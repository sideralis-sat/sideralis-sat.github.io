/**
 * Diseño preliminar de una misión: elección de órbita y dimensionado de primer orden.
 *
 * Referencias: Wertz y Larson, «Space Mission Analysis and Design» (SMAD), cap. 7 (órbitas),
 * 11 (potencia) y 13 (comunicaciones); Vallado, cap. 9 (órbitas heliosíncronas).
 *
 * Órbita heliosíncrona: la precesión nodal por J2 debe igualar el movimiento medio del Sol,
 *   Ω̇ = −(3/2) n J2 (R⊕/a)² cos i = 360°/365,2422 d   →   cos i = −Ω̇ / ((3/2) n J2 (R⊕/a)²)
 * Hora local del nodo ascendente (LTAN): Ω = α_☉ + 15°·(LTAN − 12 h)
 */
import type { SatRecord } from '../data/types'
import { sunEciAt } from './astro'
import { J2, MU, RE } from './astrodynamics'
import { BSTAR_RHO0 } from './atmosphere'

const DEG = 180 / Math.PI
export const CD = 2.2

export type MissionType = 'imaging' | 'comms' | 'science' | 'demo'

export const MISSION_TYPES: { id: MissionType; label: string; description: string }[] = [
  { id: 'imaging', label: 'Earth observation', description: 'Cameras or radar that photograph the ground' },
  { id: 'comms', label: 'Communications or IoT', description: 'Relay messages or collect data from sensors on the ground' },
  { id: 'science', label: 'Space science', description: 'Instruments that look at space or measure the environment' },
  { id: 'demo', label: 'Technology demonstration', description: 'Test a new component in orbit, like most university CubeSats' },
]

export interface Region {
  id: string
  label: string
  lat: number
  lon: number
  /** true: interesa toda la Tierra */
  global?: boolean
}

export const REGIONS: Region[] = [
  { id: 'iberia', label: 'Iberian Peninsula', lat: 40.2, lon: -3.7 },
  { id: 'europe', label: 'Europe', lat: 50, lon: 10 },
  { id: 'latam', label: 'Latin America', lat: -10, lon: -60 },
  { id: 'tropics', label: 'Tropical belt', lat: 0, lon: 0 },
  { id: 'arctic', label: 'Arctic', lat: 75, lon: 20 },
  { id: 'global', label: 'Whole Earth', lat: 40.4, lon: -3.7, global: true },
]

export interface Spacecraft {
  id: string
  label: string
  massKg: number
  /** Área frontal media para el arrastre (m²) */
  dragM2: number
  /** Área de paneles en la estructura y con paneles desplegables (m²) */
  bodySolarM2: number
  deploySolarM2: number
  loadW: number
  band: 'uhf' | 's' | 'x'
}

export const SPACECRAFT: Spacecraft[] = [
  { id: '1u', label: '1U CubeSat', massKg: 1.3, dragM2: 0.012, bodySolarM2: 0.01, deploySolarM2: 0.03, loadW: 1.5, band: 'uhf' },
  { id: '3u', label: '3U CubeSat', massKg: 4, dragM2: 0.025, bodySolarM2: 0.03, deploySolarM2: 0.12, loadW: 6, band: 'uhf' },
  { id: '6u', label: '6U CubeSat', massKg: 10, dragM2: 0.05, bodySolarM2: 0.06, deploySolarM2: 0.28, loadW: 18, band: 's' },
  { id: '12u', label: '12U CubeSat', massKg: 20, dragM2: 0.07, bodySolarM2: 0.08, deploySolarM2: 0.5, loadW: 35, band: 's' },
  { id: 'micro', label: 'Microsatellite (100 kg)', massKg: 100, dragM2: 0.5, bodySolarM2: 0.5, deploySolarM2: 2, loadW: 120, band: 'x' },
]

export type OrbitKind = 'sso' | 'inclined' | 'equatorial'

export interface OrbitChoice {
  kind: OrbitKind
  altKm: number
  incDeg: number
  /** Hora local del nodo descendente (h) en órbitas heliosíncronas */
  ltdn: number
}

/** Inclinación heliosíncrona para una órbita circular (grados) */
export function ssoInclination(altKm: number) {
  const a = RE + altKm
  const n = Math.sqrt(MU / a ** 3)
  const needed = (2 * Math.PI) / (365.2422 * 86400) // rad/s
  const c = -needed / (1.5 * n * J2 * (RE / a) ** 2)
  return Math.acos(Math.max(-1, Math.min(1, c))) * DEG
}

