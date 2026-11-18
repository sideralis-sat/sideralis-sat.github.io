import { useEffect, useMemo, useRef, useState } from 'react'
import type { SatRecord } from '../../data/types'
import { fovDeg, radecToEciOfDate, SENSORS, TARGETS } from '../../lib/astroPhoto'
import { eciToEnu, sunElevationAt, topocentric } from '../../lib/sky'
import { gmstAt } from '../../lib/astro'
import type { Station } from '../../lib/passes'
import type { Crossing, TrailRequest, TrailResponse } from '../../workers/trails.worker'
import { Row } from '../dossier/Row'
import { Fold } from '../detail'
import { fx } from '../format'

export interface AstroFrame {
  ra: number
  dec: number
  w: number
  h: number
  label: string
}

interface Props {
  satellites: SatRecord[]
  station: Station
  now: number
  onFrame: (f: AstroFrame | null) => void
  onSelect: (i: number) => void
}

const hm = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })
const hms = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

/** Elevación (grados) de unas coordenadas J2000 vistas desde la estación */
function targetElevation(ra: number, dec: number, st: Station, t: number) {
  const u = radecToEciOfDate(ra, dec, t)
  const g = gmstAt(t)
  const enu = [0, 0, 0]
  const far = 1e9
  eciToEnu(u[0] * far, u[1] * far, u[2] * far, Math.cos(g), Math.sin(g), topocentric(st), enu)
  return Math.asin(enu[2] / Math.hypot(enu[0], enu[1], enu[2])) * (180 / Math.PI)
}

/** Próxima noche astronómica (Sol por debajo de −18°; −12° si no llega a anochecer del todo) */
function nextNight(st: Station, from: number) {
  const topo = topocentric(st)
  const el = (t: number) => sunElevationAt(topo, t).el
  for (const limit of [-18, -12]) {
    let start = -1
    for (let t = from; t < from + 36 * 3_600_000; t += 5 * 60_000) {
      const dark = el(t) < limit
      if (dark && start < 0) start = t
      if (!dark && start >= 0) return { start, end: t, limit }
    }
    if (start >= 0) return { start, end: from + 36 * 3_600_000, limit }
  }
  return null
}

