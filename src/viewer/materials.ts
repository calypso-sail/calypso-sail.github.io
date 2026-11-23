/** Physical finishes, chapter highlights and the Electronics cutaway. */

import {
  AdditiveBlending,
  Color,
  DoubleSide,
  FrontSide,
  Mesh,
  MeshPhysicalMaterial,
  type MeshPhysicalMaterialParameters,
  ShaderMaterial,
  Vector2,
} from 'three'
import {
  PART_IDS,
  XRAY_GHOSTED,
  XRAY_FADED,
  ELECTRONICS,
  type PartId,
} from '../config/parts.js'
import type { LoadedModel } from './model.js'

type Spec = MeshPhysicalMaterialParameters

/** Reinterprets the named CAD finishes for the viewer's lighting. */
const BY_SOURCE: Record<string, Spec> = {
  'Paint - Gloss, white': { color: 0xd6d3ca, roughness: 0.35, clearcoat: 0.5 },
  'Paint - Gloss, optic yellow': {
    color: 0xe3f941,
    specularIntensity: 0.25,
    roughness: 0.48,
    clearcoat: 0.15,
  },
  'Carbon fibre, woven, gloss': { color: 0x41474e, roughness: 0.38, clearcoat: 0.3 },
  'Lead - Satin': { color: 0x777c86, roughness: 0.53, metalness: 0.65 },
  'Aluminium, hard anodised': { color: 0x838b95, roughness: 0.35, metalness: 0.8 },
  'Stainless Steel - Satin': { color: 0xb6bcc5, roughness: 0.32, metalness: 0.88 },
  'Plastic - Matte (Black)': { color: 0x363b44, roughness: 0.55 },
  'Plastic - Matte (White)': { color: 0xd2d7de, roughness: 0.46 },
  'RAL 7035 light grey': { color: 0xbec3be, roughness: 0.44 },
}

const CELL: Spec = {
  color: 0x101b32,
  roughness: 0.26,
  clearcoat: 0.65,
  clearcoatRoughness: 0.12,
  emissive: 0x193e68,
  emissiveIntensity: 0,
}

function specFor(part: PartId, source: string): Spec {
  if (part === 'solarCells') return CELL
  if (part === 'wing') return { ...BY_SOURCE[source], roughness: 0.6 }
  return BY_SOURCE[source] ?? { color: 0x8892a0, roughness: 0.5 }
}

// ---------------------------------------------------------------------------
// Fresnel shell used for the x-ray dissolve
// ---------------------------------------------------------------------------

const GHOST_VERT = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewW;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewW = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const GHOST_FRAG = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewW;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uBody;
  uniform vec2 uPointer;
  uniform float uPointerStrength;
  uniform vec2 uResolution;
  void main() {
    float facing = abs(dot(normalize(vNormalW), normalize(vViewW)));
    float rim = pow(1.0 - clamp(facing, 0.0, 1.0), 3.2);
    float body = uBody + rim * 0.86;
    vec2 pointerDelta = gl_FragCoord.xy/uResolution-uPointer;
    pointerDelta.x *= uResolution.x/uResolution.y;
    float pointerHalo = (1.0-smoothstep(.04,.42,length(pointerDelta)))*uPointerStrength;
    vec3 glow = uColor*(0.16+rim*.95) + vec3(.2,.38,.43)*pointerHalo*(.052+rim*.104);
    gl_FragColor = vec4(glow,body*uOpacity*(1.0+pointerHalo*.052));
    // uColor is a THREE.Color and so arrives linear; convert on the way out.
    #include <colorspace_fragment>
  }
