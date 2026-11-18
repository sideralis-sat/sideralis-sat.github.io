import raw from './constellations.json'
import type { Constellation } from './types'

export const CONSTELLATIONS: Constellation[] = raw.groups
export const CONSTELLATION_INDEX = new Map(CONSTELLATIONS.map((c, i) => [c.id, i]))
export const OTHER_INDEX = CONSTELLATION_INDEX.get('other')!