/** Ascensión recta del nodo ascendente para una hora local del nodo descendente dada */
export function raanForLtdn(ltdn: number, t: number) {
  const s = sunEciAt(t)
  const raSun = Math.atan2(s[1], s[0]) * DEG
  const ltan = (ltdn + 12) % 24
  return (((raSun + 15 * (ltan - 12)) % 360) + 360) % 360
}

export interface Recommendation {
  orbit: OrbitChoice
  reasons: string[]
}

/** Órbita recomendada y su justificación */
export function recommend(type: MissionType, region: Region, sc: Spacecraft): Recommendation {
  const small = sc.massKg < 30
  if (type === 'imaging') {
    const alt = small ? 520 : 560
    return {
      orbit: { kind: 'sso', altKm: alt, incDeg: ssoInclination(alt), ltdn: 10.5 },
      reasons: [
        'Sun-synchronous: the satellite crosses every latitude at the same local time, so images taken on different days have the same lighting and can be compared.',
        'Descending node at 10:30: the Sun is high enough for good contrast and morning clouds have not built up yet. Landsat and Sentinel-2 use the same window.',
        `${alt} km: low enough for good ground resolution, high enough to last the mission, and inside the 500 to 600 km band served by most rideshare launches to SSO.`,
      ],
    }
  }
  if (type === 'science') {
    const alt = small ? 550 : 600
    return {
      orbit: { kind: 'sso', altKm: alt, incDeg: ssoInclination(alt), ltdn: 6 },
      reasons: [
        'Dawn-dusk sun-synchronous orbit (node at 06:00): the orbital plane stays close to the day-night terminator, so the satellite is in sunlight almost all year.',
        'Near-continuous sunlight means a smaller battery, stable temperatures and an instrument that can always face away from the Sun.',
        `${alt} km keeps drag low enough for a multi-year mission.`,
      ],
    }
  }
  if (type === 'demo') {
    return {
      orbit: { kind: 'inclined', altKm: 410, incDeg: 51.6, ltdn: 10.5 },
      reasons: [
        'Deployment from the International Space Station (51.6°, about 410 km) is the most common and cheapest ride for university CubeSats.',
        'At this altitude drag brings the satellite down in one or two years: no debris is left behind and no deorbit device is needed.',
        'The price is a short mission and variable lighting, which is acceptable for a technology test.',
      ],
    }
  }
  // Comunicaciones / IoT
  if (region.global || Math.abs(region.lat) > 65) {
    return {
      orbit: { kind: 'sso', altKm: 550, incDeg: ssoInclination(550), ltdn: 10.5 },
      reasons: [
        'Near-polar orbit: the ground track sweeps every latitude, including the polar regions, so the whole Earth is covered every day.',
        '550 km is the usual altitude for small LEO communication constellations: short delay and a reasonable lifetime.',
      ],
    }
  }
  const inc = Math.min(98, Math.max(30, Math.abs(region.lat) + 5))
  return {
    orbit: { kind: 'inclined', altKm: 550, incDeg: inc, ltdn: 10.5 },
    reasons: [
      `Inclination ${inc.toFixed(0)}°, slightly above the region’s latitude (${Math.abs(region.lat).toFixed(0)}°): the ground track turns around near those latitudes, where the satellite spends the most time, so the region gets the most passes per day.`,
      'A polar orbit would cover the whole Earth but would waste most of its time over areas you do not serve.',
      '550 km balances link distance, coverage per pass and lifetime.',
    ],
  }
}

export const ballisticCoefficient = (sc: Spacecraft) => sc.massKg / (CD * sc.dragM2)

/** Registro OMM sintético para propagar el satélite diseñado con SGP4 como uno más */
export function makeRecord(o: OrbitChoice, sc: Spacecraft, name: string, norad: number, t: number): SatRecord {
  const a = RE + o.altKm
  const n = Math.sqrt(MU / a ** 3) // rad/s
  const inc = o.kind === 'sso' ? ssoInclination(o.altKm) : o.kind === 'equatorial' ? 0 : o.incDeg
  const raan = raanForLtdn(o.ltdn, t)
  const epoch = new Date(t).toISOString().replace('Z', '').replace(/\.(\d{3})$/, '.$1000')
  return {
    OBJECT_NAME: name.toUpperCase(),
    OBJECT_ID: `DESIGN-${norad - 990000}`,
    EPOCH: epoch,
    MEAN_MOTION: (n * 86400) / (2 * Math.PI),
    ECCENTRICITY: 0.0005,
    INCLINATION: inc,
    RA_OF_ASC_NODE: raan,
    ARG_OF_PERICENTER: 90,
    MEAN_ANOMALY: 0,
    EPHEMERIS_TYPE: 0,
    CLASSIFICATION_TYPE: 'U',
    NORAD_CAT_ID: norad,
    ELEMENT_SET_NO: 1,
    REV_AT_EPOCH: 0,
    BSTAR: BSTAR_RHO0 / (2 * ballisticCoefficient(sc)),
    MEAN_MOTION_DOT: 0,
    MEAN_MOTION_DDOT: 0,
    GROUP: 'mission',
  } as SatRecord
}

