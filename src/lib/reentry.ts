/**
 * Reentrada: maniobra de desorbitado y caída por la atmósfera.
 *
 * Dinámica (marco inercial, km y s), integrada con Runge-Kutta de 4.º orden:
 *   r̈ = −μ r/|r|³  +  a_J2  +  a_arrastre
 *   a_J2  = −(3/2) J2 μ R⊕² / r⁵ · [x(1 − 5z²/r²), y(1 − 5z²/r²), z(3 − 5z²/r²)]
 *   a_arr = −½ · ρ(h) · |v_rel| · v_rel / BC,   v_rel = v − ω⊕ × r  (la atmósfera gira con la Tierra)
 * con ρ(h) de la atmósfera exponencial de Vallado y BC = m/(C_D·A).
 *
 * Simplificaciones: atmósfera media sin actividad solar, BC constante (sin fragmentación
 * ni ablación) y una sola maniobra impulsiva. Sirve para entender órdenes de magnitud,
 * no para predecir dónde cae un satélite real.
 */
import { eciToGeodetic, gstime } from 'satellite.js'
import { J2, MU, RE, rv2coe } from './astrodynamics'
import { density } from './atmosphere'

export const OMEGA_EARTH = 7.2921159e-5 // rad/s
export const ENTRY_INTERFACE_KM = 120
const G0 = 9.80665

type V3 = { x: number; y: number; z: number }
const add = (a: V3, b: V3, k = 1): V3 => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k })
const len = (a: V3) => Math.hypot(a.x, a.y, a.z)
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z

/** Altitud geodésica (km) de una posición inercial en el instante t */
function geodetic(r: V3, t: number) {
  const g = eciToGeodetic(r, gstime(new Date(t)))
  return { lat: (g.latitude * 180) / Math.PI, lon: ((((g.longitude * 180) / Math.PI + 540) % 360) - 180), h: g.height }
}

const vRel = (r: V3, v: V3): V3 => ({ x: v.x + OMEGA_EARTH * r.y, y: v.y - OMEGA_EARTH * r.x, z: v.z })

/** Densidad del aire (kg/m³) en función de la altitud (km) */
export type DensityFn = (hKm: number) => number

function accel(r: V3, v: V3, bc: number, hKm: number, rho: DensityFn = density) {
  const rn = len(r)
  const r2 = rn * rn
  const k = -MU / (r2 * rn)
  const zr = (r.z * r.z) / r2
  const j = (-1.5 * J2 * MU * RE * RE) / (r2 * r2 * rn)
  const a = {
    x: k * r.x + j * r.x * (1 - 5 * zr),
    y: k * r.y + j * r.y * (1 - 5 * zr),
    z: k * r.z + j * r.z * (3 - 5 * zr),
  }
  let drag = 0
  if (hKm < 1000) {
    const vr = vRel(r, v)
    const vrn = len(vr) // km/s
    const dens = rho(hKm) // kg/m³
    // ½ρv²/BC en m/s² → km/s²: ½·ρ·(v·1000)²/BC/1000 = 500·ρ·v²/BC
    drag = (500 * dens * vrn * vrn) / bc
    if (vrn > 0) {
      a.x -= (drag * vr.x) / vrn
      a.y -= (drag * vr.y) / vrn
      a.z -= (drag * vr.z) / vrn
    }
  }
  return { a, drag } // drag en km/s²
}

/** Aplica una maniobra impulsiva: Δv en m/s, negativa = retrógrada (frena) */
export function applyBurn(v: V3, dvMs: number): V3 {
  const n = len(v)
  return add(v, { x: v.x / n, y: v.y / n, z: v.z / n }, dvMs / 1000)
}

/** Apogeo y perigeo (altitud sobre el radio ecuatorial) tras una maniobra */
export function orbitAfterBurn(r: V3, v: V3, dvMs: number) {
  const o = rv2coe(r, applyBurn(v, -Math.abs(dvMs)))
  return { perigeeAlt: o.a * (1 - o.e) - RE, apogeeAlt: o.a * (1 + o.e) - RE, a: o.a, e: o.e }
}

/** Δv retrógrado (m/s) necesario para bajar el perigeo a una altitud objetivo */
export function dvForPerigee(r: V3, v: V3, targetAlt: number) {
  let lo = 0
  let hi = 2000
  if (orbitAfterBurn(r, v, 0).perigeeAlt <= targetAlt) return 0
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2
    if (orbitAfterBurn(r, v, mid).perigeeAlt > targetAlt) lo = mid
    else hi = mid
  }
  return hi
}

export interface TrajPoint {
  t: number
  r: V3
  h: number
  lat: number
  lon: number
  speed: number // km/s, respecto a la atmósfera
  decelG: number
}

export interface ReentryResult {
  status: 'impact' | 'no-reentry'
  burnTime: number
  points: TrajPoint[]
  /** Interfaz de entrada (120 km) */
  entry?: { t: number; speed: number; gammaDeg: number; lat: number; lon: number }
  maxDecel?: { g: number; h: number }
  maxQ?: { kPa: number; h: number }
  impact?: { t: number; lat: number; lon: number; speed: number }
  /** Altitud mínima alcanzada si no reentra */
  minAlt: number
}

/**
 * Integra desde el instante de la maniobra hasta el suelo (o hasta `maxHours`).
 * Paso variable según la altitud: 10 s por encima de 200 km, 2 s hasta 150 km, 0,25 s en la
 * entrada y 0,5 s en los últimos 30 km (ya en caída casi vertical y lenta).
 */
