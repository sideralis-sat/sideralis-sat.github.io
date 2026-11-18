import type { SatRecord } from '../data/types'

const MU = 398600.4418 // km³/s², constante gravitacional de la Tierra
const EQUATOR_KM = 6378.137

export type OrbitClass = 'LEO' | 'MEO' | 'GEO' | 'HEO'

export const ORBIT_CLASSES: { id: OrbitClass; label: string; description: string }[] = [
  { id: 'LEO', label: 'Low Earth orbit', description: 'Period under 225 min (up to ~2000 km): ISS, Starlink, Earth observation' },
  { id: 'MEO', label: 'Medium Earth orbit', description: 'Between LEO and GEO: GNSS constellations (GPS, Galileo, GLONASS, BeiDou)' },
  { id: 'GEO', label: 'Geosynchronous', description: 'Period close to one sidereal day (a ≈ 42,164 km) and e < 0.1' },
  { id: 'HEO', label: 'Highly elliptical', description: 'Eccentricity ≥ 0.25: Molniya, Tundra, transfer orbits' },
]
export const ORBIT_INDEX = new Map(ORBIT_CLASSES.map((o, i) => [o.id, i]))

export interface OrbitElements {
  periodMin: number
  semiMajorKm: number
  apogeeKm: number
  perigeeKm: number
  inclinationDeg: number
  eccentricity: number
  orbitClass: OrbitClass
}

export function orbitElements(r: SatRecord): OrbitElements {
  const mm = Number(r.MEAN_MOTION) // vueltas/día
  const e = Number(r.ECCENTRICITY)
  const n = (mm * 2 * Math.PI) / 86400 // rad/s
  const a = Math.cbrt(MU / (n * n))
  const periodMin = 1440 / mm
  let orbitClass: OrbitClass
  if (e >= 0.25) orbitClass = 'HEO'
  else if (periodMin <= 225) orbitClass = 'LEO'
  else if (periodMin >= 1300 && periodMin <= 1600 && e < 0.1) orbitClass = 'GEO'
  else orbitClass = 'MEO'
  return {
    periodMin,
    semiMajorKm: a,
    apogeeKm: a * (1 + e) - EQUATOR_KM,
    perigeeKm: a * (1 - e) - EQUATOR_KM,
    inclinationDeg: Number(r.INCLINATION),
    eccentricity: e,
    orbitClass,
  }
}

/** La época de CelesTrak viene sin zona horaria, pero es UTC */
export function epochMs(r: SatRecord): number {
  const s = String(r.EPOCH)
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`)
}
