/**
 * Maniobras impulsivas entre órbitas circulares (problema de dos cuerpos).
 *
 * Hohmann (Curtis, «Orbital Mechanics for Engineering Students», 6.2):
 *   a_t = (r₁ + r₂)/2
 *   Δv₁ = √(μ(2/r₁ − 1/a_t)) − √(μ/r₁)
 *   Δv₂ = √(μ/r₂) − √(μ(2/r₂ − 1/a_t))
 *   TOF = π √(a_t³/μ)
 * Bielíptica con apoapsis intermedia r_b:
 *   a₁ = (r₁ + r_b)/2,  a₂ = (r₂ + r_b)/2, tres impulsos, TOF = π(√(a₁³/μ) + √(a₂³/μ))
 * Cambio de plano Δi combinado con un impulso (ley de los cosenos):
 *   Δv = √(v_a² + v_b² − 2 v_a v_b cos Δi)
 * Cambio de plano puro en órbita circular:  Δv = 2 v sen(Δi/2)
 * Ecuación de Tsiolkovsky:  Δv = I_sp g₀ ln(m₀/m_f)
 */
import { MU, RE } from './astrodynamics'

export const G0 = 9.80665
const DEG = Math.PI / 180

export interface Burn {
  label: string
  /** Radio al que se da el impulso (km) */
  r: number
  dv: number // km/s
  /** Δi que se aprovecha en este impulso (grados) */
  di: number
}

export interface TransferLeg {
  /** Semieje mayor y excentricidad de la elipse de transferencia */
  a: number
  e: number
  /** Radio de partida y de llegada del tramo (km) */
  rFrom: number
  rTo: number
}

export interface ManeuverPlan {
  kind: 'hohmann' | 'bielliptic'
  burns: Burn[]
  legs: TransferLeg[]
  dvTotal: number // km/s
  tof: number // s
  /** Δv si el cambio de plano se hiciera aparte, en la órbita circular más alta */
  dvSeparatePlane: number
}

const vCirc = (r: number) => Math.sqrt(MU / r)
const vOn = (r: number, a: number) => Math.sqrt(MU * (2 / r - 1 / a))
/** Impulso entre dos velocidades separadas un ángulo Δi */
const combine = (va: number, vb: number, diDeg: number) => Math.sqrt(Math.max(0, va * va + vb * vb - 2 * va * vb * Math.cos(diDeg * DEG)))

/**
 * Hohmann con cambio de plano opcional, que se combina con el impulso dado en el radio
 * mayor (donde la velocidad es menor y girar el vector cuesta menos).
 */
export function hohmann(r1: number, r2: number, diDeg = 0): ManeuverPlan {
  const at = (r1 + r2) / 2
  const up = r2 >= r1
  const v1 = vCirc(r1)
  const vp = vOn(r1, at)
  const v2 = vCirc(r2)
  const va = vOn(r2, at)
  const di1 = up ? 0 : diDeg
  const di2 = up ? diDeg : 0
  const dv1 = combine(v1, vp, di1)
  const dv2 = combine(va, v2, di2)
  const rHigh = Math.max(r1, r2)
  return {
    kind: 'hohmann',
    burns: [
      { label: up ? 'Departure burn (perigee of transfer)' : 'Departure burn (apogee of transfer)', r: r1, dv: dv1, di: di1 },
      { label: up ? 'Circularization (apogee)' : 'Circularization (perigee)', r: r2, dv: dv2, di: di2 },
    ],
    legs: [{ a: at, e: Math.abs(r2 - r1) / (r1 + r2), rFrom: r1, rTo: r2 }],
    dvTotal: dv1 + dv2,
    tof: Math.PI * Math.sqrt(at ** 3 / MU),
    dvSeparatePlane: Math.abs(vp - v1) + Math.abs(v2 - va) + 2 * vCirc(rHigh) * Math.sin((diDeg * DEG) / 2),
  }
}

