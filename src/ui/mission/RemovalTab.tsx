import { useMemo, useState } from 'react'
import { CONSTELLATION_INDEX } from '../../data/constellations'
import type { SatRecord } from '../../data/types'
import { bestPlan, chaserPropellant, kitDv, rankCandidates, targetOrbit, vCirc } from '../../lib/debrisRemoval'
import { altitudeHistogram, deorbitDv } from '../../lib/missionDesign'
import { Row } from '../dossier/Row'
import { Fold } from '../detail'
import { fx } from '../format'

interface Props {
  satellites: SatRecord[]
  groupIndex: Uint8Array
  now: number
  targets: number[]
  onTargets: (t: number[]) => void
  onShow: (i: number) => void
}

const MAX_TARGETS = 6

/** Planificador de una misión de retirada activa de basura */
export function RemovalTab(p: Props) {
  const [t0] = useState(p.now)
  const [dry, setDry] = useState(400)
  const [kit, setKit] = useState(15)
  const [isp, setIsp] = useState(220)
  const [maxWait, setMaxWait] = useState(180)
  const [q, setQ] = useState('')

  // Candidatos: la nube de restos si está en el catálogo; si no, cualquier objeto
  const ranking = useMemo(() => {
    const debris = CONSTELLATION_INDEX.get('debris')
    const mission = CONSTELLATION_INDEX.get('mission')
    let pool: number[] = []
    for (let i = 0; i < p.satellites.length; i++) if (p.groupIndex[i] === debris) pool.push(i)
    const fromDebris = pool.length > 0
    // Sin el grupo de restos: etapas de cohete y fragmentos por su nombre y, si no hay, objetos
    // que no pertenecen a constelaciones activas con propulsión (esas se retiran solas)
    if (!fromDebris) {
      for (let i = 0; i < p.satellites.length; i++) if (/ DEB\b| R\/B\b|DEB$/.test(String(p.satellites[i].OBJECT_NAME))) pool.push(i)
      if (pool.length === 0) {
        const skip = new Set(['mission', 'starlink', 'oneweb', 'kuiper', 'qianfan', 'stations', 'planet', 'spire'].map((id) => CONSTELLATION_INDEX.get(id)))
        for (let i = 0; i < p.satellites.length; i++) if (!skip.has(p.groupIndex[i])) pool.push(i)
      }
    }
    if (pool.length > 4000) pool = pool.filter((_, k) => k % Math.ceil(pool.length / 4000) === 0)
    const hist = altitudeHistogram(p.satellites)
    const band = (alt: number) => hist.find((b) => Math.abs(b.alt - alt) <= 12.5)?.n ?? 0
    return { list: rankCandidates(p.satellites, pool, band).slice(0, 12), fromDebris }
  }, [p.satellites, p.groupIndex])

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (s.length < 2) return []
    const out: number[] = []
    for (let i = 0; i < p.satellites.length && out.length < 6; i++)
      if (String(p.satellites[i].OBJECT_NAME).toLowerCase().includes(s) || String(p.satellites[i].NORAD_CAT_ID) === s) out.push(i)
    return out
  }, [q, p.satellites])

  const orbits = useMemo(() => p.targets.map((i) => targetOrbit(i, p.satellites[i], t0)), [p.targets, p.satellites, t0])
  const plan = useMemo(() => bestPlan(orbits, maxWait), [orbits, maxWait])
  const byIndex = (i: number) => orbits.find((o) => o.index === i)!
  const last = plan ? byIndex(plan.order[plan.order.length - 1]) : null
  const fuel = plan && last ? chaserPropellant(plan, dry, kit, isp, deorbitDv(last.alt)) : null

  const add = (i: number) => {
    if (p.targets.includes(i) || p.targets.length >= MAX_TARGETS) return
    p.onTargets([...p.targets, i])
  }
  const name = (i: number) => String(p.satellites[i].OBJECT_NAME)

  return (
    <>
      <p className="lead">
        Plan a chaser that visits several pieces of debris and attaches a deorbit kit to each one. The hard part is not altitude but the
        orientation of each orbital plane.
      </p>

      <Fold title="Targets worth removing" summary={`${ranking.list.length} candidates`} open={p.targets.length === 0}>
        <p className="block-note" style={{ marginTop: 0 }}>
          Ranked by how long each object will stay up on its own and how crowded its altitude band is: long-lived objects in busy shells are the
          most likely to collide and create more fragments.
          {!ranking.fromDebris && ' The Debris group is not in this catalog, so rocket bodies and satellites outside the active megaconstellations are considered instead.'}
        </p>
        <table className="data shells">
          <thead>
            <tr>
              <th>Object</th>
              <th>Altitude</th>
              <th>Lifetime</th>
              <th>Band</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ranking.list.map((c) => (
              <tr key={c.index}>
                <td>
                  <button className="link" onClick={() => p.onShow(c.index)}>
                    {name(c.index)}
                  </button>
                </td>
                <td>{fx(c.alt, 0)} km</td>
                <td>{c.lifetimeYears >= 200 ? '200+ y' : `${fx(c.lifetimeYears, 0)} y`}</td>
                <td>{c.neighbours}</td>
                <td>
                  <button className="btn small" onClick={() => add(c.index)} disabled={p.targets.includes(c.index) || p.targets.length >= MAX_TARGETS}>
                    Add
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <label className="select-row">
          Or search
          <input className="cmp-input" type="search" placeholder="Name or NORAD ID" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {hits.length > 0 && (
          <ul className="sky-list">
            {hits.map((i) => (
              <li key={i}>
                <button className="sky-item" onClick={() => (add(i), setQ(''))}>
                  <span className="dot" style={{ background: '#ff8a3d' }} />
                  <span className="sky-item-name">{name(i)}</span>
                  <span className="sky-item-meta">Add</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Fold>

      <section className="block">
        <h3 className="block-title">
          Targets ({p.targets.length}/{MAX_TARGETS})
        </h3>
        {p.targets.length === 0 && <p className="block-note">Add two or more objects to plan a tour. They are drawn in orange on the globe.</p>}
        {orbits.length > 0 && (
          <table className="data shells">
            <thead>
              <tr>
                <th>Object</th>
                <th>Alt.</th>
                <th>i</th>
                <th>Ω</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orbits.map((o) => (
                <tr key={o.index}>
                  <td>{name(o.index)}</td>
                  <td>{fx(o.alt, 0)} km</td>
                  <td>{fx(o.i, 1)}°</td>
                  <td>{fx(o.raan, 0)}°</td>
                  <td>
                    <button className="icon-btn small" aria-label={`Remove ${name(o.index)}`} onClick={() => p.onTargets(p.targets.filter((x) => x !== o.index))}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <Fold title="Chaser" summary={`${dry} kg dry, ${kit} kg kits, I_sp ${isp} s, waits up to ${maxWait} d`}>
        <div className="form-grid">
          <label>
            Chaser dry mass <span className="unit">kg</span>
            <input type="number" min={50} step={10} value={dry} onChange={(e) => setDry(Math.max(50, Number(e.target.value)))} />
          </label>
          <label>
            Mass of each kit <span className="unit">kg</span>
            <input type="number" min={1} step={1} value={kit} onChange={(e) => setKit(Math.max(1, Number(e.target.value)))} />
          </label>
          <label>
            Specific impulse <span className="unit">s</span>
            <input type="number" min={50} step={10} value={isp} onChange={(e) => setIsp(Math.max(50, Number(e.target.value)))} />
          </label>
          <label>
            Longest wait per leg <span className="unit">days</span>
            <input type="number" min={0} step={30} value={maxWait} onChange={(e) => setMaxWait(Math.max(0, Number(e.target.value)))} />
          </label>
        </div>
      </Fold>

      {plan && plan.order.length >= 2 && fuel && (
        <section className="block">
          <h3 className="block-title">Best tour</h3>
          <ol className="tour">
            {plan.order.map((i, k) => {
              const leg = plan.legs[k - 1]
              return (
                <li key={i}>
                  {leg && (
                    <p className="tour-leg">
                      {fx(leg.dv, 0)} m/s{' '}
                      {leg.strategy === 'drift' ? `after waiting ${fx(leg.waitDays, 0)} days for J2 to align the planes` : `direct, planes ${fx(leg.theta, 1)}° apart`}
                    </p>
                  )}
                  <p className="tour-stop">
                    <button className="link" onClick={() => p.onShow(i)}>
                      {name(i)}
                    </button>
                    <span>
                      {fx(byIndex(i).alt, 0)} km, kit Δv {fx(kitDv(byIndex(i)), 0)} m/s
                    </span>
                  </p>
                </li>
              )
            })}
          </ol>
          <table className="data">
            <tbody>
              <Row label="Chaser Δv for the tour" value={fx(plan.dvTotal, 0)} unit="m/s" tone="active" />
              <Row label="Own deorbit at the end" value={fx(last ? deorbitDv(last.alt) : 0, 0)} unit="m/s" />
              <Row label="Mission duration" value={fx(plan.days, 0)} unit="days" />
              <Row
                label="Chaser launch mass"
                value={fx(fuel.wet, 0)}
                unit="kg"
                explain={{
                  text: <>Rocket equation applied leg by leg, backwards from the empty chaser, adding the kit dropped at each stop.</>,
                  tex: 'm_{k} = (m_{k+1} + m_{\\text{kit}})\\,e^{\\Delta v_k/(I_{sp} g_0)}',
                }}
              />
              <Row label="Propellant" value={fx(fuel.propellant, 0)} unit="kg" />
              <Row
                label="Verdict"
                value={fuel.wet <= 1500 ? 'Feasible on a small launcher' : fuel.wet <= 6000 ? 'Needs a dedicated medium launch' : 'Not realistic'}
                tone={fuel.wet <= 1500 ? 'good' : fuel.wet <= 6000 ? 'caution' : 'warn'}
                explain={{ text: <>Compared with what small launchers (about 1.5 t to LEO) and a Falcon 9 rideshare or medium launcher can lift.</> }}
              />
            </tbody>
          </table>
          {fuel.wet > 6000 && (
            <p className="block-note">
              The targets lie in planes too far apart. Pick objects with similar inclination, or let the chaser wait longer for J2 to bring their
              nodes together.
            </p>
          )}
          {plan.legs.length > 0 && (
            <Fold title="Why the plane costs so much" summary={`${fx(2 * vCirc(byIndex(plan.order[0]).a) * Math.sin(Math.PI / 360) * 1000, 0)} m/s per degree here`}>
              <table className="data">
                <tbody>
                  <Row
                    label="Angle between planes"
                    value="θ"
                    explain={{
                      text: <>Two orbits with different inclination or node are tilted relative to each other by θ. Turning the velocity vector through θ is the expensive part of every leg.</>,
                      tex: '\\cos\\theta = \\cos i_1\\cos i_2 + \\sin i_1\\sin i_2\\cos\\Delta\\Omega,\\qquad \\Delta v = 2v\\sin\\frac{\\theta}{2}',
                    }}
                  />
                  <Row
                    label="Waiting for J2"
                    value="free ΔΩ"
                    explain={{
                      text: <>Orbits at different altitude or inclination precess at different rates, so the node difference closes on its own. The tour trades propellant for time; raise the longest wait to see the effect.</>,
                      tex: 't_{\\text{wait}} = \\frac{\\Delta\\Omega}{|\\dot\\Omega_1 - \\dot\\Omega_2|},\\qquad \\dot\\Omega = -\\tfrac{3}{2}\\,n\\,J_2\\left(\\frac{R_\\oplus}{a}\\right)^2\\cos i',
                    }}
                  />
                </tbody>
              </table>
            </Fold>
          )}
          <p className="block-note">
            Each leg is a Hohmann transfer with the plane change merged into its cheaper burn. Rendezvous and capture operations take 10 days per
            target. All orders are tried and the one with the least Δv is shown.
          </p>
        </section>
      )}
    </>
  )
}
