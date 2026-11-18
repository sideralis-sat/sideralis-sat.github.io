import { useEffect, useState } from 'react'
import type { SatRecord } from '../../data/types'
import { bcFromBstar } from '../../lib/atmosphere'
import { meanElements } from '../../lib/astrodynamics'
import { compareWithSgp4, type Divergence } from '../../lib/propagators'
import { LineChart } from '../charts/LineChart'
import { duration, fx } from '../format'
import { Row } from './Row'

const TWO_BODY = '#c2410c'
const J2_ONLY = '#0f766e'

/** Divergencia entre SGP4 y una integración numérica con distintos modelos de fuerzas */
export function PropagatorCompare({ record, now }: { record: SatRecord; now: number }) {
  const [days, setDays] = useState(3)
  const [res, setRes] = useState<Divergence[] | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => setRes(null), [record])
  const mean = meanElements(record)
  const bc = bcFromBstar(mean.bstar) ?? 100
  const age = now - mean.epoch

  const run = () => {
    setBusy(true)
    setTimeout(() => {
      setRes(compareWithSgp4(record, now, days, bc, days > 3 ? 40 : 20))
      setBusy(false)
    }, 20)
  }
  const last = res?.[res.length - 1]
  const at1 = res?.find((d) => d.t >= 1)

  return (
    <section className="block">
      <h3 className="block-title">SGP4 against numerical integration</h3>
      <p className="block-note" style={{ marginTop: 0 }}>
        The same initial state, propagated two ways: SGP4, the analytical theory behind the catalog, and a Runge-Kutta integration of
        Newton’s equations with growing force models. The gap shows what each perturbation is worth.
      </p>
      <div className="block-title-row" style={{ marginTop: 10 }}>
        <div className="seg" role="radiogroup" aria-label="Comparison span">
          {[1, 3, 7].map((d) => (
            <button key={d} className="seg-btn" role="radio" aria-checked={days === d} onClick={() => setDays(d)}>
              {d} d
            </button>
          ))}
        </div>
        <button className="btn small primary" onClick={run} disabled={busy}>
          {busy ? 'Integrating…' : res ? 'Run again' : 'Run comparison'}
        </button>
      </div>
      {res && last && (
        <>
          <LineChart
            data={res.map((d) => ({ x: d.t, y: d.j2drag }))}
            extra={[
              { data: res.map((d) => ({ x: d.t, y: d.twobody })), color: TWO_BODY, label: 'two-body', dashed: true },
              { data: res.map((d) => ({ x: d.t, y: d.j2 })), color: J2_ONLY, label: 'J2' },
            ]}
            label="Position difference from SGP4, J2 and drag model"
            formatX={(x) => `${fx(x, 1)} d`}
            formatY={(y) => fx(y, 0)}
            yUnit="km"
            height={170}
          />
          <p className="legend">
            <span>
              <i style={{ background: TWO_BODY }} /> two-body
            </span>
            <span>
              <i style={{ background: J2_ONLY }} /> + J2
            </span>
            <span>
              <i style={{ background: 'var(--plot)' }} /> + J2 + drag
            </span>
          </p>
          <LineChart
            data={res.map((d) => ({ x: d.t, y: d.inTrack }))}
            extra={[
              { data: res.map((d) => ({ x: d.t, y: d.radial })), color: TWO_BODY, label: 'radial' },
              { data: res.map((d) => ({ x: d.t, y: d.crossTrack })), color: J2_ONLY, label: 'cross-track' },
            ]}
            label="J2 and drag difference in the RIC frame (in-track shown)"
            formatX={(x) => `${fx(x, 1)} d`}
            formatY={(y) => fx(y, 1)}
            yUnit="km in-track"
            height={150}
          />
          <p className="legend">
            <span>
              <i style={{ background: 'var(--plot)' }} /> in-track
            </span>
            <span>
              <i style={{ background: TWO_BODY }} /> radial
            </span>
            <span>
              <i style={{ background: J2_ONLY }} /> cross-track
            </span>
          </p>
          <table className="data">
            <tbody>
              <Row
                label={`Two-body after ${fx(last.t, 0)} d`}
                value={fx(last.twobody, 0)}
                unit="km"
                explain={{
                  text: (
                    <>
                      Without the equatorial bulge the orbital plane does not precess and the mean motion is slightly wrong, so the error grows by
                      hundreds of kilometers a day. Keplerian orbits are only a first approximation.
                    </>
                  ),
                  tex: '\\ddot{\\vec r} = -\\frac{\\mu}{r^3}\\vec r',
                }}
              />
              <Row
                label={`With J2 after ${fx(last.t, 0)} d`}
                value={fx(last.j2, 1)}
                unit="km"
                explain={{
                  text: <>Adding J2 removes most of the gap. What remains comes from higher harmonics (J3, J4), drag and the different treatment of short-period terms.</>,
                  tex: '\\vec a_{J2} = -\\frac{3}{2}\\frac{J_2\\,\\mu R_\\oplus^2}{r^5}\\left[x\\left(1-\\frac{5z^2}{r^2}\\right),\\ y\\left(1-\\frac{5z^2}{r^2}\\right),\\ z\\left(3-\\frac{5z^2}{r^2}\\right)\\right]',
                }}
              />
              <Row label={`With J2 and drag after ${fx(last.t, 0)} d`} value={fx(last.j2drag, 1)} unit="km" tone="active" />
              {at1 && <Row label="With J2 and drag after 1 d" value={fx(at1.j2drag, 1)} unit="km" />}
            </tbody>
          </table>
          <p className="block-note">
            The difference is mostly in-track: a tiny error in the semi-major axis changes the period, and the timing error accumulates every
            revolution. Against precise ephemerides, SGP4 is accurate to about 1 km at epoch and drifts by 1–3 km per day in LEO. These elements
            are {duration(age).slice(1)} old.
          </p>
        </>
      )}
    </section>
  )
}
