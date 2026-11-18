/**
 * El cielo visto desde una estación: coordenadas topocéntricas de todo el catálogo,
 * iluminación y geometría GNSS (DOP).
 *
 * Cadena de transformaciones para cada objeto:
 *   TEME/ECI ──R_z(θ_GMST)──▶ ECEF ──(r − r_estación)──▶ ENU (Este, Norte, Cénit)
 *   El = arcsen(u / ρ),  Az = atan2(e, n)   (desde el norte hacia el este)
 *
 * La estación se sitúa sobre el elipsoide WGS-84 (latitud geodésica):
 *   N = a / √(1 − e² sen²φ)
 *   x = (N + h) cos φ cos λ,  y = (N + h) cos φ sen λ,  z = (N(1 − e²) + h) sen φ
 */
import type { SatRecord } from '../data/types'
import { gmstAt, sunEciAt } from './astro'
import { EARTH_RADIUS_KM } from './coords'
import type { Station } from './passes'
import { propagateRecord } from './propagateRecord'

const DEG = Math.PI / 180
const WGS_A = 6378.137
const WGS_F = 1 / 298.257223563
const WGS_E2 = WGS_F * (2 - WGS_F)
const RE = 6378.137

export interface Topocentric {
  /** Matriz ECEF → ENU (filas: e, n, u) y posición ECEF de la estación (km) */
  rot: Float64Array
  pos: [number, number, number]
}

export function topocentric(st: Station): Topocentric {
  const phi = st.lat * DEG
  const lam = st.lon * DEG
  const sp = Math.sin(phi)
  const cp = Math.cos(phi)
  const sl = Math.sin(lam)
  const cl = Math.cos(lam)
  const N = WGS_A / Math.sqrt(1 - WGS_E2 * sp * sp)
  const h = st.altKm
  return {
    pos: [(N + h) * cp * cl, (N + h) * cp * sl, (N * (1 - WGS_E2) + h) * sp],
    rot: new Float64Array([-sl, cl, 0, -sp * cl, -sp * sl, cp, cp * cl, cp * sl, sp]),
  }
}

/** Vector ENU (km) desde la estación hasta un punto ECI (km) en el instante de GMST θ */
export function eciToEnu(x: number, y: number, z: number, cosT: number, sinT: number, topo: Topocentric, out: Float64Array | number[]) {
  // ECI → ECEF: rotación de −θ alrededor de z
  const xe = x * cosT + y * sinT - topo.pos[0]
  const ye = -x * sinT + y * cosT - topo.pos[1]
  const ze = z - topo.pos[2]
  const m = topo.rot
  out[0] = m[0] * xe + m[1] * ye + m[2] * ze
  out[1] = m[3] * xe + m[4] * ye + m[5] * ze
  out[2] = m[6] * xe + m[7] * ye + m[8] * ze
}

/** Sombra cilíndrica de la Tierra: true si el punto ECI (km) está iluminado */
export function sunlitCylinder(x: number, y: number, z: number, sun: [number, number, number]) {
  const d = x * sun[0] + y * sun[1] + z * sun[2]
  if (d >= 0) return true
  const px = x - d * sun[0]
  const py = y - d * sun[1]
  const pz = z - d * sun[2]
  return px * px + py * py + pz * pz > RE * RE
}

/** Elevación del Sol (grados) en la estación */
export function sunElevationAt(topo: Topocentric, ms: number) {
  const s = sunEciAt(ms)
  const g = gmstAt(ms)
  const AU = 149_597_870.7
  const enu = [0, 0, 0]
  eciToEnu(s[0] * AU, s[1] * AU, s[2] * AU, Math.cos(g), Math.sin(g), topo, enu)
  return { el: Math.asin(enu[2] / Math.hypot(enu[0], enu[1], enu[2])) / DEG, az: ((Math.atan2(enu[0], enu[1]) / DEG) + 360) % 360 }
}

export interface SkyObject {
  i: number
  az: number
  el: number
  range: number
  sunlit: boolean
}

/**
 * Objetos sobre el horizonte a partir de las posiciones (escena, interpoladas) del flujo SGP4.
 * Coste: unas 30 operaciones por satélite; con 12 000 objetos, menos de 1 ms.
 */
export function skyFromPositions(
  get: (i: number, out: Float32Array) => boolean,
  count: number,
  show: Uint8Array,
  topo: Topocentric,
  ms: number,
  minEl: number,
): SkyObject[] {
  const g = gmstAt(ms)
  const c = Math.cos(g)
  const s = Math.sin(g)
  const sun = sunEciAt(ms)
  const p = new Float32Array(3)
  const enu = new Float64Array(3)
  const out: SkyObject[] = []
  const sinMin = Math.sin(minEl * DEG)
  for (let i = 0; i < count; i++) {
    if (!show[i] || !get(i, p)) continue
    // Escena → ECI (km): x = sx·R, y = −sz·R, z = sy·R
    const x = p[0] * EARTH_RADIUS_KM
    const y = -p[2] * EARTH_RADIUS_KM
    const z = p[1] * EARTH_RADIUS_KM
    eciToEnu(x, y, z, c, s, topo, enu)
    const rho = Math.hypot(enu[0], enu[1], enu[2])
    if (enu[2] / rho < sinMin) continue
    out.push({
      i,
      az: ((Math.atan2(enu[0], enu[1]) / DEG) + 360) % 360,
      el: Math.asin(enu[2] / rho) / DEG,
      range: rho,
      sunlit: sunlitCylinder(x, y, z, sun),
    })
  }
  return out
}

