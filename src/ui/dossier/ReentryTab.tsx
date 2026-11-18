import { useEffect, useMemo, useState } from 'react'
import type { SatRecord } from '../../data/types'
import { meanElements, MU, RE } from '../../lib/astrodynamics'
import { bcFromBstar, density } from '../../lib/atmosphere'
import { isOcean, loadEarthMask } from '../../lib/earthMask'
import { propagateRecord } from '../../lib/propagateRecord'
import {
  applyBurn,
  dvForPerigee,
  ENTRY_INTERFACE_KM,
  greatCircleKm,
  naturalDecay,
  orbitAfterBurn,
  POINT_NEMO,
  simulateReentry,
  type ReentryResult,
} from '../../lib/reentry'
import { LineChart } from '../charts/LineChart'
import { currentActivity, densityWith, forecastF107, SCENARIOS, useSpaceWeather, type Activity } from '../../lib/spaceWeather'
import { SpaceWeatherBlock } from './SpaceWeatherBlock'
import { tn } from '../Tex'
import { duration, fx, latStr, lonStr } from '../format'
import { Lead, Row, Table } from './Row'
import { Full, MoreDetail } from '../detail'

interface Props {
  record: SatRecord
  now: number
  result: ReentryResult | null
  onResult: (r: ReentryResult | null) => void
  onFlyTo: (lat: number, lon: number) => void
}

function lifetimeText(days: number, reentered: boolean) {
  if (!reentered) return 'more than 200 years'
  if (days < 1) return `${fx(days * 24, 1)} hours`
  if (days < 90) return `${fx(days, 0)} days`
  if (days < 730) return `${fx(days / 30.44, 0)} months`
  return `${fx(days / 365.25, 1)} years`
}

