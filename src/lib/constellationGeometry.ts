/**
 * Geometría de constelaciones a partir de los elementos medios del catálogo.
 *
 * Para comparar objetos con épocas distintas, Ω y el argumento de latitud u = ω + M se llevan
 * a un instante común con sus derivas seculares:
 *   Ω(t) = Ω₀ + Ω̇_J2 · Δt
 *   u(t) = ω₀ + M₀ + (n + ω̇_J2) · Δt      (órbitas casi circulares)
 * Una capa (shell) son los satélites con la misma inclinación y altitud: comparten Ω̇, así que
 * sus planos mantienen la separación. Una constelación Walker i: T/P/F reparte T satélites en
 * P planos equiespaciados en Ω, con un desfase F entre planos contiguos.
 */
import type { SatRecord } from '../data/types'
import { meanElements } from './astrodynamics'

export interface MemberGeo {
  i: number
  alt: number
  inc: number
  raan: number
  u: number
  period: number
  raanDot: number
}

const wrap = (d: number) => ((d % 360) + 360) % 360

export function membersAt(records: SatRecord[], indices: number[], t: number): MemberGeo[] {
  return indices.map((i) => {
    const m = meanElements(records[i])
    const days = (t - m.epoch) / 86_400_000
    return {
      i,
      alt: (m.apogeeAlt + m.perigeeAlt) / 2,
      inc: m.i,
      raan: wrap(m.raan + m.raanDot * days),
      u: wrap(m.argp + m.m + (m.n * 360 + m.argpDot) * days),
      period: m.periodMin,
      raanDot: m.raanDot,
    }
  })
}

export interface Shell {
  inc: number
  alt: number
  members: MemberGeo[]
  planes: number
  raanDot: number
}

/** Agrupa por inclinación (±0,6°) y altitud (±12 km); solo capas con al menos `min` satélites */
export function findShells(members: MemberGeo[], min = 12): Shell[] {
  const sorted = [...members].sort((a, b) => a.inc - b.inc || a.alt - b.alt)
  // Agrupación incremental con la media de altitud de cada grupo
  const acc: { list: MemberGeo[]; inc: number; altSum: number }[] = []
  for (const m of sorted) {
    const g = acc.find((gr) => Math.abs(gr.inc - m.inc) < 0.6 && Math.abs(gr.altSum / gr.list.length - m.alt) < 12)
    if (g) {
      g.list.push(m)
      g.altSum += m.alt
    } else acc.push({ list: [m], inc: m.inc, altSum: m.alt })
  }
  return acc
    .map((g) => g.list)
    .filter((g) => g.length >= min)
    .map((g) => ({
      inc: median(g.map((x) => x.inc)),
      alt: median(g.map((x) => x.alt)),
      members: g,
      planes: countPlanes(g.map((x) => x.raan)),
      raanDot: median(g.map((x) => x.raanDot)),
    }))
    .sort((a, b) => b.members.length - a.members.length)
}

function median(v: number[]) {
  const s = [...v].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/** Número de planos: grupos de Ω separados por huecos mayores que `tol` (circular en 360°) */
export function countPlanes(raans: number[], tol = 1.5): number {
  if (raans.length < 2) return raans.length
  const s = [...raans].sort((a, b) => a - b)
  let gaps = 0
  for (let k = 1; k < s.length; k++) if (s[k] - s[k - 1] > tol) gaps++
  if (s[0] + 360 - s[s.length - 1] > tol) gaps++
  return Math.max(1, gaps)
}