/** Semiángulo central de la huella para una elevación mínima (grados) */
export function footprintHalfAngle(altKm: number, minElDeg: number) {
  const e = minElDeg / DEG
  const eta = Math.asin((RE * Math.cos(e)) / (RE + altKm))
  return 90 - minElDeg - eta * DEG
}

/**
 * Paneles solares necesarios (SMAD, ec. 11-5), con seguimiento del punto de máxima potencia:
 *   P_sa = (P_e T_e / X_e + P_d T_d / X_d) / T_d,   X_e = 0,65, X_d = 0,85
 * y área = P_sa / (S · η · F), con η = 0,30 (células de triple unión) y F el factor medio de
 * incidencia (0,85 con paneles orientados al Sol, 0,35 con paneles fijos en la estructura).
 */
export function solarSizing(loadW: number, periodMin: number, eclipseMin: number) {
  const Td = periodMin - eclipseMin
  const psa = (loadW * eclipseMin) / 0.65 / Td + (loadW * Td) / 0.85 / Td
  const area = (f: number) => psa / (1361 * 0.3 * f)
  // Batería: la energía del eclipse con una profundidad de descarga del 25 % y 90 % de rendimiento
  const batteryWh = (loadW * eclipseMin) / 60 / (0.25 * 0.9)
  return { psa, areaPointing: area(0.85), areaBody: area(0.35), batteryWh }
}

/** Δv anual para compensar el arrastre en órbita circular (m/s): Δv = ½ ρ v² / BC · t */
export function dragMakeupPerYear(rho: number, altKm: number, bc: number) {
  const v = Math.sqrt(MU / (RE + altKm)) * 1000
  return ((0.5 * rho * v * v) / bc) * 365.25 * 86400
}

/** Δv de desorbitado desde una órbita circular: perigeo a 60 km (m/s) */
export function deorbitDv(altKm: number) {
  const r1 = RE + altKm
  const r2 = RE + 60
  const at = (r1 + r2) / 2
  return (Math.sqrt(MU / r1) - Math.sqrt(MU * (2 / r1 - 1 / at))) * 1000
}

/** Objetos del catálogo por franjas de altitud (perigeo y apogeo se cuentan en la franja que cruzan) */
export function altitudeHistogram(records: SatRecord[], from = 200, to = 1400, step = 25) {
  const bins = Array.from({ length: Math.ceil((to - from) / step) }, (_, k) => ({ alt: from + (k + 0.5) * step, n: 0 }))
  for (const r of records) {
    const n = (Number(r.MEAN_MOTION) * 2 * Math.PI) / 86400
    const a = Math.cbrt(MU / (n * n))
    const e = Number(r.ECCENTRICITY)
    const hp = a * (1 - e) - RE
    const ha = a * (1 + e) - RE
    if (ha < from || hp > to) continue
    for (let k = Math.max(0, Math.floor((hp - from) / step)); k <= Math.min(bins.length - 1, Math.floor((ha - from) / step)); k++) bins[k].n++
  }
  return bins
}

/**
 * Probabilidad anual de choque con objetos catalogados (cota inferior: solo los rastreados,
 * mayores de ~10 cm), modelo de gas cinético:  P = 1 − exp(−n · σ · v_rel · t)
 * con n la densidad espacial de la franja, σ la sección eficaz y v_rel ≈ 10 km/s.
 */
export function collisionProbability(countInBand: number, altKm: number, bandKm: number, crossSectionM2: number, years = 1) {
  const r = RE + altKm
  const volume = 4 * Math.PI * r * r * bandKm // km³
  const n = countInBand / volume
  const sigma = (Math.sqrt(crossSectionM2 / Math.PI) + 0.5) ** 2 * Math.PI * 1e-6 // km², radio del objeto ~0,5 m
  const flux = n * sigma * 10 * 365.25 * 86400 * years
  return { density: n, probability: 1 - Math.exp(-flux) }
}