export function ReentryTab({ record, now, result, onResult, onFlyTo }: Props) {
  const mean = useMemo(() => meanElements(record), [record])
  const fromBstar = bcFromBstar(mean.bstar)
  const [bc, setBc] = useState(() => Math.round(fromBstar ?? 100))
  const [dv, setDv] = useState(0)
  const [delayMin, setDelayMin] = useState(0)
  const [running, setRunning] = useState(false)
  const [maskReady, setMaskReady] = useState(false)
  // Se fija el instante de referencia al abrir la pestaña para que los cálculos no salten
  const [t0, setT0] = useState(now)
  useEffect(() => setT0(now), [record]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    loadEarthMask().then(() => setMaskReady(true))
  }, [])

  // ——— Atmósfera: media, actividad solar actual o previsión del ciclo ———
  const sw = useSpaceWeather()
  const [model, setModel] = useState<string>('auto')
  const active = model === 'auto' ? (sw ? 'forecast' : 'mean') : model
  const nowAct: Activity | null = sw ? { f107: currentActivity(sw).mean90, ap: currentActivity(sw).ap } : null
  const actFor = (id: string): Activity | null => (id === 'now' || id === 'forecast' ? nowAct : (SCENARIOS.find((x) => x.id === id)?.activity ?? null))
  const decayRho = (id: string) =>
    id === 'forecast' && sw
      ? (h: number, tSec: number) => {
          const f = forecastF107(sw, t0 + tSec * 1000)
          return f != null ? densityWith(h, { f107: f, ap: nowAct!.ap }) : densityWith(h, null)
        }
      : (h: number) => densityWith(h, actFor(id))
  const models = [
    ...(sw ? [{ id: 'forecast', label: 'Solar cycle forecast' }, { id: 'now', label: 'Current activity' }] : []),
    ...SCENARIOS.map((x) => ({ id: x.id, label: x.label })),
  ]
  const decay = useMemo(() => naturalDecay(mean.perigeeAlt, mean.e, bc, 200, decayRho(active)), [mean, bc, active, sw]) // eslint-disable-line react-hooks/exhaustive-deps
  const compareDecay = useMemo(
    () => (mean.perigeeAlt < 1200 ? models.map((m) => ({ ...m, d: naturalDecay(mean.perigeeAlt, mean.e, bc, 200, decayRho(m.id)) })) : []),
    [mean, bc, sw], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const burnTime = t0 + delayMin * 60_000
  const state = useMemo(() => propagateRecord(record, burnTime), [record, burnTime])
  const after = state ? orbitAfterBurn(state.position, state.velocity, dv) : null
  const dvMin = useMemo(() => (state ? dvForPerigee(state.position, state.velocity, 60) : 0), [state])
  const rMag = state ? Math.hypot(state.position.x, state.position.y, state.position.z) : 0
  const vMag = state ? Math.hypot(state.velocity.x, state.velocity.y, state.velocity.z) : 0

  // Cualquier cambio invalida la simulación anterior
  useEffect(() => onResult(null), [dv, delayMin, bc, record]) // eslint-disable-line react-hooks/exhaustive-deps

  const goApogee = () => {
    let best = 0
    let bestR = 0
    for (let m = 0; m <= mean.periodMin; m += mean.periodMin / 360) {
      const pv = propagateRecord(record, t0 + m * 60_000)
      if (!pv) continue
      const r = Math.hypot(pv.position.x, pv.position.y, pv.position.z)
      if (r > bestR) {
        bestR = r
        best = m
      }
    }
    setDelayMin(Math.round(best * 10) / 10)
  }

  const simulate = () => {
    if (!state) return
    setRunning(true)
    setTimeout(() => {
      const act = actFor(active)
      const res = simulateReentry(state.position, applyBurn(state.velocity, -dv), burnTime, bc, 72, (h) => densityWith(h, act))
      onResult(res)
      setRunning(false)
    }, 20)
  }

  const impact = result?.impact
  const ocean = impact && maskReady ? isOcean(impact.lat, impact.lon) : null
  const highOrbit = mean.perigeeAlt > 2000

  return (
    <>
      <Lead short={<>How long the object will stay up on its own, and what happens if you bring it down on purpose.</>}>
        End-of-life analysis. Below about 600 km, aerodynamic drag causes natural orbital decay. A controlled reentry needs a retrograde
        burn that drops perigee into the dense atmosphere and confines the impact zone.
      </Lead>

      <Full>
      <Table caption="Aerodynamic parameters">
        <Row
          sym="BC"
          label="Ballistic coefficient"
          value={
            <input
              className="cell-input"
              type="number"
              min={10}
              max={2000}
              step={5}
              value={bc}
              onChange={(e) => setBc(Math.min(2000, Math.max(10, Number(e.target.value))))}
              aria-label="Ballistic coefficient"
            />
          }
          unit="kg/m²"
          explain={{
            text: (
              <>
                Mass divided by reference area times drag coefficient. A higher BC means less deceleration and a longer orbital life. Typical
                satellite range: 20–200 kg/m².{' '}
                {fromBstar ? `Initial value estimated from B* (${fx(fromBstar, 0)} kg/m²).` : 'B* does not give a physically plausible value; 100 kg/m² is assumed.'}
              </>
            ),
            tex: 'BC = \\frac{m}{C_D\\,A},\\qquad a_{\\text{drag}} = \\frac{1}{2}\\,\\frac{\\rho\\,v^2}{BC}',
            calc: `a_{\\text{drag}}(h_p) = \\tfrac{1}{2}\\cdot${tn(density(Math.max(0, mean.perigeeAlt)) * 1e12, 2)}\\cdot10^{-12}\\cdot(${tn(vMag * 1000, 0)})^2 / ${bc} = ${tn((0.5 * density(Math.max(0, mean.perigeeAlt)) * (vMag * 1000) ** 2) / bc * 1e6, 2)}\\ \\mu\\text{m/s}^2`,
          }}
        />
      </Table>
      </Full>

      {sw && <SpaceWeatherBlock sw={sw} />}

      <Full>
      <section className="block">
        <h3 className="block-title">Atmosphere model</h3>
        <div className="btn-row" role="radiogroup" aria-label="Atmosphere model">
          {models.map((m) => (
            <button key={m.id} className="btn small" role="radio" aria-checked={active === m.id} aria-pressed={active === m.id} onClick={() => setModel(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        <p className="block-note">
          {active === 'mean'
            ? 'Vallado’s exponential atmosphere, an average over the solar cycle.'
            : active === 'forecast'
              ? 'King-Hele density driven by NOAA’s monthly F10.7 forecast: the decay feels the solar cycle as it goes. After the forecast ends, a cycle-average atmosphere is used.'
              : `King-Hele density with F10.7 = ${fx(actFor(active)?.f107 ?? 0, 0)} sfu and Ap = ${fx(actFor(active)?.ap ?? 0, 0)}, held constant.`}
          {!sw && ' Live solar data was not available when the catalog was generated; run npm run fetch-data with a connection.'}
        </p>
      </section>
      </Full>

      <section className="block">
        <h3 className="block-title">Orbital decay without a burn</h3>
        <p className="decay-result">
          Estimated orbital lifetime: <strong>{lifetimeText(decay.days, decay.reentered)}</strong>
          {highOrbit && '. Atmospheric density at this altitude is negligible for decay'}.
        </p>
        {decay.reentered && decay.series.length > 2 && (
          <LineChart
            data={decay.series.map((s) => ({ x: s.days, y: s.h }))}
            label="Predicted mean altitude over time"
            formatX={(d) => (decay.days > 730 ? `${fx(d / 365.25, 1)} y` : `${fx(d, 0)} d`)}
            formatY={(h) => fx(h, 0)}
            yUnit="km"
          />
        )}
        <Full>
        <table className="data">
          <tbody>
            <Row
              label="Model"
              value="da/dt from drag"
              explain={{
                text: (
                  <>
                    Drag removes orbital energy every revolution; as the object descends, density rises and decay speeds up. With solar
                    activity, the King-Hele model raises the exospheric temperature T, which stretches the scale height H and lifts dense air to
                    higher altitudes.
                  </>
                ),
                tex: '\\frac{da}{dt} = -\\frac{\\rho(h)\\,\\sqrt{\\mu\\,a}}{BC},\\qquad \\rho = 6\\cdot10^{-10}\\,e^{-(h-175)/H},\\quad H = \\frac{900 + 2.5(F_{10.7}-70) + 1.5\\,A_p}{27 - 0.012\\,(h-200)}',
              }}
            />
            {compareDecay.map((c) => (
              <Row key={c.id} label={`Lifetime: ${c.label}`} value={lifetimeText(c.d.days, c.d.reentered)} tone={c.id === active ? 'active' : undefined} />
            ))}
          </tbody>
        </table>
        </Full>
        <p className="block-note">
          Debris mitigation: the long-standing guideline capped post-mission time in LEO at 25 years; in 2022 the US FCC adopted a 5-year limit
          for the satellites it licenses.
        </p>
      </section>
      <MoreDetail what="the ballistic coefficient, the atmosphere model and the lifetime under each solar scenario" />

      <section className="block">
        <h3 className="block-title">Deorbit burn (impulsive)</h3>
        <div className="slider">
          <label htmlFor="dv">
            Retrograde Δv <strong>{fx(dv, 0)} m/s</strong>
          </label>
          <input id="dv" type="range" min={0} max={Math.max(400, Math.ceil(dvMin * 1.6))} step={1} value={dv} onChange={(e) => setDv(Number(e.target.value))} />
          <div className="btn-row">
            <button className="btn small" onClick={() => setDv(Math.ceil(dvMin))}>
              Minimum Δv, h_p = 60 km ({fx(Math.ceil(dvMin), 0)} m/s)
            </button>
          </div>
        </div>
        <div className="slider">
          <label htmlFor="delay">
            Ignition at <strong>T+{fx(delayMin, 1)} min</strong>
          </label>
          <input id="delay" type="range" min={0} max={Math.round(mean.periodMin)} step={0.5} value={delayMin} onChange={(e) => setDelayMin(Number(e.target.value))} />
          <div className="btn-row">
            <button className="btn small" onClick={goApogee}>
              Next apogee
            </button>
            <button className="btn small ghost" onClick={() => setDelayMin(0)}>
              Now
            </button>
          </div>
          <p className="block-note">The ignition time moves the impact zone along the ground track.</p>
        </div>

        {after && (
          <table className="data">
            <tbody>
              <Row
                sym={<>h<sub>p</sub>′</>}
                label="Perigee after burn"
                value={fx(after.perigeeAlt, 1)}
                unit="km"
                tone={after.perigeeAlt < 80 ? 'warn' : after.perigeeAlt < 150 ? 'caution' : undefined}
                explain={{
                  text: (
                    <>
                      A retrograde burn lowers the specific energy and the semi-major axis; the burn point becomes apogee and perigee drops at the
                      diametrically opposite point. With h_p′ &lt; ~80 km, reentry happens within the same revolution.
                    </>
                  ),
                  tex: "\\frac{v'^2}{2} - \\frac{\\mu}{r} = -\\frac{\\mu}{2a'},\\qquad h_p' = a'(1-e') - R_\\oplus",
                  calc: `v' = ${tn(vMag, 3)} - ${tn(dv / 1000, 3)} = ${tn(vMag - dv / 1000, 3)}\\ \\text{km/s}\\ \\Rightarrow\\ a' = ${tn(after.a, 1)}\\ \\text{km},\\ h_p' = ${tn(after.perigeeAlt, 1)}\\ \\text{km}`,
                }}
              />
              <Row sym={<>h<sub>a</sub>′</>} label="Apogee after burn" value={fx(after.apogeeAlt, 1)} unit="km" />
              <Row label="Altitude at ignition" value={fx(rMag - RE, 1)} unit="km" />
            </tbody>
          </table>
        )}

        <div className="btn-row">
          <button className="btn primary" onClick={simulate} disabled={running || !state}>
            {running ? 'Propagating…' : 'Propagate reentry'}
          </button>
          {result && (
            <button className="btn ghost" onClick={() => onResult(null)}>
              Clear trajectory
            </button>
          )}
        </div>
        <p className="block-note">
          RK4 numerical integration with central gravity, the J2 perturbation and aerodynamic drag in a co-rotating atmosphere. The resulting
          trajectory is drawn on the globe.
        </p>
      </section>

      {result?.status === 'no-reentry' && (
        <p className="callout">
          With Δv = {fx(dv, 0)} m/s the lowest altitude reached is {fx(result.minAlt, 0)} km: density is too low to cause reentry within the
          72 h horizon. At least {fx(Math.ceil(dvMin), 0)} m/s is needed.
        </p>
      )}

      {result?.status === 'impact' && impact && (
        <>
          <Table caption="Propagation results">
            <Row label="Time to entry interface" value={result.entry ? duration(result.entry.t - result.burnTime).slice(1) : '—'} />
            <Row
              sym={<>v<sub>EI</sub></>}
              label="Velocity at entry interface"
              value={result.entry ? fx(result.entry.speed, 3) : '—'}
              unit="km/s"
              explain={{
                text: <>Velocity relative to the atmosphere at 120 km, close to orbital speed (Mach ~25). Almost all the specific kinetic energy is dissipated as heat.</>,
                tex: `E = \\tfrac{1}{2}v^2 \\approx ${tn(((result.entry?.speed ?? 0) * 1000) ** 2 / 2 / 1e6, 1)}\\ \\text{MJ/kg}`,
              }}
            />
            <Row
              sym="γ"
              label="Flight path angle"
              value={result.entry ? fx(result.entry.gammaDeg, 2) : '—'}
              unit="°"
              explain={{
                text: (
                  <>
                    Angle between the relative velocity and the local horizon at the entry interface. Too shallow a γ leads to a skip trajectory;
                    too steep raises loads and heat flux. Crewed capsules fly between −1° and −2°.
                  </>
                ),
                tex: '\\gamma = \\arcsin\\left(\\frac{\\vec r\\cdot\\vec v_{\\text{rel}}}{|\\vec r|\\,|\\vec v_{\\text{rel}}|}\\right)',
              }}
            />
            <Row
              label={`Peak deceleration (at ${fx(result.maxDecel?.h ?? 0, 0)} km)`}
              value={result.maxDecel ? fx(result.maxDecel.g, 1) : '—'}
              unit="g"
              tone="caution"
              explain={{ text: <>In a ballistic entry (L/D = 0) the peak is around 8 g; a lifting capsule brings it down to 3–4 g.</> }}
            />
            <Row
              sym="q"
              label={`Dynamic pressure (at ${fx(result.maxQ?.h ?? 0, 0)} km)`}
              value={result.maxQ ? fx(result.maxQ.kPa, 1) : '—'}
              unit="kPa"
              explain={{ text: <>Aerodynamic load on the vehicle. Satellites without a heat shield break up around 78 km, and the debris spreads over hundreds of kilometers.</>, tex: 'q = \\tfrac{1}{2}\\rho v^2' }}
            />
            <Row label="Total time to impact" value={duration(impact.t - result.burnTime).slice(1)} />
            <Row label="Impact velocity" value={fx(impact.speed * 1000, 0)} unit="m/s" explain={{ text: <>In the troposphere the object approaches its terminal velocity.</> }} />
          </Table>

          <section className="block impact">
            <h3 className="block-title">Impact point</h3>
            <p className="impact-coords">
              {latStr(impact.lat, 2)} {lonStr(impact.lon, 2)}
            </p>
            <p className="block-note">
              {ocean === true && 'Ocean impact.'}
              {ocean === false && 'Impact on land: a real controlled reentry would adjust the ignition time.'} Distance to Point Nemo:{' '}
              {fx(greatCircleKm(impact.lat, impact.lon, POINT_NEMO.lat, POINT_NEMO.lon), 0)} km. Point Nemo is the South Pacific oceanic pole of
              inaccessibility, the target area for controlled reentries of large structures (Mir in 2001; planned for the ISS).
            </p>
            <div className="btn-row">
              <button className="btn small" onClick={() => onFlyTo(impact.lat, impact.lon)}>
                Center on impact point
              </button>
            </div>
            <p className="block-note">
              Indicative result: thermospheric density variability and an uncertainty of a few minutes in reentry time shift the impact by
              thousands of kilometers along the track.
            </p>
          </section>
        </>
      )}

      <p className="block-note">
        Entry interface: {ENTRY_INTERFACE_KM} km. Constants: μ = {fx(MU, 1)} km³/s², R⊕ = {fx(RE, 3)} km.
      </p>
    </>
  )
}