/** Predicción de trazas de satélites en una foto del cielo profundo */
export function AstroPanel(p: Props) {
  const [targetId, setTargetId] = useState('m31')
  const [ra, setRa] = useState(10.6846)
  const [dec, setDec] = useState(41.2692)
  const [sensorId, setSensorId] = useState('ff')
  const [focal, setFocal] = useState(200)
  const [hours, setHours] = useState<number | 'night'>(4)
  const [expo, setExpo] = useState(120)
  const [run, setRun] = useState<{ kind: 'idle' } | { kind: 'running'; done: number; total: number } | { kind: 'done'; crossings: Crossing[]; ms: number; t0: number; t1: number }>({ kind: 'idle' })
  const worker = useRef<Worker | null>(null)

  const target = TARGETS.find((t) => t.id === targetId)
  const tRa = target?.ra ?? ra
  const tDec = target?.dec ?? dec
  const sensor = SENSORS.find((s) => s.id === sensorId)!
  const w = fovDeg(sensor.w, focal)
  const h = fovDeg(sensor.h, focal)
  const label = target?.label ?? `α ${fx(tRa / 15, 2)} h, δ ${fx(tDec, 1)}°`

  useEffect(() => {
    p.onFrame({ ra: tRa, dec: tDec, w, h, label })
  }, [tRa, tDec, w, h, label]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => p.onFrame(null), []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => worker.current?.terminate(), [])

  const night = useMemo(() => nextNight(p.station, p.now), [p.station, Math.floor(p.now / 3_600_000)]) // eslint-disable-line react-hooks/exhaustive-deps
  const session = useMemo(() => {
    if (!night) return null
    const start = Math.max(night.start, p.now)
    const end = hours === 'night' ? night.end : Math.min(night.end, start + hours * 3_600_000)
    return { start, end }
  }, [night, hours, p.now])

  const altCurve = useMemo(() => {
    if (!session) return []
    const out: { t: number; el: number }[] = []
    for (let t = session.start; t <= session.end; t += 10 * 60_000) out.push({ t, el: targetElevation(tRa, tDec, p.station, t) })
    return out
  }, [session, tRa, tDec, p.station])
  const elNow = targetElevation(tRa, tDec, p.station, p.now)

  const start = () => {
    if (!session) return
    worker.current?.terminate()
    const wk = new Worker(new URL('../../workers/trails.worker.ts', import.meta.url), { type: 'module' })
    worker.current = wk
    setRun({ kind: 'running', done: 0, total: 1 })
    wk.onmessage = (e: MessageEvent<TrailResponse>) => {
      const m = e.data
      if (m.type === 'progress') setRun({ kind: 'running', done: m.done, total: Math.max(1, m.total) })
      else {
        setRun({ kind: 'done', crossings: m.crossings, ms: m.ms, t0: session.start, t1: session.end })
        wk.terminate()
        worker.current = null
      }
    }
    const req: TrailRequest = { records: p.satellites, station: p.station, ra: tRa, dec: tDec, wDeg: w, hDeg: h, t0: session.start, t1: session.end }
    wk.postMessage(req)
  }

  // Exposiciones: la sesión se parte en tomas de `expo` segundos; una toma se pierde si la cruza un satélite iluminado
  const result = useMemo(() => {
    if (run.kind !== 'done') return null
    const lit = run.crossings.filter((c) => c.sunlit)
    const n = Math.max(1, Math.floor((run.t1 - run.t0) / (expo * 1000)))
    const hit = new Array(n).fill(false)
    for (const c of lit) {
      const a = Math.floor((c.start - run.t0) / (expo * 1000))
      const b = Math.floor((c.end - run.t0) / (expo * 1000))
      for (let k = Math.max(0, a); k <= Math.min(n - 1, b); k++) hit[k] = true
    }
    // Ventana limpia más larga con el objetivo por encima de 20°
    let best = { start: 0, len: 0 }
    let cur = { start: 0, len: 0 }
    for (let k = 0; k < n; k++) {
      const t = run.t0 + (k + 0.5) * expo * 1000
      const ok = !hit[k] && targetElevation(tRa, tDec, p.station, t) > 20
      if (ok) {
        if (!cur.len) cur = { start: k, len: 0 }
        cur.len++
        if (cur.len > best.len) best = { ...cur }
      } else cur = { start: 0, len: 0 }
    }
    return { lit, shadow: run.crossings.length - lit.length, n, hit, lost: hit.filter(Boolean).length, best }
  }, [run, expo, tRa, tDec, p.station])

  const W = 340
  const sx = (t: number) => (run.kind === 'done' ? ((t - run.t0) / (run.t1 - run.t0)) * W : 0)

  return (
    <section className="block">
      <h3 className="block-title">Satellite trails in your photo</h3>
      <p className="block-note" style={{ marginTop: 0 }}>
        Pick what you will photograph and with which lens. Every catalogued satellite is propagated through the session to find the ones that cross
        your frame. Only sunlit satellites leave a trail.
      </p>

      <label className="select-row">
        Target
        <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
          {TARGETS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
          <option value="custom">Custom coordinates</option>
        </select>
      </label>
      {!target && (
        <div className="form-grid">
          <label>
            Right ascension <span className="unit">hours</span>
            <input type="number" min={0} max={24} step={0.01} value={fx(ra / 15, 4)} onChange={(e) => setRa(Number(e.target.value) * 15)} />
          </label>
          <label>
            Declination <span className="unit">°</span>
            <input type="number" min={-90} max={90} step={0.01} value={dec} onChange={(e) => setDec(Number(e.target.value))} />
          </label>
        </div>
      )}
      <label className="select-row">
        Sensor
        <select value={sensorId} onChange={(e) => setSensorId(e.target.value)}>
          {SENSORS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <div className="form-grid">
        <label>
          Focal length <span className="unit">mm</span>
          <input type="number" min={8} max={4000} step={5} value={focal} onChange={(e) => setFocal(Math.max(8, Number(e.target.value)))} />
        </label>
        <div className="form-out">
          <span className="form-out-label">
            Field of view <span className="unit">degrees</span>
          </span>
          <output className="form-out-value">
            {fx(w, w < 5 ? 2 : 1)} × {fx(h, h < 5 ? 2 : 1)}
          </output>
        </div>
      </div>
      <div className="block-title-row" style={{ marginTop: 12 }}>
        <span className="block-note" style={{ margin: 0 }}>
          Session
        </span>
        <div className="seg" role="radiogroup" aria-label="Session length">
          {([2, 4, 'night'] as const).map((v) => (
            <button key={v} className="seg-btn text" role="radio" aria-checked={hours === v} onClick={() => setHours(v)}>
              {v === 'night' ? 'Whole night' : `${v} h`}
            </button>
          ))}
        </div>
      </div>
      <div className="block-title-row">
        <span className="block-note" style={{ margin: 0 }}>
          Sub-exposure
        </span>
        <div className="seg" role="radiogroup" aria-label="Exposure length">
          {[30, 120, 300].map((v) => (
            <button key={v} className="seg-btn text" role="radio" aria-checked={expo === v} onClick={() => setExpo(v)}>
              {v < 60 ? `${v} s` : `${v / 60} min`}
            </button>
          ))}
        </div>
      </div>

      <table className="data">
        <tbody>
          <Row label="Target elevation now" value={fx(elNow, 0)} unit="°" tone={elNow < 20 ? 'caution' : undefined} />
          <Row
            label="Dark sky window"
            value={night ? `${hm.format(night.start)} to ${hm.format(night.end)}` : 'none in the next day'}
            unit={night && night.limit === -12 ? 'nautical' : ''}
            explain={{ text: <>From astronomical dusk to dawn, with the Sun more than 18° below the horizon. In summer at high latitude it never gets that dark and nautical twilight (−12°) is used.</> }}
          />
          {session && <Row label="Session" value={`${hm.format(session.start)} to ${hm.format(session.end)}`} />}
        </tbody>
      </table>

      <div className="btn-row">
        <button className="btn primary" onClick={start} disabled={!session || run.kind === 'running'}>
          {run.kind === 'running' ? 'Propagating…' : run.kind === 'done' ? 'Predict again' : 'Predict trails'}
        </button>
      </div>
      {run.kind === 'running' && (
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={run.total} aria-valuenow={run.done}>
          <span style={{ width: `${(100 * run.done) / run.total}%` }} />
        </div>
      )}

      {run.kind === 'done' && result && (
        <>
          <table className="data">
            <tbody>
              <Row label="Trails (sunlit crossings)" value={String(result.lit.length)} tone={result.lit.length ? 'caution' : 'good'} />
              <Row label="Crossings in shadow (no trail)" value={String(result.shadow)} />
              <Row
                label={`Sub-exposures lost (${expo < 60 ? `${expo} s` : `${expo / 60} min`})`}
                value={`${result.lost} of ${result.n}`}
                unit={`${fx((100 * result.lost) / result.n, 0)} %`}
                explain={{ text: <>Longer sub-exposures lose more time to each trail. Stacking software can reject trails, but only if enough frames are clean at each pixel.</> }}
              />
              <Row
                label="Longest clean stretch"
                value={result.best.len ? `${hm.format(run.t0 + result.best.start * expo * 1000)}, ${fx((result.best.len * expo) / 60, 0)} min` : '—'}
                tone="active"
              />
            </tbody>
          </table>

          <figure className="chart">
            <svg viewBox={`0 0 ${W} 74`} role="img" aria-label="Session timeline with satellite trails">
              <rect x={0.5} y={10} width={W - 1} height={34} className="astro-band" />
              {altCurve.length > 1 &&
                altCurve.slice(1).map((pt, k) =>
                  pt.el < 20 ? <rect key={k} x={sx(altCurve[k].t)} width={Math.max(0, sx(pt.t) - sx(altCurve[k].t))} y={10} height={34} className="astro-low" /> : null,
                )}
              {result.hit.map((hh, k) => (hh ? <rect key={`h${k}`} x={(k / result.n) * W} width={W / result.n} y={10} height={34} className="astro-hit" /> : null))}
              {/* Cruces en sombra: marcas cortas bajo la banda; las trazas reales la atraviesan */}
              {run.crossings.map((c, k) =>
                c.sunlit ? null : <line key={`d${k}`} x1={sx(c.start)} x2={sx(c.start)} y1={47} y2={53} className="astro-dark" />,
              )}
              {run.crossings.map((c, k) => (c.sunlit ? <line key={k} x1={sx(c.start)} x2={sx(c.start)} y1={6} y2={48} className="astro-lit" /> : null))}
              <text x={0} y={66} className="chart-tick">
                {hm.format(run.t0)}
              </text>
              <text x={W} y={66} className="chart-tick" textAnchor="end">
                {hm.format(run.t1)}
              </text>
            </svg>
            <figcaption className="chart-readout">
              <span className="legend">
                <span>
                  <i className="astro-lit-key" /> trail
                </span>
                <span>
                  <i className="astro-hit-key" /> lost sub-exposure
                </span>
                <span>
                  <i className="astro-low-key" /> target below 20°
                </span>
                <span>
                  <i className="astro-dark-key" /> crossing in shadow
                </span>
              </span>
            </figcaption>
          </figure>

          {result.lit.length > 0 && (
            <Fold title="Trails, one by one" summary={`${result.lit.length} satellites`}>
              <ul className="sky-list">
                {result.lit.map((c, k) => (
                  <li key={k}>
                    <button className="sky-item" onClick={() => p.onSelect(c.i)}>
                      <span className="dot" style={{ background: '#ffc21a' }} />
                      <span className="sky-item-name">{p.satellites[c.i].OBJECT_NAME}</span>
                      <span className="sky-item-meta">
                        {hms.format(c.start)}, {fx((c.end - c.start) / 1000, 0)} s in frame
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Fold>
          )}
          <p className="block-note">
            Right after dusk and before dawn even low satellites are sunlit; around midnight only high ones are. Narrow fields and targets far
            from the Sun’s side of the sky collect fewer trails. Screened in {fx(run.ms / 1000, 1)} s.
          </p>
        </>
      )}
    </section>
  )
}
