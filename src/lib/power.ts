/**
 * Luz y sombra: eclipses, ángulo β y balance de energía solar.
 */
import { jday, propagate, shadowFraction, sunPos } from 'satellite.js'
import type { SatRecord } from '../data/types'
import { meanElements, RE } from './astrodynamics'
import { satrecOf } from './propagateRecord'

const DEG = Math.PI / 180

export const SOLAR_CONSTANT = 1361 // W/m², irradiancia solar media a 1 UA (TSI)

export type LightState = 'sun' | 'penumbra' | 'umbra'

export interface LightSegment {
  start: number
  end: number
  state: LightState
}

function jdOf(ms: number) {
  const d = new Date(ms)
  return jday(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds() + d.getUTCMilliseconds() / 1000)
}

/** Dirección del Sol (unitaria, ECI) */
export function sunUnit(ms: number) {
  const s = sunPos(jdOf(ms)).rsun
  const n = Math.hypot(s.x, s.y, s.z)
  return { x: s.x / n, y: s.y / n, z: s.z / n, au: s }
}

const stateOf = (f: number): LightState => (f < 0.001 ? 'sun' : f > 0.999 ? 'umbra' : 'penumbra')

/**
 * Línea temporal de luz/sombra muestreando SGP4 + modelo de sombra cónico
 * (umbra y penumbra) de satellite.js. Los bordes se afinan por bisección hasta ~1 s.
 */
export function lightTimeline(record: SatRecord, t0: number, durationMs: number): LightSegment[] {
  const satrec = satrecOf(record)
  if (!satrec) return []
  const periodMs = (1440 / Number(record.MEAN_MOTION)) * 60_000
  const step = Math.max(5_000, Math.min(60_000, periodMs / 400))
  const stateAt = (t: number): LightState | null => {
    const pv = propagate(satrec, new Date(t))
    if (!pv) return null
    return stateOf(shadowFraction(sunPos(jdOf(t)).rsun, pv.position))
  }
  const segs: LightSegment[] = []
  let prevT = t0
  let prev = stateAt(t0)
  if (!prev) return []
  let segStart = t0
  for (let t = t0 + step; t <= t0 + durationMs; t += step) {
    const s = stateAt(t)
    if (!s) break
    if (s !== prev) {
      // Bisección del cambio de estado
      let lo = prevT
      let hi = t
      while (hi - lo > 1000) {
        const mid = (lo + hi) / 2
        if (stateAt(mid) === prev) lo = mid
        else hi = mid
      }
      segs.push({ start: segStart, end: hi, state: prev })
      segStart = hi
      // Puede haber saltado la penumbra (dura segundos en LEO): se toma el estado de después
      prev = stateAt(hi + 1) ?? s
    }
    prevT = t
  }
  segs.push({ start: segStart, end: t0 + durationMs, state: prev })
  return segs
}

/** Duración de cada estado en una ventana, en minutos */
export function lightTotals(segs: LightSegment[]) {
  const tot = { sun: 0, penumbra: 0, umbra: 0 }
  for (const s of segs) tot[s.state] += (s.end - s.start) / 60_000
  return tot
}

/**
 * Fracción de eclipse de una órbita circular (modelo de sombra cilíndrica):
 *   β* = arcsen(R⊕ / (R⊕ + h))
 *   f_E = (1/π) · arccos( √(h² + 2R⊕h) / ((R⊕ + h) · cos β) )   si |β| < β*,  y 0 si no
 */
export function eclipseAnalytic(altKm: number, betaDeg: number) {
  const a = RE + altKm
  const betaCrit = Math.asin(RE / a) / DEG
  const beta = Math.abs(betaDeg)
  if (beta >= betaCrit) return { fraction: 0, betaCrit }
  const arg = Math.sqrt(altKm * altKm + 2 * RE * altKm) / (a * Math.cos(beta * DEG))
  return { fraction: Math.acos(Math.min(1, arg)) / Math.PI, betaCrit }
}

/**
 * Evolución del ángulo β durante los próximos días. El plano orbital gira por J2
 * (dΩ/dt) y el Sol avanza ~1°/día por la eclíptica; la combinación produce las
 * «temporadas» sin eclipses cuando |β| supera β*.
 *   n̂ = (sen i · sen Ω, −sen i · cos Ω, cos i),   β = arcsen(n̂ · ŝ)
 */
export function betaSeries(record: SatRecord, t0: number, days = 90, stepDays = 0.5) {
  const m = meanElements(record)
  const out: { t: number; beta: number }[] = []
  for (let d = 0; d <= days; d += stepDays) {
    const t = t0 + d * 86_400_000
    const raan = (m.raan + m.raanDot * ((t - m.epoch) / 86_400_000)) * DEG
    const i = m.i * DEG
    const n = { x: Math.sin(i) * Math.sin(raan), y: -Math.sin(i) * Math.cos(raan), z: Math.cos(i) }
    const s = sunUnit(t)
    out.push({ t, beta: Math.asin(n.x * s.x + n.y * s.y + n.z * s.z) / DEG })
  }
  return out
}

export interface PowerInput {
  areaM2: number
  efficiency: number // 0..1
  /** Factor de apuntamiento medio: 1 con seguimiento solar, ~0,32 (1/π) en un panel fijo girando */
  pointing: number
  loadW: number
  periodMin: number
  sunMin: number
  eclipseMin: number
  /** Profundidad de descarga admisible de la batería (0..1) */
  dod: number
}

export function powerBudget(p: PowerInput) {
  const pSun = SOLAR_CONSTANT * p.efficiency * p.areaM2 * p.pointing // W mientras hay Sol
  const energyIn = (pSun * p.sunMin) / 60 // Wh por órbita
  const energyOut = (p.loadW * p.periodMin) / 60 // Wh consumidos por órbita
  const eclipseEnergy = (p.loadW * p.eclipseMin) / 60 // Wh que salen de la batería en la sombra
  return {
    pSun,
    avgPower: (energyIn / p.periodMin) * 60,
    energyIn,
    energyOut,
    margin: energyIn - energyOut,
    eclipseEnergy,
    battery: eclipseEnergy / p.dod, // Wh de capacidad necesaria
  }
}
