/**
 * Cálculos de mecánica orbital para el panel de telemetría.
 * Unidades: km, s, rad (salvo que el nombre diga otra cosa). Constantes WGS-72/84 al uso en SGP4.
 */
import { eciToEcfVelocity, eciToGeodetic, gstime, jday, shadowFraction, sunPos } from 'satellite.js'
import type { SatRecord } from '../data/types'
import { epochMs } from './orbit'
import { propagateRecord } from './propagateRecord'

export const MU = 398600.4418 // km³/s²
export const RE = 6378.137 // km, radio ecuatorial
export const J2 = 1.08262668e-3
const DEG = 180 / Math.PI
const TWO_PI = 2 * Math.PI
const SIDEREAL_YEAR_RATE = 360 / 365.2422 // °/día que debe girar el nodo en una órbita heliosíncrona

type V3 = { x: number; y: number; z: number }
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const norm = (a: V3) => Math.sqrt(dot(a, a))
const wrap = (a: number) => ((a % TWO_PI) + TWO_PI) % TWO_PI

export interface OsculatingElements {
  a: number
  e: number
  i: number
  raan: number | null // indefinido si la órbita es ecuatorial
  argp: number | null // indefinido si la órbita es circular o ecuatorial
  nu: number | null // indefinido si la órbita es circular
  /** Argumento de latitud u = ω + ν (definido en órbitas circulares inclinadas) */
  u: number | null
  energy: number // km²/s²
  h: number // km²/s
  hVec: V3
}

/** Elementos clásicos osculantes a partir del vector de estado (algoritmo RV2COE, Vallado 2.5) */
export function rv2coe(r: V3, v: V3): OsculatingElements {
  const rn = norm(r)
  const vn = norm(v)
  const hVec = cross(r, v)
  const h = norm(hVec)
  const nVec = { x: -hVec.y, y: hVec.x, z: 0 } // k × h
  const n = norm(nVec)
  const rv = dot(r, v)
  const c1 = vn * vn - MU / rn
  const eVec = { x: (c1 * r.x - rv * v.x) / MU, y: (c1 * r.y - rv * v.y) / MU, z: (c1 * r.z - rv * v.z) / MU }
  const e = norm(eVec)
  const energy = (vn * vn) / 2 - MU / rn
  const a = -MU / (2 * energy)
  const i = Math.acos(hVec.z / h)

  const SMALL = 1e-8
  let raan: number | null = null
  let argp: number | null = null
  let nu: number | null = null
  let u: number | null = null

  if (n > SMALL) {
    raan = Math.acos(Math.max(-1, Math.min(1, nVec.x / n)))
    if (nVec.y < 0) raan = TWO_PI - raan
    u = Math.acos(Math.max(-1, Math.min(1, dot(nVec, r) / (n * rn))))
    if (r.z < 0) u = TWO_PI - u
  }
  if (e > 1e-6) {
    nu = Math.acos(Math.max(-1, Math.min(1, dot(eVec, r) / (e * rn))))
    if (rv < 0) nu = TWO_PI - nu
    if (n > SMALL) {
      argp = Math.acos(Math.max(-1, Math.min(1, dot(nVec, eVec) / (n * e))))
      if (eVec.z < 0) argp = TWO_PI - argp
    }
  }
  return { a, e, i, raan, argp, nu, u, energy, h, hVec }
}

export interface Telemetry {
  time: number
  /** Vector de estado en TEME (≈ ECI de fecha) */
  r: V3
  v: V3
  rMag: number
  vMag: number
  /** Geodésicas */
  latDeg: number
  lonDeg: number
  altKm: number
  /** Velocidad respecto al suelo (marco ECEF) */
  groundSpeed: number
  osc: OsculatingElements
  /** Ángulo β: entre el plano orbital y la dirección del Sol (grados) */
  betaDeg: number
  /** 0 = iluminado, 1 = umbra, intermedio = penumbra */
  shadow: number
  /** Ángulo de visibilidad: semiángulo central de la huella a 0° de elevación (grados) */
  footprintDeg: number
  footprintRadiusKm: number
}

export function telemetry(record: SatRecord, ms: number): Telemetry | null {
  const pv = propagateRecord(record, ms)
  if (!pv) return null
  const r = pv.position
  const v = pv.velocity
  const date = new Date(ms)
  const gmst = gstime(date)
  const geo = eciToGeodetic(r, gmst)
  const vEcf = eciToEcfVelocity(r, v, gmst)
  const osc = rv2coe(r, v)

  const jd = jday(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds() + date.getUTCMilliseconds() / 1000)
  const sun = sunPos(jd).rsun
  const sunN = norm(sun)
  const beta = Math.asin(dot(osc.hVec, sun) / (osc.h * sunN))
  const rMag = norm(r)
  const lambda = Math.acos(Math.min(1, RE / rMag))

  return {
    time: ms,
    r,
    v,
    rMag,
    vMag: norm(v),
    latDeg: geo.latitude * DEG,
    lonDeg: ((geo.longitude * DEG + 540) % 360) - 180,
    altKm: geo.height,
    groundSpeed: norm(vEcf),
    osc,
    betaDeg: beta * DEG,
    shadow: shadowFraction(sun, r),
    footprintDeg: lambda * DEG,
    footprintRadiusKm: lambda * RE,
  }
}

export interface MeanElements {
  epoch: number
  n: number // rev/día
  nDot: number // rev/día² (MEAN_MOTION_DOT, ya dividido por 2 en el formato TLE)
  bstar: number // 1/R_tierra
  a: number
  e: number
  i: number // grados
  raan: number
  argp: number
  m: number
  periodMin: number
  apogeeAlt: number
  perigeeAlt: number
  revAtEpoch: number | null
  /** Derivas seculares por J2 (°/día) */
  raanDot: number
  argpDot: number
  sunSynchronous: boolean
  /** Órbita heliosíncrona o con el plano muy cerca de serlo */
}

/** Elementos medios (SGP4) del registro OMM y sus derivas seculares por J2 */
export function meanElements(r: SatRecord): MeanElements {
  const n = Number(r.MEAN_MOTION)
  const e = Number(r.ECCENTRICITY)
  const i = Number(r.INCLINATION)
  const nRad = (n * TWO_PI) / 86400
  const a = Math.cbrt(MU / (nRad * nRad))
  const p = a * (1 - e * e)
  const k = nRad * J2 * (RE / p) ** 2 * 86400 * DEG // °/día
  const cosi = Math.cos(i / DEG)
  const raanDot = -1.5 * k * cosi
  const argpDot = 0.75 * k * (5 * cosi * cosi - 1)
  return {
    epoch: epochMs(r),
    n,
    nDot: Number(r.MEAN_MOTION_DOT ?? 0),
    bstar: Number(r.BSTAR ?? 0),
    a,
    e,
    i,
    raan: Number(r.RA_OF_ASC_NODE),
    argp: Number(r.ARG_OF_PERICENTER),
    m: Number(r.MEAN_ANOMALY),
    periodMin: 1440 / n,
    apogeeAlt: a * (1 + e) - RE,
    perigeeAlt: a * (1 - e) - RE,
    revAtEpoch: r.REV_AT_EPOCH !== undefined ? Number(r.REV_AT_EPOCH) : null,
    raanDot,
    argpDot,
    sunSynchronous: Math.abs(raanDot - SIDEREAL_YEAR_RATE) < 0.05,
  }
}

export const wrapDeg = (rad: number) => wrap(rad) * DEG

/** Fecha juliana (UT) */
export const julianDate = (ms: number) => ms / 86_400_000 + 2440587.5
