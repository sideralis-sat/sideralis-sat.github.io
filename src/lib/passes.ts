/**
 * Pases de un satélite sobre una estación terrestre.
 *
 * Geometría topocéntrica: el vector estación→satélite se expresa en el sistema local
 * SEZ (Sur, Este, Cénit) y de ahí salen
 *   elevación  El = arcsen(ρ_Z / |ρ|)
 *   acimut     Az = atan2(ρ_E, −ρ_S)        (desde el norte, hacia el este)
 * (lo hace ecfToLookAngles de satellite.js, Vallado alg. 27).
 *
 * Doppler: la frecuencia recibida es f = f₀ · (1 − ṙ/c), con ṙ la velocidad radial
 * (negativa al acercarse: la frecuencia sube).
 */
import { ecfToLookAngles, eciToEcf, gstime, propagate, shadowFraction, sunPos, jday } from 'satellite.js'
import type { SatRecord } from '../data/types'
import { satrecOf } from './propagateRecord'

export const C_KM_S = 299_792.458
const DEG = 180 / Math.PI

export interface Station {
  name: string
  lat: number // grados
  lon: number
  altKm: number
}

export const DEFAULT_STATION: Station = { name: 'Madrid', lat: 40.4168, lon: -3.7038, altKm: 0.667 }

export interface Look {
  t: number
  az: number // grados
  el: number
  range: number // km
  rangeRate: number // km/s
  sunlit: boolean
}

const jdOf = (d: Date) => jday(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds() + d.getUTCMilliseconds() / 1000)

function observer(st: Station) {
  return { latitude: st.lat / DEG, longitude: st.lon / DEG, height: st.altKm }
}

/** Ángulos de observación de un satélite desde la estación en el instante t */
export function lookAt(record: SatRecord, st: Station, t: number, withRate = false): Look | null {
  const satrec = satrecOf(record)
  if (!satrec) return null
  const obs = observer(st)
  const at = (ms: number) => {
    const d = new Date(ms)
    const pv = propagate(satrec, d)
    if (!pv) return null
    const ecf = eciToEcf(pv.position, gstime(d))
    return { la: ecfToLookAngles(obs, ecf), pos: pv.position, d }
  }
  const a = at(t)
  if (!a) return null
  let rangeRate = 0
  if (withRate) {
    const p = at(t - 500)
    const n = at(t + 500)
    if (p && n) rangeRate = n.la.rangeSat - p.la.rangeSat // km en 1 s
  }
  return {
    t,
    az: (a.la.azimuth * DEG + 360) % 360,
    el: a.la.elevation * DEG,
    range: a.la.rangeSat,
    rangeRate,
    sunlit: withRate ? shadowFraction(sunPos(jdOf(a.d)).rsun, a.pos) < 0.5 : true,
  }
}

/** Elevación del Sol vista desde la estación (grados): < −6° es crepúsculo civil terminado */
export function sunElevation(st: Station, t: number) {
  const d = new Date(t)
  const s = sunPos(jdOf(d)).rsun
  const AU = 149_597_870.7
  const ecf = eciToEcf({ x: s.x * AU, y: s.y * AU, z: s.z * AU }, gstime(d))
  return ecfToLookAngles(observer(st), ecf).elevation * DEG
}

export interface Pass {
  aos: number
  tca: number
  los: number
  maxEl: number
  azAos: number
  azTca: number
  azLos: number
  /** Visible a simple vista: satélite iluminado, cielo oscuro en la estación y elevación > 10° */
  visible: boolean
  track: Look[]
}

export type PassResult =
  | { kind: 'passes'; passes: Pass[] }
  | { kind: 'always'; look: Look }
  | { kind: 'never' }
  | { kind: 'error' }

/**
 * Busca los pases en una ventana: barrido grueso de la elevación, bisección de los cruces
 * con la máscara (AOS/LOS, ±0,5 s) y búsqueda del máximo (TCA).
 */
export function predictPasses(record: SatRecord, st: Station, t0: number, hours = 48, minEl = 0): PassResult {
  const periodMin = 1440 / Number(record.MEAN_MOTION)
  const step = Math.max(10_000, Math.min(120_000, (periodMin * 60_000) / 180))
  const end = t0 + hours * 3_600_000
  const el = (t: number) => lookAt(record, st, t)?.el ?? NaN

  const first = el(t0)
  if (Number.isNaN(first)) return { kind: 'error' }

  const refine = (lo: number, hi: number, risingAtHi: boolean) => {
    while (hi - lo > 500) {
      const mid = (lo + hi) / 2
      if (el(mid) >= minEl === risingAtHi) hi = mid
      else lo = mid
    }
    return (lo + hi) / 2
  }

  const passes: Pass[] = []
  let up = first >= minEl
  let aos: number | null = up ? t0 : null
  let alwaysUp = up
  let prevT = t0
  for (let t = t0 + step; t <= end; t += step) {
    const e = el(t)
    if (Number.isNaN(e)) break
    const nowUp = e >= minEl
    if (nowUp !== up) {
      alwaysUp = false
      const cross = refine(prevT, t, nowUp)
      if (nowUp) aos = cross
      else if (aos !== null) {
        passes.push(buildPass(record, st, aos, cross))
        aos = null
      }
      up = nowUp
    }
    prevT = t
    if (passes.length >= 30) break
  }
  if (alwaysUp) {
    const look = lookAt(record, st, t0, true)
    return look ? { kind: 'always', look } : { kind: 'error' }
  }
  if (aos !== null && passes.length < 30) passes.push(buildPass(record, st, aos, end))
  return passes.length ? { kind: 'passes', passes } : { kind: 'never' }
}

function buildPass(record: SatRecord, st: Station, aos: number, los: number): Pass {
  const n = Math.max(30, Math.min(240, Math.round((los - aos) / 2000)))
  const track: Look[] = []
  for (let k = 0; k <= n; k++) {
    const l = lookAt(record, st, aos + ((los - aos) * k) / n, true)
    if (l) track.push(l)
  }
  let best = track[0]
  for (const l of track) if (l.el > best.el) best = l
  // Afinar el máximo (sección áurea alrededor de la mejor muestra)
  const dt = (los - aos) / n
  let lo = Math.max(aos, best.t - dt)
  let hi = Math.min(los, best.t + dt)
  for (let k = 0; k < 30; k++) {
    const m1 = hi - (hi - lo) / 1.618
    const m2 = lo + (hi - lo) / 1.618
    if ((lookAt(record, st, m1)?.el ?? -90) > (lookAt(record, st, m2)?.el ?? -90)) hi = m2
    else lo = m1
  }
  const tca = (lo + hi) / 2
  const top = lookAt(record, st, tca, true) ?? best
  const visible = top.el > 10 && top.sunlit && sunElevation(st, tca) < -6
  return {
    aos,
    tca,
    los,
    maxEl: top.el,
    azAos: track[0]?.az ?? 0,
    azTca: top.az,
    azLos: track[track.length - 1]?.az ?? 0,
    visible,
    track,
  }
}

/** Desplazamiento Doppler (Hz) para una frecuencia f₀ (Hz) y una velocidad radial (km/s) */
export const dopplerShift = (f0: number, rangeRate: number) => -f0 * (rangeRate / C_KM_S)

const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
export const compass = (az: number) => POINTS[Math.round(az / 22.5) % 16]
