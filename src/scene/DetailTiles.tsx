import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { DAY_TILE_URL, fillTemplate, NIGHT_TILE_MAX_ZOOM, NIGHT_TILE_URLS, TILE_MAX_ZOOM } from '../lib/imagery'
import { geoToLocal, surfaceFragment, surfaceVertex } from './earthShaders'

/**
 * Imagen de satélite por teselas (como un mapa web) que solo aparece al acercarse.
 *
 * El globo base tiene una textura de 4096 px de ancho, equivalente al nivel de zoom 4 de un
 * mapa web. Cuando la cámara se acerca y haría falta más detalle, se calcula un árbol de
 * teselas: muy finas bajo la cámara y más gruesas hacia el horizonte. Cada tesela es un
 * trozo curvo de esfera con su propia imagen de día y, si está disponible, de noche.
 * Mientras una tesela carga se dibuja su antecesora ya cargada, o el globo base.
 */

const MIN_TILE_ZOOM = 5 // por debajo, el globo base ya tiene la misma resolución
const MAX_ALTITUDE = 2.2 // en radios terrestres; más lejos no hacen falta teselas
const MAX_VISIBLE = 160
const MAX_CACHE = 320
const MAX_CONCURRENT = 6
const UPDATE_MS = 120

type LoadState = 'idle' | 'loading' | 'ready' | 'failed'

interface Tile {
  key: string
  z: number
  x: number
  y: number
  state: LoadState
  mesh?: THREE.Mesh
  material?: THREE.ShaderMaterial
  texture?: THREE.Texture
  nightKey?: string
  lastUsed: number
  readyAt: number
}

interface NightTile {
  state: LoadState
  texture?: THREE.Texture
  lastUsed: number
}

const keyOf = (z: number, x: number, y: number) => `${z}/${x}/${y}`
const mercLat = (y: number, n: number) => Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)))
const clampAcos = (v: number) => Math.acos(Math.max(-1, Math.min(1, v)))

function tileGeometry(z: number, x: number, y: number) {
  const seg = Math.max(4, 32 >> Math.max(0, z - MIN_TILE_ZOOM))
  const n = 2 ** z
  const count = (seg + 1) ** 2
  const pos = new Float32Array(count * 3)
  const uv = new Float32Array(count * 2)
  const geoUv = new Float32Array(count * 2)
  let k = 0
  for (let j = 0; j <= seg; j++) {
    const fy = j / seg
    const lat = mercLat(y + fy, n)
    for (let i = 0; i <= seg; i++) {
      const fx = i / seg
      const lon = ((x + fx) / n) * 2 * Math.PI - Math.PI
      geoToLocal(lat, lon, pos, k * 3)
      uv[k * 2] = fx
      uv[k * 2 + 1] = 1 - fy
      geoUv[k * 2] = (lon + Math.PI) / (2 * Math.PI)
      geoUv[k * 2 + 1] = (lat + Math.PI / 2) / Math.PI
      k++
    }
  }
  const idx: number[] = []
  const row = seg + 1
  for (let j = 0; j < seg; j++)
    for (let i = 0; i < seg; i++) {
      const a = j * row + i
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.setAttribute('aGeoUv', new THREE.BufferAttribute(geoUv, 2))
  g.setIndex(idx)
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.01)
  return g
}

interface Props {
  night: THREE.Texture
  spec: THREE.Texture
  sunDir: THREE.Vector3
}

