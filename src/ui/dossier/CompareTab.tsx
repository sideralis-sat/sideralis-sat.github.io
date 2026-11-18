import { useMemo, useState, type ReactNode } from 'react'
import { CONSTELLATIONS, CONSTELLATION_INDEX, OTHER_INDEX } from '../../data/constellations'
import type { SatRecord } from '../../data/types'
import { meanElements, type Telemetry } from '../../lib/astrodynamics'
import type { SimClock } from '../../lib/clock'
import { ORBIT_CLASSES, orbitElements } from '../../lib/orbit'
import { eclipseAnalytic } from '../../lib/power'
import { duration, fx } from '../format'
import { useTelemetry } from './hooks'
import { Lead } from './Row'
import { useDetail } from '../detail'

interface Props {
  t: Telemetry
  record: SatRecord
  satellites: SatRecord[]
  compare: number | null
  onCompare: (i: number | null) => void
  clock: SimClock
  now: number
}

const DEG = 180 / Math.PI

function Picker({ satellites, exclude, onPick }: { satellites: SatRecord[]; exclude: SatRecord; onPick: (i: number) => void }) {
  const [q, setQ] = useState('')
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (s.length < 2) return []
    const out: number[] = []
    for (let i = 0; i < satellites.length && out.length < 8; i++) {
      const r = satellites[i]
      if (r === exclude) continue
      if (String(r.OBJECT_NAME).toLowerCase().includes(s) || String(r.NORAD_CAT_ID) === s) out.push(i)
    }
    return out
  }, [q, satellites, exclude])
  return (
    <div className="cmp-picker">
      <label className="select-row" style={{ marginTop: 0 }}>
        Compare with
        <input className="cmp-input" type="search" placeholder="Name or NORAD ID" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </label>
      {hits.length > 0 && (
        <ul className="sky-list">
          {hits.map((i) => (
            <li key={i}>
              <button className="sky-item" onClick={() => onPick(i)}>
                <span className="dot" style={{ background: CONSTELLATIONS[CONSTELLATION_INDEX.get(satellites[i].GROUP) ?? OTHER_INDEX].color }} />
                <span className="sky-item-name">{satellites[i].OBJECT_NAME}</span>
                <span className="sky-item-meta">{satellites[i].NORAD_CAT_ID}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="btn-row">
        {['ISS (ZARYA)', 'CSS (TIANHE)', 'HUBBLE', 'NOAA 20', 'GPS BIII'].map((n) => {
          const i = satellites.findIndex((r) => String(r.OBJECT_NAME).startsWith(n) && r !== exclude)
          return i >= 0 ? (
            <button key={n} className="btn small" onClick={() => onPick(i)}>
              {String(satellites[i].OBJECT_NAME)}
            </button>
          ) : null
        })}
      </div>
    </div>
  )
}

/** Comparación lado a lado con un segundo objeto, que se dibuja en azul en el globo */
export function CompareTab({ t, record, satellites, compare, onCompare, clock, now }: Props) {
  const other = compare !== null ? satellites[compare] : null
  const tb = useTelemetry(other ?? record, clock, 500)
  const detail = useDetail()

  if (!other || !tb) {
    return (
      <>
        <Lead>Pick a second object to compare orbits side by side. It is drawn in blue on the globe, next to this one in yellow.</Lead>
        <Picker satellites={satellites} exclude={record} onPick={onCompare} />
      </>
    )
  }

  const ma = meanElements(record)
  const mb = meanElements(other)
  const rows: [ReactNode, string, string, string?][] = []
  // En la vista esencial solo las filas marcadas como clave
  const both = (label: ReactNode, a: string, b: string, unit?: string, key = false) => {
    if (key || detail === 'full') rows.push([label, a, b, unit])
  }
  const ecl = (m: typeof ma, tt: Telemetry) => eclipseAnalytic((m.apogeeAlt + m.perigeeAlt) / 2, tt.betaDeg).fraction * m.periodMin
  both('Orbital regime', orbitElements(record).orbitClass, orbitElements(other).orbitClass, undefined, true)
  both('Altitude now', fx(t.altKm, 0), fx(tb.altKm, 0), 'km', true)
  both('Inertial velocity', fx(t.vMag, 3), fx(tb.vMag, 3), 'km/s')
  both('Period', fx(ma.periodMin, 1), fx(mb.periodMin, 1), 'min', true)
  both('Semi-major axis', fx(ma.a, 0), fx(mb.a, 0), 'km')
  both('Eccentricity', fx(ma.e, 5), fx(mb.e, 5))
  both('Inclination', fx(ma.i, 2), fx(mb.i, 2), '°', true)
  both('Perigee altitude', fx(ma.perigeeAlt, 0), fx(mb.perigeeAlt, 0), 'km')
  both('Apogee altitude', fx(ma.apogeeAlt, 0), fx(mb.apogeeAlt, 0), 'km')
  both('Nodal drift dΩ/dt', fx(ma.raanDot, 3), fx(mb.raanDot, 3), '°/day')
  both('Sun-synchronous', ma.sunSynchronous ? 'Yes' : 'No', mb.sunSynchronous ? 'Yes' : 'No', undefined, true)
  both('β angle', fx(t.betaDeg, 1), fx(tb.betaDeg, 1), '°')
  both('Eclipse per orbit', fx(ecl(ma, t), 1), fx(ecl(mb, tb), 1), 'min', true)
  both('Element age', duration(now - ma.epoch).slice(1), duration(now - mb.epoch).slice(1))

  // Geometría relativa
  const d = Math.hypot(tb.r.x - t.r.x, tb.r.y - t.r.y, tb.r.z - t.r.z)
  const dv = Math.hypot(tb.v.x - t.v.x, tb.v.y - t.v.y, tb.v.z - t.v.z)
  const ha = t.osc.hVec
  const hb = tb.osc.hVec
  const cosAng = (ha.x * hb.x + ha.y * hb.y + ha.z * hb.z) / (t.osc.h * tb.osc.h)
  const planeAngle = Math.acos(Math.max(-1, Math.min(1, cosAng))) * DEG
  const synodic = 1 / Math.abs(1 / ma.periodMin - 1 / mb.periodMin)

  return (
    <>
      <div className="cmp-head">
        <p>
          <span className="cmp-swatch" style={{ background: '#ffc21a' }} /> <strong>{record.OBJECT_NAME}</strong>
        </p>
        <p>
          <span className="cmp-swatch" style={{ background: '#5b9dff' }} /> <strong>{other.OBJECT_NAME}</strong>
        </p>
        <div className="btn-row" style={{ marginTop: 4 }}>
          <button className="btn small" onClick={() => onCompare(null)}>
            Change
          </button>
        </div>
      </div>

      <section className="block">
        <table className="data cmp">
          <thead>
            <tr>
              <th />
              <th>
                <span className="cmp-swatch" style={{ background: '#ffc21a' }} />
              </th>
              <th>
                <span className="cmp-swatch" style={{ background: '#5b9dff' }} />
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, a, b, unit], k) => (
              <tr key={k}>
                <th scope="row">{label}</th>
                <td>{a}</td>
                <td>{b}</td>
                <td className="unit">{unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="block">
        <h3 className="block-title">Relative geometry</h3>
        <table className="data cmp">
          <tbody>
            <tr>
              <th scope="row">Distance now</th>
              <td colSpan={2}>{fx(d, 0)}</td>
              <td className="unit">km</td>
            </tr>
            <tr>
              <th scope="row">Relative velocity</th>
              <td colSpan={2}>{fx(dv, 3)}</td>
              <td className="unit">km/s</td>
            </tr>
            <tr>
              <th scope="row">Angle between orbital planes</th>
              <td colSpan={2}>{fx(planeAngle, 2)}</td>
              <td className="unit">°</td>
            </tr>
            <tr>
              <th scope="row">Synodic period</th>
              <td colSpan={2}>{Number.isFinite(synodic) && synodic < 1e7 ? duration(synodic * 60_000).slice(1) : '—'}</td>
              <td className="unit" />
            </tr>
          </tbody>
        </table>
        <p className="block-note">
          The angle between orbital planes, from the angular momentum vectors (cos θ = ĥ₁·ĥ₂), sets how much Δv a transfer from one plane to the
          other costs. The synodic period, 1/|1/T₁ − 1/T₂|, is how long the faster object takes to lap the slower one: the rhythm of phasing
          for rendezvous.
        </p>
      </section>
    </>
  )
}

export const regimeLabel = (r: SatRecord) => ORBIT_CLASSES.find((o) => o.id === orbitElements(r).orbitClass)!.label
