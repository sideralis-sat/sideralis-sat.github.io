import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { CONSTELLATIONS } from '../data/constellations'
import type { SatRecord } from '../data/types'
import type { SimClock } from '../lib/clock'
import type { PositionStream } from '../lib/positionStream'

/** Tamaño relativo del punto según la constelación */
const SIZE_BY_GROUP: Record<string, number> = {
  stations: 2.6,
  starlink: 0.85,
  kuiper: 0.95,
  qianfan: 0.95,
  oneweb: 1.0,
  gps: 1.5,
  galileo: 1.5,
  glonass: 1.5,
  beidou: 1.5,
  geo: 1.3,
}

const vertexShader = /* glsl */ `
  attribute vec3 aNext;
  attribute vec3 color;
  attribute float aSize;
  attribute float aValid;
  attribute float aShow;
  uniform float uAlpha;
  uniform float uScale;
  uniform float uBoost;
  uniform float uHalo;
  varying vec3 vColor;

  void main() {
    // Ocultos: fuera de la pantalla. Poner el tamaño a 0 no basta, porque en Windows
    // (Direct3D vía ANGLE) un punto de tamaño 0 se sigue dibujando como un píxel.
    if (aShow * aValid < 0.5) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
    vec3 p = mix(position, aNext, uAlpha);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float atten = clamp(5.0 / -mv.z, 0.65, 2.2);
    // Con halo el punto crece para dejar sitio al anillo exterior
    gl_PointSize = aSize * uScale * atten * uBoost * (1.0 + 0.9 * uHalo);
    vColor = color;
  }
`

/**
 * Núcleo brillante y, cuando hay pocos objetos a la vista (uHalo = 1), un anillo fino a su
 * alrededor: así un satélite aislado no se confunde con una estrella del fondo.
 */
const fragmentShader = /* glsl */ `
  uniform float uHalo;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float r = mix(0.5, 0.27, uHalo);
    float core = smoothstep(r, r * 0.24, d);
    float ring = uHalo * smoothstep(0.36, 0.40, d) * (1.0 - smoothstep(0.45, 0.5, d)) * 0.85;
    float a = max(core, ring);
    vec3 col = vColor * (0.8 + 0.6 * smoothstep(r * 0.5, 0.0, d));
    gl_FragColor = vec4(mix(vColor, col, step(ring, core)), a);
    #include <colorspace_fragment>
  }
`

interface Props {
  satellites: SatRecord[]
  groupIndex: Uint8Array
  show: Uint8Array
  /** Objetos visibles tras los filtros: con pocos, los puntos se agrandan */
  shown: number
  stream: PositionStream
  clock: SimClock
}

export function Satellites({ satellites, groupIndex, show, shown, stream, clock }: Props) {
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const uploaded = useRef<{ a: unknown; b: unknown }>({ a: null, b: null })

  const { geometry, material } = useMemo(() => {
    const n = satellites.length
    const g = new THREE.BufferGeometry()
    const colors = new Float32Array(n * 3)
    const sizes = new Float32Array(n)
    const c = new THREE.Color()

    satellites.forEach((s, i) => {
      c.set(CONSTELLATIONS[groupIndex[i]].color).convertSRGBToLinear()
      colors.set([c.r, c.g, c.b], i * 3)
      sizes[i] = SIZE_BY_GROUP[s.GROUP] ?? 1.1
    })

    const dyn = (count: number, itemSize: number) =>
      new THREE.BufferAttribute(new Float32Array(count * itemSize), itemSize).setUsage(THREE.DynamicDrawUsage)
    g.setAttribute('position', dyn(n, 3))
    g.setAttribute('aNext', dyn(n, 3))
    g.setAttribute('aValid', dyn(n, 1))
    g.setAttribute('aShow', dyn(n, 1))
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50)

    const m = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      uniforms: { uAlpha: { value: 0 }, uScale: { value: 3 }, uBoost: { value: 1 }, uHalo: { value: 0 } },
    })
    return { geometry: g, material: m }
  }, [satellites, groupIndex])

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  // Filtros: un valor por satélite, calculado en App
  useEffect(() => {
    const attr = geometry.getAttribute('aShow') as THREE.BufferAttribute
    const arr = attr.array as Float32Array
    for (let i = 0; i < arr.length; i++) arr[i] = show[i]
    attr.needsUpdate = true
  }, [show, geometry])

  // Con miles de objetos el punto pequeño evita una mancha; con unas decenas (p. ej. solo GPS)
  // se agranda hasta 3,2 veces y lleva un anillo, para que no se confundan con estrellas
  useEffect(() => {
    material.uniforms.uBoost.value = Math.min(3.2, Math.max(1, Math.pow(3000 / Math.max(shown, 1), 0.4)))
    material.uniforms.uHalo.value = shown <= 150 ? 1 : shown <= 600 ? (600 - shown) / 450 : 0
  }, [shown, material])

  useEffect(() => {
    material.uniforms.uScale.value = 2.6 * dpr * Math.min(1.25, Math.max(0.8, size.height / 900))
  }, [size.height, dpr, material])

  useFrame(() => {
    const { a, b, alpha } = stream.tick(clock)
    // Se suben al GPU solo cuando cambia el tramo (la vista del cielo también muestrea el flujo)
    if (a && b && (a !== uploaded.current.a || b !== uploaded.current.b)) {
      uploaded.current = { a, b }
      const pos = geometry.getAttribute('position') as THREE.BufferAttribute
      const next = geometry.getAttribute('aNext') as THREE.BufferAttribute
      const valid = geometry.getAttribute('aValid') as THREE.BufferAttribute
      ;(pos.array as Float32Array).set(a.positions)
      ;(next.array as Float32Array).set(b.positions)
      const v = valid.array as Float32Array
      for (let i = 0; i < v.length; i++) v[i] = a.valid[i] & b.valid[i]
      pos.needsUpdate = next.needsUpdate = valid.needsUpdate = true
    }
    material.uniforms.uAlpha.value = alpha
  })

  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={2} />
}
