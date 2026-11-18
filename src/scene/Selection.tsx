import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { SatRecord } from '../data/types'
import type { SimClock } from '../lib/clock'
import { eciToScene } from '../lib/coords'
import { frameAngles, rotateY, type FrameMode } from '../lib/frame'
import { propagateRecord } from '../lib/propagateRecord'
import type { PositionStream } from '../lib/positionStream'

/**
 * Todo lo que se dibuja del satélite seleccionado:
 *   SatMarker      anillo sobre el satélite (marco inercial, misma posición que su punto)
 *   OrbitPath      una vuelta completa desde ahora, en el marco de la escena:
 *                  en ECI es la elipse; en ECEF es la trayectoria respecto a la Tierra
 *   GroundTrack    traza sobre la superficie (½ vuelta pasada y 1½ futura)
 *   Footprint      huella de visibilidad a 0° de elevación y vertical hasta el suelo
 */

const REFRESH_MS = 20_000 // de tiempo simulado
const REFRESH_REAL_MS = 250

const lineVertex = /* glsl */ `
  attribute float aT;
  varying float vT;
  void main() {
    vT = aT;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
/** vT < 0: pasado (tenue); 0..1: futuro, apagándose */
const lineFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uFadeEnd;
  uniform float uOpacity;
  varying float vT;
  void main() {
    float a = vT < 0.0 ? 0.28 : mix(0.95, 0.18, clamp(vT / uFadeEnd, 0.0, 1.0));
    gl_FragColor = vec4(uColor, a * uOpacity);
    #include <colorspace_fragment>
  }
`

function makeLine(samples: number, color: string, fadeEnd: number, opacity = 1) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(samples * 3), 3))
  g.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(samples), 1))
  const m = new THREE.ShaderMaterial({
    vertexShader: lineVertex,
    fragmentShader: lineFragment,
    uniforms: {
      uColor: { value: new THREE.Color(color).convertSRGBToLinear() },
      uFadeEnd: { value: fadeEnd },
      uOpacity: { value: opacity },
    },
    transparent: true,
    depthWrite: false,
  })
  const line = new THREE.Line(g, m)
  line.frustumCulled = false
  return line
}

function useDispose(obj: THREE.Line | THREE.LineLoop | THREE.Points) {
  useEffect(
    () => () => {
      obj.geometry.dispose()
      ;(obj.material as THREE.Material).dispose()
    },
    [obj],
  )
}

/**
 * Recalcula cuando pasa REFRESH_MS de tiempo simulado, cambia el marco o se salta en el tiempo.
 * A velocidades altas, como mucho 4 veces por segundo real: con ×600 el umbral simulado se
 * cumpliría en cada fotograma y cada recálculo son cientos de propagaciones SGP4.
 */
function useRefresh(clock: SimClock, deps: unknown[]) {
  const last = useRef({ time: -Infinity, real: -Infinity, epoch: -1, deps: [] as unknown[] })
  return () => {
    const now = clock.now()
    const real = performance.now()
    const l = last.current
    const forced = deps.some((d, i) => d !== l.deps[i]) || l.epoch !== clock.epoch
    if (!forced && (Math.abs(now - l.time) < REFRESH_MS || real - l.real < REFRESH_REAL_MS)) return null
    last.current = { time: now, real, epoch: clock.epoch, deps }
    return now
  }
}

const tmp = [0, 0, 0]

/** Posición en la escena de un satélite en el instante t (ECI o ECEF según el marco) */
function scenePos(record: SatRecord, t: number, mode: FrameMode, out: Float32Array | number[], o: number) {
  const pv = propagateRecord(record, t)
  if (!pv) return false
  eciToScene(pv.position.x, pv.position.y, pv.position.z, tmp)
  const v = { x: tmp[0], y: tmp[1], z: tmp[2] }
  if (mode === 'ECEF') rotateY(v, frameAngles(t, 'ECEF').inertial)
  out[o] = v.x
  out[o + 1] = v.y
  out[o + 2] = v.z
  return true
}

function fill(line: THREE.Line, record: SatRecord, mode: FrameMode, t0: number, t1: number, now: number, period: number, project: number | null) {
  const pos = line.geometry.getAttribute('position') as THREE.BufferAttribute
  const tt = line.geometry.getAttribute('aT') as THREE.BufferAttribute
  const arr = pos.array as Float32Array
  const n = pos.count
  let last = -1
  for (let i = 0; i < n; i++) {
    const t = t0 + ((t1 - t0) * i) / (n - 1)
    tt.setX(i, (t - now) / period)
    if (scenePos(record, t, mode, arr, i * 3)) {
      if (project !== null) {
        const len = Math.hypot(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2])
        for (let k = 0; k < 3; k++) arr[i * 3 + k] *= project / len
      }
      last = i
    } else if (last >= 0) arr.copyWithin(i * 3, last * 3, last * 3 + 3)
  }
  pos.needsUpdate = true
  tt.needsUpdate = true
}

interface Common {
  record: SatRecord
  clock: SimClock
  color: string
}

