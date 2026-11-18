import { useRef, type MutableRefObject, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import type { SimClock } from '../lib/clock'
import { frameAngles, type FrameMode } from '../lib/frame'

/**
 * Grupo para todo lo que vive en el marco inercial (satélites, estrellas). En modo ECEF
 * gira con −GMST para que la Tierra quede quieta; en ECI no gira.
 * Se exporta la referencia al grupo para quien necesite pasar de inercial a escena.
 */
export function InertialFrame({ clock, mode, groupRef, children }: { clock: SimClock; mode: FrameMode; groupRef?: MutableRefObject<THREE.Group | null>; children: ReactNode }) {
  const local = useRef<THREE.Group>(null)
  useFrame(() => {
    const g = local.current
    if (!g) return
    g.rotation.y = frameAngles(clock.now(), mode).inertial
    g.updateMatrixWorld()
  })
  return (
    <group
      ref={(g) => {
        local.current = g
        if (groupRef) groupRef.current = g
      }}
    >
      {children}
    </group>
  )
}
