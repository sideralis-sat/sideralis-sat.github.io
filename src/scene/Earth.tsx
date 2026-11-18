import { useMemo, useRef, type ReactNode } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { sunDirectionAt } from '../lib/astro'
import { frameAngles, rotateY, type FrameMode } from '../lib/frame'
import type { SimClock } from '../lib/clock'
import { DetailTiles } from './DetailTiles'
import { atmosphereFragment, atmosphereVertex, geoToLocal, surfaceFragment, surfaceVertex } from './earthShaders'

const tex = (name: string) => `${import.meta.env.BASE_URL}textures/${name}`

/** Esfera unidad con coordenadas geográficas (aGeoUv = uv equirectangular) */
function makeGlobeGeometry(segLon = 192, segLat = 96) {
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const p = [0, 0, 0]
  for (let j = 0; j <= segLat; j++) {
    const v = j / segLat
    const lat = (0.5 - v) * Math.PI
    for (let i = 0; i <= segLon; i++) {
      const u = i / segLon
      geoToLocal(lat, (u - 0.5) * 2 * Math.PI, p)
      pos.push(p[0], p[1], p[2])
      uv.push(u, 1 - v)
    }
  }
  const row = segLon + 1
  for (let j = 0; j < segLat; j++)
    for (let i = 0; i < segLon; i++) {
      const a = j * row + i
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('aGeoUv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

interface Props {
  clock: SimClock
  mode: FrameMode
  /** Capas fijas a la Tierra (traza, rejilla...): se dibujan dentro del grupo que gira con ella */
  children?: ReactNode
}

export function Earth({ clock, mode, children }: Props) {
  const group = useRef<THREE.Group>(null!)
  const gl = useThree((s) => s.gl)
  const [day, night, spec] = useLoader(THREE.TextureLoader, [
    tex('earth_day_4k.jpg'),
    tex('earth_night_4k.jpg'),
    tex('earth_specular_2048.jpg'),
  ])

  const geometry = useMemo(() => makeGlobeGeometry(), [])

  const { uniforms, sunDir } = useMemo(() => {
    const aniso = gl.capabilities.getMaxAnisotropy()
    day.colorSpace = THREE.SRGBColorSpace
    night.colorSpace = THREE.SRGBColorSpace
    for (const t of [day, night, spec]) {
      t.anisotropy = aniso
      t.needsUpdate = true
    }
    const sunDir = new THREE.Vector3(1, 0, 0)
    return {
      sunDir,
      uniforms: {
        uDay: { value: day },
        uNight: { value: night },
        uSpec: { value: spec },
        uSunDir: { value: sunDir },
        uOpacity: { value: 1 },
        uStrength: { value: 1 },
        uNightTile: { value: night },
        uNightRect: { value: new THREE.Vector3(0, 0, 1) },
        uUseNightTile: { value: 0 },
      },
    }
  }, [day, night, spec, gl])

  useFrame(() => {
    const now = clock.now()
    const angles = frameAngles(now, mode)
    group.current.rotation.y = angles.earth
    // El Sol está en el marco inercial; en ECEF gira con −GMST como todo lo inercial
    sunDirectionAt(now, sunDir)
    rotateY(sunDir, angles.inertial)
  })

  return (
    <>
      <group ref={group}>
        <mesh geometry={geometry} renderOrder={0}>
          <shaderMaterial uniforms={uniforms} vertexShader={surfaceVertex} fragmentShader={surfaceFragment} />
        </mesh>
        <DetailTiles night={night} spec={spec} sunDir={sunDir} />
        {children}
      </group>
      {/* El halo no gira con la Tierra, solo sigue al Sol */}
      <mesh scale={1.1}>
        <sphereGeometry args={[1, 96, 48]} />
        <shaderMaterial
          uniforms={uniforms}
          vertexShader={atmosphereVertex}
          fragmentShader={atmosphereFragment}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          transparent
          depthWrite={false}
        />
      </mesh>
    </>
  )
}
