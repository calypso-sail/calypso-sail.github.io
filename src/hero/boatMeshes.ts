import type { PartId } from '../config/parts.js'
import { fetchModel } from '../viewer/model.js'

// At hero scale the hinge bushes and thrust washers read as stray dots.
const OMITTED_HERO_PARTS = new Set<PartId>([
  'tailBushLower', 'tailBushUpper', 'tailWasherLower', 'tailWasherUpper',
])

export async function fetchHeroBoatMeshes() {
  const { rest } = await fetchModel()
  return rest.filter(({ part }) => !OMITTED_HERO_PARTS.has(part))
}
