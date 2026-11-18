import { useEffect, useRef, useState } from 'react'
import type { SatRecord } from '../../data/types'
import type { ConjunctionEvent, ConjunctionRequest, ConjunctionResponse } from '../../workers/conjunction.worker'
import { duration, fx } from '../format'
import { Lead, Row, Table } from './Row'
import { Full } from '../detail'

const when = new Intl.DateTimeFormat('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })

interface Props {
  record: SatRecord
  satellites: SatRecord[]
  now: number
  /** Resalta el otro objeto y lleva el reloj al instante del encuentro */
  onFocus: (other: number, tca: number) => void
}

type Run =
  | { kind: 'idle' }
  | { kind: 'running'; done: number; total: number }
  | { kind: 'done'; events: ConjunctionEvent[]; total: number; candidates: number; ms: number; t0: number; hours: number; threshold: number }

export function ConjunctionsTab({ record, satellites, now, onFocus }: Props) {
  const [hours, setHours] = useState(24)
  const [threshold, setThreshold] = useState(10)
  const [run, setRun] = useState<Run>({ kind: 'idle' })
  const [sel, setSel] = useState<number | null>(null)
  const worker = useRef<Worker | null>(null)

  useEffect(() => () => worker.current?.terminate(), [])
  useEffect(() => {
    worker.current?.terminate()
    worker.current = null
    setRun({ kind: 'idle' })
    setSel(null)
  }, [record])

  const target = satellites.indexOf(record)

  const start = () => {
    worker.current?.terminate()
    const w = new Worker(new URL('../../workers/conjunction.worker.ts', import.meta.url), { type: 'module' })
    worker.current = w
    const t0 = now
    setSel(null)
    setRun({ kind: 'running', done: 0, total: 1 })
    w.onmessage = (e: MessageEvent<ConjunctionResponse>) => {
      const m = e.data
      if (m.type === 'progress') setRun({ kind: 'running', done: m.done, total: Math.max(1, m.total) })
      else {
        setRun({ kind: 'done', events: m.events, total: m.total, candidates: m.candidates, ms: m.ms, t0, hours, threshold })
        w.terminate()
        worker.current = null
      }
    }
    const req: ConjunctionRequest = { records: satellites, target, t0, hours, thresholdKm: threshold }
    w.postMessage(req)
  }

  const ev = run.kind === 'done' && sel !== null ? run.events[sel] : null

  return (
    <>
      <Lead short={<>Find every catalogued object that will pass close to this one.</>}>
        Conjunction screening: every catalogued object is propagated with SGP4 alongside this one to find close approaches. Operators run this
        daily and plan an avoidance maneuver when the collision probability exceeds about 1 in 10,000.
      </Lead>

      <section className="block">
        <div className="block-title-row">
          <h3 className="block-title">Screening window</h3>
        </div>
        <div className="block-title-row">
          <span className="block-note" style={{ margin: 0 }}>
            Horizon
          </span>
          <div className="seg" role="radiogroup" aria-label="Screening horizon">
            {[12, 24, 72].map((h) => (
              <button key={h} className="seg-btn" role="radio" aria-checked={hours === h} onClick={() => setHours(h)}>
                {h} h
              </button>
            ))}
          </div>
        </div>
        <div className="block-title-row">
          <span className="block-note" style={{ margin: 0 }}>
            Miss distance below
          </span>
          <div className="seg" role="radiogroup" aria-label="Distance threshold">
            {[5, 10, 25].map((d) => (
              <button key={d} className="seg-btn" role="radio" aria-checked={threshold === d} onClick={() => setThreshold(d)}>
                {d} km
              </button>
            ))}
          </div>
        </div>
        <div className="btn-row">
          <button className="btn primary" onClick={start} disabled={run.kind === 'running'}>
            {run.kind === 'running' ? 'Screening…' : run.kind === 'done' ? 'Screen again' : 'Screen the catalog'}
          </button>
        </div>
        {run.kind === 'running' && (
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={run.total} aria-valuenow={run.done}>
            <span style={{ width: `${(100 * run.done) / run.total}%` }} />
          </div>
        )}
        <Full>
        <p className="block-note">
          A first filter keeps only objects whose radius band, from perigee to apogee, overlaps this one. The rest are swept minute by minute,
          treating relative motion as a straight line within each step, and the time of closest approach (TCA) is refined on the SGP4
          distance.
        </p>
        </Full>
      </section>

      {run.kind === 'done' && (
        <section className="block">
          <h3 className="block-title">
            {run.total === 0
              ? `No approaches below ${run.threshold} km`
              : run.total > run.events.length
                ? `${run.total} approaches below ${run.threshold} km, closest ${run.events.length} shown`
                : `${run.total} approach${run.total > 1 ? 'es' : ''} below ${run.threshold} km`}
          </h3>
          <p className="block-note" style={{ marginTop: 0 }}>
            {run.candidates.toLocaleString('en-US')} objects passed the apsis filter; screened over {run.hours} h in {fx(run.ms / 1000, 1)} s.
          </p>
          {run.events.length > 0 && (
            <ul className="pass-list">
              {run.events.map((e, k) => (
                <li key={`${e.other}-${e.tca}`}>
                  <button className="conj" aria-pressed={k === sel} onClick={() => setSel(k)}>
                    <span className="conj-name">{satellites[e.other].OBJECT_NAME}</span>
                    <span className="conj-miss">{fx(e.missKm, e.missKm < 1 ? 3 : 2)} km</span>
                    <span className="conj-time">{when.format(e.tca)}</span>
                    <span className="conj-speed">{fx(e.relSpeed, 2)} km/s</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {ev && (
        <>
          <Table caption={`Encounter with ${satellites[ev.other].OBJECT_NAME}`}>
            <Row label="Time of closest approach" value={when.format(ev.tca)} unit={ev.tca > now ? `in ${duration(ev.tca - now).slice(1)}` : 'past'} />
            <Row
              label="Miss distance"
              value={fx(ev.missKm * 1000, 0)}
              unit="m"
              tone={ev.missKm < 1 ? 'warn' : 'caution'}
              explain={{
                text: (
                  <>
                    Distance between the two centers of mass at TCA, from SGP4 elements. With typical element errors of 1 km or more, a single number
                    is not enough: operators combine both position covariances into a collision probability P<sub>c</sub>.
                  </>
                ),
                tex: 'd_{\\min} = \\min_t\\ |\\vec r_2(t) - \\vec r_1(t)|',
              }}
            />
            <Row
              label="Relative speed"
              value={fx(ev.relSpeed, 3)}
              unit="km/s"
              explain={{
                text: (
                  <>
                    Neighbours in the same orbital shell drift past each other slowly; objects in crossing planes meet at up to 15 km/s, almost
                    head-on. At those speeds a 1 cm fragment carries the energy of a hand grenade.
                  </>
                ),
              }}
            />
            <Row
              label="Radial component"
              value={fx(ev.radial, 3)}
              unit="km"
              explain={{
                text: (
                  <>
                    The miss vector in the RIC frame of this object: radial (away from Earth), in-track (along the velocity) and cross-track (normal
                    to the orbital plane). Radial separation is the most reliable, because along-track position carries the largest SGP4 error.
                  </>
                ),
                tex: '\\hat R = \\frac{\\vec r}{|\\vec r|},\\quad \\hat C = \\frac{\\vec r\\times\\vec v}{|\\vec r\\times\\vec v|},\\quad \\hat I = \\hat C\\times\\hat R',
              }}
            />
            <Row label="In-track component" value={fx(ev.inTrack, 3)} unit="km" />
            <Row label="Cross-track component" value={fx(ev.crossTrack, 3)} unit="km" />
          </Table>
          <div className="btn-row">
            <button className="btn primary" onClick={() => onFocus(ev.other, ev.tca)}>
              Show encounter on the globe
            </button>
          </div>
          <p className="block-note">
            The other object is highlighted in blue and the clock jumps to one minute before TCA. Use ×1 to watch both converge.
          </p>
        </>
      )}
    </>
  )
}
