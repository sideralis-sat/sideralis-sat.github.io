/**
 * Propagación numérica (Cowell) para compararla con SGP4.
 *
 * Se integra r̈ = a(r, v) con Runge-Kutta de 4.º orden y paso fijo de 30 s, partiendo del
 * mismo vector de estado que da SGP4 en el instante inicial, con tres modelos de fuerzas:
 *   dos cuerpos         a = −μ r/r³
 *   + J2                a_J2 = −(3/2) J2 μ R⊕² / r⁵ · [x(1 − 5z²/r²), y(1 − 5z²/r²), z(3 − 5z²/r²)]
 *   + J2 + arrastre     a_D = −½ ρ |v_rel| v_rel / BC  (atmósfera de Vallado que gira con la Tierra)
 * La diferencia de posición con SGP4 muestra cuánto pesa cada perturbación. No es el error de
 * SGP4 frente a la realidad, que requiere efemérides de precisión.
 */
import type { SatRecord } from '../data/types'
import { J2, MU, RE } from './astrodynamics'
import { density } from './atmosphere'
import { propagateRecord } from './propagateRecord'
import { OMEGA_EARTH } from './reentry'

type V3 = [number, number, number]
export type ForceModel = 'twobody' | 'j2' | 'j2drag'

function accel(r: V3, v: V3, model: ForceModel, bc: number): V3 {
  const [x, y, z] = r
  const r2 = x * x + y * y + z * z
  const rn = Math.sqrt(r2)
  const k = -MU / (r2 * rn)
  const a: V3 = [k * x, k * y, k * z]
  if (model === 'twobody') return a
  const zr = (z * z) / r2
  const j = (-1.5 * J2 * MU * RE * RE) / (r2 * r2 * rn)
  a[0] += j * x * (1 - 5 * zr)
  a[1] += j * y * (1 - 5 * zr)
  a[2] += j * z * (3 - 5 * zr)
  if (model === 'j2drag') {
    const h = rn - RE
    if (h < 1000) {
      const vr: V3 = [v[0] + OMEGA_EARTH * y, v[1] - OMEGA_EARTH * x, v[2]]
      const vn = Math.hypot(vr[0], vr[1], vr[2])
      const d = (500 * density(h) * vn) / bc // km/s² por (km/s)
      a[0] -= d * vr[0]
      a[1] -= d * vr[1]
      a[2] -= d * vr[2]
    }
  }
  return a
}

function rk4(r: V3, v: V3, dt: number, model: ForceModel, bc: number): [V3, V3] {
  const add = (p: V3, q: V3, s: number): V3 => [p[0] + q[0] * s, p[1] + q[1] * s, p[2] + q[2] * s]
  const a1 = accel(r, v, model, bc)
  const r2 = add(r, v, dt / 2)
  const v2 = add(v, a1, dt / 2)
  const a2 = accel(r2, v2, model, bc)
  const r3 = add(r, v2, dt / 2)
  const v3 = add(v, a2, dt / 2)
  const a3 = accel(r3, v3, model, bc)
  const r4 = add(r, v3, dt)
  const v4 = add(v, a3, dt)
  const a4 = accel(r4, v4, model, bc)
  return [
    [0, 1, 2].map((i) => r[i] + (dt / 6) * (v[i] + 2 * v2[i] + 2 * v3[i] + v4[i])) as V3,
    [0, 1, 2].map((i) => v[i] + (dt / 6) * (a1[i] + 2 * a2[i] + 2 * a3[i] + a4[i])) as V3,
  ]
}

export interface Divergence {
  t: number // días desde el inicio
  twobody: number
  j2: number
  j2drag: number
  /** Componentes RIC de la diferencia J2 + arrastre (km) */
  radial: number
  inTrack: number
  crossTrack: number
}

/** Diferencia de posición |r_numérico − r_SGP4| (km) cada `sampleMin` minutos durante `days` días */
export function compareWithSgp4(record: SatRecord, t0: number, days: number, bc: number, sampleMin = 20): Divergence[] | null {
  const pv = propagateRecord(record, t0)
  if (!pv) return null
  const start: [V3, V3] = [
    [pv.position.x, pv.position.y, pv.position.z],
    [pv.velocity.x, pv.velocity.y, pv.velocity.z],
  ]
  const states: Record<ForceModel, [V3, V3]> = { twobody: start, j2: start, j2drag: start }
  const DT = 30
  const per = (sampleMin * 60) / DT
  const total = Math.round((days * 86400) / DT)
  const out: Divergence[] = [{ t: 0, twobody: 0, j2: 0, j2drag: 0, radial: 0, inTrack: 0, crossTrack: 0 }]
  for (let k = 1; k <= total; k++) {
    for (const m of ['twobody', 'j2', 'j2drag'] as ForceModel[]) states[m] = rk4(states[m][0], states[m][1], DT, m, bc)
    if (k % per) continue
    const t = t0 + k * DT * 1000
    const ref = propagateRecord(record, t)
    if (!ref) break
    const R: V3 = [ref.position.x, ref.position.y, ref.position.z]
    const V: V3 = [ref.velocity.x, ref.velocity.y, ref.velocity.z]
    const diff = (m: ForceModel) => Math.hypot(states[m][0][0] - R[0], states[m][0][1] - R[1], states[m][0][2] - R[2])
    // Marco RIC de la trayectoria SGP4
    const rn = Math.hypot(...R)
    const ur: V3 = [R[0] / rn, R[1] / rn, R[2] / rn]
    const h: V3 = [R[1] * V[2] - R[2] * V[1], R[2] * V[0] - R[0] * V[2], R[0] * V[1] - R[1] * V[0]]
    const hn = Math.hypot(...h)
    const uc: V3 = [h[0] / hn, h[1] / hn, h[2] / hn]
    const ui: V3 = [uc[1] * ur[2] - uc[2] * ur[1], uc[2] * ur[0] - uc[0] * ur[2], uc[0] * ur[1] - uc[1] * ur[0]]
    const d: V3 = [states.j2drag[0][0] - R[0], states.j2drag[0][1] - R[1], states.j2drag[0][2] - R[2]]
    const dot = (p: V3, q: V3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2]
    out.push({ t: (k * DT) / 86400, twobody: diff('twobody'), j2: diff('j2'), j2drag: diff('j2drag'), radial: dot(d, ur), inTrack: dot(d, ui), crossTrack: dot(d, uc) })
  }
  return out
}
