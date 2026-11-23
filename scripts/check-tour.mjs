import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'
import { Box3, PerspectiveCamera, TOUCH, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

// Compile the real TS modules in memory. No generated files or browser globals.
const modules = new Map()
async function moduleUrl(filename) {
  const absolute = path.resolve(filename)
  if (modules.has(absolute)) return modules.get(absolute)
  let code = ts.transpileModule(await fs.readFile(absolute, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText
  for (const match of [...code.matchAll(/from ['"]([^'"]+)['"]/g)]) {
    const specifier = match[1]
    const url = specifier.startsWith('.')
      ? await moduleUrl(path.resolve(path.dirname(absolute), specifier.replace(/\.js$/, '.ts')))
      : import.meta.resolve(specifier)
    code = code.replace(match[0], `from ${JSON.stringify(url)}`)
  }
  const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
  modules.set(absolute, url)
  return url
}
const { sampleTour, interpolatePose } = await import(await moduleUrl('src/viewer/tour.ts'))
const { createCameraRig } = await import(await moduleUrl('src/viewer/camera.ts'))
const { createRig } = await import(await moduleUrl('src/viewer/rig.ts'))
const { createSim } = await import(await moduleUrl('src/viewer/sim.ts'))
const { VIEWS } = await import(await moduleUrl('src/config/views.ts'))
const { JOINTS } = await import(await moduleUrl('src/config/joints.ts'))
const { PART_IDS, RUDDER_ASSEMBLY, TAIL_ASSEMBLY, WING_ASSEMBLY } =
  await import(await moduleUrl('src/config/parts.ts'))
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ≠ ${b}`)
const vectorNear = (a, b) => a.forEach((v, i) => near(v, b[i]))

for (const invalid of [-1, NaN, Infinity]) assert.equal(sampleTour(invalid, 6).active, 0)
assert.equal(sampleTour(2, 6).active, 5)
assert.equal(sampleTour(.8, 1).active, 0)
for (let i = 0; i < 6; i++) {
  assert.equal(sampleTour(i / 5, 6).active, i)
  if (i < 5) {
    assert.equal(sampleTour((i + .4) / 5, 6).mix, 0)
    assert.equal(sampleTour((i + .8) / 5, 6).transitioning, true)
  }
}
const forward = Array.from({ length: 501 }, (_, i) => sampleTour(i / 500, 6))
for (let i = 500; i >= 0; i--) assert.deepEqual(sampleTour(i / 500, 6), forward[i])
for (let i = 0; i < VIEWS.length - 1; i++) {
  const a = VIEWS[i].camera, b = VIEWS[i + 1].camera
  vectorNear(interpolatePose(a, b, 0).position, a.position)
  vectorNear(interpolatePose(a, b, 1).position, b.position)
  const minRadius = Math.min(new Vector3(...a.position).distanceTo(new Vector3(...a.target)), new Vector3(...b.position).distanceTo(new Vector3(...b.target)))
  for (let t = 0; t <= 1; t += .05) {
    const pose = interpolatePose(a, b, t)
    assert.ok(new Vector3(...pose.position).distanceTo(new Vector3(...pose.target)) >= minRadius - 1e-8)
  }
}
const acrossSeam = interpolatePose(
  { position: [.01, 0, -2], target: [0, 0, 0] },
  { position: [-.01, 0, -2], target: [0, 0, 0] }, .5)
assert.ok(acrossSeam.position[2] < -1.99, 'Take the short arc around the back of the hull')

class CanvasStub extends EventTarget {
  style = {}
  ownerDocument = new EventTarget()
  clientWidth = 1440
  clientHeight = 900
  getRootNode() { return this.ownerDocument }
}
const camera = new PerspectiveCamera(34, 1.6)
const canvas = new CanvasStub()
const rig = createCameraRig(camera, canvas, { zoom: false, oneFingerRotate: false })
const [overview, wing, rudder] = VIEWS.map(view => view.camera)
rig.flyTo(overview, true)
rig.flyTo(wing)
vectorNear(camera.position.toArray(), overview.position)
rig.update(.1)
const midflight = camera.position.toArray()
assert.notDeepEqual(midflight, overview.position)
rig.flyTo(rudder)
vectorNear(camera.position.toArray(), midflight)
rig.follow(wing)
vectorNear(camera.position.toArray(), midflight)
rig.update(.5)
vectorNear(camera.position.toArray(), wing.position)
assert.equal(rig.moving, false)

rig.setOrbitEnabled(true)
vectorNear(camera.position.toArray(), wing.position)
rig.follow(rudder)
vectorNear(camera.position.toArray(), wing.position)
// Mimic the resulting camera position of a reader's orbit, then return to the tour.
camera.position.set(3, 1, 3)
rig.setOrbitEnabled(false)
rig.flyTo(rudder)
vectorNear(camera.position.toArray(), [3, 1, 3])
rig.update(.1)
assert.ok(camera.position.distanceTo(new Vector3(...rudder.position)) > .01)
rig.follow(overview) // Continued scrolling retargets the same handoff.
rig.update(.5)
vectorNear(camera.position.toArray(), overview.position)
assert.equal(rig.controls.enableZoom, false)
assert.equal(rig.controls.touches.ONE, null)
assert.equal(rig.controls.touches.TWO, TOUCH.DOLLY_ROTATE)
assert.equal(canvas.style.touchAction, 'pan-y')
const gesture = fingers => {
  const event = new Event('touchstart', { cancelable: true })
  event.touches = Array(fingers).fill({})
  canvas.dispatchEvent(event)
  return event.defaultPrevented
}
assert.equal(gesture(2), false, 'Guided mode leaves page gestures alone')
rig.setOrbitEnabled(true)
assert.equal(gesture(1), false, 'One finger remains page scrolling')
assert.equal(gesture(2), true, 'Two fingers go to orbit in Explore')
rig.setOrbitEnabled(false)
camera.aspect = .6
rig.refit()
assert.ok(camera.position.distanceTo(new Vector3(...overview.target)) > new Vector3(...overview.position).distanceTo(new Vector3(...overview.target)))
rig.dispose()

const stillCamera = new PerspectiveCamera(34, 1.6)
const still = createCameraRig(stillCamera, new CanvasStub(), { reducedMotion: true })
still.flyTo(wing)
vectorNear(stillCamera.position.toArray(), wing.position)
assert.equal(still.moving, false)
still.dispose()

const sim = createSim()
sim.suggest(VIEWS[1].sim)
sim.set({ auto: false, windDeg: 135, tabDeg: -30, rudderDeg: -35 })
assert.equal(sim.inputs.tabDeg, JOINTS.tail.minDeg)
assert.equal(sim.inputs.rudderDeg, JOINTS.rudder.minDeg)
sim.suggest(VIEWS[2].sim)
assert.equal(sim.inputs.windDeg, 135, 'Explore preserves reader settings')
sim.set({ auto: true })
sim.suggest(VIEWS[1].sim)
sim.settle()
assert.equal(sim.state.tabDeg, JOINTS.tail.maxDeg)
assert.equal(sim.state.rudderDeg, 0)
assert.equal(sim.state.windDeg, 0)

// Exercise the rig against the delivered GLB. Bounds of the cylindrical parts
// identify the geometric axes independently of the authored pivot positions.
const bytes = await fs.readFile('public/boat.opt.glb')
const { scene: root } = await new GLTFLoader().parseAsync(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
const parts = Object.fromEntries(PART_IDS.map(id => {
  const part = root.getObjectByName(id)
  assert.ok(part, `Expected ${id} in boat.opt.glb`)
  return [id, part]
}))
root.updateMatrixWorld(true)
const rest = new Map(PART_IDS.map(id => [id, parts[id].matrixWorld.toArray()]))
const boatRig = createRig({ root, parts })
root.updateMatrixWorld(true)
for (const id of PART_IDS) vectorNear(parts[id].matrixWorld.toArray(), rest.get(id))

for (const [id, shaft, attached] of [
  ['wing', 'mast', WING_ASSEMBLY],
  ['tail', 'tailPin', TAIL_ASSEMBLY],
  ['rudder', 'rudderStock', RUDDER_ASSEMBLY],
]) {
  const pivot = boatRig.frame(id)
  const centre = new Box3().setFromObject(parts[shaft], true).getCenter(new Vector3())
  const axis = pivot.getWorldPosition(new Vector3())
  assert.ok(Math.hypot(centre.x - axis.x, centre.z - axis.z) < 0.0001, `${id} pivot is centred on its shaft`)
  for (const part of attached) assert.equal(parts[part].parent, pivot)
}
assert.equal(boatRig.frame('tail').parent, boatRig.frame('wing'))

boatRig.setAngles(0, 100, -100)
root.updateMatrixWorld(true)
assert.notDeepEqual(parts.tailVane.matrixWorld.toArray(), rest.get('tailVane'))
assert.notDeepEqual(parts.rudderBlade.matrixWorld.toArray(), rest.get('rudderBlade'))
vectorNear(parts.tailPin.matrixWorld.toArray(), rest.get('tailPin'))
vectorNear(parts.hull.matrixWorld.toArray(), rest.get('hull'))
const radians = Math.PI / 180
near(boatRig.frame('tail').rotation.y, JOINTS.tail.maxDeg * radians)
near(boatRig.frame('rudder').rotation.y, JOINTS.rudder.minDeg * radians)
const tailBefore = parts.tailVane.matrixWorld.toArray()
boatRig.setAngles(90, 100, -100)
root.updateMatrixWorld(true)
assert.notDeepEqual(parts.tailVane.matrixWorld.toArray(), tailBefore, 'The tail rides the wing')
boatRig.atRest(() => {
  for (const id of PART_IDS) vectorNear(parts[id].matrixWorld.toArray(), rest.get(id))
})
near(boatRig.frame('wing').rotation.y, Math.PI / 2)
boatRig.setAngles(-90, -100, 100)
near(boatRig.frame('tail').rotation.y, JOINTS.tail.minDeg * radians)
near(boatRig.frame('rudder').rotation.y, JOINTS.rudder.maxDeg * radians)
boatRig.dispose()

console.log('Tour checks passed: six chapters, reversible camera paths, Explore, portrait fit, reduced motion, and the delivered model’s three joints and travel limits.')
