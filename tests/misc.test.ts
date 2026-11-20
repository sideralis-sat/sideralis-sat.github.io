/** Enlace de radio, Doppler, GNSS, astrofotografía, imágenes de satélite y retirada de basura */
import { describe, expect, it } from 'vitest'
import { dB, fsplDb, linkAt } from '../src/lib/linkBudget'
import { C_KM_S, compass, dopplerShift } from '../src/lib/passes'
import { computeDop } from '../src/lib/sky'
import { fovDeg, radecToEciOfDate, tangentBasis } from '../src/lib/astroPhoto'
import { groundFromLook, IMAGERS, inSwath, maxReachKm, offNadirDeg } from '../src/lib/earthImaging'
import { chaserPropellant, kitCapacityKg, planeAngle, type Plan } from '../src/lib/debrisRemoval'
import { collisionProbability } from '../src/lib/missionDesign'
import { G0 } from '../src/lib/maneuvers'
import { DEG } from './helpers'

describe('Balance de enlace', () => {
  it('pérdidas en espacio libre: 20 log₁₀(4π d f / c)', () => {
    const exact = 20 * Math.log10((4 * Math.PI * 1000e3 * 1e9) / (C_KM_S * 1000))
    expect(fsplDb(1000, 1e9)).toBeCloseTo(exact, 1)
  })
  it('doblar la distancia cuesta 6 dB', () => {
    expect(fsplDb(2000, 2.2e9) - fsplDb(1000, 2.2e9)).toBeCloseTo(6.02, 2)
  })
  it('C/N₀ y Eb/N₀ salen de sumar y restar decibelios', () => {
    const p = { powerW: 1, txGainDbi: 0, rxGainDbi: 14, tsysK: 600, rateBps: 9600, lossesDb: 4, requiredEbN0: 9.6 }
    const l = linkAt(1000, 437e6, p)
    expect(l.cn0).toBeCloseTo(0 - fsplDb(1000, 437e6) - 4 + (14 - dB(600)) + 228.6, 8)
    expect(l.ebn0).toBeCloseTo(l.cn0 - dB(9600), 8)
    expect(l.margin).toBeCloseTo(l.ebn0 - 9.6, 8)
  })
})

describe('Doppler y pases', () => {
  it('al acercarse a 7 km/s una señal de 437 MHz sube unos 10 kHz', () => {
    expect(dopplerShift(437e6, -7)).toBeCloseTo((437e6 * 7) / C_KM_S, 6)
    expect(dopplerShift(437e6, -7)).toBeGreaterThan(10_000)
    expect(dopplerShift(437e6, 7)).toBeLessThan(0)
  })
  it('rosa de los vientos', () => {
    expect(compass(0)).toBe('N')
    expect(compass(90)).toBe('E')
    expect(compass(225)).toBe('SW')
    expect(compass(359)).toBe('N')
  })
})

describe('Dilución de la precisión (GNSS)', () => {
  const sky = (els: [number, number][]) => els.map(([az, el]) => ({ e: Math.cos(el * DEG) * Math.sin(az * DEG), n: Math.cos(el * DEG) * Math.cos(az * DEG), u: Math.sin(el * DEG), sys: 0 }))
  it('hacen falta al menos cuatro satélites', () => {
    expect(computeDop(sky([[0, 90], [0, 30], [120, 30]]))).toBeNull()
  })
  it('HDOP ≤ PDOP ≤ GDOP', () => {
    const d = computeDop(sky([[0, 90], [0, 20], [120, 20], [240, 20], [60, 45]]))!
    expect(d.hdop).toBeLessThanOrEqual(d.pdop)
    expect(d.pdop).toBeLessThanOrEqual(d.gdop)
  })
  it('no depende de hacia dónde mire el receptor', () => {
    const a = computeDop(sky([[0, 90], [0, 20], [120, 20], [240, 20]]))!
    const b = computeDop(sky([[0, 90], [37, 20], [157, 20], [277, 20]]))!
    expect(b.pdop).toBeCloseTo(a.pdop, 10)
  })
  it('satélites agrupados en un rincón del cielo dan peor geometría', () => {
    const good = computeDop(sky([[0, 90], [0, 15], [120, 15], [240, 15]]))!
    const bad = computeDop(sky([[0, 60], [10, 50], [20, 55], [5, 45]]))!
    expect(bad.pdop).toBeGreaterThan(good.pdop)
  })
})

