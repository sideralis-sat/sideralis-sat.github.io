/**
 * Planificador de imágenes de satélite: cuándo los satélites de observación gratuitos pueden
 * tomar una imagen de un punto, y si las nubes la estropearán.
 *
 * Un sensor de barrido (push-broom) o un radar de apertura sintética toma una franja continua
 * centrada (aproximadamente) en la traza del satélite. Un punto entra en la imagen si su
 * distancia en perpendicular a la traza es menor que media anchura de franja. Esa distancia es
 * el mínimo de la distancia sobre la superficie entre el punto subsatélite y el objetivo.
 *
 * No todas las franjas están centradas en la traza: el radar de Sentinel-1 mira de lado (a la
 * derecha de la marcha) y OLCI de Sentinel-3 va inclinado 12,6° al oeste para evitar el brillo
 * del Sol en el mar. Por eso cada instrumento se describe por sus ángulos de visión desde el
 * nadir, y la distancia en el suelo se calcula con la altitud real de cada pasada:
 *   γ = arcsen(((R + h)/R) · sen α) − α,   distancia = R·γ
 */

export type SensorKind = 'optical' | 'radar'

export interface Imager {
  id: string
  norad: number
  name: string
  mission: string
  sensor: string
  kind: SensorKind
  /** Resolución típica, m */
  resM: number
  /** Anchura de franja, km */
  swathKm: number
  /**
   * Ángulos de visión desde el nadir que cubre la franja (grados; positivo = a la derecha de la
   * marcha). Simétricos para los ópticos de barrido; a un lado para el radar.
   */
  look: [number, number]
  color: string
  note?: string
}

/**
 * Misiones con datos gratuitos. Anchuras de franja: Sentinel-2 MSI 290 km (campo de 20,6°),
 * Landsat OLI 185 km (15°), Sentinel-1 C-SAR en modo IW 250 km (incidencia 29,1° a 46,0°, que a
 * 693 km son 26,0° a 40,5° desde el nadir, a la derecha), Sentinel-3 OLCI 1270 km (68,5°
 * inclinados 12,6° al oeste; de día va en descendente, así que el oeste queda a la derecha).
 */
const S2_LOOK: [number, number] = [-10.3, 10.3]
const L_LOOK: [number, number] = [-7.5, 7.5]
const S1_LOOK: [number, number] = [26.0, 40.5]
const S3_LOOK: [number, number] = [-21.65, 46.85]

export const IMAGERS: Imager[] = [
  { id: 's2b', norad: 42063, name: 'Sentinel-2B', mission: 'sentinel2', sensor: 'MSI', kind: 'optical', resM: 10, swathKm: 290, look: S2_LOOK, color: '#2f9e6b' },
  { id: 's2c', norad: 60989, name: 'Sentinel-2C', mission: 'sentinel2', sensor: 'MSI', kind: 'optical', resM: 10, swathKm: 290, look: S2_LOOK, color: '#2f9e6b' },
  {
    id: 's2a',
    norad: 40697,
    name: 'Sentinel-2A',
    mission: 'sentinel2',
    sensor: 'MSI',
    kind: 'optical',
    resM: 10,
    swathKm: 290,
    look: S2_LOOK,
    color: '#2f9e6b',
    note: 'Extended campaign with a reduced acquisition plan',
  },
  { id: 'l8', norad: 39084, name: 'Landsat 8', mission: 'landsat', sensor: 'OLI', kind: 'optical', resM: 30, swathKm: 185, look: L_LOOK, color: '#3b7dd8' },
  { id: 'l9', norad: 49260, name: 'Landsat 9', mission: 'landsat', sensor: 'OLI-2', kind: 'optical', resM: 30, swathKm: 185, look: L_LOOK, color: '#3b7dd8' },
  { id: 's1a', norad: 39634, name: 'Sentinel-1A', mission: 'sentinel1', sensor: 'C-SAR', kind: 'radar', resM: 10, swathKm: 250, look: S1_LOOK, color: '#8a5cd6' },
  { id: 's1c', norad: 62261, name: 'Sentinel-1C', mission: 'sentinel1', sensor: 'C-SAR', kind: 'radar', resM: 10, swathKm: 250, look: S1_LOOK, color: '#8a5cd6' },
  { id: 's1d', norad: 66315, name: 'Sentinel-1D', mission: 'sentinel1', sensor: 'C-SAR', kind: 'radar', resM: 10, swathKm: 250, look: S1_LOOK, color: '#8a5cd6' },
  { id: 's3a', norad: 41335, name: 'Sentinel-3A', mission: 'sentinel3', sensor: 'OLCI', kind: 'optical', resM: 300, swathKm: 1270, look: S3_LOOK, color: '#d0901c' },
  { id: 's3b', norad: 43437, name: 'Sentinel-3B', mission: 'sentinel3', sensor: 'OLCI', kind: 'optical', resM: 300, swathKm: 1270, look: S3_LOOK, color: '#d0901c' },
]

