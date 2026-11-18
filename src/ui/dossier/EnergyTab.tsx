import { useMemo, useState } from 'react'
import { meanElements, type Telemetry } from '../../lib/astrodynamics'
import type { SatRecord } from '../../data/types'
import { betaSeries, eclipseAnalytic, lightTimeline, lightTotals, powerBudget, SOLAR_CONSTANT } from '../../lib/power'
import { LightBar } from '../charts/LightBar'
import { LineChart } from '../charts/LineChart'
import { tn } from '../Tex'
import { duration, fx } from '../format'
import { Lead, Row, Table } from './Row'
import { Fold, Full, MoreDetail } from '../detail'

const dayFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })

interface Props {
  t: Telemetry
  record: SatRecord
  now: number
}

export function EnergyTab({ t, record, now }: Props) {
  const mean = useMemo(() => meanElements(record), [record])
  const periodMs = mean.periodMin * 60_000
  // Se recalcula cada pocos minutos de tiempo simulado
  const bucket = Math.floor(now / Math.min(periodMs / 4, 600_000))
  const windowMs = Math.min(periodMs * 3, 36 * 3_600_000)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const segs = useMemo(() => lightTimeline(record, now, windowMs), [record, bucket])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const oneOrbit = useMemo(() => lightTotals(lightTimeline(record, now, periodMs)), [record, bucket])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const betas = useMemo(() => betaSeries(record, now, 120, 0.5), [record, Math.floor(now / 86_400_000)])

  const meanAlt = (mean.apogeeAlt + mean.perigeeAlt) / 2
  const an = eclipseAnalytic(meanAlt, t.betaDeg)
  const eclipseMin = oneOrbit.umbra + oneOrbit.penumbra / 2
  const sunMin = mean.periodMin - eclipseMin
  const next = segs.find((s) => s.start > now && s.state !== 'sun')
  const nextSun = segs.find((s) => s.start > now && s.state === 'sun')
  const inShadow = t.shadow > 0.5

  // Calculadora de energía
  const [area, setArea] = useState(1)
  const [eff, setEff] = useState(30)
  const [tracking, setTracking] = useState(true)
  const [load, setLoad] = useState(60)
  const [dod, setDod] = useState(30)
  const pb = powerBudget({
    areaM2: area,
    efficiency: eff / 100,
    pointing: tracking ? 1 : 1 / Math.PI,
    loadW: load,
    periodMin: mean.periodMin,
    sunMin,
    eclipseMin,
    dod: dod / 100,
  })

  const betaCrit = an.betaCrit
  return (
    <>
      <Lead short={<>Sunlight and eclipse along the orbit: when the solar panels work and when the battery takes over.</>}>
        Illumination analysis for sizing the electrical power subsystem (EPS) and thermal control. During eclipse there is no photovoltaic
        generation, the load runs from the battery and the spacecraft goes through a cold thermal transient.
      </Lead>

      <LightBar segments={segs} now={now} />
      <p className="block-note">
        {inShadow ? 'Current state: eclipse' : 'Current state: sunlit'}.{' '}
        {inShadow && nextSun
          ? `Shadow exit in T−${duration(nextSun.start - now).slice(1)}.`
          : next
            ? `Next shadow entry in T−${duration(next.start - now).slice(1)}; duration ${fx((next.end - next.start) / 60000, 1)} min.`
            : 'No eclipses in the analyzed window.'}
      </p>

      <Table caption="Current revolution (SGP4 and conical shadow model)">
        <Row label="Sunlight" value={fx(oneOrbit.sun, 1)} unit="min" tone="good" />
        <Row
          label="Penumbra"
          value={fx(oneOrbit.penumbra, 2)}
          unit="min"
          explain={{
            text: (
              <>
                Partial occultation of the solar disc. In LEO it lasts only seconds because the shadow boundary is crossed so fast; for the
                energy balance the umbra is what counts.
              </>
            ),
          }}
        />
        <Row label="Umbra (total eclipse)" value={fx(oneOrbit.umbra, 1)} unit="min" tone={oneOrbit.umbra > 0 ? 'caution' : undefined} />
        <Row label="Sunlit fraction" value={fx((sunMin / mean.periodMin) * 100, 1)} unit="%" />
      </Table>

      <Full>
      <Table caption="β angle and eclipse fraction">
        <Row
          sym="β"
          label="Beta angle"
          value={fx(t.betaDeg, 2)}
          unit="°"
          tone="active"
          explain={{
            text: (
              <>
                Angle between the Sun vector and the orbital plane. At β = 0° the Sun lies in the plane and the eclipse is longest; for |β| &gt; β*
                the orbit stays in continuous sunlight.
              </>
            ),
            tex: '\\beta = \\arcsin\\left(\\hat n_{\\text{orbit}} \\cdot \\hat s_{\\odot}\\right)',
          }}
        />
        <Row
          sym="β*"
          label="Critical β"
          value={fx(betaCrit, 2)}
          unit="°"
          explain={{
            text: <>Limit value of |β| above which the orbit no longer intersects the Earth's shadow cylinder.</>,
            tex: '\\beta^* = \\arcsin\\left(\\frac{R_\\oplus}{R_\\oplus + h}\\right)',
            calc: `\\beta^* = \\arcsin\\left(\\frac{6378.1}{6378.1 + ${tn(meanAlt, 0)}}\\right) = ${tn(betaCrit, 1)}^\\circ`,
          }}
        />
        <Row
          sym={<>f<sub>E</sub></>}
          label="Eclipse fraction (analytic)"
          value={fx(an.fraction * 100, 1)}
          unit="%"
          explain={{
            text: (
              <>
                Closed-form expression for a circular orbit and a cylindrical shadow. It checks the numerical result: the expected discrepancy is
                under one minute.
              </>
            ),
            tex: 'f_E = \\frac{1}{\\pi}\\arccos\\left(\\frac{\\sqrt{h^2 + 2R_\\oplus h}}{(R_\\oplus + h)\\cos\\beta}\\right)',
            calc: `f_E = \\frac{1}{\\pi}\\arccos\\left(\\frac{\\sqrt{${tn(meanAlt, 0)}^2 + 2\\cdot6378\\cdot${tn(meanAlt, 0)}}}{${tn(6378.137 + meanAlt, 0)}\\cos ${tn(t.betaDeg, 1)}^\\circ}\\right) = ${tn(an.fraction, 3)}\\ \\Rightarrow\\ ${tn(an.fraction * mean.periodMin, 1)}\\ \\text{min}`,
          }}
        />
      </Table>

      <section className="block">
        <h3 className="block-title">β evolution (120 days)</h3>
        <LineChart
          data={betas.map((b) => ({ x: b.t, y: b.beta }))}
          label="Daily β angle"
          formatX={(x) => dayFmt.format(new Date(x))}
          formatY={(y) => fx(y, 0) + '°'}
          yUnit=""
          yDomain={[-90, 90]}
          bands={[
            { from: betaCrit, to: 90, label: 'no eclipses' },
            { from: -90, to: -betaCrit, label: 'no eclipses (south)' },
          ]}
          refs={[{ y: betaCrit, label: 'β* no eclipses' }]}
        />
        <p className="block-note">
          β changes through J2 nodal precession ({fx(mean.raanDot, 2)} °/day) combined with the Sun's apparent motion along the ecliptic (~0.99
          °/day). In the shaded bands (|β| &gt; β*) there are no eclipses: more power generated and more heat to reject.
        </p>
      </section>
      </Full>

      <MoreDetail what="the β angle, its 120-day evolution and the analytic eclipse model" />
      <Fold title="Power budget" summary={`Margin ${pb.margin >= 0 ? '+' : ''}${fx(pb.margin, 0)} Wh per orbit`}>

        <p className="block-note" style={{ marginTop: 0 }}>Preliminary sizing of solar array and battery for a hypothetical spacecraft in this orbit.</p>
        <div className="form-grid">
          <label>
            Solar array area <span className="unit">m²</span>
            <input type="number" min={0.01} step={0.1} value={area} onChange={(e) => setArea(Math.max(0.01, Number(e.target.value)))} />
          </label>
          <label>
            Cell efficiency <span className="unit">%</span>
            <input type="number" min={5} max={45} value={eff} onChange={(e) => setEff(Number(e.target.value))} />
          </label>
          <label>
            Average load <span className="unit">W</span>
            <input type="number" min={1} value={load} onChange={(e) => setLoad(Math.max(1, Number(e.target.value)))} />
          </label>
          <label>
            Depth of discharge (DoD) <span className="unit">%</span>
            <input type="number" min={5} max={90} value={dod} onChange={(e) => setDod(Number(e.target.value))} />
          </label>
          <label className="span2 check-row">
            <input type="checkbox" checked={tracking} onChange={(e) => setTracking(e.target.checked)} /> Sun-tracking arrays (SADA)
          </label>
        </div>
        <table className="data">
          <tbody>
            <Row
              sym={<>P<sub>sun</sub></>}
              label="Power in sunlight"
              value={fx(pb.pSun, 0)}
              unit="W"
              explain={{
                text: (
                  <>
                    Product of total solar irradiance ({SOLAR_CONSTANT} W/m²), efficiency, area and mean incidence factor. A body-fixed panel on a
                    spinning spacecraft receives on average 1/π of the irradiance (mean cosine).
                  </>
                ),
                tex: 'P = S\\,\\eta\\,A\\,\\overline{\\cos\\theta}',
                calc: `P = 1361 \\cdot ${tn(eff / 100, 2)} \\cdot ${tn(area, 2)} \\cdot ${tracking ? '1' : '0.318'} = ${tn(pb.pSun, 0)}\\ \\text{W}`,
              }}
            />
            <Row label="Energy generated per revolution" value={fx(pb.energyIn, 1)} unit="Wh" />
            <Row label="Energy consumed per revolution" value={fx(pb.energyOut, 1)} unit="Wh" />
            <Row label="Energy margin" value={(pb.margin >= 0 ? '+' : '') + fx(pb.margin, 1)} unit="Wh" tone={pb.margin >= 0 ? 'good' : 'warn'} />
            <Row
              label="Required battery capacity"
              value={fx(pb.battery, 1)}
              unit="Wh"
              explain={{
                text: (
                  <>
                    The battery must cover the eclipse without exceeding the allowable DoD: in LEO it goes through about 5,500 cycles a year, and
                    its service life depends strongly on depth of discharge.
                  </>
                ),
                tex: 'C = \\frac{P_{\\text{load}}\\, t_{\\text{eclipse}}}{\\text{DoD}}',
                calc: `C = \\frac{${load}\\ \\text{W}\\cdot ${tn(eclipseMin / 60, 3)}\\ \\text{h}}{${tn(dod / 100, 2)}} = ${tn(pb.battery, 1)}\\ \\text{Wh}`,
              }}
            />
          </tbody>
        </table>
        <p className="block-note">
          {pb.margin < 0
            ? 'Negative balance: battery state of charge drops every revolution. The design is not viable.'
            : 'Positive balance. A real design adds a 20–30 % margin for cell degradation, temperature and conversion losses.'}
        </p>
      </Fold>
    </>
  )
}