export function OrbitPath({ record, clock, color, mode }: Common & { mode: FrameMode }) {
  const line = useMemo(() => makeLine(512, color, 1), [color])
  useDispose(line)
  const due = useRefresh(clock, [record, mode])
  const periodMs = (1440 / Number(record.MEAN_MOTION)) * 60_000
  useFrame(() => {
    const now = due()
    if (now !== null) fill(line, record, mode, now, now + periodMs, now, periodMs, null)
  })
  return <primitive object={line} renderOrder={3} />
}

/** Dentro del grupo de la Tierra: coordenadas ECEF de escena */
export function GroundTrack({ record, clock, color }: Common) {
  const line = useMemo(() => makeLine(720, color, 1.5, 0.9), [color])
  useDispose(line)
  const due = useRefresh(clock, [record])
  const periodMs = (1440 / Number(record.MEAN_MOTION)) * 60_000
  useFrame(() => {
    const now = due()
    if (now !== null) fill(line, record, 'ECEF', now - periodMs / 2, now + periodMs * 1.5, now, periodMs, 1.0025)
  })
  return <primitive object={line} renderOrder={6} />
}

/** Dentro del grupo de la Tierra: huella de cobertura y vertical del satélite */
export function Footprint({ index, stream, clock, color }: { index: number; stream: PositionStream; clock: SimClock; color: string }) {
  const SEG = 128
  const { loop, nadir } = useMemo(() => {
    const c = new THREE.Color(color)
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(SEG * 3), 3))
    const loop = new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.75, depthWrite: false }))
    const g2 = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
    const nadir = new THREE.Line(g2, new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.45, depthWrite: false }))
    loop.frustumCulled = nadir.frustumCulled = false
    return { loop, nadir }
  }, [color])
  useDispose(loop)
  useDispose(nadir)

  const p = useMemo(() => new Float32Array(3), [])
  useFrame(() => {
    const ok = stream.positionOf(index, p)
    loop.visible = nadir.visible = ok
    if (!ok) return
    // De inercial (escena ECI) a ECEF de escena
    const v = rotateY({ x: p[0], y: p[1], z: p[2] }, frameAngles(clock.now(), 'ECEF').inertial)
    const r = Math.hypot(v.x, v.y, v.z)
    const c = new THREE.Vector3(v.x, v.y, v.z).divideScalar(r)
    const lambda = Math.acos(Math.min(1, 1 / r))
    const u = new THREE.Vector3(0, 1, 0).cross(c)
    if (u.lengthSq() < 1e-8) u.set(1, 0, 0)
    u.normalize()
    const w = c.clone().cross(u)
    const arr = loop.geometry.getAttribute('position').array as Float32Array
    const R = 1.0025
    for (let i = 0; i < SEG; i++) {
      const phi = (i / SEG) * Math.PI * 2
      const cl = Math.cos(lambda)
      const sl = Math.sin(lambda)
      arr[i * 3] = (c.x * cl + (u.x * Math.cos(phi) + w.x * Math.sin(phi)) * sl) * R
      arr[i * 3 + 1] = (c.y * cl + (u.y * Math.cos(phi) + w.y * Math.sin(phi)) * sl) * R
      arr[i * 3 + 2] = (c.z * cl + (u.z * Math.cos(phi) + w.z * Math.sin(phi)) * sl) * R
    }
    loop.geometry.getAttribute('position').needsUpdate = true
    const n = nadir.geometry.getAttribute('position').array as Float32Array
    n.set([v.x, v.y, v.z, c.x * R, c.y * R, c.z * R])
    nadir.geometry.getAttribute('position').needsUpdate = true
  })
  return (
    <>
      <primitive object={loop} renderOrder={6} />
      <primitive object={nadir} renderOrder={6} />
    </>
  )
}

const ringVertex = /* glsl */ `
  uniform float uSize;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize;
  }
`
const ringFragment = /* glsl */ `
  uniform vec3 uColor;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    float ring = smoothstep(0.66, 0.74, d) * (1.0 - smoothstep(0.86, 0.94, d));
    // Retícula: cuatro marcas hacia dentro
    float tick = step(abs(c.x), 0.035) * step(0.3, abs(c.y)) * step(abs(c.y), 0.46)
               + step(abs(c.y), 0.035) * step(0.3, abs(c.x)) * step(abs(c.x), 0.46);
    float a = max(ring, tick);
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }
`

/** Dentro del grupo inercial */
export function SatMarker({ index, stream, color }: { index: number; stream: PositionStream; color: string }) {
  const dpr = useThree((s) => s.viewport.dpr)
  const marker = useMemo(() => {
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3))
    const m = new THREE.ShaderMaterial({
      vertexShader: ringVertex,
      fragmentShader: ringFragment,
      uniforms: { uColor: { value: new THREE.Color(color).convertSRGBToLinear() }, uSize: { value: 30 } },
      transparent: true,
      depthWrite: false,
    })
    const p = new THREE.Points(g, m)
    p.frustumCulled = false
    p.renderOrder = 7
    return p
  }, [color])
  useDispose(marker)
  useEffect(() => {
    ;(marker.material as THREE.ShaderMaterial).uniforms.uSize.value = 30 * dpr
  }, [dpr, marker])
  useFrame(() => {
    const attr = marker.geometry.getAttribute('position') as THREE.BufferAttribute
    marker.visible = stream.positionOf(index, attr.array as Float32Array)
    attr.needsUpdate = true
  })
  return <primitive object={marker} />
}
