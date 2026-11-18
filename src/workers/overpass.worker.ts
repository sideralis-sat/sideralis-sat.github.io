/// <reference lib="webworker" />
/**
 * Pasadas de satélites de observación sobre un punto.
 *
 * Cada satélite se propaga con SGP4 cada 30 s. La distancia sobre la superficie entre su punto
 * subsatélite y el objetivo tiene un mínimo en cada pasada (cuando el punto queda en
 * perpendicular a la traza); ese mínimo se afina por sección áurea hasta 0,5 s. Si es menor que
 * media anchura de franja, el punto cae dentro de la imagen.
 */
import { eciToGeodetic, gstime, json2satrec, propagate, type SatRec } from 'satellite.js'
import type { SatRecord } from '../data/types'
import { offNadirDeg, type Opportunity } from '../lib/earthImaging'
import { sunElevationAt, topocentric } from '../lib/sky'

export interface OverpassRequest {
  sats: { imager: string; record: SatRecord; swathKm: number }[]
  lat: number
  lon: number
  t0: number
  t1: number
}

export type OverpassResponse = { type: 'done'; opportunities: Opportunity[]; ms: number }

const R = 6371
const STEP = 30_000
const DEG = Math.PI / 180

self.onmessage = (e: MessageEvent<OverpassRequest>) => {
  const q = e.data
  const start = performance.now()
  const phi = q.lat * DEG
  const lam = q.lon * DEG
  const topo = topocentric({ name: '', lat: q.lat, lon: q.lon, altKm: 0 })
  // Vector unitario del objetivo en ECEF (esfera)
  const tx = Math.cos(phi) * Math.cos(lam)
  const ty = Math.cos(phi) * Math.sin(lam)
  const tz = Math.sin(phi)

  const out: Opportunity[] = []
  for (const s of q.sats) {
    let sat: SatRec
    try {
      sat = json2satrec(s.record)
      if (sat.error) continue
    } catch {
      continue
    }
    // Distancia (km) del punto subsatélite al objetivo en el instante t
    const sample = (t: number) => {
      const date = new Date(t)
      const pv = propagate(sat, date)
      const p = pv?.position
      if (!p || !Number.isFinite(p.x)) return null
      const g = eciToGeodetic(p, gstime(date))
      const cl = Math.cos(g.latitude)
      const ux = cl * Math.cos(g.longitude)
      const uy = cl * Math.sin(g.longitude)
      const uz = Math.sin(g.latitude)
      const c = Math.min(1, Math.max(-1, ux * tx + uy * ty + uz * tz))
      return { d: Math.acos(c) * R, g, v: pv!.velocity, u: [ux, uy, uz] }
    }
    const reach = s.swathKm / 2 + 400
    let a = sample(q.t0)
    let b = sample(q.t0 + STEP)
    for (let t = q.t0 + STEP; t < q.t1; t += STEP) {
      const c = sample(t + STEP)
      if (a && b && c && b.d <= a.d && b.d < c.d && b.d < reach) {
        // Sección áurea en [t − 30 s, t + 30 s]
        let lo = t - STEP
        let hi = t + STEP
        const k = 0.381966
        let x1 = lo + k * (hi - lo)
        let x2 = hi - k * (hi - lo)
        let f1 = sample(x1)?.d ?? Infinity
        let f2 = sample(x2)?.d ?? Infinity
        while (hi - lo > 500) {
          if (f1 < f2) {
            hi = x2
            x2 = x1
            f2 = f1
            x1 = lo + k * (hi - lo)
            f1 = sample(x1)?.d ?? Infinity
          } else {
            lo = x1
            x1 = x2
            f1 = f2
            x2 = hi - k * (hi - lo)
            f2 = sample(x2)?.d ?? Infinity
          }
        }
        const tm = Math.round((lo + hi) / 2)
        const m = sample(tm)
        if (m && m.d <= s.swathKm / 2) {
          // Lado: signo de (dirección de la traza × vertical del satélite) · objetivo
          const after = sample(tm + 1000)
          let side: 1 | -1 = 1
          if (after) {
            const dx = after.u[0] - m.u[0]
            const dy = after.u[1] - m.u[1]
            const dz = after.u[2] - m.u[2]
            // Derecha de la marcha = dirección × vertical
            const rx = dy * m.u[2] - dz * m.u[1]
            const ry = dz * m.u[0] - dx * m.u[2]
            const rz = dx * m.u[1] - dy * m.u[0]
            const right = rx * tx + ry * ty + rz * tz > 0
            // Este u oeste según el sentido de la pasada: al subir, la derecha queda al este
            side = (m.v.z > 0) === right ? 1 : -1
          }
          out.push({
            imager: s.imager,
            t: tm,
            crossKm: m.d,
            offNadir: offNadirDeg(m.d, m.g.height),
            side,
            ascending: m.v.z > 0,
            sunEl: sunElevationAt(topo, tm).el,
            altKm: m.g.height,
          })
        }
      }
      a = b
      b = c
    }
  }
  out.sort((x, y) => x.t - y.t)
  ;(self as unknown as DedicatedWorkerGlobalScope).postMessage({ type: 'done', opportunities: out, ms: performance.now() - start } satisfies OverpassResponse)
}
