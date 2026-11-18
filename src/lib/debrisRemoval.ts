/**
 * Planificación de una misión de retirada activa de basura (ADR): un vehículo «cazador»
 * visita varios objetivos y deja en cada uno un kit que lo desorbita (enfoque tipo ELSA-M
 * de Astroscale o ClearSpace-1).
 *
 * El coste dominante no es la altitud sino el plano. El ángulo entre dos planos orbitales:
 *   cos θ = cos i₁ cos i₂ + sen i₁ sen i₂ cos ΔΩ
 * y cambiarlo cuesta Δv = 2 v sen(θ/2): ¡cientos de m/s por grado en LEO!
 *
 * Truco clásico: esperar a que J2 alinee los nodos «gratis». Dos órbitas con distinta altitud
 * o inclinación precesan a ritmos distintos (Ω̇ ∝ −n (R⊕/a)² cos i), así que ΔΩ se cierra solo
 * en un tiempo  t = ΔΩ / |Ω̇₁ − Ω̇₂|. Se paga en días de misión en vez de en propulsante.
 */
import type { SatRecord } from '../data/types'
import { bcFromBstar } from './atmosphere'
import { meanElements, MU, RE } from './astrodynamics'
import { G0, hohmann } from './maneuvers'
import { naturalDecay } from './reentry'
import { deorbitDv } from './missionDesign'

const DEG = Math.PI / 180

export interface TargetOrbit {
  index: number
  a: number
  i: number // grados
  raan: number // grados, en el instante de referencia
  raanDot: number // °/día
  alt: number
}

export function targetOrbit(index: number, r: SatRecord, t: number): TargetOrbit {
  const m = meanElements(r)
  const days = (t - m.epoch) / 86_400_000
  return { index, a: m.a, i: m.i, raan: (((m.raan + m.raanDot * days) % 360) + 360) % 360, raanDot: m.raanDot, alt: m.a - RE }
}

/** Ángulo entre dos planos orbitales (grados) */
export function planeAngle(i1: number, raan1: number, i2: number, raan2: number) {
  const c = Math.cos(i1 * DEG) * Math.cos(i2 * DEG) + Math.sin(i1 * DEG) * Math.sin(i2 * DEG) * Math.cos((raan2 - raan1) * DEG)
  return Math.acos(Math.max(-1, Math.min(1, c))) / DEG
}

export interface Leg {
  from: number
  to: number
  /** Δv transfiriendo directamente, con todo el cambio de plano (m/s) */
  dvDirect: number
  /** Δv esperando a que J2 alinee los nodos, y días de espera */
  dvDrift: number
  waitDays: number
  strategy: 'direct' | 'drift'
  dv: number
  /** Ángulo entre planos al salir */
  theta: number
}

/** Coste de ir de una órbita a otra en el instante t (días desde la referencia) */
export function legCost(a: TargetOrbit, b: TargetOrbit, tDays: number, maxWaitDays: number): Leg {
  const raanA = a.raan + a.raanDot * tDays
  const raanB = b.raan + b.raanDot * tDays
  const theta = planeAngle(a.i, raanA, b.i, raanB)
  const dvDirect = hohmann(a.a, b.a, theta).dvTotal * 1000
  // Espera en la órbita actual hasta que los nodos coincidan; luego solo queda Δi.
  // ΔΩ(t) = ΔΩ₀ + (Ω̇_A − Ω̇_B)·t  y se busca el primer t > 0 con ΔΩ ≡ 0 (mod 360°)
  const rel = a.raanDot - b.raanDot
  const d0 = (((raanA - raanB) % 360) + 360) % 360
  const waitDays = d0 < 0.05 || d0 > 359.95 ? 0 : Math.abs(rel) < 1e-4 ? Infinity : rel > 0 ? (360 - d0) / rel : d0 / -rel
  const dvDrift = hohmann(a.a, b.a, Math.abs(a.i - b.i)).dvTotal * 1000
  const useDrift = waitDays <= maxWaitDays && dvDrift < dvDirect
  return {
    from: a.index,
    to: b.index,
    dvDirect,
    dvDrift,
    waitDays: useDrift ? waitDays : 0,
    strategy: useDrift ? 'drift' : 'direct',
    dv: useDrift ? dvDrift : dvDirect,
    theta,
  }
}