export const MISSIONS = [
  { id: 'sentinel2', label: 'Sentinel-2', desc: 'Optical, 10 m' },
  { id: 'landsat', label: 'Landsat 8/9', desc: 'Optical, 30 m' },
  { id: 'sentinel1', label: 'Sentinel-1', desc: 'Radar, 10 m, sees through clouds' },
  { id: 'sentinel3', label: 'Sentinel-3', desc: 'Optical, 300 m, near daily' },
] as const

/** Un óptico necesita luz: por debajo de este Sol (grados) la imagen no sirve o no se toma */
export const MIN_SUN_EL = 10

export interface Opportunity {
  imager: string
  /** Instante de máxima aproximación a la traza, ms */
  t: number
  /** Distancia del punto a la traza, km */
  crossKm: number
  /** Ángulo de visión desde el nadir, grados */
  offNadir: number
  /** Al este (+) u oeste (−) de la traza */
  side: 1 | -1
  ascending: boolean
  sunEl: number
  altKm: number
}

/** Ángulo desde el nadir con el que el satélite ve un punto a `groundKm` de su traza */
export function offNadirDeg(groundKm: number, altKm: number) {
  const R = 6371
  const g = groundKm / R
  return (Math.atan2(R * Math.sin(g), R + altKm - R * Math.cos(g)) * 180) / Math.PI
}

/** Distancia en el suelo (km) desde la traza hasta donde mira un ángulo desde el nadir (con signo) */
export function groundFromLook(lookDeg: number, altKm: number) {
  const R = 6371
  const a = (Math.abs(lookDeg) * Math.PI) / 180
  const s = ((R + altKm) / R) * Math.sin(a)
  const g = s >= 1 ? Math.PI / 2 - a : Math.asin(s) - a // s ≥ 1: la visual pasa del horizonte
  return Math.sign(lookDeg) * R * g
}

/**
 * ¿Cae en la franja un punto a `crossKm` de la traza? Con signo: positivo si está a la derecha
 * de la marcha del satélite.
 */
export function inSwath(look: [number, number], crossKm: number, altKm: number) {
  const off = Math.sign(crossKm) * offNadirDeg(Math.abs(crossKm), altKm)
  return off >= look[0] - 1e-9 && off <= look[1] + 1e-9
}

/** Lo más lejos de la traza (km) que puede llegar la franja */
export const maxReachKm = (look: [number, number], altKm: number) => Math.max(Math.abs(groundFromLook(look[0], altKm)), Math.abs(groundFromLook(look[1], altKm)))

// ——— Nubes: previsión horaria de Open-Meteo (gratuita, sin clave, uso no comercial) ———

export interface CloudForecast {
  lat: number
  lon: number
  /** Inicio de cada hora (ms) y cobertura nubosa total (%) */
  t: number[]
  cover: number[]
}

export async function fetchClouds(lat: number, lon: number, signal?: AbortSignal): Promise<CloudForecast> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&hourly=cloud_cover&forecast_days=16&timezone=GMT`
  const r = await fetch(url, { signal })
  if (!r.ok) throw new Error(`Open-Meteo ${r.status}`)
  const j = (await r.json()) as { hourly?: { time: string[]; cloud_cover: (number | null)[] } }
  if (!j.hourly) throw new Error('Open-Meteo: no hourly data')
  const t: number[] = []
  const cover: number[] = []
  j.hourly.time.forEach((s, k) => {
    const c = j.hourly!.cloud_cover[k]
    if (c == null) return
    t.push(Date.parse(`${s}:00Z`))
    cover.push(c)
  })
  return { lat, lon, t, cover }
}

/** Cobertura nubosa interpolada en un instante; null fuera de la previsión */
export function cloudAt(f: CloudForecast | null, ms: number): number | null {
  if (!f || f.t.length < 2 || ms < f.t[0] || ms > f.t[f.t.length - 1]) return null
  let lo = 0
  let hi = f.t.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (f.t[mid] <= ms) lo = mid
    else hi = mid
  }
  const a = (ms - f.t[lo]) / (f.t[hi] - f.t[lo])
  return f.cover[lo] + (f.cover[hi] - f.cover[lo]) * a
}

export type Verdict = 'clear' | 'partly' | 'cloudy' | 'unknown' | 'radar'

export function verdictFor(kind: SensorKind, cloud: number | null): Verdict {
  if (kind === 'radar') return 'radar'
  if (cloud == null) return 'unknown'
  return cloud < 25 ? 'clear' : cloud < 60 ? 'partly' : 'cloudy'
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  clear: 'Likely clear',
  partly: 'Partly cloudy',
  cloudy: 'Likely cloudy',
  unknown: 'No forecast yet',
  radar: 'Any weather',
}

/** Enlaces para descargar las imágenes de un punto */
export function dataLinks(lat: number, lon: number) {
  return {
    copernicus: `https://browser.dataspace.copernicus.eu/?zoom=11&lat=${lat.toFixed(4)}&lng=${lon.toFixed(4)}`,
    earthExplorer: 'https://earthexplorer.usgs.gov/',
  }
}
