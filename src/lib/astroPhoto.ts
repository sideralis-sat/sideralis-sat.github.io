/**
 * Astrofotografía: qué satélites cruzan el encuadre de una foto del cielo profundo.
 *
 * El objetivo viene en coordenadas ecuatoriales J2000 (α, δ). Se precesa a la fecha (IAU 1976,
 * ángulos ζ, z, θ) para trabajar en el mismo marco que SGP4 (TEME ≈ ecuador y equinoccio de la
 * fecha). El encuadre se describe en el plano tangente al cielo en el objetivo (proyección
 * gnomónica, la que hace un objetivo fotográfico):
 *   ξ = (d·ê_α)/(d·û),   η = (d·ê_δ)/(d·û)
 * con d el vector observador→satélite, û la dirección del objetivo, y ê_α, ê_δ los ejes hacia el
 * este y el norte celeste. Un sensor de lado L con focal f cubre |ξ| < L/(2f).
 */
const DEG = Math.PI / 180
const ARCSEC = DEG / 3600

export interface SkyTarget {
  id: string
  label: string
  ra: number // grados, J2000
  dec: number
}

export const TARGETS: SkyTarget[] = [
  { id: 'm31', label: 'Andromeda Galaxy (M31)', ra: 10.6846, dec: 41.2692 },
  { id: 'm42', label: 'Orion Nebula (M42)', ra: 83.8221, dec: -5.3911 },
  { id: 'm45', label: 'Pleiades (M45)', ra: 56.75, dec: 24.1167 },
  { id: 'ic434', label: 'Horsehead Nebula (IC 434)', ra: 85.2458, dec: -2.4583 },
  { id: 'm33', label: 'Triangulum Galaxy (M33)', ra: 23.4621, dec: 30.6603 },
  { id: 'm51', label: 'Whirlpool Galaxy (M51)', ra: 202.4696, dec: 47.1953 },
  { id: 'm101', label: 'Pinwheel Galaxy (M101)', ra: 210.8025, dec: 54.3492 },
  { id: 'm13', label: 'Hercules Cluster (M13)', ra: 250.4217, dec: 36.4597 },
  { id: 'm8', label: 'Lagoon Nebula (M8)', ra: 270.9042, dec: -24.3867 },
  { id: 'ngc7000', label: 'North America Nebula (NGC 7000)', ra: 314.6958, dec: 44.33 },
]

export const SENSORS = [
  { id: 'ff', label: 'Full frame (36 × 24 mm)', w: 36, h: 24 },
  { id: 'apsc', label: 'APS-C (23.5 × 15.6 mm)', w: 23.5, h: 15.6 },
  { id: 'm43', label: 'Micro Four Thirds (17.3 × 13 mm)', w: 17.3, h: 13 },
]

/** Campo de visión (grados) de un sensor con una focal */
export const fovDeg = (sizeMm: number, focalMm: number) => (2 * Math.atan(sizeMm / (2 * focalMm))) / DEG

/** Vector unitario ECI de fecha para unas coordenadas J2000 (precesión IAU 1976) */
export function radecToEciOfDate(raDeg: number, decDeg: number, ms: number): [number, number, number] {
  const T = (ms / 86_400_000 + 2440587.5 - 2451545.0) / 36525
  const zeta = (2306.2181 * T + 0.30188 * T * T) * ARCSEC
  const z = (2306.2181 * T + 1.09468 * T * T) * ARCSEC
  const theta = (2004.3109 * T - 0.42665 * T * T) * ARCSEC
  const a = raDeg * DEG
  const d = decDeg * DEG
  const x0 = Math.cos(d) * Math.cos(a)
  const y0 = Math.cos(d) * Math.sin(a)
  const z0 = Math.sin(d)
  const cz = Math.cos(zeta), sz = Math.sin(zeta)
  const cZ = Math.cos(z), sZ = Math.sin(z)
  const cT = Math.cos(theta), sT = Math.sin(theta)
  // P = Rz(−z) · Ry(θ) · Rz(−ζ)
  return [
    (cZ * cT * cz - sZ * sz) * x0 + (-cZ * cT * sz - sZ * cz) * y0 + -cZ * sT * z0,
    (sZ * cT * cz + cZ * sz) * x0 + (-sZ * cT * sz + cZ * cz) * y0 + -sZ * sT * z0,
    sT * cz * x0 + -sT * sz * y0 + cT * z0,
  ]
}

/** Ejes del plano tangente: û hacia el objetivo, ê hacia el este celeste y n̂ hacia el norte */
export function tangentBasis(u: [number, number, number]) {
  const ra = Math.atan2(u[1], u[0])
  const dec = Math.asin(u[2])
  const e: [number, number, number] = [-Math.sin(ra), Math.cos(ra), 0]
  const n: [number, number, number] = [-Math.sin(dec) * Math.cos(ra), -Math.sin(dec) * Math.sin(ra), Math.cos(dec)]
  return { u, e, n }
}

/** Esquinas del encuadre (vectores ECI unitarios), para dibujarlo en el cielo */
export function frameCorners(u: [number, number, number], wDeg: number, hDeg: number) {
  const { e, n } = tangentBasis(u)
  const tx = Math.tan((wDeg / 2) * DEG)
  const ty = Math.tan((hDeg / 2) * DEG)
  const out: [number, number, number][] = []
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    const v = [u[0] + sx * tx * e[0] + sy * ty * n[0], u[1] + sx * tx * e[1] + sy * ty * n[1], u[2] + sx * tx * e[2] + sy * ty * n[2]]
    const l = Math.hypot(v[0], v[1], v[2])
    out.push([v[0] / l, v[1] / l, v[2] / l])
  }
  return out
}