export function DetailTiles({ night, spec, sunDir }: Props) {
  const root = useRef<THREE.Group>(null!)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const gl = useThree((s) => s.gl)

  const st = useMemo(
    () => ({
      tiles: new Map<string, Tile>(),
      nights: new Map<string, NightTile>(),
      queue: [] as { run: () => void; prio: number }[],
      loading: 0,
      lastUpdate: 0,
      lastCam: new THREE.Vector3(Infinity, 0, 0),
      loader: new THREE.TextureLoader().setCrossOrigin('anonymous'),
      shared: { uNight: { value: night }, uSpec: { value: spec }, uSunDir: { value: sunDir } },
      dirty: true,
      /** Proveedor de luces nocturnas en uso (índice en NIGHT_TILE_URLS) y si ya ha funcionado alguna vez */
      nightProvider: 0,
      nightWorks: false,
      /** Dirección de la cámara en el marco terrestre y cuándo se midió, para saber si el suelo pasa rápido */
      lastDir: new THREE.Vector3(),
      lastDirAt: 0,
    }),
    [night, spec, sunDir],
  )

  useEffect(
    () => () => {
      for (const t of st.tiles.values()) disposeTile(t)
      for (const n of st.nights.values()) n.texture?.dispose()
      st.tiles.clear()
      st.nights.clear()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [st],
  )

  function disposeTile(t: Tile) {
    if (t.mesh) root.current?.remove(t.mesh)
    t.mesh?.geometry.dispose()
    t.material?.dispose()
    t.texture?.dispose()
  }

  function configure(t: THREE.Texture) {
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = gl.capabilities.getMaxAnisotropy()
  }

  function pump() {
    st.queue.sort((a, b) => a.prio - b.prio)
    while (st.loading < MAX_CONCURRENT && st.queue.length) st.queue.shift()!.run()
  }

  function load(url: string, onLoad: (t: THREE.Texture) => void, onError: () => void) {
    st.loading++
    st.loader.load(
      url,
      (t) => {
        st.loading--
        configure(t)
        onLoad(t)
        pump()
      },
      undefined,
      () => {
        st.loading--
        onError()
        pump()
      },
    )
  }

  function requestDay(t: Tile, prio: number) {
    if (t.state !== 'idle') return
    st.queue.push({
      prio,
      run: () => {
        if (t.state !== 'idle') return
        t.state = 'loading'
        load(
          fillTemplate(DAY_TILE_URL, t.z, t.x, t.y),
          (tex) => {
            const material = new THREE.ShaderMaterial({
              vertexShader: surfaceVertex,
              fragmentShader: surfaceFragment,
              uniforms: {
                ...st.shared,
                uDay: { value: tex },
                uOpacity: { value: 0 },
                uNightTile: { value: night },
                uNightRect: { value: new THREE.Vector3(0, 0, 1) },
                uUseNightTile: { value: 0 },
              },
              transparent: true,
              polygonOffset: true,
              polygonOffsetFactor: -1,
              polygonOffsetUnits: -2 * t.z,
            })
            const mesh = new THREE.Mesh(tileGeometry(t.z, t.x, t.y), material)
            mesh.renderOrder = 1 + t.z / 100
            mesh.visible = false
            mesh.frustumCulled = false
            root.current?.add(mesh)
            Object.assign(t, { state: 'ready', mesh, material, texture: tex, readyAt: performance.now() })
            st.dirty = true
          },
          () => (t.state = 'failed'),
        )
      },
    })
  }

  function requestNight(key: string, z: number, x: number, y: number, prio: number) {
    if (st.nightProvider >= NIGHT_TILE_URLS.length) return
    let n = st.nights.get(key)
    if (!n) {
      n = { state: 'idle', lastUsed: performance.now() }
      st.nights.set(key, n)
    }
    n.lastUsed = performance.now()
    if (n.state !== 'idle') return
    const entry = n
    st.queue.push({
      prio: prio + 0.001,
      run: () => {
        if (entry.state !== 'idle') return
        entry.state = 'loading'
        const provider = st.nightProvider
        load(
          fillTemplate(NIGHT_TILE_URLS[provider], z, x, y),
          (tex) => {
            st.nightWorks = true
            Object.assign(entry, { state: 'ready', texture: tex })
            st.dirty = true
          },
          () => {
            entry.state = 'failed'
            // Si este proveedor nunca ha respondido, se prueba el siguiente
            if (!st.nightWorks && provider === st.nightProvider) {
              st.nightProvider++
              for (const v of st.nights.values()) if (v.state === 'failed') v.state = 'idle'
              st.dirty = true
              if (st.nightProvider >= NIGHT_TILE_URLS.length)
                console.info('[cenit] No high-resolution night lights available; using the global texture.')
            }
          },
        )
      },
    })
  }

  function evict(keep: Set<string>) {
    if (st.tiles.size > MAX_CACHE) {
      const old = [...st.tiles.values()].filter((t) => !keep.has(t.key) && t.state !== 'loading')
      old.sort((a, b) => a.lastUsed - b.lastUsed)
      for (const t of old.slice(0, st.tiles.size - MAX_CACHE)) {
        disposeTile(t)
        st.tiles.delete(t.key)
      }
    }
    if (st.nights.size > MAX_CACHE / 2) {
      const old = [...st.nights.entries()].filter(([, n]) => n.state !== 'loading').sort((a, b) => a[1].lastUsed - b[1].lastUsed)
      for (const [k, n] of old.slice(0, st.nights.size - MAX_CACHE / 2)) {
        n.texture?.dispose()
        st.nights.delete(k)
        for (const t of st.tiles.values())
          if (t.nightKey === k && t.material) {
            t.material.uniforms.uUseNightTile.value = 0
            t.nightKey = undefined
          }
      }
    }
  }

  /** Enlaza una tesela con la mejor imagen nocturna disponible (la suya o la de un antecesor) */
  function linkNight(t: Tile, prio: number) {
    if (!t.material || st.nightProvider >= NIGHT_TILE_URLS.length) return
    const nz = Math.min(t.z, NIGHT_TILE_MAX_ZOOM)
    const shift = t.z - nz
    const nx = t.x >> shift
    const ny = t.y >> shift
    const key = keyOf(nz, nx, ny)
    requestNight(key, nz, nx, ny, prio)
    if (t.nightKey === key) return
    const n = st.nights.get(key)
    if (n?.state !== 'ready') return
    const scale = 1 / 2 ** shift
    const u = t.material.uniforms
    u.uNightTile.value = n.texture
    ;(u.uNightRect.value as THREE.Vector3).set((t.x - (nx << shift)) * scale, (t.y - (ny << shift)) * scale, scale)
    u.uUseNightTile.value = 1
    t.nightKey = key
  }

  const tmpCam = useMemo(() => new THREE.Vector3(), [])
  const c = useMemo(() => [0, 0, 0], [])
  const corner = useMemo(() => [0, 0, 0], [])

  useFrame(() => {
    const now = performance.now()

    // Fundido de entrada de las teselas recién cargadas
    for (const t of st.tiles.values())
      if (t.material && t.mesh?.visible) t.material.uniforms.uOpacity.value = Math.min(1, (now - t.readyAt) / 280)

    if (now - st.lastUpdate < UPDATE_MS && !st.dirty) return
    // Cámara en el marco de la Tierra (que gira)
    tmpCam.copy(camera.position)
    root.current.worldToLocal(tmpCam)
    if (!st.dirty && tmpCam.distanceToSquared(st.lastCam) < 1e-8) return
    st.lastUpdate = now
    st.lastCam.copy(tmpCam)
    st.dirty = false

    const D = tmpCam.length()
    const h = D - 1
    const visible = new Set<string>()

    // Con el tiempo acelerado la Tierra gira bajo la cámara (o la cámara sigue a un satélite):
    // si el suelo visible se renueva en menos de ~2 s, las teselas nuevas caducarían antes de
    // llegar. Se siguen usando las ya cargadas, pero no se piden más hasta que vaya despacio.
    const dir = tmpCam.clone().divideScalar(D)
    const dtSec = (now - st.lastDirAt) / 1000
    const sweep = dtSec > 0 && dtSec < 1 ? Math.acos(Math.min(1, dir.dot(st.lastDir))) / dtSec : 0
    st.lastDir.copy(dir)
    st.lastDirAt = now
    const fast = sweep > 0.5 * Math.acos(Math.min(1, 1 / D))
    // Volver a mirar en la siguiente actualización aunque la cámara se quede quieta
    if (fast) st.dirty = true

    if (h < MAX_ALTITUDE) {
      const nadir = tmpCam.clone().divideScalar(D)
      const horizon = Math.acos(Math.min(1, 1 / D))
      const screenPx = gl.domElement.height * Math.min(1, 1.5 / gl.getPixelRatio())
      const fovFactor = 2 * Math.tan((camera.fov * Math.PI) / 360)
      const targetZ = Math.min(TILE_MAX_ZOOM, Math.log2((2 * Math.PI * screenPx) / (256 * h * fovFactor)))

      if (targetZ >= MIN_TILE_ZOOM) {
        const leaves: { z: number; x: number; y: number; dist: number }[] = []
        const visit = (z: number, x: number, y: number) => {
          const n = 2 ** z
          geoToLocal(mercLat(y + 0.5, n), ((x + 0.5) / n) * 2 * Math.PI - Math.PI, c)
          const delta = clampAcos(c[0] * nadir.x + c[1] * nadir.y + c[2] * nadir.z)
          // Radio angular de la tesela: la esquina más alejada del centro
          let r = 0
          for (const [fx, fy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
            geoToLocal(mercLat(y + fy, n), ((x + fx) / n) * 2 * Math.PI - Math.PI, corner)
            r = Math.max(r, clampAcos(corner[0] * c[0] + corner[1] * c[1] + corner[2] * c[2]))
          }
          if (delta - r > horizon + 0.03) return
          const near = Math.max(0, delta - r)
          const want = targetZ - Math.log2(Math.hypot(h, near) / h)
          if (z < Math.round(want) && z < TILE_MAX_ZOOM) {
            for (let k = 0; k < 4; k++) visit(z + 1, x * 2 + (k & 1), y * 2 + (k >> 1))
          } else if (z >= MIN_TILE_ZOOM) {
            leaves.push({ z, x, y, dist: near })
          }
        }
        for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) visit(2, x, y)

        leaves.sort((a, b) => a.dist - b.dist)
        st.queue = []
        for (const leaf of leaves.slice(0, MAX_VISIBLE)) {
          const key = keyOf(leaf.z, leaf.x, leaf.y)
          let t = st.tiles.get(key)
          if (!t) {
            t = { key, z: leaf.z, x: leaf.x, y: leaf.y, state: 'idle', lastUsed: now, readyAt: 0 }
            st.tiles.set(key, t)
          }
          t.lastUsed = now
          const prio = leaf.dist - leaf.z * 0.01
          if (t.state === 'ready') {
            visible.add(key)
            linkNight(t, prio)
            continue
          }
          if (!fast) requestDay(t, prio)
          // Mientras tanto, la antecesora más cercana que ya esté cargada
          for (let z = leaf.z - 1, x = leaf.x >> 1, y = leaf.y >> 1; z >= MIN_TILE_ZOOM; z--, x >>= 1, y >>= 1) {
            const anc = st.tiles.get(keyOf(z, x, y))
            if (anc?.state === 'ready') {
              anc.lastUsed = now
              visible.add(anc.key)
              linkNight(anc, prio)
              break
            }
          }
        }
        if (!fast) pump()
        evict(visible)
      }
    }

    for (const t of st.tiles.values()) if (t.mesh) t.mesh.visible = visible.has(t.key)
  })

  return <group ref={root} />
}
