import type { ReactNode } from 'react'
import type { SatRecord } from '../../data/types'
import { bcFromBstar } from '../../lib/atmosphere'
import { meanElements, MU, RE, telemetry, type MeanElements, type Telemetry } from '../../lib/astrodynamics'
import { eclipseAnalytic } from '../../lib/power'
import { hohmann } from '../../lib/maneuvers'
import { fsplDb } from '../../lib/linkBudget'
import { kingHele } from '../../lib/spaceWeather'
import { tn } from '../Tex'
import { fx } from '../format'

/** Datos del satélite de referencia con los que se plantea el ejercicio */
export interface ExerciseCtx {
  rec: SatRecord
  m: MeanElements
  t: Telemetry
}

export interface Exercise {
  /** Satélite de referencia (búsqueda por nombre) y alternativa si no está en el catálogo */
  ref: (sats: SatRecord[]) => SatRecord | undefined
  prompt: (c: ExerciseCtx) => ReactNode
  answer: (c: ExerciseCtx) => number
  unit: string
  /** Tolerancia relativa admitida */
  tol: number
  /** Desarrollo con los números (LaTeX) */
  solution: (c: ExerciseCtx) => string
  digits: number
}

const byName = (prefix: string) => (sats: SatRecord[]) => sats.find((s) => String(s.OBJECT_NAME).startsWith(prefix))
const iss = (sats: SatRecord[]) => byName('ISS')(sats) ?? sats.find((s) => meanElements(s).periodMin < 100)
const gnss = (sats: SatRecord[]) => byName('GPS')(sats) ?? byName('GSAT')(sats) ?? sats.find((s) => meanElements(s).periodMin > 600 && meanElements(s).periodMin < 900)
const name = (c: ExerciseCtx) => <strong>{String(c.rec.OBJECT_NAME)}</strong>
const DEG = 180 / Math.PI

export function makeCtx(rec: SatRecord, now: number): ExerciseCtx | null {
  const t = telemetry(rec, now)
  return t ? { rec, m: meanElements(rec), t } : null
}