export function simulateReentry(r0: V3, v0: V3, t0: number, bc: number, maxHours = 72, rho: DensityFn = density): ReentryResult {
  let r = r0
  let v = v0
  let t = t0
  const points: TrajPoint[] = []
  let minAlt = Infinity
  let entry: ReentryResult['entry']
  let maxDecel = { g: 0, h: 0 }
  let maxQ = { kPa: 0, h: 0 }
  let lastSample = -Infinity
  const tEnd = t0 + maxHours * 3_600_000

  while (t < tEnd) {
    const geo = geodetic(r, t)
    const h = geo.h
    minAlt = Math.min(minAlt, h)
    const { drag } = accel(r, v, bc, h, rho)
    const vr = len(vRel(r, v))
    const decelG = (drag * 1000) / G0
    if (decelG > maxDecel.g) maxDecel = { g: decelG, h }
    const q = 0.5 * rho(h) * (vr * 1000) ** 2 / 1000 // kPa
    if (q > maxQ.kPa) maxQ = { kPa: q, h }

    if (!entry && h <= ENTRY_INTERFACE_KM) {
      const vrel = vRel(r, v)
      entry = { t, speed: vr, gammaDeg: (Math.asin(dot(r, vrel) / (len(r) * vr)) * 180) / Math.PI, lat: geo.lat, lon: geo.lon }
    }
    const sampleEvery = h > 150 ? 20_000 : h > 60 ? 2_000 : 500
    if (t - lastSample >= sampleEvery) {
      points.push({ t, r, h, lat: geo.lat, lon: geo.lon, speed: vr, decelG })
      lastSample = t
    }
    if (h <= 0) {
      return { status: 'impact', burnTime: t0, points, entry, maxDecel, maxQ, impact: { t, lat: geo.lat, lon: geo.lon, speed: vr }, minAlt: 0 }
    }

    const dt = h > 200 ? 10 : h > 150 ? 2 : h > 30 ? 0.25 : 0.5
    // RK4
    const f = (rr: V3, vv: V3) => {
      // Altitud sobre el elipsoide aproximada (achatamiento f = 1/298,257): R(φ) ≈ R⊕(1 − f·sen²φ)
      const rn = len(rr)
      const s2 = (rr.z / rn) ** 2
      const hh = rn - RE * (1 - s2 / 298.257)
      return accel(rr, vv, bc, hh, rho).a
    }
    const k1v = f(r, v)
    const k1r = v
    const k2v = f(add(r, k1r, dt / 2), add(v, k1v, dt / 2))
    const k2r = add(v, k1v, dt / 2)
    const k3v = f(add(r, k2r, dt / 2), add(v, k2v, dt / 2))
    const k3r = add(v, k2v, dt / 2)
    const k4v = f(add(r, k3r, dt), add(v, k3v, dt))
    const k4r = add(v, k3v, dt)
    r = { x: r.x + (dt / 6) * (k1r.x + 2 * k2r.x + 2 * k3r.x + k4r.x), y: r.y + (dt / 6) * (k1r.y + 2 * k2r.y + 2 * k3r.y + k4r.y), z: r.z + (dt / 6) * (k1r.z + 2 * k2r.z + 2 * k3r.z + k4r.z) }
    v = { x: v.x + (dt / 6) * (k1v.x + 2 * k2v.x + 2 * k3v.x + k4v.x), y: v.y + (dt / 6) * (k1v.y + 2 * k2v.y + 2 * k3v.y + k4v.y), z: v.z + (dt / 6) * (k1v.z + 2 * k2v.z + 2 * k3v.z + k4v.z) }
    t += dt * 1000
  }
  return { status: 'no-reentry', burnTime: t0, points, minAlt, maxDecel, maxQ }
}

/**
 * Vida orbital por arrastre (órbita casi circular), en días:
 *   da/dt = −ρ(h) · √(μ·a) / BC
 * Para órbitas algo excéntricas se usa una altura efectiva h_ef = h_p + 900·e^0,6 (Bureau
 * of Meteorology de Australia, «Satellite Orbital Decay Calculations»).
 */
export function naturalDecay(perigeeAlt: number, e: number, bc: number, maxYears = 200, rho: (hKm: number, tSec: number) => number = (h) => density(h)) {
  let h = perigeeAlt + 900 * Math.pow(Math.max(0, e), 0.6)
  let a = (RE + h) * 1000 // m
  const mu = MU * 1e9 // m³/s²
  let t = 0 // s
  const series: { days: number; h: number }[] = [{ days: 0, h }]
  const limit = maxYears * 365.25 * 86400
  while (h > ENTRY_INTERFACE_KM && t < limit) {
    const dadt = (-rho(h, t) * Math.sqrt(mu * a)) / bc // m/s
    // Paso tal que la altitud baje como mucho ~1 km (o 30 días)
    const dt = Math.min(30 * 86400, Math.max(60, 1000 / Math.abs(dadt)))
    a += dadt * dt
    t += dt
    h = a / 1000 - RE
    if (t / 86400 - series[series.length - 1].days > Math.max(0.5, t / 86400 / 200)) series.push({ days: t / 86400, h: Math.max(h, ENTRY_INTERFACE_KM) })
  }
  series.push({ days: t / 86400, h: Math.max(h, ENTRY_INTERFACE_KM) })
  return { days: t / 86400, reentered: h <= ENTRY_INTERFACE_KM, series }
}

/** Punto Nemo: el punto oceánico más alejado de tierra firme, «cementerio de naves» */
export const POINT_NEMO = { lat: -48.8767, lon: -123.3933 }

/** Distancia de círculo máximo (km) */
export function greatCircleKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = Math.PI / 180
  const dlat = (lat2 - lat1) * r
  const dlon = (lon2 - lon1) * r
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dlon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)))
}
