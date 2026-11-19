import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { geoToSceneDir } from '../lib/coords'
import type { SimClock } from '../lib/clock'
import { frameAngles, rotateY, type FrameMode } from '../lib/frame'
import { viewState } from '../lib/viewState'
import { EARTH_RADIUS_KM } from '../lib/coords'

/**
 * Controles de cámara al estilo de Google Earth
 * ---------------------------------------------
 * La cámara se describe como en los visores geoespaciales (Cesium, Google Earth):
 *   T      punto de la superficie al que se mira (vector unitario, marco de la escena)
 *   up     dirección «arriba» de la pantalla en T (tangente a la esfera)
 *   range  distancia de la cámara a T, en radios terrestres
 *   tilt   inclinación respecto a la vertical de T (0 = mirando hacia abajo)
 *
 * Arrastrar con el botón izquierdo «agarra» el punto de la superficie que hay bajo el
 * cursor y lo mantiene ahí: se calcula la rotación que lleva el punto que ahora está
 * bajo el cursor al punto agarrado y se aplica a toda la cámara. Funciona igual sobre
 * los polos, sin bloqueos, y al soltar conserva la inercia.
 */

export type CameraRequest =
  | { kind: 'fly'; target: [number, number, number]; range: number; key: number }
  | { kind: 'zoom'; factor: number; key: number }
  | { kind: 'home'; key: number }
  | { kind: 'north'; key: number }
  | { kind: 'tilt'; key: number }

const MIN_RANGE = 0.003 // ~19 km
const MAX_RANGE = 60
const HOME_RANGE = 3.6
const INTRO_RANGE = 12
const MAX_TILT = THREE.MathUtils.degToRad(80)
const MIN_CAMERA_ALT = 0.0015
/**
 * Con el dedo, la Tierra gira solo esta fracción de lo que se arrastra: con el ratón se
 * «agarra» el suelo y va pegado al cursor, pero en una pantalla pequeña eso resulta brusco.
 */
const TOUCH_GAIN = 0.55
/** Y la inercia al soltar, esta fracción de la del ratón */
const TOUCH_INERTIA = 0.45
const WORLD_NORTH = new THREE.Vector3(0, 1, 0)

interface CamState {
  T: THREE.Vector3
  up: THREE.Vector3
  range: number
  tilt: number
}

interface Anim {
  start: number
  duration: number
  from: CamState
  to: CamState
  /** Rotación que lleva from.T a to.T (para interpolar sin pasar por el centro de la Tierra) */
  q: THREE.Quaternion
}

const clone = (s: CamState): CamState => ({ T: s.T.clone(), up: s.up.clone(), range: s.range, tilt: s.tilt })

/** Componente tangente de v en T, normalizada (con un respaldo si v es paralelo a T) */
function tangent(v: THREE.Vector3, T: THREE.Vector3) {
  const t = v.clone().addScaledVector(T, -v.dot(T))
  if (t.lengthSq() < 1e-10) {
    const alt = Math.abs(T.y) < 0.9 ? WORLD_NORTH : new THREE.Vector3(1, 0, 0)
    t.copy(alt).addScaledVector(T, -alt.dot(T))
  }
  return t.normalize()
}

/** Norte local en T según el eje de la Tierra (el eje Y en ambos marcos) */
const localNorth = (T: THREE.Vector3) => tangent(WORLD_NORTH, T)

function headingOf(s: CamState) {
  const north = localNorth(s.T)
  const east = north.clone().cross(s.T)
  return Math.atan2(s.up.dot(east), s.up.dot(north))
}

/** Distancia inicial: en pantallas verticales, lo bastante lejos para que quepa la Tierra */
function homeRange(camera: THREE.PerspectiveCamera) {
  const halfW = Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect)
  return Math.max(HOME_RANGE, 1.25 / Math.sin(halfW) - 1)
}

function homeTarget(ms: number, mode: FrameMode) {
  // Tu zona del mundo: la longitud se estima con la zona horaria del navegador
  const lon = THREE.MathUtils.clamp((-new Date().getTimezoneOffset() / 60) * 15, -180, 180)
  return new THREE.Vector3(...geoToSceneDir(38, lon, frameAngles(ms, mode).earth))
}

