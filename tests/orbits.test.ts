/** Elementos orbitales, J2, órbitas heliosíncronas, eclipses y huella */
import { describe, expect, it } from 'vitest'
import { meanElements, MU, RE, rv2coe } from '../src/lib/astrodynamics'
import { footprintHalfAngle, makeRecord, raanForLtdn, ssoInclination, SPACECRAFT } from '../src/lib/missionDesign'
import { eclipseAnalytic, powerBudget } from '../src/lib/power'
import { orbitElements } from '../src/lib/orbit'
import { DEG, omm } from './helpers'

describe('Del vector de estado a los elementos (RV2COE)', () => {
  it('recupera los elementos de un vector construido a mano', () => {
    const [a, e, i, raan, argp, nu] = [9000, 0.12, 35 * DEG, 40 * DEG, 60 * DEG, 25 * DEG]
    const p = a * (1 - e * e)
    const r = p / (1 + e * Math.cos(nu))
    const rp = [r * Math.cos(nu), r * Math.sin(nu), 0]
    const vp = [-Math.sqrt(MU / p) * Math.sin(nu), Math.sqrt(MU / p) * (e + Math.cos(nu)), 0]
    const [cO, sO, cw, sw, ci, si] = [Math.cos(raan), Math.sin(raan), Math.cos(argp), Math.sin(argp), Math.cos(i), Math.sin(i)]
    const Q = [
      [cO * cw - sO * sw * ci, -cO * sw - sO * cw * ci],
      [sO * cw + cO * sw * ci, -sO * sw + cO * cw * ci],
      [sw * si, cw * si],
    ]
    const rot = (v: number[]) => ({ x: Q[0][0] * v[0] + Q[0][1] * v[1], y: Q[1][0] * v[0] + Q[1][1] * v[1], z: Q[2][0] * v[0] + Q[2][1] * v[1] })
    const o = rv2coe(rot(rp), rot(vp))
    expect(o.a).toBeCloseTo(a, 6)
    expect(o.e).toBeCloseTo(e, 10)
    expect(o.i).toBeCloseTo(i, 10)
    expect(o.raan!).toBeCloseTo(raan, 10)
    expect(o.argp!).toBeCloseTo(argp, 10)
    expect(o.nu!).toBeCloseTo(nu, 10)
  })
})

describe('J2 y órbitas heliosíncronas', () => {
  it('el nodo de la ISS retrocede unos 5° al día', () => {
    const m = meanElements(omm({ n: 15.5, i: 51.64 }))
    expect(m.raanDot).toBeGreaterThan(-5.1)
    expect(m.raanDot).toBeLessThan(-4.8)
  })
  it('en órbita polar el nodo no gira, y a 63,4° el perigeo tampoco (Molniya)', () => {
    expect(meanElements(omm({ n: 14.5, i: 90 })).raanDot).toBeCloseTo(0, 10)
    expect(meanElements(omm({ n: 2.006, e: 0.74, i: 63.435 })).argpDot).toBeCloseTo(0, 3)
  })
  it('inclinación heliosíncrona de tablas: 500 km 97,4°, 700 km 98,2°, 800 km 98,6°', () => {
    expect(ssoInclination(500)).toBeCloseTo(97.4, 1)
    expect(ssoInclination(700)).toBeCloseTo(98.19, 1)
    expect(ssoInclination(800)).toBeCloseTo(98.6, 1)
  })
  it('una órbita diseñada como heliosíncrona gira 0,9856°/día y se reconoce como tal', () => {
    const rec = makeRecord({ kind: 'sso', altKm: 520, incDeg: 0, ltdn: 10.5 }, SPACECRAFT[1], 'sso', 990001, Date.UTC(2026, 5, 1))
    const m = meanElements(rec)
    expect(m.raanDot).toBeCloseTo(360 / 365.2422, 2)
    expect(m.sunSynchronous).toBe(true)
  })
  it('LTDN 10:30 → nodo ascendente 22:30: Ω a 157,5° del Sol', () => {
    const t = Date.UTC(2026, 2, 20, 12) // equinoccio: α☉ ≈ 0
    const raan = raanForLtdn(10.5, t)
    expect(Math.abs(((raan - 157.5 + 540) % 360) - 180)).toBeLessThan(1)
  })
})

describe('Clases de órbita', () => {
  it('ISS en LEO, GPS en MEO, geoestacionario en GEO, Molniya en HEO', () => {
    expect(orbitElements(omm({ n: 15.5, i: 51.6 })).orbitClass).toBe('LEO')
    expect(orbitElements(omm({ n: 2.0056, i: 55 })).orbitClass).toBe('MEO')
    expect(orbitElements(omm({ n: 1.0027, i: 0.05 })).orbitClass).toBe('GEO')
    expect(orbitElements(omm({ n: 2.006, e: 0.72, i: 63.4 })).orbitClass).toBe('HEO')
  })
  it('periodo de un día sidéreo en GEO: a ≈ 42.164 km', () => {
    expect(orbitElements(omm({ n: 1.00273791, i: 0 })).semiMajorKm).toBeCloseTo(42164, -1)
  })
})

describe('Eclipses y energía', () => {
  it('a 400 km con β = 0 la sombra dura un 39 % de la órbita', () => {
    expect(eclipseAnalytic(400, 0).fraction).toBeCloseTo(0.39, 2)
  })
  it('sin eclipse cuando |β| supera β*', () => {
    const { betaCrit } = eclipseAnalytic(400, 0)
    expect(betaCrit).toBeCloseTo(70.2, 1)
    expect(eclipseAnalytic(400, betaCrit + 0.1).fraction).toBe(0)
    expect(eclipseAnalytic(400, -(betaCrit + 0.1)).fraction).toBe(0)
  })
  it('en GEO el eclipse máximo dura unos 69 minutos (sombra cilíndrica)', () => {
    const minutes = eclipseAnalytic(35_786, 0).fraction * 1436.07
    expect(minutes).toBeGreaterThan(68)
    expect(minutes).toBeLessThan(71)
  })
  it('balance de energía: lo que entra con Sol frente a lo que se consume', () => {
    const b = powerBudget({ areaM2: 0.1, efficiency: 0.3, pointing: 1, loadW: 10, periodMin: 95, sunMin: 60, eclipseMin: 35, dod: 0.25 })
    expect(b.pSun).toBeCloseTo(1361 * 0.03, 8)
    expect(b.energyOut).toBeCloseTo((10 * 95) / 60, 8)
    expect(b.battery).toBeCloseTo((10 * 35) / 60 / 0.25, 8)
  })
})

describe('Huella', () => {
  it('a 0° de elevación el semiángulo es arccos(R/(R+h))', () => {
    for (const h of [400, 800, 20_000]) expect(footprintHalfAngle(h, 0)).toBeCloseTo(Math.acos(RE / (RE + h)) / DEG, 8)
  })
  it('con más elevación mínima la huella se encoge', () => {
    expect(footprintHalfAngle(550, 10)).toBeLessThan(footprintHalfAngle(550, 0))
    expect(footprintHalfAngle(550, 90)).toBeCloseTo(0, 8)
  })
})
