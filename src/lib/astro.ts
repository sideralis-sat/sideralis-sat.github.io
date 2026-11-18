/**
 * Cálculos astronómicos ligeros para el hilo principal (sin cargar satellite.js entero).
 * Precisión de sobra para la visualización: GMST según Vallado y Sol según el
 * Astronomical Almanac (algoritmo de baja precisión, ~0.01°).
 */
import { eciToScene } from './coords'

const DEG = Math.PI / 180
const TWO_PI = Math.PI * 2
const tmp = [0, 0, 0]

const julianDate = (ms: number) => ms / 86_400_000 + 2440587.5

/** Tiempo sidéreo medio de Greenwich (rad) = ángulo de rotación de la Tierra */
export function gmstAt(ms: number): number {
  const t = (julianDate(ms) - 2451545.0) / 36525
  let g = (-6.2e-6 * t * t * t + 0.093104 * t * t + (876600.0 * 3600 + 8640184.812866) * t + 67310.54841) * DEG / 240
  g %= TWO_PI
  return g < 0 ? g + TWO_PI : g
}

/** Dirección unitaria del Sol en el marco inercial (ECI, ecuador y equinoccio medios) */
export function sunEciAt(ms: number): [number, number, number] {
  const n = julianDate(ms) - 2451545.0
  const L = (280.46 + 0.9856474 * n) * DEG
  const g = (357.528 + 0.9856003 * n) * DEG
  const lambda = L + (1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG
  const eps = (23.439 - 4e-7 * n) * DEG
  return [Math.cos(lambda), Math.cos(eps) * Math.sin(lambda), Math.sin(eps) * Math.sin(lambda)]
}

/** Dirección unitaria del Sol en coordenadas de la escena */
export function sunDirectionAt(ms: number, out: { set(x: number, y: number, z: number): unknown }) {
  const s = sunEciAt(ms)
  eciToScene(s[0], s[1], s[2], tmp)
  const len = Math.hypot(tmp[0], tmp[1], tmp[2])
  out.set(tmp[0] / len, tmp[1] / len, tmp[2] / len)
}