export const EXERCISES: Record<string, Exercise> = {
  orbita: {
    ref: iss,
    prompt: (c) => (
      <>
        The mean semi-major axis of {name(c)} is a = {fx(c.m.a, 1)} km. With μ = 398600.4 km³/s², what is its orbital period?
      </>
    ),
    answer: (c) => (2 * Math.PI * Math.sqrt(c.m.a ** 3 / MU)) / 60,
    unit: 'min',
    tol: 0.005,
    digits: 2,
    solution: (c) => `T = 2\\pi\\sqrt{\\frac{a^3}{\\mu}} = 2\\pi\\sqrt{\\frac{${tn(c.m.a, 1)}^3}{398600.4}} = ${tn((2 * Math.PI * Math.sqrt(c.m.a ** 3 / MU)), 0)}\\ \\text{s} = ${tn((2 * Math.PI * Math.sqrt(c.m.a ** 3 / MU)) / 60, 2)}\\ \\text{min}`,
  },
  elementos: {
    ref: iss,
    prompt: (c) => (
      <>
        {name(c)} has a = {fx(c.m.a, 1)} km and e = {fx(c.m.e, 6)}. Taking R⊕ = 6378.137 km, what is its perigee altitude?
      </>
    ),
    answer: (c) => c.m.a * (1 - c.m.e) - RE,
    unit: 'km',
    tol: 0.003,
    digits: 1,
    solution: (c) => `h_p = a(1-e) - R_\\oplus = ${tn(c.m.a, 1)}\\,(1 - ${tn(c.m.e, 6)}) - 6378.137 = ${tn(c.m.a * (1 - c.m.e) - RE, 1)}\\ \\text{km}`,
  },
  marcos: {
    ref: iss,
    prompt: (c) => (
      <>
        {name(c)} completes a revolution in {fx(c.m.periodMin, 2)} min. How many degrees does the Earth rotate under it in that time? (Sidereal
        day: 86164.1 s.)
      </>
    ),
    answer: (c) => (360 * c.m.periodMin * 60) / 86164.1,
    unit: '°',
    tol: 0.005,
    digits: 2,
    solution: (c) => `\\Delta\\lambda = 360^\\circ\\cdot\\frac{T}{T_{\\text{sid}}} = 360^\\circ\\cdot\\frac{${tn(c.m.periodMin * 60, 0)}}{86164.1} = ${tn((360 * c.m.periodMin * 60) / 86164.1, 2)}^\\circ`,
  },
  traza: {
    ref: iss,
    prompt: (c) => (
      <>
        {name(c)} is now at h = {fx(c.t.altKm, 0)} km. What is the central half-angle λ₀ of its coverage footprint at 0° elevation? (Use R⊕ =
        6378 km.)
      </>
    ),
    answer: (c) => Math.acos(6378 / (6378 + c.t.altKm)) * DEG,
    unit: '°',
    tol: 0.01,
    digits: 2,
    solution: (c) => `\\lambda_0 = \\arccos\\frac{R_\\oplus}{R_\\oplus + h} = \\arccos\\frac{6378}{${tn(6378 + c.t.altKm, 0)}} = ${tn(Math.acos(6378 / (6378 + c.t.altKm)) * DEG, 2)}^\\circ`,
  },
  regimenes: {
    ref: gnss,
    prompt: (c) => (
      <>
        {name(c)} has a mean motion of n = {fx(c.m.n, 6)} rev/day and is nearly circular. What is its altitude above the equatorial radius?
      </>
    ),
    answer: (c) => c.m.a - RE,
    unit: 'km',
    tol: 0.003,
    digits: 0,
    solution: (c) => {
      const nr = (c.m.n * 2 * Math.PI) / 86400
      return `n = ${tn(c.m.n, 4)}\\cdot\\frac{2\\pi}{86400} = ${tn(nr * 1e4, 4)}\\cdot10^{-4}\\ \\text{rad/s},\\quad a = \\sqrt[3]{\\frac{\\mu}{n^2}} = ${tn(c.m.a, 0)}\\ \\text{km},\\quad h = a - R_\\oplus = ${tn(c.m.a - RE, 0)}\\ \\text{km}`
    },
  },
  j2: {
    ref: iss,
    prompt: (c) => (
      <>
        For {name(c)}: a = {fx(c.m.a, 1)} km, e = {fx(c.m.e, 5)}, i = {fx(c.m.i, 2)}°, n = {fx(c.m.n, 4)} rev/day. Compute the J2 nodal
        precession dΩ/dt in degrees per day (J₂ = 1.0826·10⁻³, R⊕ = 6378.137 km).
      </>
    ),
    answer: (c) => c.m.raanDot,
    unit: '°/day',
    tol: 0.02,
    digits: 3,
    solution: (c) => `\\dot\\Omega = -\\frac{3}{2}\\,n\\,J_2\\left(\\frac{R_\\oplus}{a(1-e^2)}\\right)^2\\cos i = -\\frac{3}{2}\\cdot${tn(c.m.n * 360, 1)}^\\circ\\!/\\text{d}\\cdot1.0826\\cdot10^{-3}\\left(\\frac{6378.1}{${tn(c.m.a * (1 - c.m.e ** 2), 1)}}\\right)^2\\cos ${tn(c.m.i, 2)}^\\circ = ${tn(c.m.raanDot, 3)}^\\circ\\!/\\text{d}`,
  },
  sgp4: {
    ref: (sats) => sats.find((s) => (bcFromBstar(Number(s.BSTAR ?? 0)) ?? 0) > 0 && String(s.OBJECT_NAME).startsWith('ISS')) ?? sats.find((s) => (bcFromBstar(Number(s.BSTAR ?? 0)) ?? 0) > 0),
    prompt: (c) => (
      <>
        The OMM of {name(c)} gives B* = {Number(c.rec.BSTAR).toExponential(4)} 1/R⊕. With SGP4’s reference density ρ₀ = 0.15697 kg m⁻² R⊕⁻¹, what
        ballistic coefficient BC = m/(C<sub>D</sub>A) does that imply?
      </>
    ),
    answer: (c) => 0.15696615 / (2 * Number(c.rec.BSTAR)),
    unit: 'kg/m²',
    tol: 0.01,
    digits: 1,
    solution: (c) => `B^* = \\frac{\\rho_0}{2}\\frac{C_D A}{m}\\ \\Rightarrow\\ BC = \\frac{\\rho_0}{2B^*} = \\frac{0.15697}{2\\cdot${tn(Number(c.rec.BSTAR) * 1e4, 4)}\\cdot10^{-4}} = ${tn(0.15696615 / (2 * Number(c.rec.BSTAR)), 1)}\\ \\text{kg/m}^2`,
  },
  sombra: {
    ref: iss,
    prompt: (c) => (
      <>
        {name(c)} flies at h = {fx((c.m.apogeeAlt + c.m.perigeeAlt) / 2, 0)} km with β = {fx(c.t.betaDeg, 1)}° and T = {fx(c.m.periodMin, 1)} min. How
        many minutes per orbit does it spend in eclipse (cylindrical shadow)?
      </>
    ),
    answer: (c) => eclipseAnalytic((c.m.apogeeAlt + c.m.perigeeAlt) / 2, c.t.betaDeg).fraction * c.m.periodMin,
    unit: 'min',
    tol: 0.02,
    digits: 1,
    solution: (c) => {
      const h = (c.m.apogeeAlt + c.m.perigeeAlt) / 2
      const f = eclipseAnalytic(h, c.t.betaDeg).fraction
      return `f_E = \\frac{1}{\\pi}\\arccos\\left(\\frac{\\sqrt{h^2 + 2R_\\oplus h}}{(R_\\oplus + h)\\cos\\beta}\\right) = ${tn(f, 4)},\\qquad t_{\\text{ecl}} = f_E\\,T = ${tn(f * c.m.periodMin, 1)}\\ \\text{min}`
    },
  },
  pases: {
    ref: iss,
    prompt: (c) => (
      <>
        {name(c)} is at h = {fx(c.t.altKm, 0)} km. What is the slant range to it from a ground station when it rises above the horizon (0°
        elevation)? (R⊕ = 6378 km.)
      </>
    ),
    answer: (c) => Math.sqrt((6378 + c.t.altKm) ** 2 - 6378 ** 2),
    unit: 'km',
    tol: 0.01,
    digits: 0,
    solution: (c) => `\\rho_{\\max} = \\sqrt{(R_\\oplus + h)^2 - R_\\oplus^2} = \\sqrt{${tn(6378 + c.t.altKm, 0)}^2 - 6378^2} = ${tn(Math.sqrt((6378 + c.t.altKm) ** 2 - 6378 ** 2), 0)}\\ \\text{km}`,
  },
  reentrada: {
    ref: iss,
    prompt: (c) => (
      <>
        Treat {name(c)} as circular at r₁ = {fx(c.m.a, 0)} km. What retrograde Δv lowers its perigee to 60 km altitude (r₂ = 6438 km)?
      </>
    ),
    answer: (c) => {
      const r1 = c.m.a
      const r2 = RE + 60
      const at = (r1 + r2) / 2
      return (Math.sqrt(MU / r1) - Math.sqrt(MU * (2 / r1 - 1 / at))) * 1000
    },
    unit: 'm/s',
    tol: 0.02,
    digits: 0,
    solution: (c) => {
      const r1 = c.m.a
      const r2 = RE + 60
      const at = (r1 + r2) / 2
      const vc = Math.sqrt(MU / r1)
      const va = Math.sqrt(MU * (2 / r1 - 1 / at))
      return `a_t = \\frac{r_1 + r_2}{2} = ${tn(at, 0)}\\ \\text{km},\\quad v_c = \\sqrt{\\frac{\\mu}{r_1}} = ${tn(vc, 4)},\\quad v_a = \\sqrt{\\mu\\left(\\frac{2}{r_1} - \\frac{1}{a_t}\\right)} = ${tn(va, 4)}\\ \\text{km/s}\\ \\Rightarrow\\ \\Delta v = ${tn((vc - va) * 1000, 0)}\\ \\text{m/s}`
    },
  },
  maniobras: {
    ref: iss,
    prompt: (c) => (
      <>
        Treat {name(c)} as circular at r₁ = {fx(c.m.a, 0)} km. What total Δv does a coplanar Hohmann transfer to GEO (r₂ = 42,164 km) need?
      </>
    ),
    answer: (c) => hohmann(c.m.a, 42164).dvTotal,
    unit: 'km/s',
    tol: 0.01,
    digits: 3,
    solution: (c) => {
      const h = hohmann(c.m.a, 42164)
      return `a_t = \\frac{${tn(c.m.a, 0)} + 42164}{2} = ${tn(h.legs[0].a, 0)}\\ \\text{km},\\quad \\Delta v_1 = ${tn(h.burns[0].dv, 3)},\\quad \\Delta v_2 = ${tn(h.burns[1].dv, 3)}\\ \\Rightarrow\\ \\Delta v = ${tn(h.dvTotal, 3)}\\ \\text{km/s}`
    },
  },
  enlace: {
    ref: iss,
    prompt: (c) => {
      const rho = Math.sqrt((6378 + c.t.altKm) ** 2 - 6378 ** 2)
      return (
        <>
          A ground station receives {name(c)} at 437.8 MHz just as it rises, at a slant range of {fx(rho, 0)} km. What is the free-space loss?
        </>
      )
    },
    answer: (c) => fsplDb(Math.sqrt((6378 + c.t.altKm) ** 2 - 6378 ** 2), 437.8e6),
    unit: 'dB',
    tol: 0.002,
    digits: 1,
    solution: (c) => {
      const rho = Math.sqrt((6378 + c.t.altKm) ** 2 - 6378 ** 2)
      return `L_{fs} = 92.45 + 20\\log_{10}${tn(rho, 0)} + 20\\log_{10}0.4378 = ${tn(fsplDb(rho, 437.8e6), 1)}\\ \\text{dB}`
    },
  },
  basura: {
    ref: iss,
    prompt: (c) => (
      <>
        Using the King-Hele model with F10.7 = 150 sfu and Ap = 12, what is the air density at the altitude of {name(c)}, h = {fx(c.t.altKm, 0)}{' '}
        km? Answer in units of 10⁻¹² kg/m³.
      </>
    ),
    answer: (c) => kingHele(c.t.altKm, { f107: 150, ap: 12 }) * 1e12,
    unit: '×10⁻¹² kg/m³',
    tol: 0.02,
    digits: 2,
    solution: (c) => {
      const T = 900 + 2.5 * 80 + 1.5 * 12
      const m = 27 - 0.012 * (c.t.altKm - 200)
      return `T = 900 + 2.5\\cdot80 + 1.5\\cdot12 = ${T}\\ \\text{K},\\quad m = 27 - 0.012\\,(${tn(c.t.altKm, 0)} - 200) = ${tn(m, 2)},\\quad H = ${tn(T / m, 1)}\\ \\text{km},\\quad \\rho = 6\\cdot10^{-10}e^{-(${tn(c.t.altKm, 0)} - 175)/${tn(T / m, 1)}} = ${tn(kingHele(c.t.altKm, { f107: 150, ap: 12 }) * 1e12, 2)}\\cdot10^{-12}`
    },
  },
}
