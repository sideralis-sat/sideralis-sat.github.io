import { useMemo } from 'react'
import * as THREE from 'three'

/** Fondo de estrellas fijo (marco inercial), generado con semilla para que no cambie entre visitas */
export function Starfield({ count = 4000 }: { count?: number }) {
  const geometry = useMemo(() => {
    let seed = 7
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    const pos = new Float32Array(count * 3)
    const col = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const u = rand() * 2 - 1
      const t = rand() * Math.PI * 2
      const r = Math.sqrt(1 - u * u)
      pos.set([r * Math.cos(t) * 300, u * 300, r * Math.sin(t) * 300], i * 3)
      const b = Math.pow(rand(), 3.2) * 0.9 + 0.08
      const warm = rand()
      col.set([b * (0.85 + warm * 0.2), b * 0.92, b * (1.05 - warm * 0.2)], i * 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    return g
  }, [count])

  return (
    <points geometry={geometry} renderOrder={-1}>
      <pointsMaterial size={1.3} sizeAttenuation={false} vertexColors depthWrite={false} transparent />
    </points>
  )
}
