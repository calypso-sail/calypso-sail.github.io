/** Vertical joint axes as [X, Z] in the processed model, in metres. */
export const JOINTS = {
  wing: { axis: [-0.327647, 0] },
  // CAD travel at the linear-actuator stops, in degrees from the exported neutral pose.
  tail: { axis: [0.524573, 0], minDeg: -10, maxDeg: 20 },
  rudder: { axis: [0.4405, 0], minDeg: -4.60, maxDeg: 24.19 },
} as const

export function clampDeflection(value: number, joint: 'tail' | 'rudder'): number {
  const { minDeg, maxDeg } = JOINTS[joint]
  return Math.max(minDeg, Math.min(maxDeg, value))
}

/** Simplified equilibrium model: wing heading = apparent wind - TAB_AUTHORITY * vane deflection. */
export const TAB_AUTHORITY = 0.5

/** Second-order response of the free-pivoting wing. */
export const WING_OMEGA = 2.0 // rad/s, undamped
export const WING_ZETA = 0.9

/** Angular slew rates for the website demonstration, in degrees per second. */
export const TAB_SLEW = 36
export const RUDDER_SLEW = 42
