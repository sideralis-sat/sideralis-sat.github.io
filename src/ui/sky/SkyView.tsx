import { useEffect, useMemo, useRef, useState } from 'react'
import { CONSTELLATIONS, CONSTELLATION_INDEX } from '../../data/constellations'
import type { SatRecord } from '../../data/types'
import type { SimClock } from '../../lib/clock'
import type { PositionStream } from '../../lib/positionStream'
import type { Station } from '../../lib/passes'
import { computeDop, dopSeries, GNSS_SYSTEMS, lookRecord, skyFromPositions, sunElevationAt, topocentric, type DopSample, type GnssId, type SkyObject } from '../../lib/sky'
import { LineChart } from '../charts/LineChart'
import { Lead, Row, Table } from '../dossier/Row'
import { useSimNow } from '../dossier/hooks'
import { fx, latStr, lonStr } from '../format'
import { Fold, Full } from '../detail'
import { AstroPanel, type AstroFrame } from './AstroPanel'
import { frameCorners, radecToEciOfDate } from '../../lib/astroPhoto'
import { gmstAt } from '../../lib/astro'
import { eciToEnu } from '../../lib/sky'

type SkyMode = 'all' | 'visible' | 'gnss' | 'astro'

interface Props {
  satellites: SatRecord[]
  groupIndex: Uint8Array
  show: Uint8Array
  stream: PositionStream
  clock: SimClock
  station: Station
  stationIsDefault: boolean
  onStation: (s: Station) => void
  selected: number | null
  onSelect: (i: number) => void
}

const ACTIVE = '#ffc21a'
const hm = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })
const GNSS_INDEX = GNSS_SYSTEMS.map((s) => CONSTELLATION_INDEX.get(s.id)!)
const GNSS_PREFIX: Record<GnssId, string> = { gps: 'G', galileo: 'E', glonass: 'R', beidou: 'C' }

/** Fase del crepúsculo según la elevación del Sol */
function skyPhase(sunEl: number) {
  if (sunEl > -0.833) return { label: 'Daylight', note: 'Sunlit satellites are lost against the bright sky.' }
  if (sunEl > -6) return { label: 'Civil twilight', note: 'Only the brightest objects (ISS, Tiangong) start to show.' }
  if (sunEl > -12) return { label: 'Nautical twilight', note: 'Best time to spot satellites: dark sky, objects at altitude still sunlit.' }
  if (sunEl > -18) return { label: 'Astronomical twilight', note: 'Dark sky. Only high-altitude or high-elevation objects remain sunlit.' }
  return { label: 'Night', note: 'Most LEO objects are inside the Earth’s shadow; MEO and GEO objects can still be sunlit.' }
}

/**
 * Etiqueta corta de un satélite GNSS: letra del sistema (G, E, R, C) y su PRN si el nombre
 * lo incluye, p. ej. «GPS BIIF-1 (PRN 25)» → G25; si no, el último número del nombre.
 */
function gnssLabel(name: string, sys: GnssId) {
  const prn = /PRN\s*[A-Z]?(\d+)/i.exec(name)?.[1] ?? /\(([A-Z]?)(\d{1,3})\)/.exec(name)?.[2]
  if (prn) return `${GNSS_PREFIX[sys]}${prn.padStart(2, '0')}`
  const num = name.match(/\d+/g)
  return num ? `${GNSS_PREFIX[sys]}${num[num.length - 1]}` : name.slice(0, 8)
}

