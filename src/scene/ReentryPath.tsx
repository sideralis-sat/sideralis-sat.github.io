import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { eciToScene } from '../lib/coords'
import { frameAngles, rotateY } from '../lib/frame'
import { ENTRY_INTERFACE_KM, type ReentryResult } from '../lib/reentry'
import { hideIfBehindEarth, makeMarker } from './markers'

const MAGENTA = new THREE.Color('#ffc21a') // tramo orbital, en el color de lo seleccionado
const AMBER = new THREE.Color('#ffb020')
const RED = new THREE.Color('#ff4d4d')

/**
 * Trayectoria simulada de reentrada (dentro del grupo de la Tierra, ECEF): amarilla en
 * órbita, ámbar desde la interfaz de entrada y rojo cerca del suelo. Marcadores en el
 * encendido, en la interfaz de entrada y en el impacto.
 */
export function ReentryPath({ result }: { result: ReentryResult }) {
  const dpr = useThree((s) => s.viewport.dpr)
  const camera = useThree((s) => s.camera)
  const objs = useMemo(() => {
    const pts = result.points
    const pos = new Float32Array(pts.length * 3)
    const col = new Float32Array(pts.length * 3)
    const tmp = [0, 0, 0]
    const toScene = (r: { x: number; y: number; z: number }, t: number) => {
      eciToScene(r.x, r.y, r.z, tmp)
      return rotateY({ x: tmp[0], y: tmp[1], z: tmp[2] }, frameAngles(t, 'ECEF').inertial)
    }
    pts.forEach((p, i) => {
      const v = toScene(p.r, p.t)
      pos.set([v.x, v.y, v.z], i * 3)
      const c = p.h > ENTRY_INTERFACE_KM ? MAGENTA : AMBER.clone().lerp(RED, 1 - Math.max(0, p.h) / ENTRY_INTERFACE_KM)
      col.set([c.r, c.g, c.b], i * 3)
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }))
    line.frustumCulled = false
    line.renderOrder = 7

    const anchors: (THREE.Vector3 | null)[] = []
    const place = (m: THREE.Points, v: { x: number; y: number; z: number } | null) => {
      anchors.push(v ? new THREE.Vector3(v.x, v.y, v.z) : null)
      if (!v) {
        m.visible = false
        return m
      }
      ;(m.geometry.getAttribute('position').array as Float32Array).set([v.x, v.y, v.z])
      return m
    }
    const burn = place(makeMarker('dot', '#ffc21a', 12), pts[0] ? toScene(pts[0].r, pts[0].t) : null)
    const eiPt = result.entry ? pts.find((p) => p.t >= result.entry!.t) : null
    const ei = place(makeMarker('ring', '#ffb020', 18), eiPt ? toScene(eiPt.r, eiPt.t) : null)
    const last = pts[pts.length - 1]
    let impactV = null
    if (result.impact && last) {
      const v = toScene(last.r, last.t)
      const n = Math.hypot(v.x, v.y, v.z)
      impactV = { x: (v.x / n) * 1.001, y: (v.y / n) * 1.001, z: (v.z / n) * 1.001 }
    }
    const impact = place(makeMarker('cross', '#ff4d4d', 26), impactV)
    const impactRing = place(makeMarker('ring', '#ff4d4d', 44), impactV)
    return { line, markers: [burn, ei, impact, impactRing], sizes: [12, 18, 26, 44], anchors }
  }, [result])

  useFrame(() => objs.markers.forEach((m, i) => hideIfBehindEarth(m, camera, objs.anchors[i])))

  useEffect(() => {
    objs.markers.forEach((m, i) => ((m.material as THREE.ShaderMaterial).uniforms.uSize.value = objs.sizes[i] * dpr))
  }, [objs, dpr])

  useEffect(
    () => () => {
      for (const o of [objs.line, ...objs.markers]) {
        o.geometry.dispose()
        ;(o.material as THREE.Material).dispose()
      }
    },
    [objs],
  )

  return (
    <>
      <primitive object={objs.line} />
      {objs.markers.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  )
}
