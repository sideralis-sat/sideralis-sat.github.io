import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { CONSTELLATIONS, CONSTELLATION_INDEX, OTHER_INDEX } from './data/constellations'
import { loadCatalog, MissingCatalogError } from './data/loadCatalog'
import type { Catalog, SatRecord } from './data/types'
import { SimClock } from './lib/clock'
import { eciToScene, geoToSceneDir } from './lib/coords'
import { frameAngles, rotateY, type FrameMode } from './lib/frame'
import { ORBIT_CLASSES, ORBIT_INDEX, orbitElements } from './lib/orbit'
import { DEFAULT_STATION, type Station } from './lib/passes'
import { PositionStream } from './lib/positionStream'
import { propagateRecord } from './lib/propagateRecord'
import type { ReentryResult } from './lib/reentry'
import { viewState } from './lib/viewState'
import { Earth } from './scene/Earth'
import { GlobeControls, type CameraRequest } from './scene/GlobeControls'
import { Graticule } from './scene/Graticule'
import { GroundStation } from './scene/GroundStation'
import { InertialFrame } from './scene/InertialFrame'
import { Picker } from './scene/Picker'
import { ReentryPath } from './scene/ReentryPath'
import { Satellites } from './scene/Satellites'
import { Footprint, GroundTrack, OrbitPath, SatMarker } from './scene/Selection'
import { Starfield } from './scene/Starfield'
import { ViewShift } from './scene/ViewShift'
import { TransferPath } from './scene/TransferPath'
import type { ManeuverDrawing } from './ui/dossier/ManeuverTab'
import { readUrl, shareLink, writeUrl, type ViewMode } from './lib/url'
import { SkyView } from './ui/sky/SkyView'
import { DetailContext, useDetailState } from './ui/detail'
import { AnalysisDrawer } from './ui/analysis/AnalysisDrawer'
import { MissionDrawer } from './ui/mission/MissionDrawer'
import { Dossier, type DossierTab } from './ui/dossier/Dossier'
import { FilterMenu, type FilterOption } from './ui/FilterMenu'
import { MobileNav } from './ui/MobileNav'
import { SatLabels } from './scene/SatLabels'
import { Welcome, type WelcomeAction } from './ui/Welcome'
import { FrameToggle } from './ui/FrameToggle'
import { Hud } from './ui/Hud'
import { BookIcon, ChartIcon, GlobeIcon, RocketIcon, ZenithIcon } from './ui/icons'
import { APP_NAME } from './brand'
import { LearnDrawer } from './ui/learn/LearnDrawer'
import type { LearnActions } from './ui/learn/lessons'
import { NavControls } from './ui/NavControls'
import { SearchBox } from './ui/SearchBox'
import { StatusOverlay, type LoadState } from './ui/StatusOverlay'
import { TimeControls } from './ui/TimeControls'

const EMPTY = new Set<string>()
/** Amarillo: el color de lo seleccionado en el globo (órbita, traza, huella) */
const ACTIVE = '#ffc21a'
/** Azul: el segundo objeto (comparación o encuentro) */
const SECONDARY = '#5b9dff'
/** Naranja: objetivos de una misión de retirada de basura */
const TARGET = '#ff8a3d'

type CameraAction = CameraRequest extends infer R ? (R extends CameraRequest ? Omit<R, 'key'> : never) : never

const LAYERS: FilterOption[] = [
  { id: 'labels', label: 'Names when zoomed in', description: 'Name and altitude of the satellites close to the camera' },
  { id: 'orbit', label: 'Orbit', description: 'One revolution from the current epoch, in the active reference frame' },
  { id: 'track', label: 'Ground track', description: 'Half a revolution back and one and a half revolutions ahead' },
  { id: 'footprint', label: 'Coverage footprint', description: 'Region where the object is above the horizon (0° elevation mask)' },
  { id: 'station', label: 'Ground station', description: 'Station, line of sight and visibility circle' },
  { id: 'grid', label: 'Graticule', description: 'Meridians and parallels every 15°' },
]

