/** Atmósfera, vida orbital, desorbitado y meteorología espacial */
import { describe, expect, it } from 'vitest'
import { bcFromBstar, density } from '../src/lib/atmosphere'
import { ballisticCoefficient, deorbitDv, dragMakeupPerYear, SPACECRAFT } from '../src/lib/missionDesign'
import { dvForPerigee, naturalDecay, orbitAfterBurn } from '../src/lib/reentry'
import { densityWith, forecastF107, kingHele, type SpaceWeather } from '../src/lib/spaceWeather'
import { MU, RE } from '../src/lib/astrodynamics'

const years = (h: number, bc: number) => naturalDecay(h, 0, bc).days / 365.25

describe('Atmósfera', () => {
  it('reproduce la tabla de Vallado en sus nodos', () => {
    expect(density(0)).toBeCloseTo(1.225, 6)
    expect(density(400)).toBeCloseTo(3.725e-12, 15)
    expect(density(500)).toBeCloseTo(6.967e-13, 16)
  })
  it('la densidad baja siempre con la altitud', () => {
    for (let h = 0; h < 1000; h += 5) expect(density(h + 5)).toBeLessThan(density(h))
  })
  it('King-Hele: más actividad solar, más densidad', () => {
    const quiet = kingHele(400, { f107: 70, ap: 4 })
    const active = kingHele(400, { f107: 220, ap: 15 })
    expect(active).toBeGreaterThan(3 * quiet)
    expect(quiet).toBeGreaterThan(1e-13)
    expect(active).toBeLessThan(1e-10)
  })
  it('sin datos de actividad se usa la atmósfera media', () => {
    expect(densityWith(400, null)).toBe(density(400))
  })
  it('B* → coeficiente balístico, descartando valores absurdos', () => {
    expect(bcFromBstar(0.15696615 / 200)).toBeCloseTo(100, 8)
    expect(bcFromBstar(-1e-4)).toBeNull()
    expect(bcFromBstar(0)).toBeNull()
  })
})

describe('Vida orbital', () => {
  const bc3u = ballisticCoefficient(SPACECRAFT[1])
  it('un 3U soltado desde la ISS (400 km) cae en uno o dos años', () => {
    const y = years(400, bc3u)
    expect(y).toBeGreaterThan(0.3)
    expect(y).toBeLessThan(3)
  })
  it('a 550 km dura años, y a 700 km décadas', () => {
    expect(years(550, bc3u)).toBeGreaterThan(2)
    expect(years(550, bc3u)).toBeLessThan(25)
    expect(years(700, bc3u)).toBeGreaterThan(25)
  })
  it('más altitud o más coeficiente balístico, más vida', () => {
    expect(years(450, bc3u)).toBeGreaterThan(years(400, bc3u))
    expect(years(450, 2 * bc3u)).toBeCloseTo(2 * years(450, bc3u), 0)
  })
  it('la serie de altitud baja de forma monótona hasta la interfaz de entrada', () => {
    const d = naturalDecay(450, 0, bc3u)
    expect(d.reentered).toBe(true)
    for (let k = 1; k < d.series.length; k++) expect(d.series[k].h).toBeLessThanOrEqual(d.series[k - 1].h + 1e-9)
    expect(d.series[d.series.length - 1].h).toBe(120)
  })
})

describe('Desorbitado', () => {
  const circular = (h: number) => {
    const r = RE + h
    return { r: { x: r, y: 0, z: 0 }, v: { x: 0, y: Math.sqrt(MU / r), z: 0 } }
  }
  it('desde 400 km bajar el perigeo a 60 km cuesta unos 100 m/s', () => {
    expect(deorbitDv(400)).toBeGreaterThan(95)
    expect(deorbitDv(400)).toBeLessThan(105)
  })
  it('el impulso calculado deja el perigeo justo a 60 km', () => {
    const { r, v } = circular(500)
    expect(orbitAfterBurn(r, v, deorbitDv(500)).perigeeAlt).toBeCloseTo(60, 1)
    expect(dvForPerigee(r, v, 60)).toBeCloseTo(deorbitDv(500), 1)
  })
  it('sin impulso la órbita no cambia', () => {
    const { r, v } = circular(500)
    const o = orbitAfterBurn(r, v, 0)
    expect(o.perigeeAlt).toBeCloseTo(500, 6)
    expect(o.apogeeAlt).toBeCloseTo(500, 6)
  })
  it('Δv anual contra el arrastre: ½ρv²/BC durante un año', () => {
    const rho = density(400)
    const v = Math.sqrt(MU / (RE + 400)) * 1000
    expect(dragMakeupPerYear(rho, 400, 100)).toBeCloseTo(((0.5 * rho * v * v) / 100) * 365.25 * 86400, 6)
  })
})

describe('Previsión del ciclo solar', () => {
  const sw: SpaceWeather = {
    generatedAt: '2026-11-01T00:00:00Z',
    source: 'test',
    f107: [],
    kp: [],
    cycle: [
      { month: '2026-11', f107: 140, high: 160, low: 120 },
      { month: '2026-12', f107: 135, high: 155, low: 115 },
    ],
  }
  it('devuelve el mes de la predicción', () => {
    expect(forecastF107(sw, Date.UTC(2026, 11, 15))).toBe(135)
  })
  it('antes de la predicción usa su primer valor', () => {
    expect(forecastF107(sw, Date.UTC(2026, 0, 15))).toBe(140)
  })
  it('después de la predicción devuelve null (atmósfera media del ciclo, no el último mínimo)', () => {
    expect(forecastF107(sw, Date.UTC(2031, 0, 15))).toBeNull()
  })
})
