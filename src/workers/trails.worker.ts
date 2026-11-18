/// <reference lib="webworker" />
/**
 * Cruces de satélites por el encuadre de una foto.
 *
 * Cada satélite se propaga con SGP4 cada 30 s. Dentro de cada paso se interpola linealmente
 * su posición (la cuerda de 30 s en LEO se separa del arco menos de 1 km) y la del observador,
 * y se proyecta en el plano tangente al objetivo; si algún punto cae dentro del rectángulo
 * del sensor, se afina la entrada y la salida con SGP4 cada 0,5 s.
 */
import { json2satrec, propagate, type SatRec } from 'satellite.js'
import type { SatRecord } from '../data/types'
import { gmstAt, sunEciAt } from '../lib/astro'
import { radecToEciOfDate, tangentBasis } from '../lib/astroPhoto'
import { sunlitCylinder, topocentric } from '../lib/sky'

export interface TrailRequest {
  records: SatRecord[]
  station: { lat: number; lon: number; altKm: number; name: string }
  ra: number
  dec: number
  wDeg: number
  hDeg: number
  t0: number
  t1: number
}

export interface Crossing {
  i: number
  start: number
  end: number
  sunlit: boolean
}

export type TrailResponse = { type: 'progress'; done: number; total: number } | { type: 'done'; crossings: Crossing[]; ms: number }

const STEP = 30_000
const DEG = Math.PI / 180

self.onmessage = (e: MessageEvent<TrailRequest>) => {
  const q = e.data
  const start = performance.now()
  const topo = topocentric(q.station)
  const tx = Math.tan((q.wDeg / 2) * DEG)
  const ty = Math.tan((q.hDeg / 2) * DEG)
  const steps = Math.ceil((q.t1 - q.t0) / STEP)

  // Por paso: observador ECI, ejes del encuadre y Sol (comunes a todos los satélites)
  const obs: number[][] = []
  const basis: ReturnType<typeof tangentBasis>[] = []
  const sun: [number, number, number][] = []
  for (let k = 0; k <= steps; k++) {
    const t = q.t0 + k * STEP
    const g = gmstAt(t)
    const c = Math.cos(g)
    const s = Math.sin(g)
    const [x, y, z] = topo.pos
    obs.push([x * c - y * s, x * s + y * c, z])
    basis.push(tangentBasis(radecToEciOfDate(q.ra, q.dec, t)))
    sun.push(sunEciAt(t))
  }
  const obsAt = (t: number) => {
    const g = gmstAt(t)
    const [x, y, z] = topo.pos
    return [x * Math.cos(g) - y * Math.sin(g), x * Math.sin(g) + y * Math.cos(g), z]
  }
  const inFrame = (p: { x: number; y: number; z: number }, o: number[], b: ReturnType<typeof tangentBasis>) => {
    const d = [p.x - o[0], p.y - o[1], p.z - o[2]]
    const w = d[0] * b.u[0] + d[1] * b.u[1] + d[2] * b.u[2]
    if (w <= 0) return false
    // Por encima del horizonte del observador (vertical geocéntrica, suficiente para esto)
    if (d[0] * o[0] + d[1] * o[1] + d[2] * o[2] <= 0) return false
    const xi = (d[0] * b.e[0] + d[1] * b.e[1] + d[2] * b.e[2]) / w
    const eta = (d[0] * b.n[0] + d[1] * b.n[1] + d[2] * b.n[2]) / w
    return Math.abs(xi) < tx && Math.abs(eta) < ty
  }

  const crossings: Crossing[] = []
  const n = q.records.length
  for (let i = 0; i < n; i++) {
    if (i % 500 === 0) (self as unknown as DedicatedWorkerGlobalScope).postMessage({ type: 'progress', done: i, total: n } satisfies TrailResponse)
    let sat: SatRec
    try {
      sat = json2satrec(q.records[i])
      if (sat.error) continue
    } catch {
      continue
    }
    const pos = (t: number) => {
      const pv = propagate(sat, new Date(t))
      const p = pv?.position
      return p && Number.isFinite(p.x) ? p : null
    }
    let prev = pos(q.t0)
    let lastEnd = -Infinity
    for (let k = 0; k < steps; k++) {
      const t = q.t0 + k * STEP
      const next = pos(t + STEP)
      if (!prev || !next) {
        prev = next
        continue
      }
      // Descarte rápido: ambos extremos detrás del observador respecto al objetivo
      const b = basis[k]
      const o0 = obs[k]
      const o1 = obs[k + 1]
      const w0 = (prev.x - o0[0]) * b.u[0] + (prev.y - o0[1]) * b.u[1] + (prev.z - o0[2]) * b.u[2]
      const w1 = (next.x - o1[0]) * b.u[0] + (next.y - o1[1]) * b.u[1] + (next.z - o1[2]) * b.u[2]
      if (w0 > 0 || w1 > 0) {
        let hit = -1
        for (let s = 0; s <= 24; s++) {
          const f = s / 24
          const p = { x: prev.x + (next.x - prev.x) * f, y: prev.y + (next.y - prev.y) * f, z: prev.z + (next.z - prev.z) * f }
          const o = [o0[0] + (o1[0] - o0[0]) * f, o0[1] + (o1[1] - o0[1]) * f, o0[2] + (o1[2] - o0[2]) * f]
          if (inFrame(p, o, b)) {
            hit = f
            break
          }
        }
        if (hit >= 0 && t > lastEnd) {
          // Afinar entrada y salida con SGP4 cada 0,5 s alrededor del paso
          let first = -1
          let last = -1
          for (let tt = t - STEP; tt <= t + 2 * STEP; tt += 500) {
            const p = pos(tt)
            if (p && inFrame(p, obsAt(tt), b)) {
              if (first < 0) first = tt
              last = tt
            }
          }
          if (first >= 0) {
            const mid = pos((first + last) / 2)!
            crossings.push({ i, start: first, end: last + 500, sunlit: sunlitCylinder(mid.x, mid.y, mid.z, sun[k]) })
            lastEnd = last + 500
          }
        }
      }
      prev = next
    }
  }
  crossings.sort((a, b) => a.start - b.start)
  ;(self as unknown as DedicatedWorkerGlobalScope).postMessage({ type: 'done', crossings, ms: performance.now() - start } satisfies TrailResponse)
}
