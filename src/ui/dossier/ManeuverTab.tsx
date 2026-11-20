import { useEffect, useMemo, useState } from 'react'
import type { SatRecord } from '../../data/types'
import { meanElements, MU, RE, type Telemetry } from '../../lib/astrodynamics'
import { BIELLIPTIC_RATIO_ANY, BIELLIPTIC_RATIO_MIN, compareTransfers, G0, planeChangeDv, propellant, transferPoints, type ManeuverPlan } from '../../lib/maneuvers'
import { TransferDiagram } from '../charts/TransferDiagram'
import { tn } from '../Tex'
import { duration, fx } from '../format'
import { Lead, Row, Table } from './Row'
import { Fold, Full } from '../detail'

export interface ManeuverDrawing {
  legs: number[][][]
  target: number[][]
  start: number[][]
}

interface Props {
  t: Telemetry
  record: SatRecord
  drawing: ManeuverDrawing | null
  onDraw: (d: ManeuverDrawing | null) => void
}

const PRESETS: { label: string; alt: number; inc?: number }[] = [
  { label: 'ISS', alt: 420, inc: 51.64 },
  { label: 'Sun-synchronous 700 km', alt: 700, inc: 98.19 },
  { label: 'GPS', alt: 20_180, inc: 55 },
  { label: 'GEO', alt: 35_786, inc: 0 },
  { label: 'GEO graveyard', alt: 36_086, inc: 0 },
]

const ENGINES: { label: string; isp: number }[] = [
  { label: 'Cold gas', isp: 70 },
  { label: 'Hydrazine', isp: 225 },
  { label: 'Biprop', isp: 320 },
  { label: 'Hall thruster', isp: 1600 },
]

const ms = (kms: number) => fx(kms * 1000, 0)

