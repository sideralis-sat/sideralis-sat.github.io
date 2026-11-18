import { useEffect, useRef, type MutableRefObject } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { PositionStream } from '../lib/positionStream'

interface Props {
  /** Grupo inercial: las posiciones del stream están en su marco */
  frame: MutableRefObject<THREE.Group | null>
  stream: PositionStream
  show: Uint8Array
  /** Al pinchar: índice del satélite, o null si se pincha en vacío */
  onPick: (index: number | null) => void
  /** Al pasar el ratón por encima */
  onHover: (index: number | null, x: number, y: number) => void
}

const CLICK_TOLERANCE_PX = 6

/**
 * Selección en pantalla: proyecta todos los satélites visibles y se queda con el más
 * cercano al puntero, descartando los que tapa la Tierra. Con ~15.000 puntos tarda ~1 ms,
 * así que no hace falta un raycaster.
 */
export function Picker({ frame, stream, show, onPick, onHover }: Props) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const latest = useRef({ show, onPick, onHover })
  latest.current = { show, onPick, onHover }

  useEffect(() => {
    const el = gl.domElement
    const m = new THREE.Matrix4()
    let down: { x: number; y: number; t: number } | null = null
    let hoverFrame = 0
    let lastHover: number | null = null

    function pick(clientX: number, clientY: number, radius: number): number | null {
      const { a, b, alpha } = stream.current
      if (!a || !b) return null
      const rect = el.getBoundingClientRect()
      const px = clientX - rect.left
      const py = clientY - rect.top
      const w = rect.width
      const h = rect.height
      camera.updateMatrixWorld()
      // Giro del marco inercial respecto a la escena (solo alrededor de Y)
      const theta = frame.current?.rotation.y ?? 0
      const ct = Math.cos(theta)
      const sn = Math.sin(theta)
      m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      const e = m.elements
      const cx = camera.position.x
      const cy = camera.position.y
      const cz = camera.position.z
      const cc = cx * cx + cy * cy + cz * cz - 1
      const showArr = latest.current.show
      const A = a.positions
      const B = b.positions
      let best: number | null = null
      let bestD = radius * radius

      for (let i = 0, n = showArr.length; i < n; i++) {
        if (!showArr[i] || !a.valid[i] || !b.valid[i]) continue
        const o = i * 3
        const xi = A[o] + (B[o] - A[o]) * alpha
        const y = A[o + 1] + (B[o + 1] - A[o + 1]) * alpha
        const zi = A[o + 2] + (B[o + 2] - A[o + 2]) * alpha
        const x = xi * ct + zi * sn
        const z = -xi * sn + zi * ct
        const cw = e[3] * x + e[7] * y + e[11] * z + e[15]
        if (cw <= 0) continue
        const sx = (((e[0] * x + e[4] * y + e[8] * z + e[12]) / cw + 1) / 2) * w
        const sy = ((1 - (e[1] * x + e[5] * y + e[9] * z + e[13]) / cw) / 2) * h
        const d2 = (sx - px) ** 2 + (sy - py) ** 2
        if (d2 >= bestD) continue
        // ¿Lo tapa la Tierra? Intersección del segmento cámara→satélite con la esfera unidad
        const dx = x - cx
        const dy = y - cy
        const dz = z - cz
        const qa = dx * dx + dy * dy + dz * dz
        const qb = 2 * (cx * dx + cy * dy + cz * dz)
        const disc = qb * qb - 4 * qa * cc
        if (disc > 0) {
          const t = (-qb - Math.sqrt(disc)) / (2 * qa)
          if (t > 0 && t < 1) continue
        }
        best = i
        bestD = d2
      }
      return best
    }

    const onDown = (ev: PointerEvent) => {
      down = { x: ev.clientX, y: ev.clientY, t: performance.now() }
    }
    const onUp = (ev: PointerEvent) => {
      if (!down) return
      const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y)
      down = null
      if (moved > CLICK_TOLERANCE_PX) return
      const radius = ev.pointerType === 'touch' ? 24 : 14
      latest.current.onPick(pick(ev.clientX, ev.clientY, radius))
    }
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerType === 'touch' || ev.buttons) return
      cancelAnimationFrame(hoverFrame)
      hoverFrame = requestAnimationFrame(() => {
        const i = pick(ev.clientX, ev.clientY, 12)
        el.style.cursor = i === null ? '' : 'pointer'
        if (i !== lastHover || i !== null) latest.current.onHover(i, ev.clientX, ev.clientY)
        lastHover = i
      })
    }
    const onLeave = () => {
      cancelAnimationFrame(hoverFrame)
      lastHover = null
      latest.current.onHover(null, 0, 0)
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
      cancelAnimationFrame(hoverFrame)
    }
  }, [camera, gl, stream])

  return null
}
