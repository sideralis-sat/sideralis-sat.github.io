import { useMemo, useState } from 'react'
import { CONSTELLATIONS } from '../../data/constellations'
import type { SatRecord } from '../../data/types'
import { meanElements } from '../../lib/astrodynamics'
import { findShells, membersAt } from '../../lib/constellationGeometry'
import { ScatterCanvas, type ScatterPoint } from '../charts/ScatterCanvas'
import { Row } from '../dossier/Row'
import { fx } from '../format'
import { CloseIcon } from '../icons'
import { useSimNow } from '../dossier/hooks'
import type { SimClock } from '../../lib/clock'

type Tab = 'gabbard' | 'geometry'

interface Props {
  open: boolean
  onClose: () => void
  satellites: SatRecord[]
  groupIndex: Uint8Array
  groupCounts: number[]
  clock: SimClock
  selected: number | null
  onSelect: (i: number) => void
}

const APOGEE = '#1748c4'
const PERIGEE = '#c2410c'

/** Panel de análisis del catálogo: diagrama de Gabbard y geometría de constelaciones */
export function AnalysisDrawer(p: Props) {
  const [tab, setTab] = useState<Tab>('gabbard')
  const available = CONSTELLATIONS.map((c, k) => ({ ...c, k, count: p.groupCounts[k] })).filter((c) => c.count > 0)
  const defaultGabbard = available.find((c) => c.id === 'debris') ?? available.find((c) => c.id === 'starlink') ?? available[0]
  const defaultGeo = available.find((c) => c.id === 'starlink') ?? available[0]
  const [gGroup, setGGroup] = useState(defaultGabbard?.k ?? 0)
  const [cGroup, setCGroup] = useState(defaultGeo?.k ?? 0)
  const [shellIdx, setShellIdx] = useState(0)

  const indicesOf = (k: number) => {
    const out: number[] = []
    for (let i = 0; i < p.groupIndex.length; i++) if (p.groupIndex[i] === k) out.push(i)
    return out
  }

  // ——— Gabbard ———
  const gabbard = useMemo(() => {
    const pts: ScatterPoint[] = []
    let maxAlt = 0
    for (const i of indicesOf(gGroup)) {
      const m = meanElements(p.satellites[i])
      if (!(m.periodMin < 2000)) continue
      pts.push({ x: m.periodMin, y: m.apogeeAlt, s: 0, i })
      pts.push({ x: m.periodMin, y: m.perigeeAlt, s: 1, i })
      maxAlt = Math.max(maxAlt, m.apogeeAlt)
    }
    return { pts, maxAlt }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gGroup, p.satellites, p.groupIndex])

  // ——— Geometría ———
  const now = useSimNow(p.clock, 60_000)
  const dayBucket = Math.floor(now / 3_600_000)
  const geo = useMemo(() => {
    const members = membersAt(p.satellites, indicesOf(cGroup), dayBucket * 3_600_000)
    return { members, shells: findShells(members) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cGroup, p.satellites, p.groupIndex, dayBucket])
  const shell = geo.shells[Math.min(shellIdx, geo.shells.length - 1)]
  const name = (i: number) => String(p.satellites[i].OBJECT_NAME)

  if (!p.open) return null
  return (
    <aside className="panel learn analysis" aria-label="Catalog analysis">
      <header className="learn-head">
        <h2 className="learn-title">Catalog analysis</h2>
        <button className="icon-btn" aria-label="Close" onClick={p.onClose}>
          <CloseIcon />
        </button>
      </header>
      <div className="tabs" role="tablist">
        <button role="tab" className="tab" aria-selected={tab === 'gabbard'} onClick={() => setTab('gabbard')}>
          Gabbard diagram
        </button>
        <button role="tab" className="tab" aria-selected={tab === 'geometry'} onClick={() => setTab('geometry')}>
          Constellation geometry
        </button>
      </div>

      <div className="learn-body">
        {tab === 'gabbard' && (
          <>
            <p className="lead">
              Apogee and perigee altitude of every object against its orbital period. After a breakup, fragments thrown forward gain energy
              (higher apogee, longer period) and those thrown backward lose it (lower perigee), so the cloud draws an X centered on the parent
              orbit. Drag then pulls the apogees down over the years.
            </p>
            <label className="select-row">
              Group
              <select value={gGroup} onChange={(e) => setGGroup(Number(e.target.value))}>
                {available.map((c) => (
                  <option key={c.k} value={c.k}>
                    {c.label} ({c.count.toLocaleString('en-US')})
                  </option>
                ))}
              </select>
            </label>
            <ScatterCanvas
              points={gabbard.pts}
              series={[
                { label: 'apogee', color: APOGEE },
                { label: 'perigee', color: PERIGEE },
              ]}
              label="Gabbard diagram: altitude against period"
              xLabel="Period (min)"
              yLabel="Altitude (km)"
              formatX={(x) => fx(x, 0)}
              formatY={(y) => fx(y, 0)}
              describe={(q) => `${name(q.i)}: ${q.s === 0 ? 'apogee' : 'perigee'} ${fx(q.y, 0)} km, T = ${fx(q.x, 1)} min`}
              onPick={p.onSelect}
              highlight={p.selected}
              height={340}
            />
            <table className="data">
              <tbody>
                <Row label="Objects plotted" value={(gabbard.pts.length / 2).toLocaleString('en-US')} />
                <Row
                  label="Period and altitude"
                  value="Kepler III"
                  explain={{
                    text: <>Every point on the diagram obeys Kepler’s third law: the period depends only on the semi-major axis, the mean of apogee and perigee radii.</>,
                    tex: 'T = 2\\pi\\sqrt{\\frac{a^3}{\\mu}},\\qquad a = R_\\oplus + \\frac{h_a + h_p}{2}',
                  }}
                />
              </tbody>
            </table>
            <p className="block-note">
              The Debris group gathers the tracked fragments of three events: the Chinese anti-satellite test on Fengyun-1C (2007) and the
              collision between Iridium 33 and Cosmos 2251 (2009). Click a point to open that object.
            </p>
          </>
        )}

        {tab === 'geometry' && (
          <>
            <p className="lead">
              Large constellations are built from shells: satellites sharing altitude and inclination. Inside a shell, orbital planes are spread
              evenly in right ascension of the ascending node Ω. Because every plane in a shell drifts at the same J2 rate, the pattern holds.
            </p>
            <label className="select-row">
              Group
              <select
                value={cGroup}
                onChange={(e) => {
                  setCGroup(Number(e.target.value))
                  setShellIdx(0)
                }}
              >
                {available.map((c) => (
                  <option key={c.k} value={c.k}>
                    {c.label} ({c.count.toLocaleString('en-US')})
                  </option>
                ))}
              </select>
            </label>
            <ScatterCanvas
              points={geo.members.map((m) => ({ x: m.inc, y: m.alt, s: 0, i: m.i }))}
              series={[{ label: 'satellite', color: APOGEE }]}
              label="Altitude against inclination"
              xLabel="Inclination (°)"
              yLabel="Mean altitude (km)"
              formatX={(x) => fx(x, 1)}
              formatY={(y) => fx(y, 0)}
              describe={(q) => `${name(q.i)}: i = ${fx(q.x, 2)}°, h = ${fx(q.y, 0)} km`}
              onPick={p.onSelect}
              highlight={p.selected}
              height={240}
            />
            {geo.shells.length === 0 && <p className="callout">No shell with at least 12 satellites in this group.</p>}
            {geo.shells.length > 0 && (
              <section className="block">
                <h3 className="block-title">Shells</h3>
                <table className="data shells">
                  <thead>
                    <tr>
                      <th>Inclination</th>
                      <th>Altitude</th>
                      <th>Sats</th>
                      <th>Planes</th>
                      <th>dΩ/dt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {geo.shells.slice(0, 10).map((s, k) => (
                      <tr key={k} className={k === shellIdx ? 'is-sel' : undefined}>
                        <td>
                          <button className="link" onClick={() => setShellIdx(k)}>
                            {fx(s.inc, 1)}°
                          </button>
                        </td>
                        <td>{fx(s.alt, 0)} km</td>
                        <td>{s.members.length}</td>
                        <td>{s.planes}</td>
                        <td>{fx(s.raanDot, 2)} °/d</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="block-note">
                  Planes are counted as clusters of Ω separated by more than 1.5°. Satellites still raising their orbit or drifting to their slot
                  sit outside the clusters.
                </p>
              </section>
            )}
            {shell && (
              <section className="block">
                <h3 className="block-title">
                  Shell at {fx(shell.inc, 1)}°, {fx(shell.alt, 0)} km
                </h3>
                <ScatterCanvas
                  points={shell.members.map((m) => ({ x: m.raan, y: m.u, s: 0, i: m.i }))}
                  series={[{ label: 'satellite', color: APOGEE }]}
                  label="Argument of latitude against right ascension of the ascending node"
                  xLabel="Right ascension of the ascending node Ω (°)"
                  yLabel="Argument of latitude u (°)"
                  formatX={(x) => fx(x, 0)}
                  formatY={(y) => fx(y, 0)}
                  xDomain={[0, 360]}
                  yDomain={[0, 360]}
                  describe={(q) => `${name(q.i)}: Ω = ${fx(q.x, 1)}°, u = ${fx(q.y, 1)}°`}
                  onPick={p.onSelect}
                  highlight={p.selected}
                  height={300}
                />
                <table className="data">
                  <tbody>
                    <Row
                      label="Walker pattern (estimate)"
                      value={`${fx(shell.inc, 1)}°: ${shell.members.length}/${shell.planes}/F`}
                      explain={{
                        text: (
                          <>
                            Walker delta notation i: T/P/F gives the inclination, the total number of satellites T, the number of equally spaced
                            planes P and the phasing F, which shifts each plane’s satellites by F·360°/T relative to the previous plane. Each
                            vertical column above is one plane; the dots along it are the satellites in that plane.
                          </>
                        ),
                        tex: '\\Delta\\Omega = \\frac{360^\\circ}{P},\\qquad \\Delta u_{\\text{in-plane}} = \\frac{360^\\circ}{T/P},\\qquad \\Delta u_{\\text{between planes}} = F\\,\\frac{360^\\circ}{T}',
                      }}
                    />
                    <Row label="Satellites per plane" value={fx(shell.members.length / shell.planes, 1)} />
                    <Row label="Plane spacing" value={fx(360 / shell.planes, 1)} unit="°" />
                    <Row
                      label="Nodal drift"
                      value={fx(shell.raanDot, 3)}
                      unit="°/day"
                      explain={{
                        text: <>J2 precession for this altitude and inclination. Different shells drift at different rates, so their relative geometry rotates over weeks.</>,
                        tex: '\\dot\\Omega = -\\frac{3}{2}\\,n\\,J_2\\left(\\frac{R_\\oplus}{p}\\right)^2\\cos i',
                      }}
                    />
                  </tbody>
                </table>
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  )
}
