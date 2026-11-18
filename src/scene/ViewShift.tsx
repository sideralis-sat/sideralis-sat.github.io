import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'

/**
 * En móvil la ficha del satélite ocupa la mitad de abajo de la pantalla.
 * Desplazamos el encuadre hacia arriba (sin mover la cámara) para que el globo
 * y el satélite queden en la parte visible.
 */
export function ViewShift({ active }: { active: boolean }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const current = useRef(0)

  useFrame((_, dt) => {
    const narrow = size.width <= 760
    const target = active && narrow ? size.height * 0.22 : 0
    const next = current.current + (target - current.current) * Math.min(1, dt * 8)
    current.current = Math.abs(next - target) < 0.5 ? target : next
    if (current.current === 0) {
      if (camera.view?.enabled) camera.clearViewOffset()
      return
    }
    camera.setViewOffset(size.width, size.height, 0, current.current, size.width, size.height)
  })

  return null
}
