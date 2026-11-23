import { JOINTS } from './joints.js'
import {
  DRAFT, ELECTRONICS, HULL_EXTENT, LOA, RUDDER_ASSEMBLY, SOLAR_PANEL, TAIL_ASSEMBLY,
  WING_ASSEMBLY, type PartId,
} from './parts.js'

export type Vec3 = [number, number, number]

export interface LabelDef {
  readonly text: string
  readonly sub?: string
  /** Anchor in rest-pose model space. */
  readonly at: Vec3
  /** Pivot the anchor rides on. */
  readonly follows?: 'wing' | 'tail' | 'rudder'
  readonly dir?: [number, number]
  readonly reach?: number
}

export interface DimensionDef {
  readonly from: Vec3
  readonly to: Vec3
  readonly text: string
  readonly kind?: 'dimension' | 'reference'
  /** Push the dimension line off the measured axis, in screen pixels. */
  readonly nudge?: [number, number]
}

export interface CameraPose {
  readonly position: Vec3
  readonly target: Vec3
  /** Vertical field of view. */
  readonly fov?: number
}

export interface ViewDef {
  readonly id: string
  readonly label: string
  readonly caption: string
  readonly camera: CameraPose
  readonly labels?: readonly LabelDef[]
  readonly dimensions?: readonly DimensionDef[]
  readonly xray?: boolean
  readonly highlight?: readonly PartId[]
  readonly focusControl?: 'wind' | 'tab' | 'rudder'
  /** Commanded winds and deflections for the simulation on arrival. */
  readonly sim?: { readonly windDeg?: number; readonly tabDeg?: number; readonly rudderDeg?: number }
}

const NEUTRAL_POSE = { windDeg: 0, tabDeg: 0, rudderDeg: 0 }

export const VIEWS: readonly ViewDef[] = [
  {
    id: 'overview',
    label: 'Overview',
    caption:
      'Calypso is our autonomous sailing boat for the Microtransat Challenge. Its wingsail provides propulsion, and a deck-mounted solar panel supplies electricity.',
    camera: { position: [-1.65, 1.22, 3.95], target: [-0.025, 0.045, 0], fov: 35 },
  },
  {
    id: 'wingsail',
    label: 'Wingsail',
    caption:
      'The wingsail pivots freely around the mast. A linear actuator adjusts the tail vane, which sets the wing’s angle to the wind.',
    camera: { position: [-0.39, 1.31, 2.70], target: [-0.04, 0.59, 0], fov: 34 },
    sim: { ...NEUTRAL_POSE, tabDeg: JOINTS.tail.maxDeg },
    focusControl: 'tab',
    highlight: [...WING_ASSEMBLY, ...TAIL_ASSEMBLY],
    labels: [
      { text: 'Tail vane', at: [0.646, 0.68, 0.005], follows: 'tail', dir: [1, -1], reach: 58 },
      { text: 'Wing', at: [-0.24, 0.94, 0.027], follows: 'wing', dir: [-1, -1], reach: 65 },
    ],
  },
  {
    id: 'rudder',
    label: 'Rudder',
    caption:
      'A linear actuator below deck turns the rudder. The autopilot uses it to hold course and steer between waypoints.',
    camera: { position: [1.65, -0.13, 1.09], target: [0.44, -0.135, 0], fov: 29 },
    sim: { ...NEUTRAL_POSE, rudderDeg: JOINTS.rudder.maxDeg },
    focusControl: 'rudder',
    highlight: RUDDER_ASSEMBLY,
    labels: [
      { text: 'Rudder blade', at: [0.488, -0.205, 0.007], follows: 'rudder', dir: [1, 1], reach: 67 },
    ],
  },
  {
    id: 'hull',
    label: 'Hull',
    caption:
      `Calypso’s ${LOA.toFixed(2)} m fibreglass sandwich hull carries a deep fin keel with a lead bulb. The low ballast helps the boat right itself after a knockdown.`,
    camera: { position: [0.015, -0.025, 6.3], target: [0.015, -0.025, 0], fov: 27 },
    sim: NEUTRAL_POSE,
    dimensions: [
      { kind: 'reference', from: [-0.86, 0, 0], to: [0.84, 0, 0], text: 'Design waterline' },
      { from: [-0.82, 0, 0], to: [-0.82, HULL_EXTENT.keel, 0], text: `Draft ${DRAFT.toFixed(2)} m` },
    ],
  },
  {
    id: 'solar',
    label: 'Solar',
    caption:
      'A single low-profile solar panel sits aft of the mast. It charges the batteries that power navigation, communications and steering.',
    camera: { position: [1.60, 2.48, 1.42], target: [0.18, 0.124, 0], fov: 29 },
    sim: NEUTRAL_POSE,
    highlight: SOLAR_PANEL,
    labels: [
      { text: 'Solar panel', at: [0.36, 0.125, 0.12], dir: [1, 1], reach: 68 },
    ],
  },
  {
    id: 'electronics',
    label: 'Electronics',
    caption:
      'An enclosure below deck houses the navigation and communications electronics. Three batteries store solar energy for use overnight and in low light.',
    camera: { position: [-0.56, 1.25, 1.94], target: [0.12, -0.025, 0], fov: 30 },
    sim: NEUTRAL_POSE,
    xray: true,
    highlight: ELECTRONICS,
    labels: [
      { text: 'Electronics enclosure', at: [0.225, 0.025, 0.068], dir: [1, -1], reach: 58 },
      { text: 'Battery bank', at: [-0.016, 0.065, 0.065], dir: [-1, -1], reach: 71 },
    ],
  },
] as const

export const DEFAULT_VIEW = VIEWS[0].id

export function findView(id: string | null | undefined): ViewDef {
  return VIEWS.find((v) => v.id === id) ?? VIEWS[0]
}