export function SkyView(p: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [mode, setMode] = useState<SkyMode>('all')
  const [systems, setSystems] = useState<Set<GnssId>>(() => new Set<GnssId>(['gps', 'galileo']))
  const [mask, setMask] = useState(10)
  const [summary, setSummary] = useState<{ objs: SkyObject[]; sunEl: number; sunAz: number }>({ objs: [], sunEl: 0, sunAz: 0 })
  const [geoError, setGeoError] = useState<string | null>(null)
  const [series, setSeries] = useState<DopSample[] | null>(null)
  const now = useSimNow(p.clock, 1000)
  const topo = useMemo(() => topocentric(p.station), [p.station])

  const gnssSet = useMemo(() => new Set([...systems].map((s) => CONSTELLATION_INDEX.get(s)!)), [systems])

  // Lo que necesita el bucle de dibujo, sin reiniciarlo en cada render
  const [astro, setAstro] = useState<AstroFrame | null>(null)
  const live = useRef({ ...p, mode, gnssSet, mask, topo, astro, hover: null as number | null, objs: [] as SkyObject[] })
  live.current = { ...live.current, ...p, mode, gnssSet, mask, topo, astro }

  // ——— Bucle de dibujo ———
  useEffect(() => {
    const cv = canvas.current!
    const ctx = cv.getContext('2d')!
    let raf = 0
    let lastSummary = 0
    let allOn = new Uint8Array(0)
    let track: { at: number; key: string; pts: { az: number; el: number }[] } = { at: -Infinity, key: '', pts: [] }

    const draw = () => {
      raf = requestAnimationFrame(draw)
      const L = live.current
      const dpr = window.devicePixelRatio || 1
      const w = cv.clientWidth
      const h = cv.clientHeight
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr)
        cv.height = Math.round(h * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const cx = w / 2
      const cy = h / 2
      const R = Math.max(40, Math.min(w, h) / 2 - 30)
      const proj = (az: number, el: number) => {
        const r = (R * (90 - el)) / 90
        const a = (az * Math.PI) / 180
        return [cx + r * Math.sin(a), cy - r * Math.cos(a)]
      }

      // El globo 3D está parado en esta vista: el flujo de posiciones avanza desde aquí
      L.stream.tick(L.clock)
      const t = L.clock.now()
      const sun = sunElevationAt(L.topo, t)

      // Cielo: el color de fondo sigue la elevación del Sol
      const sky = sun.el > -0.833 ? ['#1f3d6e', '#13284b'] : sun.el > -6 ? ['#1a2a4d', '#0e1830'] : sun.el > -12 ? ['#111d38', '#0a1224'] : ['#0b1222', '#070b16']
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R)
      grad.addColorStop(0, sky[1])
      grad.addColorStop(1, sky[0])
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.fill()

      // Retícula: anillos de elevación y radios de acimut
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(237,240,244,0.14)'
      for (const el of [30, 60]) {
        ctx.setLineDash([3, 4])
        ctx.beginPath()
        ctx.arc(cx, cy, (R * (90 - el)) / 90, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.setLineDash([])
      for (let az = 0; az < 360; az += 30) {
        const [x, y] = proj(az, 0)
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(x, y)
        ctx.stroke()
      }
      ctx.strokeStyle = 'rgba(237,240,244,0.5)'
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.stroke()
      // Marcas cada 10° en el horizonte
      for (let az = 0; az < 360; az += 10) {
        const a = (az * Math.PI) / 180
        const r2 = R + (az % 30 === 0 ? 7 : 4)
        ctx.beginPath()
        ctx.moveTo(cx + R * Math.sin(a), cy - R * Math.cos(a))
        ctx.lineTo(cx + r2 * Math.sin(a), cy - r2 * Math.cos(a))
        ctx.stroke()
      }
      ctx.font = '600 13px "Schibsted Grotesk", system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#edf0f4'
      for (const [lbl, az] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]] as const) {
        const a = (az * Math.PI) / 180
        const x = cx + (R + 18) * Math.sin(a)
        const y = cy - (R + 18) * Math.cos(a)
        ctx.fillStyle = lbl === 'N' ? '#f2b600' : '#edf0f4'
        ctx.fillText(lbl, x, y)
      }
      ctx.font = '11px "Schibsted Grotesk", system-ui, sans-serif'
      ctx.fillStyle = 'rgba(237,240,244,0.55)'
      for (const el of [30, 60]) {
        const [x, y] = proj(45, el)
        ctx.fillText(`${el}°`, x + 10, y)
      }
      // Cénit
      ctx.strokeStyle = 'rgba(242,182,0,0.8)'
      ctx.beginPath()
      ctx.moveTo(cx - 5, cy)
      ctx.lineTo(cx + 5, cy)
      ctx.moveTo(cx, cy - 5)
      ctx.lineTo(cx, cy + 5)
      ctx.stroke()

      // Sol
      if (sun.el > -2) {
        const [x, y] = proj(sun.az, Math.max(sun.el, -1.5))
        const g2 = ctx.createRadialGradient(x, y, 0, x, y, 26)
        g2.addColorStop(0, 'rgba(255,214,90,0.55)')
        g2.addColorStop(1, 'rgba(255,214,90,0)')
        ctx.fillStyle = g2
        ctx.beginPath()
        ctx.arc(x, y, 26, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#ffd65a'
        ctx.beginPath()
        ctx.arc(x, y, 7, 0, Math.PI * 2)
        ctx.fill()
      }

      // Objetos
      if (allOn.length !== L.stream.count) allOn = new Uint8Array(L.stream.count).fill(1)
      // En modo GNSS no se aplican los filtros de constelación de la barra
      const objs = skyFromPositions((i, out) => L.stream.positionOf(i, out), L.stream.count, L.mode === 'gnss' ? allOn : L.show, L.topo, t, 0)
      const dark = sun.el < -6
      const gnss = L.mode === 'gnss'
      const drawn: SkyObject[] = []
      for (const o of objs) {
        const g = L.groupIndex[o.i]
        if (gnss && !L.gnssSet.has(g)) continue
        const visible = o.sunlit && dark && o.el >= 10
        if (L.mode === 'visible' && !visible) continue
        drawn.push(o)
      }
      L.objs = drawn
      for (const o of drawn) {
        const g = L.groupIndex[o.i]
        const [x, y] = proj(o.az, o.el)
        const color = CONSTELLATIONS[g].color
        const belowMask = gnss && o.el < L.mask
        if (L.mode === 'visible') {
          const g3 = ctx.createRadialGradient(x, y, 0, x, y, 9)
          g3.addColorStop(0, 'rgba(255,255,255,0.5)')
          g3.addColorStop(1, 'rgba(255,255,255,0)')
          ctx.fillStyle = g3
          ctx.beginPath()
          ctx.arc(x, y, 9, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.globalAlpha = belowMask ? 0.3 : o.sunlit ? 1 : 0.38
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(x, y, gnss ? 5 : L.mode === 'visible' ? 2.6 : 1.7, 0, Math.PI * 2)
        ctx.fill()
        if (gnss) {
          ctx.font = '600 11px "Schibsted Grotesk", system-ui, sans-serif'
          ctx.textAlign = 'left'
          ctx.fillStyle = '#edf0f4'
          const sys = GNSS_SYSTEMS[GNSS_INDEX.indexOf(g)]?.id ?? 'gps'
          ctx.fillText(gnssLabel(String(L.satellites[o.i].OBJECT_NAME), sys), x + 8, y)
        }
        ctx.globalAlpha = 1
      }
      if (gnss && L.mask > 0) {
        ctx.strokeStyle = 'rgba(242,182,0,0.55)'
        ctx.setLineDash([2, 4])
        ctx.beginPath()
        ctx.arc(cx, cy, (R * (90 - L.mask)) / 90, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
      }

      // Encuadre de la foto (modo astrofotografía)
      if (L.mode === 'astro' && L.astro) {
        const g = gmstAt(t)
        const azel = (v: number[]) => {
          const enu = [0, 0, 0]
          eciToEnu(v[0] * 1e9, v[1] * 1e9, v[2] * 1e9, Math.cos(g), Math.sin(g), L.topo, enu)
          const r = Math.hypot(enu[0], enu[1], enu[2])
          return { az: ((Math.atan2(enu[0], enu[1]) * 180) / Math.PI + 360) % 360, el: (Math.asin(enu[2] / r) * 180) / Math.PI }
        }
        const c = azel(radecToEciOfDate(L.astro.ra, L.astro.dec, t))
        if (c.el > -5) {
          const [x, y] = proj(c.az, Math.max(c.el, 0))
          ctx.strokeStyle = '#ffc21a'
          ctx.lineWidth = 1.5
          ctx.setLineDash([4, 3])
          ctx.beginPath()
          frameCorners(radecToEciOfDate(L.astro.ra, L.astro.dec, t), L.astro.w, L.astro.h).forEach((v, k) => {
            const q = azel(v)
            const [px, py] = proj(q.az, Math.max(q.el, 0))
            if (k) ctx.lineTo(px, py)
            else ctx.moveTo(px, py)
          })
          ctx.closePath()
          ctx.stroke()
          ctx.setLineDash([])
          ctx.beginPath()
          ctx.arc(x, y, 9, 0, Math.PI * 2)
          ctx.stroke()
          ctx.lineWidth = 1
          ctx.font = '600 12px "Schibsted Grotesk", system-ui, sans-serif'
          ctx.textAlign = 'left'
          ctx.fillStyle = '#ffc21a'
          ctx.fillText(c.el > 0 ? L.astro.label : `${L.astro.label} (below horizon)`, x + 14, y - 12)
        }
      }

      // Traza del seleccionado: 5 min atrás y 15 min adelante
      const sel = L.selected
      if (sel !== null) {
        const rec = L.satellites[sel]
        const key = `${sel}|${L.station.lat}|${L.station.lon}`
        if (key !== track.key || Math.abs(t - track.at) > 10_000) {
          const pts: { az: number; el: number }[] = []
          for (let k = -15; k <= 45; k++) {
            const l = lookRecord(rec, L.topo, t + k * 20_000)
            if (l) pts.push({ az: l.az, el: l.el })
          }
          track = { at: t, key, pts }
        }
        ctx.strokeStyle = ACTIVE
        ctx.lineWidth = 2
        ctx.beginPath()
        let pen = false
        for (const q of track.pts) {
          if (q.el < 0) {
            pen = false
            continue
          }
          const [x, y] = proj(q.az, q.el)
          if (pen) ctx.lineTo(x, y)
          else ctx.moveTo(x, y)
          pen = true
        }
        ctx.stroke()
        ctx.lineWidth = 1
        const me = drawn.find((o) => o.i === sel) ?? objs.find((o) => o.i === sel)
        if (me) {
          const [x, y] = proj(me.az, me.el)
          ctx.strokeStyle = ACTIVE
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(x, y, 10, 0, Math.PI * 2)
          ctx.stroke()
          ctx.lineWidth = 1
        }
      }

      // Nombre bajo el puntero
      const hv = L.hover
      const ho = hv !== null ? drawn.find((o) => o.i === hv) : null
      if (ho) {
        const [x, y] = proj(ho.az, ho.el)
        const text = `${L.satellites[ho.i].OBJECT_NAME}  El ${ho.el.toFixed(0)}°`
        ctx.font = '500 12.5px "Schibsted Grotesk", system-ui, sans-serif'
        const tw = ctx.measureText(text).width
        const bx = Math.min(x + 12, w - tw - 20)
        ctx.fillStyle = '#f4f5f7'
        ctx.fillRect(bx, y - 22, tw + 16, 22)
        ctx.fillStyle = '#11151c'
        ctx.textAlign = 'left'
        ctx.fillText(text, bx + 8, y - 11)
      }

      if (t - lastSummary > 500 || t < lastSummary) {
        lastSummary = t
        setSummary({ objs: drawn, sunEl: sun.el, sunAz: sun.az })
      }
    }
    draw()
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pick = (e: React.PointerEvent) => {
    const cv = canvas.current!
    const r = cv.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    const w = r.width
    const h = r.height
    const R = Math.max(40, Math.min(w, h) / 2 - 30)
    let best: number | null = null
    let bestD = 12
    for (const o of live.current.objs) {
      const rr = (R * (90 - o.el)) / 90
      const a = (o.az * Math.PI) / 180
      const d = Math.hypot(w / 2 + rr * Math.sin(a) - x, h / 2 - rr * Math.cos(a) - y)
      if (d < bestD) {
        bestD = d
        best = o.i
      }
    }
    return best
  }

  // ——— DOP: ahora y a lo largo de 24 h ———
  const sysList = [...systems]
  const gnssObjs = summary.objs.filter((o) => gnssSet.has(p.groupIndex[o.i]) && o.el >= mask)
  const dopNow = mode === 'gnss' ? computeDop(gnssObjs.map((o) => {
    const el = (o.el * Math.PI) / 180
    const az = (o.az * Math.PI) / 180
    return { e: Math.cos(el) * Math.sin(az), n: Math.cos(el) * Math.cos(az), u: Math.sin(el), sys: p.groupIndex[o.i] }
  })) : null

  const hourBucket = Math.floor(now / 3_600_000)
  useEffect(() => {
    if (mode !== 'gnss') return
    setSeries(null)
    const id = setTimeout(() => {
      const recs = p.satellites
        .map((record, i) => ({ record, sys: p.groupIndex[i] }))
        .filter((r) => gnssSet.has(r.sys))
      setSeries(dopSeries(recs, p.station, hourBucket * 3_600_000, 24, 10, mask))
    }, 30)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, gnssSet, mask, p.station, hourBucket, p.satellites])

  const useMyLocation = () => {
    setGeoError(null)
    if (!navigator.geolocation) return setGeoError('This browser does not support geolocation.')
    navigator.geolocation.getCurrentPosition(
      (pos) => p.onStation({ name: 'My location', lat: pos.coords.latitude, lon: pos.coords.longitude, altKm: (pos.coords.altitude ?? 0) / 1000 }),
      () => setGeoError('Could not get your position. Check the browser’s location permission.'),
      { enableHighAccuracy: false, timeout: 10_000 },
    )
  }

  const phase = skyPhase(summary.sunEl)
  const above = summary.objs.length
  const sunlit = summary.objs.filter((o) => o.sunlit).length
  const highest = [...summary.objs].sort((a, b) => b.el - a.el).slice(0, 8)

  return (
    <div className="sky-view">
      <aside className="panel sky-side" aria-label="Sky view">
        <div className="sky-side-body">
          <h2 className="sky-title">Sky over {p.station.name}</h2>
          <p className="station-coords">
            {latStr(p.station.lat, 3)}, {lonStr(p.station.lon, 3)}
          </p>
          {p.stationIsDefault && (
            <div className="callout sky-prompt">
              <p>This is the sky over Madrid, the default station. Use your own location to see the sky above you; it stays in this browser.</p>
              <div className="btn-row">
                <button className="btn small primary" onClick={useMyLocation}>
                  Use my location
                </button>
              </div>
            </div>
          )}
          {!p.stationIsDefault && (
            <div className="btn-row">
              <button className="btn small" onClick={useMyLocation}>
                Use my location
              </button>
            </div>
          )}
          {geoError && <p className="block-note tone-caution">{geoError}</p>}

          <Lead short={<>The sky above your station right now: the center is straight overhead, the edge is the horizon.</>}>
            Azimuthal equidistant projection of the sky: the zenith at the center, the horizon on the outer ring, north up and east to the
            right, as in GNSS sky plots. Bright dots are sunlit; faded dots are inside the Earth’s shadow.
          </Lead>

          <div className="seg sky-mode" role="radiogroup" aria-label="What to show">
            {(
              [
                ['all', 'All objects'],
                ['visible', 'Naked eye'],
                ['gnss', 'GNSS and DOP'],
                ['astro', 'Astrophoto'],
              ] as const
            ).map(([id, label]) => (
              <button key={id} className="seg-btn text" role="radio" aria-checked={mode === id} onClick={() => setMode(id)}>
                {label}
              </button>
            ))}
          </div>

          <Table caption="Conditions now">
            <Row
              label="Sun elevation"
              value={fx(summary.sunEl, 1)}
              unit="°"
              explain={{
                text: (
                  <>
                    Twilight phases are defined by the Sun’s depression: civil to −6°, nautical to −12°, astronomical to −18°. A satellite is seen
                    by reflected sunlight, so the best window is when the observer is in darkness but the satellite, hundreds of kilometers up,
                    is still sunlit.
                  </>
                ),
              }}
            />
            <Row label="Sky" value={phase.label} />
            <Row label="Objects above the horizon" value={String(above)} />
            <Row label="Sunlit" value={String(sunlit)} />
          </Table>
          <p className="block-note">{phase.note}</p>

          {mode === 'astro' && <AstroPanel satellites={p.satellites} station={p.station} now={now} onFrame={setAstro} onSelect={p.onSelect} />}

          {mode === 'gnss' && (
            <section className="block">
              <h3 className="block-title">Satellite navigation geometry</h3>
              <p className="block-note" style={{ marginTop: 0 }}>
                GNSS (Global Navigation Satellite Systems) is the umbrella term for the satellite positioning constellations: GPS (United States),
                Galileo (European Union), GLONASS (Russia) and BeiDou (China). Each satellite broadcasts its position and the time from an atomic
                clock; a receiver measures the signal travel time to at least four of them and solves for latitude, longitude, altitude and its
                own clock error. They fly in medium Earth orbit, around 19,000 to 23,000 km up.
              </p>
              <div className="btn-row">
                {GNSS_SYSTEMS.map((s) => (
                  <button
                    key={s.id}
                    className="btn small"
                    aria-pressed={systems.has(s.id)}
                    onClick={() =>
                      setSystems((cur) => {
                        const next = new Set(cur)
                        if (next.has(s.id)) next.delete(s.id)
                        else next.add(s.id)
                        return next.size ? next : cur
                      })
                    }
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="block-title-row" style={{ marginTop: 14 }}>
                <span className="block-note" style={{ margin: 0 }}>
                  Elevation mask
                </span>
                <div className="seg" role="radiogroup" aria-label="Elevation mask">
                  {[5, 10, 15].map((v) => (
                    <button key={v} className="seg-btn" role="radio" aria-checked={mask === v} onClick={() => setMask(v)}>
                      {v}°
                    </button>
                  ))}
                </div>
              </div>
              <table className="data">
                <tbody>
                  <Row label="Satellites in view (above mask)" value={String(gnssObjs.length)} />
                  <Row
                    label="PDOP"
                    value={dopNow ? fx(dopNow.pdop, 2) : '—'}
                    tone={dopNow && dopNow.pdop > 6 ? 'caution' : 'active'}
                    explain={{
                      text: (
                        <>
                          Dilution of precision: how satellite geometry amplifies ranging errors into position errors, σ_pos = PDOP · σ_range.
                          Satellites spread across the sky give low DOP; clustered ones give high DOP. Below 2 is excellent, above 6 poor. Each
                          extra system adds one clock unknown to the solution.
                        </>
                      ),
                      tex: 'Q = (G^\\mathsf{T}G)^{-1},\\quad G_k = [-\\hat e_k\\ \\ -\\hat n_k\\ \\ -\\hat u_k\\ \\ 1],\\quad \\text{PDOP} = \\sqrt{q_{EE}+q_{NN}+q_{UU}}',
                    }}
                  />
                  <Row label="HDOP (horizontal)" value={dopNow ? fx(dopNow.hdop, 2) : '—'} />
                  <Row label="VDOP (vertical)" value={dopNow ? fx(dopNow.vdop, 2) : '—'} />
                  <Full>
                  <Row label="TDOP (time)" value={dopNow ? fx(dopNow.tdop, 2) : '—'} />
                  <Row label="GDOP (geometric)" value={dopNow ? fx(dopNow.gdop, 2) : '—'} />
                  </Full>
                </tbody>
              </table>
              <Full>
              <p className="block-note">
                VDOP is almost always worse than HDOP: every satellite is above the horizon, so the vertical component is never bracketed from
                below. That is why GNSS altitude is less accurate than latitude and longitude.
              </p>
              </Full>
              <Fold title="Next 24 hours" summary={series ? `PDOP between ${fx(Math.min(...series.filter((s) => s.dop).map((s) => s.dop!.pdop)), 1)} and ${fx(Math.max(...series.filter((s) => s.dop).map((s) => s.dop!.pdop)), 1)}` : 'computing…'}>
              {series === null && <p className="block-note">Propagating {sysList.length > 1 ? 'the constellations' : 'the constellation'} over 24 h…</p>}
              {series && (
                <>
                  <LineChart
                    data={series.filter((s) => s.dop).map((s) => ({ x: s.t, y: Math.min(s.dop!.pdop, 10) }))}
                    label="PDOP over the next 24 h"
                    formatX={(x) => hm.format(x)}
                    formatY={(y) => fx(y, 1)}
                    yUnit=""
                    yDomain={[0, Math.max(4, ...series.filter((s) => s.dop).map((s) => Math.min(s.dop!.pdop, 10)))]}
                    marker={{ x: now, label: 'now' }}
                  />
                  <LineChart
                    data={series.map((s) => ({ x: s.t, y: s.visible }))}
                    label="Satellites above the mask over 24 h"
                    formatX={(x) => hm.format(x)}
                    formatY={(y) => fx(y, 0)}
                    yUnit="satellites"
                    marker={{ x: now, label: 'now' }}
                  />
                </>
              )}
              </Fold>
            </section>
          )}

          {highest.length > 0 && mode !== 'astro' && (
            <section className="block">
              <h3 className="block-title">{mode === 'visible' ? 'Visible now' : 'Highest in the sky'}</h3>
              <ul className="sky-list">
                {highest.map((o) => (
                  <li key={o.i}>
                    <button className="sky-item" onClick={() => p.onSelect(o.i)} aria-pressed={p.selected === o.i}>
                      <span className="dot" style={{ background: CONSTELLATIONS[p.groupIndex[o.i]].color }} />
                      <span className="sky-item-name">{p.satellites[o.i].OBJECT_NAME}</span>
                      <span className="sky-item-meta">
                        El {fx(o.el, 0)}° Az {fx(o.az, 0)}°{o.sunlit ? '' : ', shadow'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {mode === 'visible' && highest.length === 0 && (
            <p className="callout">
              Nothing visible to the naked eye right now: {summary.sunEl > -6 ? 'the sky is too bright.' : 'every object above 10° is in the Earth’s shadow.'} Try
              the time controls to jump to dusk or dawn.
            </p>
          )}
        </div>
      </aside>

      <div className="sky-stage">
        <canvas
          ref={canvas}
          className="sky-canvas"
          role="img"
          aria-label={`Sky above ${p.station.name}: ${above} objects above the horizon`}
          onPointerMove={(e) => {
            const i = pick(e)
            live.current.hover = i
            e.currentTarget.style.cursor = i === null ? 'default' : 'pointer'
          }}
          onPointerLeave={() => (live.current.hover = null)}
          onClick={(e) => {
            const i = pick(e as unknown as React.PointerEvent)
            if (i !== null) p.onSelect(i)
          }}
        />
      </div>
    </div>
  )
}
