import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { SimClock } from '../lib/clock'
import { EARTH_RADIUS_KM } from '../lib/coords'
import { frameAngles, rotateY } from '../lib/frame'
import type { Station } from '../lib/passes'
import type { PositionStream } from '../lib/positionStream'
import { geoToLocal } from './earthShaders'
import { hideIfBehindEarth, makeMarker } from './markers'

const CYAN = '#3ccfff'
const GREEN = '#3fe08a'
const DEG = Math.PI / 180

interface Props {
  station: Station
  /** Satélite seleccionado: se dibuja la línea de visión cuando está sobre el horizonte */
  selected: number | null
  stream: PositionStream | null
  clock: SimClock
}

/** Estación terrestre (dentro del grupo de la Tierra, coordenadas ECEF de escena) */
export function GroundStation({ station, selected, stream, clock }: Props) {
  const dpr = useThree((s) => s.viewport.dpr)
  const camera = useThree((s) => s.camera)
  const marker = useMemo(() => makeMarker('diamond', CYAN, 22), [])
  const { los, ring } = useMemo(() => {
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
    const los = new THREE.Line(g, new THREE.LineBasicMaterial({ color: new THREE.Color(GREEN), transparent: true, opacity: 0.9, depthWrite: false }))
    const g2 = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(128 * 3), 3))
    const ring = new THREE.LineLoop(g2, new THREE.LineDashedMaterial({ color: new THREE.Color(CYAN), transparent: true, opacity: 0.55, dashSize: 0.012, gapSize: 0.01, depthWrite: false }))
    los.frustumCulled = ring.frustumCulled = false
    los.renderOrder = ring.renderOrder = 7
    return { los, ring }
  }, [])

  useEffect(
    () => () => {
      for (const o of [marker, los, ring]) {
        o.geometry.dispose()
        ;(o.material as THREE.Material).dispose()
      }
    },
    [marker, los, ring],
  )
  useEffect(() => {
    ;(marker.material as THREE.ShaderMaterial).uniforms.uSize.value = 22 * dpr
  }, [dpr, marker])

  const st = useMemo(() => {
    const p = [0, 0, 0]
    geoToLocal(station.lat * DEG, station.lon * DEG, p)
    const k = 1 + station.altKm / EARTH_RADIUS_KM + 0.0008
    return new THREE.Vector3(p[0] * k, p[1] * k, p[2] * k)
  }, [station])

  useEffect(() => {
    ;(marker.geometry.getAttribute('position').array as Float32Array).set(st.toArray())
    marker.geometry.getAttribute('position').needsUpdate = true
  }, [st, marker])

  const sat = useMemo(() => new Float32Array(3), [])
  useFrame(() => {
    hideIfBehindEarth(marker, camera, st)
    if (selected === null || !stream || !stream.positionOf(selected, sat)) {
      los.visible = ring.visible = false
      return
    }
    const v = rotateY(new THREE.Vector3(sat[0], sat[1], sat[2]), frameAngles(clock.now(), 'ECEF').inertial)
    const up = st.clone().normalize()
    // Visible si está por encima del plano del horizonte local
    const visible = v.clone().sub(st).dot(up) > 0
    los.visible = visible
    if (visible) {
      ;(los.geometry.getAttribute('position').array as Float32Array).set([st.x, st.y, st.z, v.x, v.y, v.z])
      los.geometry.getAttribute('position').needsUpdate = true
    }
    // Zona desde la que la estación ve un satélite a esta altitud (0° de elevación)
    const r = v.length()
    const lambda = Math.acos(Math.min(1, 1 / r))
    const u = new THREE.Vector3(0, 1, 0).cross(up)
    if (u.lengthSq() < 1e-8) u.set(1, 0, 0)
    u.normalize()
    const w = up.clone().cross(u)
    const arr = ring.geometry.getAttribute('position').array as Float32Array
    const R = 1.002
    for (let i = 0; i < 128; i++) {
      const phi = (i / 128) * Math.PI * 2
      const p = up.clone().multiplyScalar(Math.cos(lambda)).addScaledVector(u, Math.cos(phi) * Math.sin(lambda)).addScaledVector(w, Math.sin(phi) * Math.sin(lambda))
      arr.set([p.x * R, p.y * R, p.z * R], i * 3)
    }
    ring.geometry.getAttribute('position').needsUpdate = true
    ring.computeLineDistances()
    ring.visible = true
  })

  return (
    <>
      <primitive object={marker} />
      <primitive object={los} />
      <primitive object={ring} />
    </>
  )
}