/** Bielíptica: el cambio de plano se hace en r_b, el punto más lento de toda la maniobra */
export function biElliptic(r1: number, r2: number, rb: number, diDeg = 0): ManeuverPlan {
  rb = Math.max(rb, r1, r2)
  const a1 = (r1 + rb) / 2
  const a2 = (r2 + rb) / 2
  const dv1 = Math.abs(vOn(r1, a1) - vCirc(r1))
  const dv2 = combine(vOn(rb, a1), vOn(rb, a2), diDeg)
  const dv3 = Math.abs(vOn(r2, a2) - vCirc(r2))
  const plain = dv1 + Math.abs(vOn(rb, a2) - vOn(rb, a1)) + dv3
  return {
    kind: 'bielliptic',
    burns: [
      { label: 'Departure burn', r: r1, dv: dv1, di: 0 },
      { label: 'Intermediate apoapsis burn', r: rb, dv: dv2, di: diDeg },
      { label: 'Circularization', r: r2, dv: dv3, di: 0 },
    ],
    legs: [
      { a: a1, e: (rb - r1) / (rb + r1), rFrom: r1, rTo: rb },
      { a: a2, e: (rb - r2) / (rb + r2), rFrom: rb, rTo: r2 },
    ],
    dvTotal: dv1 + dv2 + dv3,
    tof: Math.PI * (Math.sqrt(a1 ** 3 / MU) + Math.sqrt(a2 ** 3 / MU)),
    dvSeparatePlane: plain + 2 * vCirc(Math.max(r1, r2)) * Math.sin((diDeg * DEG) / 2),
  }
}

/** Cambio de plano puro en una órbita circular de radio r (km/s) */
export const planeChangeDv = (r: number, diDeg: number) => 2 * vCirc(r) * Math.sin((diDeg * DEG) / 2)

/** Masa de propulsante (kg) para un Δv (km/s) dada la masa final (seca) */
export function propellant(dvKmS: number, ispS: number, dryKg: number) {
  const ratio = Math.exp((dvKmS * 1000) / (ispS * G0))
  return { ratio, propellant: dryKg * (ratio - 1), wet: dryKg * ratio, fraction: 1 - 1 / ratio }
}

export const altToR = (h: number) => RE + h
export const rToAlt = (r: number) => r - RE

type V3 = { x: number; y: number; z: number }

/**
 * Puntos (ECI, km) de los tramos de transferencia en el plano orbital actual, empezando
 * en la posición del satélite. Sirve para dibujar la maniobra en el globo.
 */
export function transferPoints(r: V3, v: V3, plan: ManeuverPlan, samples = 160): { legs: number[][][]; target: number[][]; start: number[][] } {
  const rn = Math.hypot(r.x, r.y, r.z)
  const P = { x: r.x / rn, y: r.y / rn, z: r.z / rn }
  // Normal al plano y dirección de avance en el plano (perpendicular a r̂)
  const h = { x: r.y * v.z - r.z * v.y, y: r.z * v.x - r.x * v.z, z: r.x * v.y - r.y * v.x }
  const hn = Math.hypot(h.x, h.y, h.z)
  const W = { x: h.x / hn, y: h.y / hn, z: h.z / hn }
  const Q = { x: W.y * P.z - W.z * P.y, y: W.z * P.x - W.x * P.z, z: W.x * P.y - W.y * P.x }
  const at = (rad: number, ang: number) => [rad * (Math.cos(ang) * P.x + Math.sin(ang) * Q.x), rad * (Math.cos(ang) * P.y + Math.sin(ang) * Q.y), rad * (Math.cos(ang) * P.z + Math.sin(ang) * Q.z)]

  const legs: number[][][] = []
  let phase = 0 // ángulo recorrido desde la posición inicial
  for (const leg of plan.legs) {
    const p = leg.a * (1 - leg.e * leg.e)
    const up = leg.rTo >= leg.rFrom
    const pts: number[][] = []
    for (let k = 0; k <= samples; k++) {
      const f = k / samples
      // Si sube, el tramo va de periapsis (ν = 0) a apoapsis (ν = π); si baja, al revés
      const nu = up ? f * Math.PI : Math.PI + f * Math.PI
      const rad = leg.e < 1e-9 ? leg.a : p / (1 + leg.e * Math.cos(nu))
      pts.push(at(rad, phase + f * Math.PI))
    }
    legs.push(pts)
    phase += Math.PI
  }
  const ring = (rad: number) => Array.from({ length: 241 }, (_, k) => at(rad, (k / 240) * 2 * Math.PI))
  const rEnd = plan.legs[plan.legs.length - 1].rTo
  return { legs, target: ring(rEnd), start: ring(plan.legs[0].rFrom) }
}
