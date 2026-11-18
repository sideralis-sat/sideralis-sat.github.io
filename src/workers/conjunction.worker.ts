/// <reference lib="webworker" />
/**
 * Búsqueda de aproximaciones (conjunction screening) de un objeto contra todo el catálogo.
 *
 * 1. Filtro de apsides: solo pueden acercarse objetos cuyas franjas de radio [r_p, r_a] se solapan.
 * 2. Barrido temporal con paso Δt. En cada muestra se toma el movimiento relativo como
 *    rectilíneo dentro del paso (cerca del encuentro la aceleración relativa es el gradiente
 *    de gravedad, ~10⁻⁶ s⁻² por km de separación, despreciable en un minuto):
 *        t* = −(ρ·ρ̇)/|ρ̇|²,  d* = |ρ + ρ̇ t*|
 * 3. Salto seguro: si la separación es d y la velocidad relativa no puede superar
 *    v_máx = v_p,objetivo + v_p,otro (velocidades en el perigeo), ningún encuentro por debajo
 *    del umbral puede ocurrir antes de (d − umbral)/v_máx. Eso evita propagar la mayoría de pasos.
 * 4. Refinado del TCA con sección áurea sobre la distancia propagada con SGP4.
 */
import { json2satrec, propagate, type SatRec } from 'satellite.js'
import type { SatRecord } from '../data/types'

export interface ConjunctionRequest {
  records: SatRecord[]
  target: number
  t0: number
  hours: number
  thresholdKm: number
}

export interface ConjunctionEvent {
  other: number
  tca: number
  missKm: number
  relSpeed: number // km/s
  /** Componentes de la distancia de paso en el marco del objetivo: radial, a lo largo de la traza, normal */
  radial: number
  inTrack: number
  crossTrack: number
}

export type ConjunctionResponse =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; events: ConjunctionEvent[]; total: number; candidates: number; ms: number }

const MU = 398600.4418
const STEP_S = 60

type V = { x: number; y: number; z: number }

function pv(s: SatRec, t: number): { r: V; v: V } | null {
  const out = propagate(s, new Date(t))
  if (!out || !out.position || !Number.isFinite(out.position.x)) return null
  return { r: out.position, v: out.velocity }
}

function apsides(r: SatRecord) {
  const n = (Number(r.MEAN_MOTION) * 2 * Math.PI) / 86400
  const a = Math.cbrt(MU / (n * n))
  const e = Number(r.ECCENTRICITY)
  const rp = a * (1 - e)
  return { rp, ra: a * (1 + e), vp: Math.sqrt(MU * (2 / rp - 1 / a)) }
}

const post = (m: ConjunctionResponse) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m)