interface Props {
  clock: SimClock
  mode: FrameMode
  request: CameraRequest | null
  /** Posición del satélite a seguir (marco de la escena), o null */
  follow: (() => THREE.Vector3 | null) | null
  onStopFollow: () => void
}

export function GlobeControls({ clock, mode, request, follow, onStopFollow }: Props) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const gl = useThree((s) => s.gl)
  const reduce = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])

  const st = useMemo<CamState>(() => {
    const T = homeTarget(clock.now(), mode)
    return { T, up: localNorth(T), range: reduce ? HOME_RANGE : INTRO_RANGE, tilt: 0 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const anim = useRef<Anim | null>(null)
  const inertia = useRef<{ axis: THREE.Vector3; rate: number } | null>(null)
  const latest = useRef({ follow, onStopFollow, mode })
  latest.current = { follow, onStopFollow, mode }

  // ——— Geometría ———

  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const sphere = useMemo(() => new THREE.Sphere(new THREE.Vector3(), 1), [])

  function applyCamera() {
    const { T, up, range, tilt } = st
    const off = T.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(up, -Math.sin(tilt))
    camera.position.copy(T).addScaledVector(off, range)
    camera.up.copy(up).multiplyScalar(Math.cos(tilt)).addScaledVector(T, Math.sin(tilt))
    camera.lookAt(T)
    const alt = camera.position.length() - 1
    const near = THREE.MathUtils.clamp(alt * 0.4, 0.0004, 0.05)
    if (Math.abs(camera.near - near) / near > 0.05) {
      camera.near = near
      camera.updateProjectionMatrix()
    }
    camera.updateMatrixWorld()
  }

  /** Punto de la esfera unidad bajo unas coordenadas de pantalla (o null) */
  function hit(clientX: number, clientY: number, out = new THREE.Vector3()) {
    const r = gl.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    return raycaster.ray.intersectSphere(sphere, out) ? out.normalize() : null
  }

  /** Gira la cámara alrededor del centro de la Tierra con el cuaternión q */
  function rotateRig(q: THREE.Quaternion) {
    st.T.applyQuaternion(q).normalize()
    st.up.applyQuaternion(q)
    st.up.copy(tangent(st.up, st.T))
  }

  /** Lleva el punto de superficie que ahora está bajo el cursor al punto `grabbed` */
  function regrab(clientX: number, clientY: number, grabbed: THREE.Vector3) {
    applyCamera()
    const now = hit(clientX, clientY)
    if (!now) return null
    const q = new THREE.Quaternion().setFromUnitVectors(now, grabbed)
    rotateRig(q)
    return q
  }

  function setRange(range: number) {
    st.range = THREE.MathUtils.clamp(range, MIN_RANGE, MAX_RANGE)
    // Con poca distancia la inclinación máxima baja para no meter la cámara bajo el suelo
    clampTilt()
  }

  function clampTilt() {
    st.tilt = THREE.MathUtils.clamp(st.tilt, 0, MAX_TILT)
    for (let k = 0; k < 20; k++) {
      const off = st.T.clone().multiplyScalar(Math.cos(st.tilt)).addScaledVector(st.up, -Math.sin(st.tilt))
      const alt = st.T.clone().addScaledVector(off, st.range).length() - 1
      if (alt >= MIN_CAMERA_ALT || st.tilt <= 0) break
      st.tilt = Math.max(0, st.tilt - 0.05)
    }
  }

  function stopMotion() {
    anim.current = null
    inertia.current = null
    if (latest.current.follow) latest.current.onStopFollow()
  }

  function animateTo(to: CamState, duration: number) {
    inertia.current = null
    if (reduce) {
      Object.assign(st, clone(to))
      anim.current = null
      return
    }
    const q = new THREE.Quaternion().setFromUnitVectors(st.T, to.T)
    anim.current = { start: performance.now(), duration, from: clone(st), to, q }
  }

  const earthAngle = () => frameAngles(clock.now(), latest.current.mode).earth

  // ——— Entrada inicial ———
  useEffect(() => {
    applyCamera()
    if (!reduce) animateTo({ ...clone(st), range: homeRange(camera) }, 2600)
    else st.range = homeRange(camera)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ——— Cambio de marco: girar la cámara con la Tierra para que el suelo no salte ———
  const lastMode = useRef(mode)
  useEffect(() => {
    if (lastMode.current === mode) return
    const now = clock.now()
    const delta = frameAngles(now, mode).earth - frameAngles(now, lastMode.current).earth
    lastMode.current = mode
    rotateY(st.T, delta)
    rotateY(st.up, delta)
    if (anim.current) {
      rotateY(anim.current.to.T, delta)
      rotateY(anim.current.to.up, delta)
      anim.current = null
    }
    inertia.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // ——— Peticiones de la interfaz ———
  useEffect(() => {
    if (!request) return
    if (request.kind === 'fly') {
      const T = new THREE.Vector3(...request.target).normalize()
      // Conserva el rumbo actual al llegar
      const h = headingOf(st)
      const north = localNorth(T)
      const east = north.clone().cross(T)
      const up = north.multiplyScalar(Math.cos(h)).addScaledVector(east, Math.sin(h)).normalize()
      animateTo({ T, up, range: THREE.MathUtils.clamp(request.range, MIN_RANGE, MAX_RANGE), tilt: 0 }, 1300)
    }
    if (request.kind === 'zoom') {
      const to = clone(st)
      to.range = THREE.MathUtils.clamp(st.range * request.factor, MIN_RANGE, MAX_RANGE)
      animateTo(to, 380)
    }
    if (request.kind === 'home') {
      const T = homeTarget(clock.now(), latest.current.mode)
      animateTo({ T, up: localNorth(T), range: homeRange(camera), tilt: 0 }, 1500)
    }
    if (request.kind === 'north') animateTo({ ...clone(st), up: localNorth(st.T), tilt: 0 }, 700)
    if (request.kind === 'tilt') animateTo({ ...clone(st), tilt: st.tilt > 0.1 ? 0 : THREE.MathUtils.degToRad(60) }, 700)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])

  // ——— Ratón, rueda, táctil y teclado ———
  useEffect(() => {
    const el = gl.domElement
    const pointers = new Map<number, { x: number; y: number }>()
    let mode: 'none' | 'grab' | 'spin' | 'look' | 'touch2' = 'none'
    let grabbedLocal: THREE.Vector3 | null = null
    let last = { x: 0, y: 0, t: 0 }
    let lastQ: { q: THREE.Quaternion; dt: number } | null = null
    let pinch = { dist: 0, angle: 0, midY: 0 }

    // El punto agarrado se guarda en coordenadas de la Tierra: si la Tierra gira (ECI o
    // tiempo acelerado), el punto sigue siendo el mismo lugar del suelo.
    const toLocal = (v: THREE.Vector3) => rotateY(v.clone(), -earthAngle())
    const toWorld = (v: THREE.Vector3) => rotateY(v.clone(), earthAngle())

    const startGrab = (x: number, y: number) => {
      applyCamera()
      const p = hit(x, y)
      grabbedLocal = p ? toLocal(p) : null
      mode = p ? 'grab' : 'spin'
    }

    let downAt = { x: 0, y: 0 }
    let touch = false
    const onDown = (e: PointerEvent) => {
      downAt = { x: e.clientX, y: e.clientY }
      touch = e.pointerType === 'touch'
      el.setPointerCapture(e.pointerId)
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      stopMotion()
      last = { x: e.clientX, y: e.clientY, t: performance.now() }
      lastQ = null
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        mode = 'touch2'
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), angle: Math.atan2(b.y - a.y, b.x - a.x), midY: (a.y + b.y) / 2 }
        return
      }
      if (e.button === 2 || e.shiftKey || e.ctrlKey) mode = 'look'
      else startGrab(e.clientX, e.clientY)
    }

    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) {
        readCursor(e)
        return
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const now = performance.now()
      const dx = e.clientX - last.x
      const dy = e.clientY - last.y
      const dt = Math.max(1, now - last.t)

      if (mode === 'grab' && grabbedLocal && touch) {
        // Dedo: giro incremental entre la posición anterior y la actual, atenuado
        applyCamera()
        const from = hit(last.x, last.y)
        const to = hit(e.clientX, e.clientY)
        if (from && to) {
          const q = new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(to, from), TOUCH_GAIN)
          rotateRig(q)
          lastQ = { q, dt }
        } else mode = 'spin'
      } else if (mode === 'grab' && grabbedLocal) {
        const q = regrab(e.clientX, e.clientY, toWorld(grabbedLocal))
        if (q) lastQ = { q, dt }
        else mode = 'spin' // el cursor ha salido del globo
      } else if (mode === 'spin') {
        // Fuera del globo: giro proporcional al desplazamiento
        const k = ((0.0035 * Math.min(st.range + 0.3, 4)) / 4) * (touch ? TOUCH_GAIN : 1)
        const right = new THREE.Vector3().crossVectors(st.up, st.T).normalize()
        const q = new THREE.Quaternion()
          .setFromAxisAngle(st.up, -dx * k)
          .multiply(new THREE.Quaternion().setFromAxisAngle(right, dy * k))
        rotateRig(q)
        lastQ = { q, dt }
      } else if (mode === 'look') {
        // Horizontal: rumbo; vertical: inclinación
        st.up.applyAxisAngle(st.T, dx * 0.006)
        st.up.copy(tangent(st.up, st.T))
        st.tilt -= dy * 0.005
        clampTilt()
      } else if (mode === 'touch2' && pointers.size >= 2) {
        const [a, b] = [...pointers.values()]
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        const angle = Math.atan2(b.y - a.y, b.x - a.x)
        const midY = (a.y + b.y) / 2
        if (pinch.dist > 0) setRange(st.range * (pinch.dist / dist))
        st.up.applyAxisAngle(st.T, angle - pinch.angle)
        st.up.copy(tangent(st.up, st.T))
        st.tilt -= (midY - pinch.midY) * 0.006
        clampTilt()
        pinch = { dist, angle, midY }
      }
      last = { x: e.clientX, y: e.clientY, t: now }
      readCursor(e)
    }

    /** Coordenadas geográficas bajo el cursor, para la barra inferior */
    const readCursor = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      applyCamera()
      const p = hit(e.clientX, e.clientY)
      if (!p) {
        viewState.cursor = null
        return
      }
      const l = toLocal(p)
      viewState.cursor = {
        lat: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(l.y, -1, 1))),
        lon: THREE.MathUtils.radToDeg(Math.atan2(-l.z, l.x)),
      }
    }

    const onUp = (e: PointerEvent) => {
      // Clic sin arrastrar: se guarda el punto del suelo (sirve para colocar la estación)
      if (pointers.size === 1 && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6) {
        applyCamera()
        const p = hit(e.clientX, e.clientY)
        if (p) {
          const l = toLocal(p)
          viewState.lastClick = {
            lat: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(l.y, -1, 1))),
            lon: THREE.MathUtils.radToDeg(Math.atan2(-l.z, l.x)),
            at: performance.now(),
          }
        }
      }
      pointers.delete(e.pointerId)
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
      if (pointers.size === 1 && mode === 'touch2') {
        const [p] = [...pointers.values()]
        startGrab(p.x, p.y)
        last = { x: p.x, y: p.y, t: performance.now() }
        return
      }
      if (pointers.size > 0) return
      // Inercia si se soltó en movimiento
      if ((mode === 'grab' || mode === 'spin') && lastQ && performance.now() - last.t < 60 && !reduce) {
        const angle = 2 * Math.acos(THREE.MathUtils.clamp(lastQ.q.w, -1, 1))
        if (angle > 1e-4) {
          const s = Math.sqrt(1 - lastQ.q.w * lastQ.q.w) || 1
          inertia.current = { axis: new THREE.Vector3(lastQ.q.x / s, lastQ.q.y / s, lastQ.q.z / s), rate: (angle / lastQ.dt) * (touch ? TOUCH_INERTIA : 1) }
        }
      }
      mode = 'none'
      grabbedLocal = null
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      stopMotion()
      const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY
      const factor = Math.exp(THREE.MathUtils.clamp(delta, -300, 300) * 0.0018)
      applyCamera()
      const p = hit(e.clientX, e.clientY)
      setRange(st.range * factor)
      // Acercarse hacia el cursor: el punto bajo el ratón se queda bajo el ratón
      if (p && factor < 1) regrab(e.clientX, e.clientY, p)
    }

    const onDouble = (e: MouseEvent) => {
      applyCamera()
      const p = hit(e.clientX, e.clientY)
      if (!p) return
      const to = clone(st)
      const q = new THREE.Quaternion().setFromUnitVectors(st.T, p)
      to.T = p.clone()
      to.up = tangent(st.up.clone().applyQuaternion(q), p)
      to.range = THREE.MathUtils.clamp(st.range * 0.4, MIN_RANGE, MAX_RANGE)
      animateTo(to, 700)
    }

    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      const step = 0.02 * Math.min(st.range + 0.2, 3)
      const right = new THREE.Vector3().crossVectors(st.up, st.T).normalize()
      const rot = (axis: THREE.Vector3, a: number) => {
        stopMotion()
        rotateRig(new THREE.Quaternion().setFromAxisAngle(axis, a))
      }
      if (e.key === 'ArrowLeft') rot(st.up, -step)
      else if (e.key === 'ArrowRight') rot(st.up, step)
      else if (e.key === 'ArrowUp') rot(right, -step)
      else if (e.key === 'ArrowDown') rot(right, step)
      else if (e.key === '+' || e.key === '=') setRange(st.range * 0.8)
      else if (e.key === '-') setRange(st.range * 1.25)
      else if (e.key === 'n' || e.key === 'N') animateTo({ ...clone(st), up: localNorth(st.T), tilt: 0 }, 700)
      else return
      e.preventDefault()
    }

    const onLeave = () => (viewState.cursor = null)
    const noMenu = (e: Event) => e.preventDefault()

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('pointerleave', onLeave)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('dblclick', onDouble)
    el.addEventListener('contextmenu', noMenu)
    window.addEventListener('keydown', onKey)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('pointerleave', onLeave)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('dblclick', onDouble)
      el.removeEventListener('contextmenu', noMenu)
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, camera])

  // ——— Cada fotograma ———
  useFrame((_, dtSec) => {
    const dt = Math.min(dtSec, 0.1) * 1000

    const a = anim.current
    if (a) {
      const t = Math.min(1, (performance.now() - a.start) / a.duration)
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
      const qt = new THREE.Quaternion().slerp(a.q, e)
      st.T.copy(a.from.T).applyQuaternion(qt).normalize()
      const carried = a.from.up.clone().applyQuaternion(qt)
      st.up.copy(tangent(carried.lerp(tangent(a.to.up, st.T), e), st.T))
      // Distancia interpolada en escala logarítmica: los saltos grandes se ven naturales
      st.range = Math.exp(Math.log(a.from.range) + (Math.log(a.to.range) - Math.log(a.from.range)) * e)
      st.tilt = a.from.tilt + (a.to.tilt - a.from.tilt) * e
      if (t >= 1) anim.current = null
    } else if (inertia.current) {
      const it = inertia.current
      rotateRig(new THREE.Quaternion().setFromAxisAngle(it.axis, it.rate * dt))
      it.rate *= Math.exp(-dt / 320)
      if (it.rate < 1e-6) inertia.current = null
    }

    // Seguir a un satélite: la cámara se coloca sobre él (en su vertical)
    const f = latest.current.follow?.()
    if (f && !a) {
      const r = f.length()
      const h = headingOf(st)
      st.T.copy(f).divideScalar(r)
      const north = localNorth(st.T)
      const east = north.clone().cross(st.T)
      st.up.copy(north.multiplyScalar(Math.cos(h)).addScaledVector(east, Math.sin(h)).normalize())
      st.range = Math.max(st.range, r - 1 + 0.35)
    }

    applyCamera()

    // Estado para la barra inferior
    const local = rotateY(st.T.clone(), -earthAngle())
    viewState.target = {
      lat: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(local.y, -1, 1))),
      lon: THREE.MathUtils.radToDeg(Math.atan2(-local.z, local.x)),
    }
    viewState.altitudeKm = (camera.position.length() - 1) * EARTH_RADIUS_KM
    viewState.headingDeg = (THREE.MathUtils.radToDeg(headingOf(st)) + 360) % 360
    viewState.tiltDeg = THREE.MathUtils.radToDeg(st.tilt)
  })

  return null
}
