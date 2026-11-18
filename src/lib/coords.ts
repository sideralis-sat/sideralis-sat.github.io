/**
 * Convenciones de la escena 3D
 * ----------------------------
 * 1 unidad = radio medio terrestre (6371 km).
 * Trabajamos en el marco inercial (ECI/TEME), así las órbitas son elipses fijas
 * y es la Tierra la que gira (rotation.y = GMST).
 *
 *   ECI x  →  escena  x
 *   ECI y  →  escena -z
 *   ECI z  →  escena  y   (eje Y de three.js = polo norte)
 */
export const EARTH_RADIUS_KM = 6371

export function eciToScene(x: number, y: number, z: number, out: number[] | Float32Array, offset = 0) {
  out[offset] = x / EARTH_RADIUS_KM
  out[offset + 1] = z / EARTH_RADIUS_KM
  out[offset + 2] = -y / EARTH_RADIUS_KM
}

/** Dirección unitaria en la escena de un punto lat/lon (grados) ya girado por la Tierra (GMST en radianes) */
export function geoToSceneDir(latDeg: number, lonDeg: number, gmst: number): [number, number, number] {
  const lat = (latDeg * Math.PI) / 180
  const lon = (lonDeg * Math.PI) / 180
  const x = Math.cos(lat) * Math.cos(lon)
  const y = Math.sin(lat)
  const z = -Math.cos(lat) * Math.sin(lon)
  const c = Math.cos(gmst)
  const s = Math.sin(gmst)
  return [x * c + z * s, y, -x * s + z * c]
}
