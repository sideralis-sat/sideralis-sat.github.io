import { useMemo } from 'react'
import * as THREE from 'three'
import { geoToLocal } from './earthShaders'

/** Rejilla de meridianos y paralelos cada 15°, con el ecuador y el meridiano de Greenwich resaltados */
export function Graticule() {
  const { minor, major } = useMemo(() => {
    const r = 1.0015
    const p = [0, 0, 0]
    const minor: number[] = []
    const major: number[] = []
    const push = (arr: number[], lat: number, lon: number) => {
      geoToLocal(THREE.MathUtils.degToRad(lat), THREE.MathUtils.degToRad(lon), p)
      arr.push(p[0] * r, p[1] * r, p[2] * r)
    }
    for (let lat = -75; lat <= 75; lat += 15) {
      const arr = lat === 0 ? major : minor
      for (let lon = -180; lon < 180; lon += 2) {
        push(arr, lat, lon)
        push(arr, lat, lon + 2)
      }
    }
    for (let lon = -180; lon < 180; lon += 15) {
      const arr = lon === 0 ? major : minor
      for (let lat = -88; lat < 88; lat += 2) {
        push(arr, lat, lon)
        push(arr, lat + 2, lon)
      }
    }
    const geo = (a: number[]) => new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(a, 3))
    return { minor: geo(minor), major: geo(major) }
  }, [])

  return (
    <>
      <lineSegments geometry={minor} renderOrder={5}>
        <lineBasicMaterial color="#9fb4d8" transparent opacity={0.16} depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={major} renderOrder={5}>
        <lineBasicMaterial color="#c9d8f2" transparent opacity={0.4} depthWrite={false} />
      </lineSegments>
    </>
  )
}
