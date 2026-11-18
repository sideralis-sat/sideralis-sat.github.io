import { json2satrec, propagate, type PositionAndVelocity, type SatRec } from 'satellite.js'
import type { SatRecord } from '../data/types'

const cache = new WeakMap<SatRecord, SatRec | null>()

/** SatRec de SGP4 de un registro (con caché) */
export function satrecOf(r: SatRecord): SatRec | null {
  let s = cache.get(r)
  if (s === undefined) {
    try {
      s = json2satrec(r)
    } catch {
      s = null
    }
    cache.set(r, s)
  }
  return s
}

/** Posición y velocidad (ECI, km y km/s) de un satélite en un instante, para usos puntuales */
export function propagateRecord(r: SatRecord, ms: number): PositionAndVelocity | null {
  const s = satrecOf(r)
  if (!s) return null
  const pv = propagate(s, new Date(ms))
  return pv && Number.isFinite(pv.position.x) ? pv : null
}