function loadStation(): Station {
  try {
    const s = JSON.parse(localStorage.getItem('cenit.station') ?? 'null')
    if (s && typeof s.lat === 'number' && typeof s.lon === 'number') return s
  } catch {
    /* almacenamiento no disponible */
  }
  return DEFAULT_STATION
}

function hasSavedStation() {
  try {
    return localStorage.getItem('cenit.station') !== null
  } catch {
    return false
  }
}

export default function App() {
  // La barra superior puede ocupar una o dos filas según el hueco: su altura real se publica
  // en --top para que los filtros y la vista del cielo queden siempre debajo
  const topbarRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = topbarRef.current
    if (!el) return
    const root = document.documentElement
    const ro = new ResizeObserver(() => root.style.setProperty('--top', `${Math.round(el.getBoundingClientRect().height)}px`))
    ro.observe(el)
    return () => {
      ro.disconnect()
      root.style.removeProperty('--top')
    }
  }, [])
  // Estado inicial desde la URL (enlace compartido)
  const initial = useMemo(readUrl, [])
  const clock = useMemo(() => {
    const c = new SimClock()
    if (initial.t !== undefined) c.jumpTo(initial.t)
    return c
  }, [initial])
  const [baseCatalog, setCatalog] = useState<Catalog | null>(null)
  const [stream, setStream] = useState<PositionStream | null>(null)
  const [state, setState] = useState<LoadState>({ kind: 'loading-catalog' })
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(EMPTY)
  const [hiddenOrbits, setHiddenOrbits] = useState<Set<string>>(EMPTY)
  const [hiddenLayers, setHiddenLayers] = useState<Set<string>>(EMPTY)
  const [selected, setSelected] = useState<number | null>(null)
  const [tab, setTab] = useState<DossierTab>(initial.tab ?? 'estado')
  const [following, setFollowing] = useState(false)
  const [mode, setMode] = useState<FrameMode>(initial.frame ?? 'ECEF')
  const [view, setViewState] = useState<ViewMode>(initial.view ?? 'globe')
  const [compare, setCompare] = useState<number | null>(null)
  const [cameraRequest, setCameraRequest] = useState<CameraRequest | null>(null)
  const [station, setStationState] = useState<Station>(loadStation)
  const [stationIsDefault, setStationIsDefault] = useState(() => !hasSavedStation())
  const [picking, setPicking] = useState(false)
  const [reentry, setReentry] = useState<ReentryResult | null>(null)
  const [maneuver, setManeuver] = useState<ManeuverDrawing | null>(null)
  /** Hoja lateral izquierda abierta (solo una a la vez) */
  const [drawer, setDrawer] = useState<'learn' | 'analysis' | 'missions' | null>(null)
  const learnOpen = drawer === 'learn'
  const analysisOpen = drawer === 'analysis'
  const missionsOpen = drawer === 'missions'
  const toggleDrawer = (d: 'learn' | 'analysis' | 'missions') => {
    if (drawer !== d) setViewState('globe')
    setDrawer((cur) => (cur === d ? null : d))
  }
  const setLearnOpen = (o: boolean) => setDrawer(o ? 'learn' : null)
  // Satélites diseñados por el usuario (guardados en este navegador) y objetivos de retirada
  const [missions, setMissions] = useState<SatRecord[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('cenit.missions') ?? '[]')
    } catch {
      return []
    }
  })
  const saveMissions = (list: SatRecord[]) => {
    setMissions(list)
    try {
      localStorage.setItem('cenit.missions', JSON.stringify(list))
    } catch {
      /* almacenamiento no disponible */
    }
  }
  const [targets, setTargets] = useState<number[]>([])
  const [pendingSelect, setPendingSelect] = useState<number | null>(null)
  // Catálogo que ve la web: el de CelesTrak más los satélites diseñados, al final
  const catalog = useMemo(
    () => (baseCatalog && missions.length ? { ...baseCatalog, satellites: [...baseCatalog.satellites, ...missions] } : baseCatalog),
    [baseCatalog, missions],
  )
  const detailState = useDetailState()
  // Bienvenida: la primera vez que se entra, y siempre desde el botón de ayuda
  const [welcome, setWelcome] = useState(() => {
    try {
      return localStorage.getItem('zenith.welcomed') !== '1' && !new URLSearchParams(location.search).has('sat')
    } catch {
      return true
    }
  })
  const closeWelcome = () => {
    setWelcome(false)
    try {
      localStorage.setItem('zenith.welcomed', '1')
    } catch {
      /* almacenamiento no disponible */
    }
  }
  const [missionTab, setMissionTab] = useState<'design' | 'imaging' | 'removal'>('design')
  const inertial = useRef<THREE.Group | null>(null)
  const tooltip = useRef<HTMLDivElement>(null)
  const labelLayer = useRef<HTMLDivElement>(null)
  const pickStart = useRef(0)

  const setStation = useCallback((s: Station) => {
    setStationState(s)
    setStationIsDefault(false)
    try {
      localStorage.setItem('cenit.station', JSON.stringify(s))
    } catch {
      /* almacenamiento no disponible */
    }
  }, [])

  // ——— Datos ———
  useEffect(() => {
    loadCatalog()
      .then((c) => {
        setCatalog(c)
        setState({ kind: 'preparing', count: c.satellites.length })
      })
      .catch((err) =>
        setState(err instanceof MissingCatalogError ? { kind: 'missing' } : { kind: 'error', message: String(err.message ?? err) }),
      )
  }, [])

  useEffect(() => {
    if (!catalog) return
    const s = new PositionStream(catalog.satellites)
    s.onReady = ({ failed }) => {
      if (failed) console.info(`[cenit] ${failed} records could not be initialized with SGP4`)
      setState({ kind: 'ready' })
    }
    setStream(s)
    return () => s.dispose()
  }, [catalog])

  const index = useMemo(() => {
    if (!catalog) return null
    const sats = catalog.satellites
    const groupIndex = new Uint8Array(sats.length)
    const orbitIndex = new Uint8Array(sats.length)
    const groupCounts = new Array(CONSTELLATIONS.length).fill(0)
    const orbitCounts = new Array(ORBIT_CLASSES.length).fill(0)
    sats.forEach((s, i) => {
      const g = CONSTELLATION_INDEX.get(s.GROUP) ?? OTHER_INDEX
      const o = ORBIT_INDEX.get(orbitElements(s).orbitClass)!
      groupIndex[i] = g
      orbitIndex[i] = o
      groupCounts[g]++
      orbitCounts[o]++
    })
    return { groupIndex, orbitIndex, groupCounts, orbitCounts }
  }, [catalog])

  const { show, shown } = useMemo(() => {
    if (!index) return { show: new Uint8Array(0), shown: 0 }
    const gOff = CONSTELLATIONS.map((c) => hiddenGroups.has(c.id))
    const oOff = ORBIT_CLASSES.map((o) => hiddenOrbits.has(o.id))
    const show = new Uint8Array(index.groupIndex.length)
    let shown = 0
    for (let i = 0; i < show.length; i++) {
      const v = gOff[index.groupIndex[i]] || oOff[index.orbitIndex[i]] ? 0 : 1
      show[i] = v
      shown += v
    }
    return { show, shown }
  }, [index, hiddenGroups, hiddenOrbits])

  const groupOptions: FilterOption[] = useMemo(
    () =>
      index
        ? CONSTELLATIONS.map((c, i) => ({ id: c.id, label: c.label, color: c.color, count: index.groupCounts[i] })).filter((o) => (o.count ?? 0) > 0)
        : [],
    [index],
  )
  const orbitOptions: FilterOption[] = useMemo(
    () =>
      index
        ? ORBIT_CLASSES.map((o, i) => ({ id: o.id, label: `${o.id}: ${o.label}`, description: o.description, count: index.orbitCounts[i] }))
        : [],
    [index],
  )

  const toggleIn = (set: Set<string>, id: string) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  }

  // ——— Cámara ———
  const requestCamera = useCallback((r: CameraAction) => setCameraRequest({ ...r, key: performance.now() } as CameraRequest), [])

  /** Vuela hasta el satélite, algo desplazado fuera de su plano para ver la órbita abierta */
  const centerOn = useCallback(
    (i: number) => {
      if (!catalog) return
      const now = clock.now()
      const pv = propagateRecord(catalog.satellites[i], now)
      if (!pv) return
      const p = [0, 0, 0]
      const v = [0, 0, 0]
      eciToScene(pv.position.x, pv.position.y, pv.position.z, p)
      eciToScene(pv.velocity.x, pv.velocity.y, pv.velocity.z, v)
      const theta = frameAngles(now, mode).inertial
      const pos = rotateY(new THREE.Vector3().fromArray(p), theta)
      const vel = rotateY(new THREE.Vector3().fromArray(v), theta)
      const r = pos.length()
      const normal = pos.clone().cross(vel).normalize()
      const narrow = window.innerWidth <= 760
      const target = pos.clone().normalize().addScaledVector(normal, narrow ? 0.25 : 0.6).normalize()
      const distance = r < 1.6 ? r + (narrow ? 3.4 : 2.2) : r * (narrow ? 2.6 : 1.9)
      setFollowing(false)
      requestCamera({ kind: 'fly', target: target.toArray() as [number, number, number], range: distance - 1 })
    },
    [catalog, clock, mode, requestCamera],
  )

  const flyToGround = useCallback(
    (lat: number, lon: number, range = 0.9) => {
      setFollowing(false)
      requestCamera({ kind: 'fly', target: geoToSceneDir(lat, lon, frameAngles(clock.now(), mode).earth), range })
    },
    [clock, mode, requestCamera],
  )

  const followGetter = useMemo(() => {
    if (!following || selected === null || !stream) return null
    const p = new Float32Array(3)
    return () => {
      if (!stream.positionOf(selected, p)) return null
      return rotateY(new THREE.Vector3(p[0], p[1], p[2]), inertial.current?.rotation.y ?? 0)
    }
  }, [following, selected, stream])

  const select = useCallback((i: number | null) => {
    setSelected(i)
    setFollowing(false)
    setReentry(null)
    setCompare(null)
    setManeuver(null)
  }, [])

  const setView = useCallback((v: ViewMode) => {
    setViewState(v)
    if (v === 'sky') {
      setDrawer(null)
    }
  }, [])

  // ——— Enlace compartible: aplicar el de la URL y mantenerla al día ———
  const urlApplied = useRef(false)
  useEffect(() => {
    if (!catalog || urlApplied.current) return
    urlApplied.current = true
    const byNorad = (n?: number) => (n ? catalog.satellites.findIndex((s) => s.NORAD_CAT_ID === n) : -1)
    const i = byNorad(initial.sat)
    if (i >= 0) {
      setSelected(i)
      if (view === 'globe') centerOn(i)
      const c = byNorad(initial.cmp)
      if (c >= 0) setCompare(c)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog])

  useEffect(() => {
    if (!catalog || !urlApplied.current) return
    writeUrl({
      sat: selected !== null ? catalog.satellites[selected].NORAD_CAT_ID : undefined,
      tab,
      frame: mode,
      view,
      cmp: compare !== null ? catalog.satellites[compare].NORAD_CAT_ID : undefined,
    })
  }, [catalog, selected, tab, mode, view, compare])

  /** Dibuja la maniobra y aleja la cámara para que quepa entera, mirando desde la normal al plano */
  const showManeuver = useCallback(
    (d: ManeuverDrawing | null) => {
      const first = maneuver === null
      setManeuver(d)
      if (!d || !first || view !== 'globe') return
      const P = d.start[0]
      const Q = d.start[60]
      const n = [P[1] * Q[2] - P[2] * Q[1], P[2] * Q[0] - P[0] * Q[2], P[0] * Q[1] - P[1] * Q[0]]
      const tmp = [0, 0, 0]
      eciToScene(n[0], n[1], n[2], tmp)
      const normal = rotateY(new THREE.Vector3().fromArray(tmp), frameAngles(clock.now(), mode).inertial).normalize()
      const maxR = Math.max(Math.hypot(...d.target[0]), ...d.legs.flat().map((p) => Math.hypot(p[0], p[1], p[2]))) / 6371
      setFollowing(false)
      requestCamera({ kind: 'fly', target: normal.toArray() as [number, number, number], range: Math.max(3, maxR * 2.6) })
    },
    [maneuver, view, clock, mode, requestCamera],
  )

  const makeShareLink = useCallback(
    () =>
      shareLink({
        sat: selected !== null && catalog ? catalog.satellites[selected].NORAD_CAT_ID : undefined,
        tab,
        frame: mode,
        view,
        cmp: compare !== null && catalog ? catalog.satellites[compare].NORAD_CAT_ID : undefined,
        t: clock.isLive() ? undefined : clock.now(),
      }),
    [catalog, selected, tab, mode, view, compare, clock],
  )

  const selectAndCenter = useCallback(
    (i: number) => {
      select(i)
      centerOn(i)
    },
    [select, centerOn],
  )

  const onWelcome = (a: WelcomeAction) => {
    closeWelcome()
    if (a === 'iss') {
      setDrawer(null)
      setView('globe')
      const sats = catalog?.satellites ?? []
      let i = sats.findIndex((r) => r.NORAD_CAT_ID === 25544)
      if (i < 0) i = sats.findIndex((r) => /^ISS\b/.test(r.OBJECT_NAME))
      if (i >= 0) selectAndCenter(i)
    } else if (a === 'sky') setView('sky')
    else if (a === 'learn') {
      setView('globe')
      setDrawer('learn')
    } else {
      setMissionTab(a === 'imaging' ? 'imaging' : 'design')
      setView('globe')
      setDrawer('missions')
    }
  }

  // Tras lanzar un satélite diseñado, se selecciona en cuanto entra en el catálogo
  useEffect(() => {
    if (pendingSelect === null || !catalog) return
    const i = catalog.satellites.findIndex((r) => r.NORAD_CAT_ID === pendingSelect)
    if (i >= 0) {
      setPendingSelect(null)
      selectAndCenter(i)
    }
  }, [pendingSelect, catalog, selectAndCenter])

  // Al pinchar en el globo: o se coloca la estación, o se selecciona un satélite
  const onPick = useCallback(
    (i: number | null) => {
      if (picking) {
        // El clic sobre el suelo lo registra GlobeControls en este mismo evento
        setTimeout(() => {
          const c = viewState.lastClick
          if (c && c.at > pickStart.current) {
            setStation({ name: 'Picked on the globe', lat: c.lat, lon: c.lon, altKm: 0 })
            setPicking(false)
          }
        }, 0)
        return
      }
      select(i)
    },
    [picking, select, setStation],
  )

  const onHover = useCallback(
    (i: number | null, x: number, y: number) => {
      const el = tooltip.current
      if (!el) return
      if (i === null || !catalog || picking) {
        el.hidden = true
        return
      }
      const s = catalog.satellites[i]
      el.hidden = false
      el.textContent = `${s.OBJECT_NAME}  ${s.NORAD_CAT_ID}`
      el.style.transform = `translate(${x + 14}px, ${y + 14}px)`
    },
    [catalog, picking],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.activeElement?.tagName === 'INPUT') return
      if (picking) setPicking(false)
      else select(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [select, picking])

  // ——— Acciones de las lecciones ———
  const learnActions: LearnActions = useMemo(
    () => ({
      select: (query, t) => {
        if (!catalog) return false
        const q = query.toLowerCase()
        const sats = catalog.satellites
        let i = sats.findIndex((s) => String(s.OBJECT_NAME).toLowerCase() === q)
        if (i < 0) i = sats.findIndex((s) => String(s.OBJECT_NAME).toLowerCase().includes(q))
        if (i < 0) return false
        selectAndCenter(i)
        if (t) setTab(t)
        return true
      },
      frame: setMode,
      speed: (s) => clock.setSpeed(s),
      layers: (on) => setHiddenLayers((h) => new Set([...h].filter((id) => !on.includes(id)))),
      follow: () => setFollowing(true),
      view: (v) => setView(v),
    }),
    [catalog, clock, selectAndCenter, setView],
  )

  const selectedRecord = selected !== null && catalog ? catalog.satellites[selected] : null
  const selectedGroup = selected !== null && index ? CONSTELLATIONS[index.groupIndex[selected]] : null
  const ready = catalog && index && stream
  const layer = (id: string) => !hiddenLayers.has(id)

  return (
    <DetailContext.Provider value={detailState}>
    <div className={`app detail-${detailState.detail} ${selectedRecord ? 'has-panel' : ''} ${drawer || view === 'sky' ? 'has-learn' : ''} ${picking ? 'is-picking' : ''} view-${view}`}>
      <Canvas
        className="scene"
        dpr={[1, 2]}
        // En la vista del cielo el globo queda tapado: no se dibuja para no gastar GPU
        frameloop={view === 'sky' ? 'never' : 'always'}
        camera={{ fov: 40, near: 0.01, far: 1000, position: [0, 0, 13] }}
        gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping }}
      >
        <InertialFrame clock={clock} mode={mode} groupRef={inertial}>
          <Starfield />
          {ready && <Satellites satellites={catalog.satellites} groupIndex={index.groupIndex} show={show} shown={shown} stream={stream} clock={clock} />}
          {ready && selectedRecord && <SatMarker index={selected!} stream={stream} color={ACTIVE} />}
          {maneuver && selectedRecord && <TransferPath drawing={maneuver} />}
          {ready && compare !== null && <SatMarker index={compare} stream={stream} color={SECONDARY} />}
          {ready && targets.map((i) => <SatMarker key={i} index={i} stream={stream} color={TARGET} />)}
        </InertialFrame>

        <Suspense fallback={null}>
          <Earth clock={clock} mode={mode}>
            {layer('grid') && <Graticule />}
            {ready && selectedRecord && layer('track') && <GroundTrack record={selectedRecord} clock={clock} color={ACTIVE} />}
            {ready && selectedRecord && layer('footprint') && <Footprint index={selected!} stream={stream} clock={clock} color={ACTIVE} />}
            {layer('station') && <GroundStation station={station} selected={selected} stream={stream} clock={clock} />}
            {reentry && <ReentryPath result={reentry} />}
          </Earth>
        </Suspense>

        {ready && selectedRecord && layer('orbit') && !reentry && <OrbitPath record={selectedRecord} clock={clock} color={ACTIVE} mode={mode} />}
        {ready && compare !== null && layer('orbit') && <OrbitPath record={catalog.satellites[compare]} clock={clock} color={SECONDARY} mode={mode} />}
        {ready && layer('orbit') && targets.map((i) => <OrbitPath key={i} record={catalog.satellites[i]} clock={clock} color={TARGET} mode={mode} />)}
        {ready && <Picker frame={inertial} stream={stream} show={show} onPick={onPick} onHover={onHover} />}
        {ready && layer('labels') && (
          <SatLabels frame={inertial} stream={stream} show={show} satellites={catalog.satellites} groupIndex={index.groupIndex} layer={labelLayer} selected={selected} />
        )}
        <GlobeControls clock={clock} mode={mode} request={cameraRequest} follow={followGetter} onStopFollow={() => setFollowing(false)} />
        <ViewShift active={!!selectedRecord} />
      </Canvas>
      {/* Etiquetas de nombre al acercarse (las coloca SatLabels) */}
      <div className="sat-labels" ref={labelLayer} aria-hidden hidden={view !== 'globe'} />

      <header className="topbar" ref={topbarRef}>
        <div className="brand">
          {/* Insignia: el parche bordado de la misión */}
          <img className="brand-mark" src={`${import.meta.env.BASE_URL}brand-patch.png`} width="30" height="30" alt="" />
          {/* Logotipo: el punto de la «i» es el cénit, un satélite en la vertical del trazo */}
          <span className="brand-name" role="img" aria-label={APP_NAME}>
            <span aria-hidden>
              Zen<span className="brand-i">ı</span>th
            </span>
          </span>
        </div>
        <button
          className={`learn-btn ${learnOpen ? 'is-on' : ''}`}
          aria-pressed={learnOpen}
          aria-label="Fundamentals"
          onClick={() => toggleDrawer('learn')}
        >
          <BookIcon />
          <span className="learn-label">Fundamentals</span>
        </button>
        <button
          className={`learn-btn ${analysisOpen ? 'is-on' : ''}`}
          aria-pressed={analysisOpen}
          aria-label="Analysis"
          onClick={() => toggleDrawer('analysis')}
        >
          <ChartIcon />
          <span className="learn-label">Analysis</span>
        </button>
        <button
          className={`learn-btn ${missionsOpen ? 'is-on' : ''}`}
          aria-pressed={missionsOpen}
          aria-label="Missions"
          onClick={() => {
            if (!missionsOpen) setMissionTab('design')
            toggleDrawer('missions')
          }}
        >
          <RocketIcon />
          <span className="learn-label">Missions</span>
        </button>
        {catalog && index && <SearchBox satellites={catalog.satellites} groupIndex={index.groupIndex} onSelect={selectAndCenter} />}
        <div className="topbar-right">
          <div className="seg view-toggle" role="radiogroup" aria-label="View">
            <button className="seg-btn text" role="radio" aria-checked={view === 'globe'} onClick={() => setView('globe')} title="3D globe" aria-label="Globe">
              <GlobeIcon />
              <span className="vt-label">Globe</span>
            </button>
            <button className="seg-btn text" role="radio" aria-checked={view === 'sky'} onClick={() => setView('sky')} title="The sky above your ground station" aria-label="Sky">
              <ZenithIcon />
              <span className="vt-label">Sky</span>
            </button>
          </div>
          {view === 'globe' && <FrameToggle mode={mode} onChange={setMode} />}
          <TimeControls clock={clock} />
        </div>
      </header>

      {index && (
        <nav className="filters" aria-label="Filters and layers">
          <FilterMenu
            label="Constellations"
            options={groupOptions}
            hidden={hiddenGroups}
            onToggle={(id) => setHiddenGroups((s) => toggleIn(s, id))}
            onSetAll={(v) => setHiddenGroups(v ? EMPTY : new Set(groupOptions.map((o) => o.id)))}
            onSolo={(id) => setHiddenGroups(new Set(groupOptions.map((o) => o.id).filter((g) => g !== id)))}
          />
          <FilterMenu
            label="Orbital regime"
            options={orbitOptions}
            hidden={hiddenOrbits}
            onToggle={(id) => setHiddenOrbits((s) => toggleIn(s, id))}
            onSetAll={(v) => setHiddenOrbits(v ? EMPTY : new Set(orbitOptions.map((o) => o.id)))}
            onSolo={(id) => setHiddenOrbits(new Set(orbitOptions.map((o) => o.id).filter((g) => g !== id)))}
          />
          <FilterMenu label="Layers" options={LAYERS} hidden={hiddenLayers} onToggle={(id) => setHiddenLayers((s) => toggleIn(s, id))} onSetAll={() => {}} simple />
        </nav>
      )}

      {picking && (
        <div className="picking-banner" role="status">
          Click the globe to place the station. <kbd>Esc</kbd> to cancel.
        </div>
      )}

      {view === 'sky' && ready && (
        <SkyView
          satellites={catalog.satellites}
          groupIndex={index.groupIndex}
          show={show}
          stream={stream}
          clock={clock}
          station={station}
          stationIsDefault={stationIsDefault}
          onStation={setStation}
          selected={selected}
          onSelect={(i) => select(i)}
        />
      )}

      {/* Sin nada a la vista: decirlo y ofrecer la salida, en vez de dejar un globo vacío */}
      {state.kind === 'ready' && view === 'globe' && shown === 0 && (
        <div className="empty-pill" role="status">
          No satellites shown
          <button
            className="btn small primary"
            onClick={() => {
              setHiddenGroups(EMPTY)
              setHiddenOrbits(EMPTY)
            }}
          >
            Show all
          </button>
        </div>
      )}

      <LearnDrawer open={learnOpen} onClose={() => setLearnOpen(false)} actions={learnActions} satellites={catalog?.satellites ?? null} clock={clock} />
      {catalog && index && missionsOpen && (
        <MissionDrawer
          key={missionTab}
          onClose={() => setDrawer(null)}
          satellites={catalog.satellites}
          groupIndex={index.groupIndex}
          station={station}
          clock={clock}
          missions={missions}
          initialTab={missionTab}
          onLaunch={(r) => {
            saveMissions([...missions, r])
            setPendingSelect(r.NORAD_CAT_ID)
          }}
          onRemove={(n) => {
            if (selected !== null && selected >= (baseCatalog?.satellites.length ?? 0)) select(null)
            saveMissions(missions.filter((m) => m.NORAD_CAT_ID !== n))
          }}
          onShowNorad={(n) => {
            const i = catalog.satellites.findIndex((s) => s.NORAD_CAT_ID === n)
            if (i >= 0) selectAndCenter(i)
          }}
          onShowIndex={selectAndCenter}
          targets={targets}
          onTargets={setTargets}
        />
      )}
      {catalog && index && (
        <AnalysisDrawer
          open={analysisOpen}
          onClose={() => setDrawer(null)}
          satellites={catalog.satellites}
          groupIndex={index.groupIndex}
          groupCounts={index.groupCounts}
          clock={clock}
          selected={selected}
          onSelect={selectAndCenter}
        />
      )}

      {selectedRecord && selectedGroup && (
        <Dossier
          key={selected}
          record={selectedRecord}
          constellation={selectedGroup}
          clock={clock}
          tab={tab}
          onTab={setTab}
          following={following}
          station={station}
          pickingStation={picking}
          reentry={reentry}
          onClose={() => select(null)}
          onCenter={() => centerOn(selected!)}
          onFollow={() => setFollowing((f) => !f)}
          onStation={setStation}
          onPickStation={() => {
            pickStart.current = performance.now()
            setViewState('globe')
            setPicking((p) => !p)
          }}
          onShare={makeShareLink}
          maneuver={maneuver}
          satellites={catalog!.satellites}
          compare={compare}
          onCompare={setCompare}
          onConjunction={(other, tca) => {
            setCompare(other)
            clock.setSpeed(1)
            clock.jumpTo(tca - 60_000)
            if (view === 'globe') centerOn(selected!)
          }}
          onManeuver={showManeuver}
          onReentry={setReentry}
          onFlyTo={(lat, lon) => flyToGround(lat, lon, 0.6)}
        />
      )}

      {view === 'globe' && <NavControls
        onZoom={(factor) => requestCamera({ kind: 'zoom', factor })}
        onHome={() => requestCamera({ kind: 'home' })}
        onNorth={() => requestCamera({ kind: 'north' })}
        onTilt={() => requestCamera({ kind: 'tilt' })}
      />}

      {catalog && (
        <Hud
          clock={clock}
          mode={mode}
          shown={shown}
          total={catalog.satellites.length}
          generatedAt={catalog.generatedAt}
          onResetFilters={() => {
            setHiddenGroups(EMPTY)
            setHiddenOrbits(EMPTY)
          }}
        />
      )}

      <MobileNav
        view={view}
        drawer={drawer}
        onGlobe={() => {
          setDrawer(null)
          setView('globe')
        }}
        onSky={() => setView('sky')}
        onDrawer={(d) => {
          if (d === 'missions' && drawer !== 'missions') setMissionTab('design')
          toggleDrawer(d)
        }}
        onHelp={() => setWelcome(true)}
      />
      {welcome && <Welcome onClose={closeWelcome} onAction={onWelcome} />}

      <div className="tooltip" ref={tooltip} hidden />
      <StatusOverlay state={state} />
    </div>
    </DetailContext.Provider>
  )
}