export interface Plan {
  order: number[]
  legs: Leg[]
  dvTotal: number
  days: number
}

/**
 * Mejor orden de visita (fuerza bruta: con 6 objetivos son 720 permutaciones). El cazador
 * se lanza directamente al plano del primer objetivo; cada tramo empieza cuando acaba el
 * anterior, porque los planos siguen precesando mientras tanto.
 */
export function bestPlan(targets: TargetOrbit[], maxWaitDays: number, opsDays = 10): Plan | null {
  if (!targets.length) return null
  const perms = (xs: number[]): number[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, k) => perms([...xs.slice(0, k), ...xs.slice(k + 1)]).map((p) => [x, ...p])))
  let best: Plan | null = null
  for (const order of perms(targets.map((_, k) => k))) {
    let t = opsDays
    let dv = 0
    const legs: Leg[] = []
    for (let k = 1; k < order.length; k++) {
      const leg = legCost(targets[order[k - 1]], targets[order[k]], t, maxWaitDays)
      legs.push(leg)
      dv += leg.dv
      t += leg.waitDays + opsDays
    }
    if (!best || dv < best.dvTotal) best = { order: order.map((k) => targets[k].index), legs, dvTotal: dv, days: t }
  }
  return best
}

/** Propulsante del cazador: va soltando un kit en cada objetivo (Tsiolkovsky tramo a tramo) */
export function chaserPropellant(plan: Plan, dryKg: number, kitKg: number, isp: number, finalDeorbit: number) {
  // Se integra hacia atrás: al final queda el cazador vacío; antes de cada tramo llevaba los kits restantes
  let mass = dryKg
  const ve = isp * G0
  mass *= Math.exp(finalDeorbit / ve) // desorbitado propio al terminar
  for (let k = plan.legs.length - 1; k >= 0; k--) {
    mass += kitKg // kit que se suelta en el objetivo de llegada
    mass *= Math.exp(plan.legs[k].dv / ve)
  }
  mass += kitKg // kit del primer objetivo
  const wet = mass
  return { wet, propellant: wet - dryKg - kitKg * plan.order.length }
}

export interface Candidate {
  index: number
  alt: number
  inc: number
  lifetimeYears: number
  neighbours: number
  score: number
}

/**
 * Objetivos que más merece la pena retirar: los que más tiempo seguirán en órbita y en las
 * franjas más concurridas (más ocasiones de choque y de generar más fragmentos).
 */
export function rankCandidates(records: SatRecord[], pool: number[], bandCounts: (alt: number) => number): Candidate[] {
  const out: Candidate[] = []
  for (const i of pool) {
    const m = meanElements(records[i])
    if (m.perigeeAlt < 300 || m.apogeeAlt > 2000) continue
    const bc = bcFromBstar(m.bstar) ?? 100
    const d = naturalDecay(m.perigeeAlt, m.e, bc, 200)
    const life = d.reentered ? d.days / 365.25 : 200
    const neighbours = bandCounts((m.apogeeAlt + m.perigeeAlt) / 2)
    out.push({ index: i, alt: (m.apogeeAlt + m.perigeeAlt) / 2, inc: m.i, lifetimeYears: life, neighbours, score: Math.min(life, 200) * neighbours })
  }
  return out.sort((a, b) => b.score - a.score)
}

/** Δv que el kit debe dar para desorbitar cada objetivo (perigeo a 60 km) */
export const kitDv = (t: TargetOrbit) => deorbitDv(t.alt)

/** Velocidad circular (km/s), para explicar el coste del cambio de plano */
export const vCirc = (a: number) => Math.sqrt(MU / a)
