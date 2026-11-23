/**
 * boat.glb  ->  public/boat.opt.glb
 *
 * Reads the supplied CAD export and writes an optimised, semantically
 * named copy. Two contracts this script must never break:
 *
 *   1. Convert the export to the viewer's frame once, then preserve that pose
 *      through optimisation. Joint coordinates are in the viewer's frame.
 *
 *   2. Every part listed in RULES gets a stable id as its node name, and every mesh
 *      node in the file is claimed by exactly one rule. A future Fusion re-export
 *      that renames or splits something fails loudly here rather than silently
 *      producing a viewer with a missing rudder.
 *
 * Run: npm run model
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { NodeIO, PropertyType } from '@gltf-transform/core'
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, flatten, prune, weld, quantize } from '@gltf-transform/functions'
import { Matrix4 } from 'three'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const SRC = join(ROOT, 'boat.glb')
const OUT_DIR = join(ROOT, 'public')
const OUT = join(OUT_DIR, 'boat.opt.glb')

/** Max allowed drift of any part's world AABB, in metres. Quantization costs ~0.03 mm. */
const POSE_TOLERANCE = 0.001

// ---------------------------------------------------------------------------
// Part map
// ---------------------------------------------------------------------------

const RULES = {
  hull: 'Hull',
  deck: 'Deck',
  ballast: 'Bulb',
  keel: 'Keel fin',
  wing: 'Wing',
  mast: 'Mast',
  counterweight: 'Counterweight',
  boomForward: 'Boom forward',
  boomHubLower: 'Boom hub lower',
  boomHubUpper: 'Boom hub upper',
  boomTailLower: 'Boom tail lower',
  boomTailUpper: 'Boom tail upper',
  tailPin: 'Tail pin',
  tailFittingLower: 'Tail pivot fitting lower',
  tailFittingUpper: 'Tail pivot fitting upper',
  tailVane: 'Tail vane',
  tailBushLower: 'Tail bush lower',
  tailBushUpper: 'Tail bush upper',
  tailWasherLower: 'Tail thrust washer lower',
  tailWasherUpper: 'Tail thrust washer upper',
  rudderBlade: 'Rudder blade',
  rudderStock: 'Rudder stock',
  solarCells: 'Solar cells',
  solarJunction: 'Solar junction box',
  solarBacking: 'Solar panel back sheet',
  electronicsBox: 'Electronics box',
  electronicsLid: 'Electronics box lid',
  battery1: 'Battery 1',
  battery2: 'Battery 2',
  battery3: 'Battery 3',
}

// The Blender export's world axes are X forward, Y to port, Z up. Set +X aft,
// +Y up, length near the centre, and the design waterline at Y = 0.
const TO_VIEWER = new Matrix4().set(
  -1, 0, 0, 0.610,
  0, 0, 1, 0.0963770269,
  0, 1, 0, 0,
  0, 0, 0, 1,
)

// ---------------------------------------------------------------------------
// Small matrix / bounds helpers (column-major mat4 as number[16])
// ---------------------------------------------------------------------------

function applyMat4(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ]
}

/** World-space AABB of a node's mesh, from POSITION accessor min/max. */
function worldBounds(node) {
  const mesh = node.getMesh()
  if (!mesh) return null
  const m = node.getWorldMatrix()
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION')
    if (!pos) continue
    const min = pos.getMinNormalized([0, 0, 0])
    const max = pos.getMaxNormalized([0, 0, 0])
    for (let i = 0; i < 8; i++) {
      const corner = [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]]
      const w = applyMat4(m, corner)
      for (let k = 0; k < 3; k++) {
        if (w[k] < lo[k]) lo[k] = w[k]
        if (w[k] > hi[k]) hi[k] = w[k]
      }
    }
  }
  return { lo, hi }
}

function fail(message, detail) {
  console.error(`\n  x  ${message}`)
  if (detail) console.error(detail)
  console.error('')
  process.exit(1)
}

const fmt = (v) => v.map((x) => x.toFixed(4).padStart(9)).join(' ')

// ---------------------------------------------------------------------------
// 1. Load (read-only) and resolve the part map
// ---------------------------------------------------------------------------

if (!existsSync(SRC)) fail(`Source model not found at ${SRC}`)

const srcBytes = readFileSync(SRC)
const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS)
const doc = await io.readBinary(new Uint8Array(srcBytes))
const root = doc.getRoot()

console.log(`\n  microtransat / process-model`)
console.log(`  source  ${(srcBytes.length / 1024).toFixed(0)} KB  ` +
  `${root.listNodes().length} nodes  ${root.listMeshes().length} meshes  ` +
  `${root.listMaterials().length} materials`)

// Preserve material and mesh names used by the viewer's part and material maps.
await doc.transform(dedup({ keepUniqueNames: true }))

const sceneRoots = new Set(root.listScenes().flatMap((scene) => scene.listChildren()))
for (const node of sceneRoots) {
  node.setMatrix(TO_VIEWER.clone().multiply(new Matrix4().fromArray(node.getMatrix())).toArray())
}
const meshNodes = root.listNodes().filter((n) => n.getMesh())
const measured = new Map(meshNodes.map((n) => [n, worldBounds(n)]))

