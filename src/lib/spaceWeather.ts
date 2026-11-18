/**
 * Meteorología espacial y su efecto en la densidad de la termosfera.
 *
 * El Sol calienta la alta atmósfera sobre todo en ultravioleta extremo, que se mide de forma
 * indirecta con el flujo de radio a 10,7 cm (F10.7, en sfu = 10⁻²² W m⁻² Hz⁻¹). Las tormentas
 * geomagnéticas (índice Ap) añaden calentamiento en latitudes altas. Una termosfera más
 * caliente se expande y aumenta la densidad a una altitud dada.
 *
 * Modelo de King-Hele, usado por el Bureau of Meteorology de Australia (válido 180–500 km):
 *   T = 900 + 2,5 (F10.7 − 70) + 1,5 Ap        temperatura exosférica (K)
 *   m = 27 − 0,012 (h − 200)                    masa molecular media
 *   H = T / m                                   altura de escala (km)
 *   ρ = 6·10⁻¹⁰ exp(−(h − 175) / H)             densidad (kg/m³)
 * Por debajo de 180 km se usa la tabla de Vallado; por encima de 500 km, la tabla escalada
 * con el cociente de ambos modelos a 500 km.
 */
import { useEffect, useState } from 'react'
import { density as valladoDensity } from './atmosphere'

export interface SpaceWeather {
  generatedAt: string
  source: string
  f107: { t: string; flux: number; mean90: number | null }[]
  kp: { t: string; kp: number; ap: number }[]
  cycle: { month: string; f107: number; high: number; low: number }[]
}

export interface Activity {
  f107: number
  ap: number
}

export const SCENARIOS: { id: string; label: string; activity: Activity | null }[] = [
  { id: 'mean', label: 'Mean (Vallado)', activity: null },
  { id: 'min', label: 'Solar minimum', activity: { f107: 70, ap: 4 } },
  { id: 'max', label: 'Solar maximum', activity: { f107: 220, ap: 15 } },
  { id: 'storm', label: 'Geomagnetic storm', activity: { f107: 180, ap: 150 } },
]

export function kingHele(hKm: number, a: Activity) {
  const T = 900 + 2.5 * (a.f107 - 70) + 1.5 * a.ap
  const m = 27 - 0.012 * (hKm - 200)
  const H = T / m
  return 6e-10 * Math.exp(-(hKm - 175) / H)
}

/** Densidad (kg/m³) con actividad solar; null = atmósfera media de Vallado */
export function densityWith(hKm: number, a: Activity | null) {
  if (!a || hKm < 180) return valladoDensity(hKm)
  if (hKm <= 500) return kingHele(hKm, a)
  return valladoDensity(hKm) * (kingHele(500, a) / valladoDensity(500))
}

/** Valores actuales: último F10.7 diario, su media de 90 días y Ap medio de las últimas 24 h */
export function currentActivity(sw: SpaceWeather) {
  const last = sw.f107[sw.f107.length - 1]
  const mean90 = [...sw.f107].reverse().find((d) => d.mean90)?.mean90 ?? last?.flux ?? 100
  const lastT = sw.kp.length ? Date.parse(sw.kp[sw.kp.length - 1].t) : 0
  const day = sw.kp.filter((k) => Date.parse(k.t) > lastT - 86_400_000)
  const ap = day.length ? day.reduce((s, k) => s + k.ap, 0) / day.length : 10
  const kpMax = day.length ? Math.max(...day.map((k) => k.kp)) : 0
  return { f107: last?.flux ?? mean90, mean90, ap, kpMax, at: last?.t ?? sw.generatedAt }
}

/** F10.7 previsto (media mensual del ciclo) para un instante, o null fuera del rango de la predicción */
export function forecastF107(sw: SpaceWeather, ms: number): number | null {
  if (!sw.cycle.length) return null
  const d = new Date(ms)
  const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  const hit = sw.cycle.find((c) => c.month === key)
  if (hit) return hit.f107
  // Antes de la predicción, su primer valor; después, null: quien llama usa la atmósfera media
  // de un ciclo, porque prolongar el mínimo solar alargaría la vida orbital sin fundamento
  return key < sw.cycle[0].month ? sw.cycle[0].f107 : null
}

let cache: Promise<SpaceWeather | null> | null = null

export function loadSpaceWeather() {
  cache ??= fetch(`${import.meta.env.BASE_URL}data/spaceweather.json`)
    .then((r) => (r.ok ? (r.json() as Promise<SpaceWeather>) : null))
    .catch(() => null)
  return cache
}

/** undefined mientras carga; null si no hay datos (sin conexión al generar el catálogo) */
export function useSpaceWeather() {
  const [sw, setSw] = useState<SpaceWeather | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    loadSpaceWeather().then((d) => alive && setSw(d))
    return () => {
      alive = false
    }
  }, [])
  return sw
}
