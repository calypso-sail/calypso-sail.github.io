/**
 * Loads the processed model and hands back every part by id.
 *
 * scripts/process-model.mjs guarantees each part is a direct child of the scene with a
 * baked world transform and an id for a name. If any of that stops being true, this
 * throws immediately rather than letting the viewer come up half-rigged.
 *
 * The GLB is fetched and parsed once. `fetchModel()` is the shared entry point: the
 * hero's ghost boat reads the rest-pose snapshot it returns, and `loadModel()` — used
 * by the viewer — builds on the same parsed scene. The snapshot is taken straight after
 * parsing, before the rig re-parents meshes into joint pivots, so it stays valid no
 * matter what the viewer does to the scene afterwards.
 */

import type { BufferGeometry, Group, Object3D } from 'three'
import { Matrix4, Mesh } from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { PART_IDS, type PartId } from '../config/parts.js'

export interface LoadedModel {
  /** The glTF scene root. Nothing ever transforms this — the rig hangs its pivots here. */
  readonly root: Group
  readonly parts: Readonly<Record<PartId, Object3D>>
  /** Every Mesh belonging to a part. Multi-material parts load as a Group of Meshes. */
  meshesOf(id: PartId): Mesh[]
  dispose(): void
}

export interface RestMesh {
  readonly part: PartId
  /** Shared with the viewer's meshes — never dispose it from here. */
  readonly geometry: BufferGeometry
  /** World transform in the rest pose, in model space. */
  readonly matrixWorld: Matrix4
}

export interface FetchedModel {
  readonly gltf: GLTF
  readonly parts: Readonly<Record<PartId, Object3D>>
  /** Every visible mesh in the rest pose, for anyone who wants to draw the boat without the viewer. */
  readonly rest: readonly RestMesh[]
}

const MODEL_URL = `${import.meta.env.BASE_URL}${new URLSearchParams(location.search).get('qa') === 'model-error' ? 'missing-model.glb' : 'boat.opt.glb?v=calypso'}`

let pending: Promise<FetchedModel> | null = null
const progressListeners = new Set<(fraction: number) => void>()

/** Fetches and parses the GLB once; later callers share the same promise. */
export function fetchModel(onProgress?: (fraction: number) => void): Promise<FetchedModel> {
  if (onProgress) progressListeners.add(onProgress)
  if (pending) return pending

  const loader = new GLTFLoader()
  pending = loader
    .loadAsync(MODEL_URL, (event) => {
      // Only meaningful when the server sends Content-Length; otherwise we let the
      // indeterminate bar in the loader carry it.
      if (event.lengthComputable && event.total > 0) {
        const fraction = event.loaded / event.total
        for (const listener of progressListeners) listener(fraction)
      }
    })
    .then((gltf) => {
      const root = gltf.scene as Group
      const parts = {} as Record<PartId, Object3D>
      const missing: string[] = []

      for (const id of PART_IDS) {
        const found = root.getObjectByName(id)
        if (!found) {
          missing.push(id)
          continue
        }
        parts[id] = found
      }

      if (missing.length) {
        throw new Error(
          `boat.opt.glb is missing ${missing.length} part(s): ${missing.join(', ')}. ` +
            `Re-run "npm run model" — and if that fails, the part map in ` +
            `scripts/process-model.mjs needs updating for a new Fusion export.`,
        )
      }

      root.updateMatrixWorld(true)

      const rest: RestMesh[] = []
      for (const id of PART_IDS) {
        parts[id].traverse((o) => {
          const mesh = o as Mesh
          if (!mesh.isMesh) return
          rest.push({ part: id, geometry: mesh.geometry, matrixWorld: new Matrix4().copy(mesh.matrixWorld) })
        })
      }

      for (const listener of progressListeners) listener(1)
      return { gltf, parts, rest }
    })

  return pending
}

export async function loadModel(onProgress?: (fraction: number) => void): Promise<LoadedModel> {
  const { gltf, parts } = await fetchModel(onProgress)
  const root = gltf.scene as Group

  for (const object of root.getObjectsByProperty('isMesh', true)) {
    const mesh = object as Mesh
    mesh.castShadow = true
    mesh.receiveShadow = true
    // The parts move and frame together, so culling per-object buys little and
    // costs a bounding-sphere test per frame per part.
    mesh.frustumCulled = false
  }

  return {
    root,
    parts,
    meshesOf(id: PartId) {
      const out: Mesh[] = []
      parts[id].traverse((o) => {
        if ((o as Mesh).isMesh) out.push(o as Mesh)
      })
      return out
    },
    dispose() {
      // Geometry is shared with the hero's ghost boat, so only materials go here.
      root.traverse((o) => {
        const mesh = o as Mesh
        if (!mesh.isMesh) return
        const material = mesh.material
        if (Array.isArray(material)) material.forEach((m) => m.dispose())
        else material.dispose()
      })
    },
  }
}
