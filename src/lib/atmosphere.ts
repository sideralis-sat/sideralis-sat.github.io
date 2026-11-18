/**
 * Atmósfera exponencial por tramos.
 * Fuente: Vallado, «Fundamentals of Astrodynamics and Applications», 4.ª ed., tabla 8-4.
 *   ρ(h) = ρ₀ · exp(−(h − h₀) / H)
 * Representa una actividad solar media: en un máximo solar la densidad a 400 km puede ser
 * varias veces mayor, y en un mínimo bastante menor.
 */
// [altitud base h₀ (km), densidad nominal ρ₀ (kg/m³), altura de escala H (km)]
export const VALLADO_TABLE: [number, number, number][] = [
  [0, 1.225, 7.249],
  [25, 3.899e-2, 6.349],
  [30, 1.774e-2, 6.682],
  [40, 3.972e-3, 7.554],
  [50, 1.057e-3, 8.382],
  [60, 3.206e-4, 7.714],
  [70, 8.77e-5, 6.549],
  [80, 1.905e-5, 5.799],
  [90, 3.396e-6, 5.382],
  [100, 5.297e-7, 5.877],
  [110, 9.661e-8, 7.263],
  [120, 2.438e-8, 9.473],
  [130, 8.484e-9, 12.636],
  [140, 3.845e-9, 16.149],
  [150, 2.07e-9, 22.523],
  [180, 5.464e-10, 29.74],
  [200, 2.789e-10, 37.105],
  [250, 7.248e-11, 45.546],
  [300, 2.418e-11, 53.628],
  [350, 9.518e-12, 53.298],
  [400, 3.725e-12, 58.515],
  [450, 1.585e-12, 60.828],
  [500, 6.967e-13, 63.822],
  [600, 1.454e-13, 71.835],
  [700, 3.614e-14, 88.667],
  [800, 1.17e-14, 124.64],
  [900, 5.245e-15, 181.05],
  [1000, 3.019e-15, 268.0],
]

/** Densidad del aire (kg/m³) a una altitud (km) */
export function density(hKm: number): number {
  if (hKm <= 0) return VALLADO_TABLE[0][1]
  let row = VALLADO_TABLE[0]
  for (const r of VALLADO_TABLE) {
    if (r[0] <= hKm) row = r
    else break
  }
  return row[1] * Math.exp(-(hKm - row[0]) / row[2])
}

/** Densidad de referencia de SGP4 para convertir B* (kg/m² por radio terrestre) */
export const BSTAR_RHO0 = 0.15696615

/**
 * Coeficiente balístico BC = m / (C_D·A) en kg/m² a partir de B* (1/R⊕):
 *   B* = ρ₀ · (C_D·A/m) / 2   →   BC = ρ₀ / (2·B*)
 * B* es un parámetro de ajuste del SGP4 y a veces sale negativo o absurdo: en ese caso null.
 */
export function bcFromBstar(bstar: number): number | null {
  if (!(bstar > 0)) return null
  const bc = BSTAR_RHO0 / (2 * bstar)
  return bc >= 10 && bc <= 2000 ? bc : null
}
