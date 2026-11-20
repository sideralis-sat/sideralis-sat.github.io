/**
 * Maniobras: casos de libro, el caso sin cambio de órbita y el cambio de plano ISS → GEO.
 * Referencia principal: Vallado, «Fundamentals of Astrodynamics and Applications», ejemplo 6-1.
 */
import { describe, expect, it } from 'vitest'
import { MU, RE } from '../src/lib/astrodynamics'
import { BIELLIPTIC_RATIO_ANY, BIELLIPTIC_RATIO_MIN, biElliptic, compareTransfers, G0, hohmann, planeChangeDv, propellant } from '../src/lib/maneuvers'

const vc = (r: number) => Math.sqrt(MU / r)

describe('Hohmann (coplanar)', () => {
  it('reproduce el ejemplo 6-1 de Vallado: 191,34 km → GEO', () => {
    const h = hohmann(RE + 191.34411, RE + 35781.34857)
    expect(h.burns[0].dv).toBeCloseTo(2.457038, 5)
    expect(h.burns[1].dv).toBeCloseTo(1.478187, 5)
    expect(h.dvTotal).toBeCloseTo(3.935224, 5)
    expect(h.tof / 3600).toBeCloseTo(5.256713, 4)
  })

  it('400 km → GEO cuesta 3,85 km/s y tarda 5,3 h (cifras de la lección)', () => {
    const h = hohmann(RE + 400, 42164)
    expect(h.dvTotal).toBeCloseTo(3.854, 2)
    expect(h.tof / 3600).toBeCloseTo(5.29, 1)
  })

  it('es simétrica: bajar cuesta lo mismo que subir', () => {
    const up = hohmann(RE + 500, RE + 20_000)
    const down = hohmann(RE + 20_000, RE + 500)
    expect(down.dvTotal).toBeCloseTo(up.dvTotal, 10)
    expect(down.tof).toBeCloseTo(up.tof, 6)
  })

  it('la elipse de transferencia es tangente a las dos órbitas', () => {
    const r1 = RE + 300
    const r2 = RE + 2000
    const leg = hohmann(r1, r2).legs[0]
    expect(leg.a * (1 - leg.e)).toBeCloseTo(r1, 6)
    expect(leg.a * (1 + leg.e)).toBeCloseTo(r2, 6)
  })
})

describe('Sin cambio de órbita', () => {
  it('misma órbita y mismo plano: Δv = 0 y medio periodo de vuelo', () => {
    const r = RE + 700
    const h = hohmann(r, r, 0)
    expect(h.dvTotal).toBe(0)
    expect(h.tof).toBeCloseTo(Math.PI * Math.sqrt(r ** 3 / MU), 6)
    expect(biElliptic(r, r, r, 0).dvTotal).toBeCloseTo(0, 12)
  })

  it('solo cambio de plano: coincide con 2 v sen(Δi/2)', () => {
    const r = RE + 700
    expect(hohmann(r, r, 10).dvTotal).toBeCloseTo(planeChangeDv(r, 10), 9)
    // 60°: el vector gira un triángulo equilátero, Δv = v
    expect(planeChangeDv(r, 60)).toBeCloseTo(vc(r), 12)
    // GEO, 28,5° (lanzamiento desde Cabo Cañaveral): ≈ 1,51 km/s
    expect(planeChangeDv(42164, 28.5)).toBeCloseTo(1.514, 2)
  })
})

describe('Regla de 11,94 / 15,58 (solo coplanar)', () => {
  const r1 = RE + 300
  it('por debajo de 11,94 Hohmann gana con cualquier apoapsis intermedia', () => {
    const r2 = r1 * 11
    for (const k of [1.01, 2, 10, 100, 1e4]) expect(biElliptic(r1, r2, r2 * k).dvTotal).toBeGreaterThan(hohmann(r1, r2).dvTotal)
  })
  it('entre 11,94 y 15,58 la bielíptica gana solo con una apoapsis muy alta', () => {
    const r2 = r1 * 13
    expect(biElliptic(r1, r2, r2 * 1.05).dvTotal).toBeGreaterThan(hohmann(r1, r2).dvTotal)
    expect(biElliptic(r1, r2, r2 * 1e4).dvTotal).toBeLessThan(hohmann(r1, r2).dvTotal)
  })
  it('por encima de 15,58 la bielíptica gana con cualquier apoapsis por encima del destino', () => {
    const r2 = r1 * 16
    for (const k of [1.05, 2, 10, 100]) expect(biElliptic(r1, r2, r2 * k).dvTotal).toBeLessThan(hohmann(r1, r2).dvTotal)
  })
  it('las constantes son las del libro', () => {
    expect(BIELLIPTIC_RATIO_MIN).toBe(11.94)
    expect(BIELLIPTIC_RATIO_ANY).toBe(15.58)
  })
})