/** Az/El de un registro en el instante t (para trazas en el cielo) */
export function lookRecord(record: SatRecord, topo: Topocentric, t: number) {
  const pv = propagateRecord(record, t)
  if (!pv) return null
  const g = gmstAt(t)
  const enu = [0, 0, 0]
  eciToEnu(pv.position.x, pv.position.y, pv.position.z, Math.cos(g), Math.sin(g), topo, enu)
  const rho = Math.hypot(enu[0], enu[1], enu[2])
  return { az: ((Math.atan2(enu[0], enu[1]) / DEG) + 360) % 360, el: Math.asin(enu[2] / rho) / DEG, e: enu[0] / rho, n: enu[1] / rho, u: enu[2] / rho }
}

/* ——— GNSS: dilución de la precisión ——— */

export const GNSS_SYSTEMS = [
  { id: 'gps', label: 'GPS' },
  { id: 'galileo', label: 'Galileo' },
  { id: 'glonass', label: 'GLONASS' },
  { id: 'beidou', label: 'BeiDou' },
] as const
export type GnssId = (typeof GNSS_SYSTEMS)[number]['id']

export interface Dop {
  n: number
  gdop: number
  pdop: number
  hdop: number
  vdop: number
  tdop: number
}

/**
 * DOP por mínimos cuadrados. Cada satélite aporta una fila de la matriz de geometría
 *   G_k = [ −ê_k  −n̂_k  −û_k  | 1 en la columna del reloj de su sistema ]
 * (cosenos directores de la línea de visión). Con varios sistemas hay una incógnita de
 * reloj por sistema. Q = (GᵀG)⁻¹ y
 *   PDOP = √(q_EE + q_NN + q_UU),  HDOP = √(q_EE + q_NN),  VDOP = √q_UU,
 *   TDOP = √q_tt (primer reloj),   GDOP = √tr(Q)
 */
export function computeDop(los: { e: number; n: number; u: number; sys: number }[]): Dop | null {
  // Una columna de reloj por cada sistema que aporte al menos un satélite
  const cols = new Map<number, number>()
  for (const l of los) if (!cols.has(l.sys)) cols.set(l.sys, cols.size)
  const k = 3 + Math.max(1, cols.size)
  if (los.length < k) return null
  const N = Array.from({ length: k }, () => new Float64Array(k))
  const row = new Float64Array(k)
  for (const l of los) {
    row.fill(0)
    row[0] = -l.e
    row[1] = -l.n
    row[2] = -l.u
    row[3 + cols.get(l.sys)!] = 1
    for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) N[a][b] += row[a] * row[b]
  }
  const Q = invert(N)
  if (!Q) return null
  let tr = 0
  for (let a = 0; a < k; a++) tr += Q[a][a]
  return {
    n: los.length,
    gdop: Math.sqrt(tr),
    pdop: Math.sqrt(Q[0][0] + Q[1][1] + Q[2][2]),
    hdop: Math.sqrt(Q[0][0] + Q[1][1]),
    vdop: Math.sqrt(Q[2][2]),
    tdop: Math.sqrt(Q[3][3]),
  }
}

/** Inversa por Gauss-Jordan con pivoteo parcial (matrices pequeñas, k ≤ 7) */
function invert(M: Float64Array[]): Float64Array[] | null {
  const k = M.length
  const A = M.map((r, i) => {
    const out = new Float64Array(2 * k)
    out.set(r)
    out[k + i] = 1
    return out
  })
  for (let c = 0; c < k; c++) {
    let p = c
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r
    if (Math.abs(A[p][c]) < 1e-12) return null
    ;[A[c], A[p]] = [A[p], A[c]]
    const d = A[c][c]
    for (let j = 0; j < 2 * k; j++) A[c][j] /= d
    for (let r = 0; r < k; r++) {
      if (r === c) continue
      const f = A[r][c]
      if (f !== 0) for (let j = 0; j < 2 * k; j++) A[r][j] -= f * A[c][j]
    }
  }
  return A.map((r) => r.slice(k))
}

export interface DopSample {
  t: number
  dop: Dop | null
  visible: number
}

/** DOP a lo largo de un intervalo, propagando cada satélite GNSS con SGP4 */
export function dopSeries(records: { record: SatRecord; sys: number }[], st: Station, t0: number, hours: number, stepMin: number, maskDeg: number): DopSample[] {
  const topo = topocentric(st)
  const out: DopSample[] = []
  const sinMask = Math.sin(maskDeg * DEG)
  for (let t = t0; t <= t0 + hours * 3_600_000; t += stepMin * 60_000) {
    const los: { e: number; n: number; u: number; sys: number }[] = []
    for (const r of records) {
      const l = lookRecord(r.record, topo, t)
      if (l && l.u >= sinMask) los.push({ e: l.e, n: l.n, u: l.u, sys: r.sys })
    }
    out.push({ t, dop: computeDop(los), visible: los.length })
  }
  return out
}