const claimed = new Map() // node -> id
const report = []

for (const [id, sourceName] of Object.entries(RULES)) {
  const candidates = meshNodes.filter((node) => node.getName().replace(/\.\d+$/, '') === sourceName)
  if (candidates.length !== 1) {
    fail(`Part "${id}" expected one "${sourceName}" node, found ${candidates.length}.`,
      `     Mesh nodes: ${meshNodes.map((node) => node.getName()).join(', ')}`)
  }
  const [node] = candidates
  claimed.set(node, id)
  report.push({ id, from: node.getName(), bounds: measured.get(node) })
}

const orphans = meshNodes.filter((n) => !claimed.has(n))
if (orphans.length) {
  fail(
    `${orphans.length} mesh node(s) unclaimed by any part rule.`,
    orphans.map((n) => `       ${n.getName()}`).join('\n'),
  )
}

// Apply the ids. The Mesh gets the same name so debugging tools agree with the node.
for (const [node, id] of claimed) {
  node.setName(id)
  node.getMesh().setName(id)
}

// Bounds we must still have at the end, keyed by the id we just assigned.
const before = new Map([...claimed].map(([node, id]) => [id, measured.get(node)]))

// ---------------------------------------------------------------------------
// 2. Optimise
// ---------------------------------------------------------------------------

await doc.transform(
  // Every part becomes a direct child of the scene with its world TRS baked in —
  // which is what lets the runtime rig re-parent parts into pivots with attach().
  flatten(),
  prune({ keepAttributes: false, keepLeaves: false }),
  weld(),
  // 16-bit positions and normals cost the same bytes as 14/12 (both Int16) and remove
  // any risk of banding in the clearcoat reflections on the big smooth hull.
  quantize({ quantizePosition: 16, quantizeNormal: 16 }),
  // quantize's cleanup can leave newly-orphaned materials behind.
  prune({ propertyTypes: [PropertyType.MATERIAL, PropertyType.ACCESSOR], keepLeaves: true }),
)

const outBytes = await io.writeBinary(doc)

// ---------------------------------------------------------------------------
// 3. Verify — re-open what we actually wrote
// ---------------------------------------------------------------------------

const check = await io.readBinary(outBytes)
const checkRoot = check.getRoot()
const scene = checkRoot.getDefaultScene() ?? checkRoot.listScenes()[0]
const topLevel = new Set(scene.listChildren())

let worst = 0
let worstId = ''
const problems = []

for (const [id, srcB] of before) {
  const node = checkRoot.listNodes().find((n) => n.getName() === id)
  if (!node) {
    problems.push(`${id}: missing from the output file`)
    continue
  }
  if (!topLevel.has(node)) {
    problems.push(`${id}: not a direct child of the scene (the rig assumes identity parents)`)
  }
  const outB = worldBounds(node)
  const drift = Math.max(
    ...[0, 1, 2].map((k) => Math.max(Math.abs(outB.lo[k] - srcB.lo[k]), Math.abs(outB.hi[k] - srcB.hi[k]))),
  )
  if (drift > worst) {
    worst = drift
    worstId = id
  }
  if (drift > POSE_TOLERANCE) {
    problems.push(
      `${id}: moved ${(drift * 1000).toFixed(2)} mm\n` +
        `         was lo=[${fmt(srcB.lo)}] hi=[${fmt(srcB.hi)}]\n` +
        `         now lo=[${fmt(outB.lo)}] hi=[${fmt(outB.hi)}]`,
    )
  }
}

// The source must be untouched, always.
const after = readFileSync(SRC)
if (after.length !== srcBytes.length || !after.equals(srcBytes)) {
  fail('boat.glb changed during processing. That should be impossible — investigate before continuing.')
}

// ---------------------------------------------------------------------------
// 4. Report
// ---------------------------------------------------------------------------

console.log(`\n  part map (${report.length} parts)`)
for (const { id, from, bounds } of report) {
  console.log(`    ${id.padEnd(19)} <- ${from.padEnd(12)}  lo=[${fmt(bounds.lo)}]  hi=[${fmt(bounds.hi)}]`)
}

console.log(`\n  materials  ${checkRoot.listMaterials().map((m) => m.getName()).join(', ')}`)
console.log(`  output     ${(outBytes.length / 1024).toFixed(0)} KB  ` +
  `(${((1 - outBytes.length / srcBytes.length) * 100).toFixed(0)}% smaller)  ` +
  `${checkRoot.listNodes().length} nodes`)
console.log(`  pose       max drift ${(worst * 1000).toFixed(3)} mm (${worstId})`)
console.log(`  source     unchanged, ${srcBytes.length} bytes`)

if (problems.length) fail(`Verification failed:`, problems.map((p) => `       ${p}`).join('\n'))

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(OUT, outBytes)
console.log(`\n  ok  ->  public/boat.opt.glb\n`)