export function ManeuverTab({ t, record, drawing, onDraw }: Props) {
  const mean = useMemo(() => meanElements(record), [record])
  const h1 = Math.round(((mean.apogeeAlt + mean.perigeeAlt) / 2) * 10) / 10
  const [h2, setH2] = useState(35_786)
  const [i2, setI2] = useState(0)
  const [kind, setKind] = useState<'hohmann' | 'bielliptic'>('hohmann')
  const [hb, setHb] = useState(120_000)
  const [isp, setIsp] = useState(320)
  const [dry, setDry] = useState(500)

  const r1 = RE + h1
  const r2 = RE + Math.max(150, h2)
  const di = Math.abs(i2 - mean.i)
  const cmp = compareTransfers(r1, r2, RE + Math.max(hb, h1, h2), di)
  const plan: ManeuverPlan = kind === 'hohmann' ? cmp.hohmann : cmp.bielliptic
  const prop = propellant(plan.dvTotal, isp, dry)
  const propHo = propellant(cmp.hohmann.dvTotal, isp, dry)
  const propBi = propellant(cmp.bielliptic.dvTotal, isp, dry)
  const ratio = cmp.ratio
  /** Velocidad en la apoapsis intermedia, donde la bielíptica gira el plano (km/s) */
  const vAtRb = (() => {
    const rb = cmp.bielliptic.legs[0].rTo
    const a1 = cmp.bielliptic.legs[0].a
    return Math.sqrt(MU * (2 / rb - 1 / a1))
  })()
  /** Nave hipotética del cálculo de propelente, en una frase */
  const craft = `a hypothetical ${fx(dry, 0)} kg (dry) spacecraft with I_sp = ${isp} s`
  const leg = plan.legs[0]
  // Edelbaum: transferencia de empuje continuo bajo entre órbitas circulares con cambio de plano
  const v1 = Math.sqrt(MU / r1)
  const v2 = Math.sqrt(MU / r2)
  const edelbaum = Math.sqrt(v1 * v1 + v2 * v2 - 2 * v1 * v2 * Math.cos((Math.PI / 2) * ((di * Math.PI) / 180)))

  // Al cambiar los datos, el dibujo del globo se rehace (si está activo)
  const showing = drawing !== null
  useEffect(() => {
    if (showing) onDraw(transferPoints(t.r, t.v, plan))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h2, i2, kind, hb, record])
  useEffect(() => () => onDraw(null), []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Lead short={<>How much Δv and propellant it takes to move this object to another orbit, with the transfer drawn to scale.</>}>
        Impulsive transfer from the current orbit, treated as circular at its mean altitude, to a circular target orbit. Each burn is
        instantaneous. The plane change is merged into the burns and split between them to minimise the total: almost all of it goes where
        the spacecraft is slowest, because turning a slow velocity vector is cheap. The burn is assumed to happen at the node of the target
        plane, so only the change in inclination counts.
      </Lead>

      {mean.e > 0.01 && <p className="callout">This orbit has e = {fx(mean.e, 3)}: the circular approximation uses its mean radius, so the numbers are indicative.</p>}

      <section className="block">
        <h3 className="block-title">Target orbit</h3>
        <div className="btn-row">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              className="btn small"
              aria-pressed={h2 === p.alt && (p.inc === undefined || i2 === p.inc)}
              onClick={() => {
                setH2(p.alt)
                if (p.inc !== undefined) setI2(p.inc)
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="form-grid">
          <Full>
          <label>
            Initial altitude <span className="unit">km (mean)</span>
            <input type="number" value={h1} readOnly />
          </label>
          <label>
            Initial inclination <span className="unit">°</span>
            <input type="number" value={fx(mean.i, 2)} readOnly />
          </label>
          </Full>
          <label>
            Target altitude <span className="unit">km</span>
            <input type="number" min={150} step={10} value={h2} onChange={(e) => setH2(Number(e.target.value))} />
          </label>
          <label>
            Target inclination <span className="unit">°</span>
            <input type="number" min={0} max={180} step={0.1} value={i2} onChange={(e) => setI2(Number(e.target.value))} />
          </label>
        </div>
        <div className="block-title-row" style={{ marginTop: 14 }}>
          <span className="block-note" style={{ margin: 0 }}>
            Transfer
          </span>
          <div className="seg" role="radiogroup" aria-label="Transfer type">
            <button className="seg-btn text" role="radio" aria-checked={kind === 'hohmann'} onClick={() => setKind('hohmann')}>
              Hohmann
            </button>
            <button className="seg-btn text" role="radio" aria-checked={kind === 'bielliptic'} onClick={() => setKind('bielliptic')}>
              Bi-elliptic
            </button>
          </div>
        </div>
        <div className="slider">
          <label htmlFor="hb">
            Bi-elliptic intermediate apoapsis <strong>{fx(Math.max(hb, h1, h2), 0)} km</strong>
          </label>
          <input id="hb" type="range" min={Math.max(h1, h2)} max={400_000} step={1000} value={Math.max(hb, h1, h2)} onChange={(e) => setHb(Number(e.target.value))} />
        </div>
      </section>

      <TransferDiagram plan={plan} />

      <Table caption={kind === 'hohmann' ? 'Hohmann transfer' : 'Bi-elliptic transfer'}>
        <Full>
        {plan.burns.map((b, j) => (
          <Row
            key={j}
            sym={<>Δv<sub>{j + 1}</sub></>}
            label={b.di > 0.01 ? `${b.label}, with Δi = ${fx(b.di, 2)}°` : b.label}
            value={ms(b.dv)}
            unit="m/s"
            explain={
              b.di > 0.01
                ? {
                    text: <>Combined burn: the velocity changes magnitude and direction at once. By the law of cosines this costs much less than two separate burns.</>,
                    tex: '\\Delta v = \\sqrt{v_a^2 + v_b^2 - 2\\,v_a v_b \\cos\\Delta i}',
                  }
                : j === 0 && kind === 'hohmann'
                ? {
                    text: (
                      <>
                        Speed change at the departure point: from circular speed to the speed of the transfer ellipse at the same radius (vis-viva
                        with the transfer semi-major axis a_t).
                      </>
                    ),
                    tex: '\\Delta v_1 = \\sqrt{\\mu\\left(\\frac{2}{r_1} - \\frac{1}{a_t}\\right)} - \\sqrt{\\frac{\\mu}{r_1}},\\qquad a_t = \\frac{r_1 + r_2}{2}',
                    calc: `a_t = \\frac{${tn(r1, 0)} + ${tn(r2, 0)}}{2} = ${tn(leg.a, 0)}\\ \\text{km}`,
                  }
                : undefined
            }
          />
        ))}
        </Full>
        <Row label="Total Δv" value={ms(plan.dvTotal)} unit="m/s" tone="active" />
        <Row
          label="Time of flight"
          value={duration(plan.tof * 1000).slice(1)}
          explain={{ text: <>Each leg is half an ellipse, so it takes half of that ellipse’s period.</>, tex: kind === 'hohmann' ? 'TOF = \\pi\\sqrt{\\frac{a_t^3}{\\mu}}' : 'TOF = \\pi\\left(\\sqrt{\\frac{a_1^3}{\\mu}} + \\sqrt{\\frac{a_2^3}{\\mu}}\\right)' }}
        />
        <Full>
        <Row label="Transfer perigee altitude" value={fx(Math.min(leg.rFrom, leg.rTo) - RE, 0)} unit="km" />
        <Row label="Transfer apogee altitude" value={fx(Math.max(...plan.legs.map((l) => Math.max(l.rFrom, l.rTo))) - RE, 0)} unit="km" />
        {di > 0.01 && (
          <Row
            label="Same Δi as a separate burn"
            value={ms(plan.dvSeparatePlane)}
            unit="m/s"
            tone="caution"
            explain={{
              text: <>Plane change on its own, in the higher circular orbit. Rotating a velocity vector by Δi costs 2 v sin(Δi/2): about 1.5 km/s for 28.5° at GEO and 3.8 km/s in LEO.</>,
              tex: '\\Delta v_{\\text{plane}} = 2\\,v\\,\\sin\\frac{\\Delta i}{2}',
              calc: `\\Delta v_{\\text{plane}} = 2\\cdot${tn(Math.sqrt(MU / Math.max(r1, r2)), 3)}\\cdot\\sin\\frac{${tn(di, 2)}^\\circ}{2} = ${tn(planeChangeDv(Math.max(r1, r2), di) * 1000, 0)}\\ \\text{m/s}`,
            }}
          />
        )}
        </Full>
      </Table>
      <section className="block">
        <table className="data cmp">
          <caption>Hohmann or bi-elliptic?</caption>
          <thead>
            <tr>
              <th />
              <th>Hohmann</th>
              <th>Bi-elliptic</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Total Δv</th>
              <td className={cmp.cheaper === 'hohmann' ? 'tone-active' : undefined}>{ms(cmp.hohmann.dvTotal)}</td>
              <td className={cmp.cheaper === 'bielliptic' ? 'tone-active' : undefined}>{ms(cmp.bielliptic.dvTotal)}</td>
              <td className="unit">m/s</td>
            </tr>
            <tr>
              <th scope="row">Time of flight</th>
              <td>{duration(cmp.hohmann.tof * 1000).slice(1)}</td>
              <td>{duration(cmp.bielliptic.tof * 1000).slice(1)}</td>
              <td className="unit" />
            </tr>
            <tr>
              <th scope="row">Propellant</th>
              <td>{fx(propHo.propellant, 0)}</td>
              <td>{fx(propBi.propellant, 0)}</td>
              <td className="unit">kg</td>
            </tr>
          </tbody>
        </table>
        <p className="block-note">
          {cmp.coplanar ? (
            <>
              Both orbits are in the same plane, so the classic rule applies to the radius ratio r₂/r₁ = {fx(ratio, 2)}:{' '}
              {ratio < BIELLIPTIC_RATIO_MIN
                ? `below ${BIELLIPTIC_RATIO_MIN} the Hohmann transfer is always cheaper.`
                : ratio < BIELLIPTIC_RATIO_ANY
                  ? `between ${BIELLIPTIC_RATIO_MIN} and ${BIELLIPTIC_RATIO_ANY} a bi-elliptic transfer is cheaper only with a high enough intermediate apoapsis.`
                  : `above ${BIELLIPTIC_RATIO_ANY} a bi-elliptic transfer is cheaper for any intermediate apoapsis beyond the target.`}{' '}
            </>
          ) : (
            <>
              With a {fx(di, 2)}° plane change the {BIELLIPTIC_RATIO_MIN} rule does not apply: it assumes both orbits share a plane. The
              bi-elliptic transfer turns the plane at {fx(Math.max(hb, h1, h2), 0)} km, where the spacecraft moves at only {ms(vAtRb)} m/s,
              so it can win at much smaller radius ratios (here r₂/r₁ = {fx(ratio, 2)}).{' '}
            </>
          )}
          {cmp.cheaper === 'bielliptic'
            ? `With these numbers the bi-elliptic transfer saves ${ms(cmp.saving)} m/s, but takes ${fx(cmp.timeFactor, 1)} times as long.`
            : `With these numbers the bi-elliptic transfer costs ${ms(-cmp.saving)} m/s more and takes ${fx(cmp.timeFactor, 1)} times as long.`}{' '}
          Propellant is for {craft}, not for this object.
        </p>
      </section>

      <Fold title="Propellant budget" summary={`${fx(prop.propellant, 0)} kg of propellant for ${craft}`}>
        <p className="block-note" style={{ marginTop: 0 }}>
          The spacecraft is hypothetical, not {record.OBJECT_NAME}: set its dry mass (everything except propellant) and engine to match your
          own design.
        </p>

        <div className="btn-row">
          {ENGINES.map((e) => (
            <button key={e.label} className="btn small" aria-pressed={isp === e.isp} onClick={() => setIsp(e.isp)}>
              {e.label} ({e.isp} s)
            </button>
          ))}
        </div>
        <div className="form-grid">
          <label>
            <span className="lbl-text">
              Specific impulse I<sub>sp</sub> <span className="unit">s</span>
            </span>
            <input type="number" min={30} max={5000} value={isp} onChange={(e) => setIsp(Math.max(30, Number(e.target.value)))} />
          </label>
          <label>
            Dry mass <span className="unit">kg</span>
            <input type="number" min={1} value={dry} onChange={(e) => setDry(Math.max(1, Number(e.target.value)))} />
          </label>
        </div>
        <table className="data">
          <tbody>
            <Row
              sym={<>m₀/m<sub>f</sub></>}
              label="Mass ratio"
              value={fx(prop.ratio, 3)}
              explain={{
                text: <>Tsiolkovsky rocket equation: Δv depends on exhaust velocity (I_sp·g₀) and on the logarithm of the mass ratio. That logarithm is why propellant needs grow exponentially with Δv.</>,
                tex: '\\Delta v = I_{sp}\\,g_0 \\ln\\frac{m_0}{m_f}\\quad\\Rightarrow\\quad m_p = m_f\\left(e^{\\Delta v/(I_{sp} g_0)} - 1\\right)',
                calc: `\\frac{m_0}{m_f} = \\exp\\left(\\frac{${tn(plan.dvTotal * 1000, 0)}}{${isp}\\cdot${G0}}\\right) = ${tn(prop.ratio, 3)}`,
              }}
            />
            <Row label="Propellant mass" value={fx(prop.propellant, 1)} unit="kg" tone="active" />
            <Row label="Wet mass at departure" value={fx(prop.wet, 1)} unit="kg" />
            <Row label="Propellant fraction" value={fx(prop.fraction * 100, 1)} unit="%" tone={prop.fraction > 0.6 ? 'caution' : undefined} />
          </tbody>
        </table>
        {isp >= 1000 && (
          <p className="block-note">
            Electric thrusters deliver millinewtons: the transfer becomes a slow spiral over weeks or months, not two burns. For a continuous
            low-thrust transfer between circular orbits, Edelbaum’s approximation gives Δv ≈ {ms(edelbaum)} m/s, more than the impulsive
            estimate, but the high I<sub>sp</sub> still saves most of the propellant.
          </p>
        )}
      </Fold>

      <div className="btn-row">
        <button className="btn primary" onClick={() => onDraw(showing ? null : transferPoints(t.r, t.v, plan))} aria-pressed={showing}>
          {showing ? 'Hide transfer on the globe' : 'Show transfer on the globe'}
        </button>
      </div>
      <p className="block-note">
        The transfer is drawn in the current orbital plane, starting from the satellite’s present position. The plane change is not drawn in 3D.
      </p>
    </>
  )
}
