import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { CONSTELLATIONS } from '../data/constellations'
import type { SatRecord } from '../data/types'
import type { PositionStream } from '../lib/positionStream'

interface Props {
  /** Grupo inercial: las posiciones del stream están en su marco */
  frame: MutableRefObject<THREE.Group | null>
  stream: PositionStream
  show: Uint8Array
  satellites: SatRecord[]
  groupIndex: Uint8Array
  /** Capa HTML encima del lienzo donde se pintan las etiquetas */
  layer: RefObject<HTMLDivElement | null>
  selected: number | null
}

const RE = 6371
/** Solo se etiquetan los satélites a menos de esta distancia de la cámara (radios terrestres, ~2900 km) */
const NEAR = 0.45
const MAX_LABELS = 28
const BOX_W = 150
const BOX_H = 34
/** Cada cuánto se decide qué satélites llevan etiqueta (ms); entre medias solo se recolocan */
const CHOOSE_MS = 250

/**
 * Etiquetas al acercarse: nombre y altitud de los satélites que quedan cerca de la cámara.
 * Se eligen los más cercanos que no se solapen en pantalla; los tapados por la Tierra se omiten.
 */
export function SatLabels({ frame, stream, show, satellites, groupIndex, layer, selected }: Props) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const pool = useRef<HTMLDivElement[]>([])
  const chosen = useRef<number[]>([])
  const lastChoice = useRef(0)
  const m = useRef(new THREE.Matrix4())
  const p = useRef(new Float32Array(3))
  /** Franja de pantalla libre de barras (px) y ancho medido de cada etiqueta */
  const band = useRef({ top: 0, bottom: 0 })
  const widths = useRef<number[]>([])

  // Reserva de elementos de etiqueta (se reutilizan; nunca se crean en cada fotograma)
  useEffect(() => {
    const host = layer.current
    if (!host) return
    const els: HTMLDivElement[] = []
    for (let k = 0; k < MAX_LABELS; k++) {
      const d = document.createElement('div')
      d.className = 'sat-label'
      d.hidden = true
      d.innerHTML = '<i></i><b></b><span></span>'
      host.appendChild(d)
      els.push(d)
    }
    pool.current = els
    return () => els.forEach((d) => d.remove())
  }, [layer])

  useFrame(() => {
    const els = pool.current
    if (!els.length) return
    camera.updateMatrixWorld()
    m.current.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    const e = m.current.elements
    const theta = frame.current?.rotation.y ?? 0
    const ct = Math.cos(theta)
    const sn = Math.sin(theta)
    const cx = camera.position.x
    const cy = camera.position.y
    const cz = camera.position.z
    const cc = cx * cx + cy * cy + cz * cz - 1
    const w = size.width
    const h = size.height

    // Proyección de un satélite: posición de pantalla, distancia a la cámara y si se ve
    const project = (i: number) => {
      if (!stream.positionOf(i, p.current)) return null
      const xi = p.current[0]
      const y = p.current[1]
      const zi = p.current[2]
      const x = xi * ct + zi * sn
      const z = -xi * sn + zi * ct
      const cw = e[3] * x + e[7] * y + e[11] * z + e[15]
      if (cw <= 0) return null
      const sx = (((e[0] * x + e[4] * y + e[8] * z + e[12]) / cw + 1) / 2) * w
      const sy = ((1 - (e[1] * x + e[5] * y + e[9] * z + e[13]) / cw) / 2) * h
      if (sx < 0 || sx > w || sy < band.current.top || sy > band.current.bottom) return null
      const dx = x - cx
      const dy = y - cy
      const dz = z - cz
      const qa = dx * dx + dy * dy + dz * dz
      const qb = 2 * (cx * dx + cy * dy + cz * dz)
      const disc = qb * qb - 4 * qa * cc
      if (disc > 0) {
        const t = (-qb - Math.sqrt(disc)) / (2 * qa)
        if (t > 0 && t < 1) return null // tapado por la Tierra
      }
      return { sx, sy, dist: Math.sqrt(qa), alt: Math.hypot(xi, y, zi) * RE - RE }
    }

    // Elegir: los más cercanos, sin solaparse, con prioridad para el seleccionado
    const now = performance.now()
    if (now - lastChoice.current > CHOOSE_MS) {
      lastChoice.current = now
      // Las etiquetas no se meten bajo la barra superior, los filtros, el HUD ni la barra inferior
      const cs = getComputedStyle(document.documentElement)
      const px = (v: string) => parseFloat(cs.getPropertyValue(v)) || 0
      const mnav = window.matchMedia('(max-width: 760px)').matches ? 60 : 0
      band.current = { top: px('--top') + 34, bottom: h - px('--hud') - mnav - 8 }
      const camR = Math.sqrt(cc + 1)
      const cands: { i: number; dist: number; sx: number; sy: number }[] = []
      // Lejos de todo (cámara muy por encima de la órbita baja) no hace falta recorrer el catálogo
      if (camR < 8) {
        for (let i = 0, n = show.length; i < n; i++) {
          if (!show[i]) continue
          const q = project(i)
          if (q && q.dist < NEAR) cands.push({ i, dist: q.dist, sx: q.sx, sy: q.sy })
        }
      }
      cands.sort((a, b) => (a.i === selected ? -1 : b.i === selected ? 1 : a.dist - b.dist))
      // Rectángulos aproximados de cada etiqueta (a la derecha del punto, o a la izquierda si no cabe)
      const boxes: [number, number, number, number][] = []
      const pick: number[] = []
      for (const c of cands) {
        if (pick.length >= MAX_LABELS) break
        const bw = Math.min(BOX_W + 60, 34 + String(satellites[c.i].OBJECT_NAME).length * 7.4)
        const x0 = c.sx + 10 + bw > w ? c.sx - 10 - bw : c.sx - 6
        const r: [number, number, number, number] = [x0 - 4, c.sy - 14, x0 + bw + 4, c.sy - 14 + BOX_H + 4]
        if (boxes.some((b) => r[0] < b[2] && r[2] > b[0] && r[1] < b[3] && r[3] > b[1])) continue
        boxes.push(r)
        pick.push(c.i)
      }
      chosen.current = pick
      els.forEach((d, k) => {
        const i = pick[k]
        if (i === undefined) {
          d.hidden = true
          return
        }
        const r = satellites[i]
        const g = CONSTELLATIONS[groupIndex[i]]
        ;(d.children[0] as HTMLElement).style.background = g?.color ?? '#fff'
        d.children[1].textContent = r.OBJECT_NAME
        d.classList.toggle('is-selected', i === selected)
        d.hidden = false
      })
      // Ancho de cada etiqueta, para darle la vuelta si no cabe a la derecha del punto
      widths.current = els.map((d, k) => (pick[k] === undefined ? 0 : d.offsetWidth || 120))
    }

    // Recolocar cada fotograma (los satélites se mueven) y actualizar la altitud
    const pick = chosen.current
    for (let k = 0; k < els.length; k++) {
      const d = els[k]
      const i = pick[k]
      if (i === undefined) continue
      const q = project(i)
      if (!q) {
        d.hidden = true
        continue
      }
      d.hidden = false
      const bw = widths.current[k] || 120
      const x = q.sx + 10 + bw > w ? q.sx - 10 - bw : q.sx + 10
      d.style.transform = `translate(${x}px, ${q.sy - 10}px)`
      d.children[2].textContent = `${Math.round(q.alt).toLocaleString('en-GB')} km`
    }
  })

  return null
}