`

export interface GhostOptions {
  /** Off = draw through everything (the hero keel shows under the sea). Default on. */
  depthTest?: boolean
  /** A little more surface fill keeps the hero silhouette readable against waves. */
  body?: number
}

/** The fresnel shell: additive and double-sided, shared by the x-ray and the hero. */
export function createGhostMaterial(
  color: number,
  opacity: number,
  options: GhostOptions = {},
): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(color) },
      uOpacity: { value: opacity },
      uBody: { value: options.body ?? 0.04 },
      uPointer: { value: new Vector2(-10,-10) },
      uPointerStrength: { value: 0 },
      uResolution: { value: new Vector2(1,1) },
    },
    vertexShader: GHOST_VERT,
    fragmentShader: GHOST_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: options.depthTest ?? true,
    blending: AdditiveBlending,
    // Both shells of the hull, so it reads as a volume rather than a near surface.
    side: DoubleSide,
  })
}

// ---------------------------------------------------------------------------

interface Slot {
  mesh: Mesh
  part: PartId
  material: MeshPhysicalMaterial
  baseColor: Color
  baseOpacity: number
  baseClearcoat: number
  baseRoughness: number
  /** Fades out and is replaced by a fresnel shell during x-ray. */
  isShell: boolean
  /** Small enough that a shell would be noise; just fades away during x-ray. */
  isFaded: boolean
  /** Solar cell laminate; picks up a little glow when the panel is the subject. */
  isCell: boolean
  /** 0 = full attention, 1 = pushed into the background. */
  dim: number
  dimTarget: number
}

export interface MaterialSystem {
  /** 0 = solid boat, 1 = hull dissolved to a shell. */
  setXray(on: boolean): void
  /** Parts to keep at full strength; everything else recedes. Empty/null = all equal. */
  setHighlight(ids: readonly PartId[] | null | undefined): void
  update(dt: number): void
  dispose(): void
}

// A backgrounded part loses albedo, environment, gloss and sharpness together. Albedo
// alone does almost nothing: on a white gel coat under a hard key it's the specular
// that's bright, and no amount of darkening the base colour touches that. Roughening
// the surface is what actually puts a part into the background.
const DIM_COLOR = 0.78
const DIM_ENV = 0.62
const DIM_COAT = 0.85
const DIM_ROUGH = 0.6 // fraction of the way to fully matte

export function createMaterials(model: LoadedModel): MaterialSystem {
  const slots: Slot[] = []
  const shellSet = new Set<PartId>(XRAY_GHOSTED)
  const fadedSet = new Set<PartId>(XRAY_FADED)
  const baySet = new Set<PartId>(ELECTRONICS)

  // A restrained warm grey keeps the X-ray legible without a neon shell.
  const ghostMaterial = createGhostMaterial(0xb8bba5, 0)
  const ghosts: Mesh[] = []

  for (const part of PART_IDS) {
    for (const mesh of model.meshesOf(part)) {
      const source = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material)?.name ?? ''
      const spec = specFor(part, source)

      const material = new MeshPhysicalMaterial({
        // Solar cells are a surface. The backing sheet covers them from below.
        side: spec === CELL ? DoubleSide : FrontSide,
        envMapIntensity: 1,
        ...spec,
      })
      material.name = `${part}/${source}`

      const old = mesh.material
      if (Array.isArray(old)) old.forEach((m) => m.dispose())
      else old?.dispose()
      mesh.material = material

      if (baySet.has(part)) {
        // The near-transparent hull shouldn't leave the electronics in its shadow.
        mesh.receiveShadow = false
        mesh.castShadow = false
      }

      slots.push({
        mesh,
        part,
        material,
        baseColor: material.color.clone(),
        baseOpacity: material.opacity,
        baseClearcoat: material.clearcoat,
        baseRoughness: material.roughness,
        isShell: shellSet.has(part),
        isFaded: fadedSet.has(part),
        isCell: spec === CELL,
        dim: 0,
        dimTarget: 0,
      })

      if (shellSet.has(part)) {
        // Shares the geometry, so the second copy costs a draw call and nothing else.
        const ghost = new Mesh(mesh.geometry, ghostMaterial)
        ghost.matrixAutoUpdate = false
        ghost.matrix.copy(mesh.matrixWorld)
        ghost.matrixWorld.copy(mesh.matrixWorld)
        ghost.frustumCulled = false
        ghost.renderOrder = 10
        ghost.visible = false
        model.root.add(ghost)
        ghosts.push(ghost)
      }
    }
  }

  let xray = 0
  let xrayTarget = 0
  let cellGlow = 0
  let cellGlowTarget = 0
  const tint = new Color()

  function applyDim(slot: Slot) {
    const k = slot.dim
    tint.copy(slot.baseColor).multiplyScalar(1 - DIM_COLOR * k)
    slot.material.color.copy(tint)
    slot.material.envMapIntensity = 1 - DIM_ENV * k
    slot.material.clearcoat = slot.baseClearcoat * (1 - DIM_COAT * k)
    slot.material.roughness = slot.baseRoughness + (0.92 - slot.baseRoughness) * DIM_ROUGH * k
  }

  return {
    setXray(on) {
      xrayTarget = on ? 1 : 0
    },

    setHighlight(ids) {
      const focus = ids && ids.length ? new Set(ids) : null
      for (const slot of slots) {
        slot.dimTarget = !focus || focus.has(slot.part) ? 0 : 1
      }
      cellGlowTarget = focus && slots.some((s) => s.isCell && focus.has(s.part)) ? 1 : 0
    },

    update(dt) {
      // ~180 ms to settle; fast enough to feel like a response, slow enough to read.
      const k = 1 - Math.exp(-dt / 0.18)

      for (const slot of slots) {
        if (slot.dim === slot.dimTarget) continue
        slot.dim =
          Math.abs(slot.dim - slot.dimTarget) > 0.0005
            ? slot.dim + (slot.dimTarget - slot.dim) * k
            : slot.dimTarget
        applyDim(slot)
      }

      xray =
        Math.abs(xray - xrayTarget) > 0.0005
          ? xray + (xrayTarget - xray) * (1 - Math.exp(-dt / 0.22))
          : xrayTarget
      cellGlow += (cellGlowTarget - cellGlow) * k

      const solid = 1 - xray
      for (const slot of slots) {
        if (slot.isShell || slot.isFaded) {
          const opacity = slot.baseOpacity * solid
          slot.material.transparent = xray > 0.002
          slot.material.depthWrite = xray < 0.5
          slot.material.opacity = opacity
          slot.mesh.visible = opacity > 0.02
          slot.mesh.castShadow = xray < 0.5
        } else if (slot.isCell) {
          slot.material.emissiveIntensity = cellGlow * 0.3
        }
      }

      ghostMaterial.uniforms.uOpacity.value = xray
      const ghostVisible = xray > 0.01
      for (const ghost of ghosts) ghost.visible = ghostVisible
    },

    dispose() {
      for (const slot of slots) slot.material.dispose()
      for (const ghost of ghosts) ghost.removeFromParent()
      ghostMaterial.dispose()
    },
  }
}