describe('Astrofotografía', () => {
  it('campo de visión: 36 mm con 50 mm de focal son 39,6°', () => {
    expect(fovDeg(36, 50)).toBeCloseTo(39.6, 1)
  })
  it('en J2000 la precesión no cambia nada', () => {
    const u = radecToEciOfDate(83.82, -5.39, Date.UTC(2000, 0, 1, 12))
    const ra = 83.82 * DEG
    const dec = -5.39 * DEG
    expect(u[0]).toBeCloseTo(Math.cos(dec) * Math.cos(ra), 9)
    expect(u[1]).toBeCloseTo(Math.cos(dec) * Math.sin(ra), 9)
    expect(u[2]).toBeCloseTo(Math.sin(dec), 9)
  })
  it('en 26 años el equinoccio retrocede unos 0,36°', () => {
    const u = radecToEciOfDate(0, 0, Date.UTC(2026, 0, 1))
    const ra = Math.atan2(u[1], u[0]) / DEG
    expect(ra).toBeGreaterThan(0.3)
    expect(ra).toBeLessThan(0.4)
  })
  it('los ejes del plano tangente son ortonormales', () => {
    const { u, e, n } = tangentBasis(radecToEciOfDate(10.68, 41.27, Date.UTC(2026, 0, 1)))
    const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
    expect(dot(u, e)).toBeCloseTo(0, 12)
    expect(dot(u, n)).toBeCloseTo(0, 12)
    expect(dot(e, n)).toBeCloseTo(0, 12)
    expect(dot(n, n)).toBeCloseTo(1, 12)
  })
})

describe('Imágenes de satélite: franjas', () => {
  const im = (id: string) => IMAGERS.find((x) => x.id === id)!
  it('el ángulo desde el nadir y la distancia en el suelo son inversos', () => {
    for (const look of [5, 20, 40]) expect(offNadirDeg(groundFromLook(look, 700), 700)).toBeCloseTo(look, 8)
    expect(offNadirDeg(0, 700)).toBe(0)
  })
  it('las anchuras que salen de los ángulos coinciden con las publicadas', () => {
    const width = (id: string, h: number) => groundFromLook(im(id).look[1], h) - groundFromLook(im(id).look[0], h)
    expect(width('s2b', 786)).toBeCloseTo(290, -1)
    expect(width('l8', 705)).toBeCloseTo(185, -1)
    expect(width('s1a', 693)).toBeCloseTo(250, -2)
    expect(width('s3a', 814)).toBeCloseTo(1270, -2)
  })
  it('Sentinel-2 ve la traza y 140 km a cada lado, no 160', () => {
    const l = im('s2b').look
    expect(inSwath(l, 0, 786)).toBe(true)
    expect(inSwath(l, 140, 786)).toBe(true)
    expect(inSwath(l, -140, 786)).toBe(true)
    expect(inSwath(l, 160, 786)).toBe(false)
  })
  it('Sentinel-1 mira de lado: nunca la traza, sí 450 km a la derecha, nunca a la izquierda', () => {
    const l = im('s1a').look
    expect(inSwath(l, 0, 693)).toBe(false)
    expect(inSwath(l, 100, 693)).toBe(false)
    expect(inSwath(l, 450, 693)).toBe(true)
    expect(inSwath(l, -450, 693)).toBe(false)
  })
  it('OLCI de Sentinel-3 llega mucho más lejos hacia un lado que hacia el otro', () => {
    const l = im('s3a').look
    expect(inSwath(l, 900, 814)).toBe(true)
    expect(inSwath(l, -900, 814)).toBe(false)
    expect(inSwath(l, -300, 814)).toBe(true)
    expect(maxReachKm(l, 814)).toBeGreaterThan(900)
  })
})

describe('Retirada de basura', () => {
  it('ángulo entre planos', () => {
    expect(planeAngle(51.6, 30, 51.6, 30)).toBeCloseTo(0, 6)
    expect(planeAngle(0, 0, 30, 77)).toBeCloseTo(30, 10)
    expect(planeAngle(90, 0, 90, 90)).toBeCloseTo(90, 10)
  })
  it('propelente del cazador: con un solo tramo equivale a Tsiolkovsky a mano', () => {
    const plan: Plan = { order: [0, 1], legs: [{ from: 0, to: 1, dvDirect: 200, dvDrift: 200, waitDays: 0, strategy: 'direct', dv: 200, theta: 0 }], dvTotal: 200, days: 20 }
    const ve = 220 * G0
    const f = chaserPropellant(plan, 400, 15, 220, 100)
    const expected = ((400 * Math.exp(100 / ve) + 15) * Math.exp(200 / ve) + 15)
    expect(f.wet).toBeCloseTo(expected, 8)
    expect(f.propellant).toBeCloseTo(expected - 400 - 30, 8)
  })
  it('un kit de 15 kg no puede desorbitar una etapa de cohete de varias toneladas', () => {
    const cap = kitCapacityKg(15, 150, 220)
    expect(cap).toBeGreaterThan(50)
    expect(cap).toBeLessThan(500)
    // Comprobación con Tsiolkovsky: con esa masa, el propelente del kit da justo el Δv pedido
    expect(220 * G0 * Math.log((cap + 15) / (cap + 15 - 9))).toBeCloseTo(150, 6)
  })
  it('probabilidad de choque: más objetos o más años, más probabilidad', () => {
    const a = collisionProbability(500, 550, 25, 0.1)
    expect(collisionProbability(1000, 550, 25, 0.1).probability).toBeGreaterThan(a.probability)
    expect(collisionProbability(500, 550, 25, 0.1, 5).probability).toBeGreaterThan(a.probability)
    expect(a.probability).toBeGreaterThan(0)
    expect(a.probability).toBeLessThan(1)
  })
})
