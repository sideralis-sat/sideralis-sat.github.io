/**
 * Estado de la vista que cambia en cada fotograma (cámara, cursor). Se guarda fuera de
 * React para no provocar renders; la barra inferior lo lee unas veces por segundo.
 */
export const viewState = {
  /** Punto de la superficie bajo el cursor, en grados, o null si apunta al espacio */
  cursor: null as null | { lat: number; lon: number },
  /** Último clic (sin arrastrar) sobre la superficie, en grados */
  lastClick: null as null | { lat: number; lon: number; at: number },
  /** Punto de la superficie en el centro de la vista */
  target: { lat: 0, lon: 0 },
  /** Altitud de la cámara sobre la superficie (km) */
  altitudeKm: 0,
  /** Rumbo e inclinación de la cámara (grados) */
  headingDeg: 0,
  tiltDeg: 0,
}
