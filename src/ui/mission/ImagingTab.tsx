import { useEffect, useMemo, useRef, useState } from 'react'
import type { SatRecord } from '../../data/types'
import {
  cloudAt,
  dataLinks,
  fetchClouds,
  IMAGERS,
  MIN_SUN_EL,
  MISSIONS,
  VERDICT_LABEL,
  verdictFor,
  type CloudForecast,
  type Opportunity,
  type Verdict,
} from '../../lib/earthImaging'
import type { Station } from '../../lib/passes'
import type { OverpassRequest, OverpassResponse } from '../../workers/overpass.worker'
import { Fold } from '../detail'
import { Row } from '../dossier/Row'
import { fx, latStr, lonStr } from '../format'

interface Props {
  satellites: SatRecord[]
  station: Station
  now: number
  onShowAt: (norad: number, t: number) => void
}

interface Point {
  name: string
  lat: number
  lon: number
}

const DAYS = 15
const KEY = 'cenit.imagingPoint'

function loadPoint(fallback: Point): Point {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Point | null
    if (p && Number.isFinite(p.lat) && Number.isFinite(p.lon)) return p
  } catch {
    /* almacenamiento no disponible */
  }
  return fallback
}

const localDay = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
const localTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })
const utcTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
const shortWhen = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Cuándo los satélites de observación gratuitos pueden fotografiar un punto, con la previsión de nubes */
export function ImagingTab(p: Props) {
  const [point, setPoint] = useState<Point>(() => loadPoint({ name: p.station.name, lat: p.station.lat, lon: p.station.lon }))
  const [draft, setDraft] = useState({ lat: String(point.lat), lon: String(point.lon) })
  const [missions, setMissions] = useState<string[]>(['sentinel2', 'landsat', 'sentinel1'])
  const [onlyClear, setOnlyClear] = useState(false)
  const [run, setRun] = useState<{ kind: 'idle' | 'running' } | { kind: 'done'; list: Opportunity[]; ms: number }>({ kind: 'idle' })
  const [clouds, setClouds] = useState<{ state: 'loading' | 'ok' | 'error'; f: CloudForecast | null }>({ state: 'loading', f: null })
  const [geoMsg, setGeoMsg] = useState('')
  const [t0] = useState(() => Math.floor(p.now / 60_000) * 60_000)
  const worker = useRef<Worker | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(point))
    } catch {
      /* sin almacenamiento: no pasa nada */
    }
  }, [point])

  // Satélites disponibles en el catálogo
  const byNorad = useMemo(() => {
    const m = new Map<number, SatRecord>()
    for (const r of p.satellites) m.set(Number(r.NORAD_CAT_ID), r)
    return m
  }, [p.satellites])
  const chosen = IMAGERS.filter((im) => missions.includes(im.mission))
  const available = chosen.filter((im) => byNorad.has(im.norad))
  const missing = chosen.filter((im) => !byNorad.has(im.norad))

  // Pasadas (en un worker: son unos cientos de miles de propagaciones)
  useEffect(() => {
    if (available.length === 0) {
      setRun({ kind: 'done', list: [], ms: 0 })
      return
    }
    const id = setTimeout(() => {
      worker.current?.terminate()
      const wk = new Worker(new URL('../../workers/overpass.worker.ts', import.meta.url), { type: 'module' })
      worker.current = wk
      setRun({ kind: 'running' })
      wk.onmessage = (e: MessageEvent<OverpassResponse>) => {
        setRun({ kind: 'done', list: e.data.opportunities, ms: e.data.ms })
        wk.terminate()
        worker.current = null
      }
      const req: OverpassRequest = {
        sats: available.map((im) => ({ imager: im.id, record: byNorad.get(im.norad)!, swathKm: im.swathKm })),
        lat: point.lat,
        lon: point.lon,
        t0,
        t1: t0 + DAYS * 86_400_000,
      }
      wk.postMessage(req)
    }, 250)
    return () => clearTimeout(id)
  }, [point.lat, point.lon, missions.join(), byNorad, t0]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => worker.current?.terminate(), [])

  // Previsión de nubes para el punto
  useEffect(() => {
    const ctl = new AbortController()
    setClouds({ state: 'loading', f: null })
    fetchClouds(point.lat, point.lon, ctl.signal)
      .then((f) => setClouds({ state: 'ok', f }))
      .catch((err) => {
        if ((err as Error).name !== 'AbortError') setClouds({ state: 'error', f: null })
      })
    return () => ctl.abort()
  }, [point.lat, point.lon])

  // Oportunidades útiles: los ópticos solo de día
  const rows = useMemo(() => {
    if (run.kind !== 'done') return []
    return run.list
      .map((o) => {
        const im = IMAGERS.find((x) => x.id === o.imager)!
        const cloud = im.kind === 'optical' ? cloudAt(clouds.f, o.t) : null
        return { o, im, cloud, verdict: verdictFor(im.kind, cloud) as Verdict }
      })
      .filter((r) => r.im.kind === 'radar' || r.o.sunEl >= MIN_SUN_EL)
  }, [run, clouds.f])
  const shown = onlyClear ? rows.filter((r) => r.verdict === 'clear' || r.verdict === 'radar') : rows

  const nextClear = rows.find((r) => r.verdict === 'clear' && r.im.resM <= 30)
  const nextRadar = rows.find((r) => r.verdict === 'radar')
  const nextAny = rows.find((r) => r.im.kind === 'optical' && r.im.resM <= 30)

  const apply = () => {
    const lat = Number(draft.lat.replace(',', '.'))
    const lon = Number(draft.lon.replace(',', '.'))
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      setGeoMsg('Enter latitude between −90 and 90 and longitude between −180 and 180.')
      return
    }
    setGeoMsg('')
    setPoint({ name: 'Custom point', lat, lon })
  }
  const useHere = () => {
    if (!navigator.geolocation) {
      setGeoMsg('This browser cannot share its location.')
      return
    }
    setGeoMsg('Finding your location…')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(4))
        const lon = Number(pos.coords.longitude.toFixed(4))
        setPoint({ name: 'Your location', lat, lon })
        setDraft({ lat: String(lat), lon: String(lon) })
        setGeoMsg('')
      },
      () => setGeoMsg('Location not available. Type the coordinates instead.'),
      { timeout: 10_000 },
    )
  }
  const useStation = () => {
    setPoint({ name: p.station.name, lat: p.station.lat, lon: p.station.lon })
    setDraft({ lat: String(p.station.lat), lon: String(p.station.lon) })
    setGeoMsg('')
  }

  // Agrupadas por día local
  const days: { label: string; items: typeof shown }[] = []
  for (const r of shown) {
    const label = localDay.format(r.o.t)
    if (days[days.length - 1]?.label !== label) days.push({ label, items: [] })
    days[days.length - 1].items.push(r)
  }
  const links = dataLinks(point.lat, point.lon)
  const when = (t: number) => shortWhen.format(t)

  return (
    <div className="img-tab">
      <p className="lead">
        When the free Earth observation satellites can image a place over the next {DAYS} days, and whether clouds are likely to spoil the
        picture. Their images are free to download.
      </p>

      <h3 className="block-title">Place</h3>
      <p className="img-place">
        <strong>{point.name}</strong> {latStr(point.lat, 4)}, {lonStr(point.lon, 4)}
      </p>
      <div className="form-grid">
        <label>
          <span className="lbl-text">Latitude</span>
          <input inputMode="decimal" value={draft.lat} onChange={(e) => setDraft({ ...draft, lat: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && apply()} />
        </label>
        <label>
          <span className="lbl-text">Longitude</span>
          <input inputMode="decimal" value={draft.lon} onChange={(e) => setDraft({ ...draft, lon: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && apply()} />
        </label>
      </div>
      <div className="btn-row">
        <button className="btn small primary" onClick={apply}>
          Use these coordinates
        </button>
        <button className="btn small" onClick={useHere}>
          Use my location
        </button>
        <button className="btn small ghost" onClick={useStation}>
          Use the ground station
        </button>
      </div>
      {geoMsg && <p className="block-note">{geoMsg}</p>}

      <h3 className="block-title">Satellites</h3>
      <div className="choice-list img-missions" role="group" aria-label="Missions">
        {MISSIONS.map((m) => {
          const on = missions.includes(m.id)
          return (
            <button
              key={m.id}
              className="choice"
              role="checkbox"
              aria-checked={on}
              onClick={() => setMissions(on ? missions.filter((x) => x !== m.id) : [...missions, m.id])}
            >
              <span className="choice-title">
                <i className="img-dot" style={{ background: IMAGERS.find((x) => x.mission === m.id)!.color }} /> {m.label}
              </span>
              <span className="choice-desc">{m.desc}</span>
            </button>
          )
        })}
      </div>
      {missing.length > 0 && <p className="block-note">Not in the current catalog: {missing.map((m) => m.name).join(', ')}.</p>}

      <h3 className="block-title">Next images</h3>
      {run.kind !== 'done' ? (
        <p className="block-note" role="status">
          Propagating {available.length} satellites over {DAYS} days…
        </p>
      ) : (
        <table className="data">
          <tbody>
            <Row
              label="Next clear optical image (≤ 30 m)"
              value={nextClear ? when(nextClear.o.t) : clouds.state === 'ok' ? 'None forecast' : '—'}
              tone={nextClear ? 'good' : undefined}
              explain={{
                text: nextClear ? (
                  <>
                    {nextClear.im.name}, forecast {fx(nextClear.cloud ?? 0, 0)} % cloud cover.
                  </>
                ) : (
                  <>No pass with a forecast below 25 % cloud cover. The forecast only reaches about 16 days and is unreliable after 5.</>
                ),
              }}
            />
            <Row label="Next optical pass, any weather" value={nextAny ? when(nextAny.o.t) : '—'} explain={nextAny ? { text: <>{nextAny.im.name}</> } : undefined} />
            {missions.includes('sentinel1') && (
              <Row
                label="Next radar image"
                value={nextRadar ? when(nextRadar.o.t) : '—'}
                explain={{ text: <>Radar works through clouds and at night{nextRadar ? `: ${nextRadar.im.name}` : ''}.</> }}
              />
            )}
            <Row label={`Opportunities in ${DAYS} days`} value={String(rows.length)} />
          </tbody>
        </table>
      )}
      <p className="block-note">Times are in your device’s time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).</p>
      <p className="block-note">
        {clouds.state === 'loading'
          ? 'Loading the cloud forecast…'
          : clouds.state === 'error'
            ? 'The cloud forecast could not be loaded, so optical passes show no weather.'
            : (
              <>
                Cloud forecast by{' '}
                <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
                  Open-Meteo
                </a>
                , total cloud cover at the time of the pass.
              </>
            )}
      </p>

      {run.kind === 'done' && rows.length > 0 && (
        <>
          <div className="block-title-row">
            <h3 className="block-title">All passes</h3>
            <label className="img-only">
              <input type="checkbox" checked={onlyClear} onChange={(e) => setOnlyClear(e.target.checked)} /> Only clear or radar
            </label>
          </div>
          {days.map((d) => (
            <section key={d.label} className="img-day">
              <h4 className="img-day-title">{d.label}</h4>
              <ul className="img-list">
                {d.items.map(({ o, im, cloud, verdict }) => (
                  <li key={`${o.imager}-${o.t}`}>
                    <button className="img-pass" onClick={() => p.onShowAt(im.norad, o.t)} title="Show this pass on the globe">
                      <span className="img-time">
                        {localTime.format(o.t)}
                        <span className="img-utc">{utcTime.format(o.t)} UTC</span>
                      </span>
                      <span className="img-sat">
                        <i className="img-dot" style={{ background: im.color }} />
                        {im.name}
                        <span className="img-sub">
                          {im.sensor}, {im.resM} m · {o.ascending ? 'ascending' : 'descending'} · {fx(o.crossKm, 0)} km {o.side > 0 ? 'east' : 'west'} of track, {fx(o.offNadir, 1)}° off nadir
                        </span>
                      </span>
                      <span className={`img-verdict v-${verdict}`}>
                        {VERDICT_LABEL[verdict]}
                        {cloud != null && <span className="img-sub">{fx(cloud, 0)} % cloud</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="block-note">Tap a pass to see the satellite over the place on the globe.</p>
        </>
      )}
      {run.kind === 'done' && rows.length === 0 && available.length > 0 && <p className="block-note">No passes over this point in the next {DAYS} days.</p>}

      <Fold title="Getting the images" summary="Free, usually online within a day">
        <p>
          Sentinel images are free on the{' '}
          <a href={links.copernicus} target="_blank" rel="noreferrer">
            Copernicus Browser
          </a>{' '}
          (free account) and Landsat images on{' '}
          <a href={links.earthExplorer} target="_blank" rel="noreferrer">
            USGS EarthExplorer
          </a>
          . Processed images usually appear within hours to a day of the pass.
        </p>
      </Fold>
      <Fold title="What this cannot know" summary="Acquisition plans and forecast limits">
        <ul className="plain-list">
          <li>
            A pass is a chance, not a promise. Sentinel-2 and Landsat image land and coastal waters in daylight; Sentinel-1 follows an observation
            scenario and does not record on every pass. Sentinel-2A runs a reduced plan in its extended campaign. ESA publishes the exact
            acquisition plans.
          </li>
          <li>The swath is taken as centred on the ground track. Sentinel-3 OLCI is tilted to the west, so its eastern edge is narrower.</li>
          <li>Cloud forecasts are good for 2 to 3 days, fair up to 5, and only indicative after that.</li>
          <li>Orbits come from the public catalog and are accurate to a few seconds over these {DAYS} days.</li>
        </ul>
      </Fold>
      {run.kind === 'done' && <p className="block-note">Computed in {fx(run.ms / 1000, 1)} s.</p>}
    </div>
  )
}
