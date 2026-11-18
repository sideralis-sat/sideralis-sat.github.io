import { gmstAt } from './astro'

/**
 * Marco de referencia de la escena
 * --------------------------------
 * ECEF (fijo a la Tierra): la Tierra no gira y todo lo inercial (satélites, estrellas,
 *   Sol) gira a su alrededor con −GMST. Es lo que hace Google Earth: el suelo no se
 *   mueve bajo la cámara.
 * ECI (inercial): las órbitas son elipses fijas y la Tierra gira con +GMST.
 *
 * Las posiciones de satellite.js están en TEME (≈ ECI). La escena siempre está en el
 * marco elegido; los grupos «tierra» e «inercial» llevan la rotación que corresponda.
 */
export type FrameMode = 'ECEF' | 'ECI'

export function frameAngles(ms: number, mode: FrameMode) {
  const gmst = gmstAt(ms)
  return {
    gmst,
    /** Rotación (eje Y de la escena) del grupo que contiene la Tierra */
    earth: mode === 'ECI' ? gmst : 0,
    /** Rotación del grupo que contiene lo inercial */
    inertial: mode === 'ECEF' ? -gmst : 0,
  }
}

/** Gira (x, z) un ángulo θ alrededor del eje Y, igual que `object.rotation.y = θ` */
export function rotateY<T extends { x: number; y: number; z: number }>(v: T, theta: number): T {
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  const x = v.x * c + v.z * s
  const z = -v.x * s + v.z * c
  v.x = x
  v.z = z
  return v
}