describe('Cambio de plano: ISS → GEO', () => {
  const r1 = RE + 420
  const r2 = RE + 35_786
  const c = compareTransfers(r1, r2, RE + 120_000, 51.64)

  it('la relación de radios es 6,20, muy por debajo de 11,94', () => {
    expect(c.ratio).toBeCloseTo(6.2, 2)
    expect(c.coplanar).toBe(false)
  })
  it('aun así la bielíptica gasta menos, pero tarda unas diez veces más', () => {
    expect(c.cheaper).toBe('bielliptic')
    expect(c.saving * 1000).toBeGreaterThan(150)
    expect(c.saving * 1000).toBeLessThan(250)
    expect(c.timeFactor).toBeGreaterThan(9)
    expect(c.timeFactor).toBeLessThan(12)
    expect(c.hohmann.tof / 3600).toBeCloseTo(5.29, 1)
  })
  it('repartir el Δi entre los dos impulsos ahorra frente a hacerlo todo en GEO', () => {
    // Todo el giro en el apogeo (cálculo directo, sin la función)
    const at = (r1 + r2) / 2
    const vp = Math.sqrt(MU * (2 / r1 - 1 / at))
    const va = Math.sqrt(MU * (2 / r2 - 1 / at))
    const di = 51.64 * (Math.PI / 180)
    const allAtApogee = vp - vc(r1) + Math.sqrt(va ** 2 + vc(r2) ** 2 - 2 * va * vc(r2) * Math.cos(di))
    expect(allAtApogee).toBeCloseTo(4.82, 2) // la cifra que daba la versión anterior
    expect(c.hohmann.dvTotal).toBeLessThan(allAtApogee)
    expect(c.hohmann.burns[1].di).toBeGreaterThan(c.hohmann.burns[0].di) // casi todo, en el radio mayor
    expect(c.hohmann.burns[0].di + c.hohmann.burns[1].di).toBeCloseTo(51.64, 9)
  })
  it('el reparto óptimo nunca es peor que hacer todo el giro en el radio mayor', () => {
    const at = (r1 + r2) / 2
    const vp = Math.sqrt(MU * (2 / r1 - 1 / at))
    const va = Math.sqrt(MU * (2 / r2 - 1 / at))
    for (const di of [0.5, 5, 28.5, 51.64, 90]) {
      const x = di * (Math.PI / 180)
      const allHigh = vp - vc(r1) + Math.sqrt(va ** 2 + vc(r2) ** 2 - 2 * va * vc(r2) * Math.cos(x))
      expect(hohmann(r1, r2, di).dvTotal).toBeLessThanOrEqual(allHigh + 1e-12)
    }
  })
  it('combinar el giro con un impulso sale más barato que darlo aparte', () => {
    expect(c.hohmann.dvTotal).toBeLessThan(c.hohmann.dvSeparatePlane)
  })
})

describe('Ecuación del cohete', () => {
  it('Δv = I_sp·g₀ da una relación de masas e', () => {
    const p = propellant((300 * G0) / 1000, 300, 100)
    expect(p.ratio).toBeCloseTo(Math.E, 10)
    expect(p.propellant).toBeCloseTo(100 * (Math.E - 1), 8)
    expect(p.wet).toBeCloseTo(100 * Math.E, 8)
  })
  it('Δv nulo, propelente nulo', () => {
    expect(propellant(0, 320, 500).propellant).toBe(0)
  })
  it('caso de la ficha: 500 kg secos, I_sp 320 s', () => {
    const p = propellant(4.78, 320, 500)
    expect(p.propellant).toBeGreaterThan(1700)
    expect(p.propellant).toBeLessThan(1800)
  })
})