self.onmessage = (e: MessageEvent<ConjunctionRequest>) => {
  const { records, target, t0, hours, thresholdKm } = e.data
  const start = performance.now()
  const sat = (i: number) => {
    try {
      const s = json2satrec(records[i])
      return s.error ? null : s
    } catch {
      return null
    }
  }
  const ts = sat(target)
  if (!ts) return post({ type: 'done', events: [], total: 0, candidates: 0, ms: 0 })
  const tA = apsides(records[target])
  const pad = thresholdKm + 25

  // Objetivo propagado una sola vez en todos los pasos
  const steps = Math.ceil((hours * 3600) / STEP_S)
  const tgt: ({ r: V; v: V } | null)[] = []
  for (let k = 0; k <= steps; k++) tgt.push(pv(ts, t0 + k * STEP_S * 1000))

  const candidates: number[] = []
  for (let j = 0; j < records.length; j++) {
    if (j === target) continue
    const a = apsides(records[j])
    if (a.rp - pad <= tA.ra && a.ra + pad >= tA.rp) candidates.push(j)
  }

  const coarse = thresholdKm + 5
  const events: ConjunctionEvent[] = []
  candidates.forEach((j, n) => {
    if (n % 200 === 0) post({ type: 'progress', done: n, total: candidates.length })
    const s = sat(j)
    if (!s) return
    const vmax = tA.vp + apsides(records[j]).vp + 0.5
    const dist = (t: number) => {
      const a = pv(ts, t)
      const b = pv(s, t)
      return a && b ? Math.hypot(b.r.x - a.r.x, b.r.y - a.r.y, b.r.z - a.r.z) : Infinity
    }
    let k = 0
    while (k < steps) {
      const A = tgt[k]
      const t = t0 + k * STEP_S * 1000
      const B = pv(s, t)
      if (!A || !B) {
        k++
        continue
      }
      const rx = B.r.x - A.r.x
      const ry = B.r.y - A.r.y
      const rz = B.r.z - A.r.z
      const vx = B.v.x - A.v.x
      const vy = B.v.y - A.v.y
      const vz = B.v.z - A.v.z
      const d = Math.hypot(rx, ry, rz)
      const v2 = vx * vx + vy * vy + vz * vz
      const tStar = Math.min(STEP_S, Math.max(0, -(rx * vx + ry * vy + rz * vz) / (v2 || 1)))
      const dStar = Math.hypot(rx + vx * tStar, ry + vy * tStar, rz + vz * tStar)
      if (dStar < coarse) {
        // Sección áurea en ±1 paso alrededor del mínimo lineal
        let lo = t + (tStar - STEP_S) * 1000
        let hi = t + (tStar + STEP_S) * 1000
        for (let it = 0; it < 40; it++) {
          const m1 = hi - (hi - lo) / 1.618
          const m2 = lo + (hi - lo) / 1.618
          if (dist(m1) < dist(m2)) hi = m2
          else lo = m1
        }
        const tca = (lo + hi) / 2
        const a = pv(ts, tca)
        const b = pv(s, tca)
        if (a && b) {
          const dx = { x: b.r.x - a.r.x, y: b.r.y - a.r.y, z: b.r.z - a.r.z }
          const miss = Math.hypot(dx.x, dx.y, dx.z)
          if (miss < thresholdKm) {
            // Marco RIC del objetivo
            const rn = Math.hypot(a.r.x, a.r.y, a.r.z)
            const R = { x: a.r.x / rn, y: a.r.y / rn, z: a.r.z / rn }
            const h = { x: a.r.y * a.v.z - a.r.z * a.v.y, y: a.r.z * a.v.x - a.r.x * a.v.z, z: a.r.x * a.v.y - a.r.y * a.v.x }
            const hn = Math.hypot(h.x, h.y, h.z)
            const C = { x: h.x / hn, y: h.y / hn, z: h.z / hn }
            const I = { x: C.y * R.z - C.z * R.y, y: C.z * R.x - C.x * R.z, z: C.x * R.y - C.y * R.x }
            const dot = (u: V, w: V) => u.x * w.x + u.y * w.y + u.z * w.z
            const prev = events.find((ev) => ev.other === j && Math.abs(ev.tca - tca) < 600_000)
            const ev: ConjunctionEvent = {
              other: j,
              tca,
              missKm: miss,
              relSpeed: Math.hypot(b.v.x - a.v.x, b.v.y - a.v.y, b.v.z - a.v.z),
              radial: dot(dx, R),
              inTrack: dot(dx, I),
              crossTrack: dot(dx, C),
            }
            if (!prev) events.push(ev)
            else if (miss < prev.missKm) Object.assign(prev, ev)
          }
        }
        k += 1
        continue
      }
      // Ningún encuentro por debajo del umbral antes de (d − umbral)/v_máx
      k += Math.max(1, Math.floor((d - coarse) / (vmax * STEP_S)))
    }
  })
  events.sort((a, b) => a.missKm - b.missKm)
  post({ type: 'done', events: events.slice(0, 60), total: events.length, candidates: candidates.length, ms: performance.now() - start })
}
