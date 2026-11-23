/** Stable mesh IDs written by scripts/process-model.mjs. */
export const WING_ASSEMBLY = [
  'wing', 'mast', 'counterweight',
  'boomForward', 'boomHubLower', 'boomHubUpper', 'boomTailLower', 'boomTailUpper',
  'tailPin', 'tailFittingLower', 'tailFittingUpper',
] as const

/** The vane and its bushes and washers turn about the pin carried by the boom. */
export const TAIL_ASSEMBLY = [
  'tailVane', 'tailBushLower', 'tailBushUpper', 'tailWasherLower', 'tailWasherUpper',
] as const

export const RUDDER_ASSEMBLY = ['rudderBlade', 'rudderStock'] as const
export const SOLAR_PANEL = ['solarCells', 'solarJunction', 'solarBacking'] as const
export const ELECTRONICS = ['electronicsBox', 'electronicsLid', 'battery1', 'battery2', 'battery3'] as const

export const XRAY_GHOSTED = ['hull'] as const
export const XRAY_FADED = ['deck', ...SOLAR_PANEL] as const

export const PART_IDS = [
  ...XRAY_GHOSTED, ...XRAY_FADED, 'keel', 'ballast',
  ...WING_ASSEMBLY, ...TAIL_ASSEMBLY, ...RUDDER_ASSEMBLY, ...ELECTRONICS,
] as const

export type PartId = (typeof PART_IDS)[number]

/** Measured from the website model, in metres relative to the design waterline. */
export const HULL_EXTENT = {
  bow: -0.610000,
  stern: 0.638239,
  keel: -1.040073,
} as const

export const LOA = HULL_EXTENT.stern - HULL_EXTENT.bow
export const DRAFT = -HULL_EXTENT.keel
