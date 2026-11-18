import { useDeferredValue, useMemo, useState } from 'react'
import type { SatRecord } from '../../data/types'
import { meanElements, RE } from '../../lib/astrodynamics'
import { linkAt, LINK_PRESETS } from '../../lib/linkBudget'
import {
  altitudeHistogram,
  ballisticCoefficient,
  collisionProbability,
  deorbitDv,
  dragMakeupPerYear,
  footprintHalfAngle,
  makeRecord,
  MISSION_TYPES,
  recommend,
  REGIONS,
  solarSizing,
  SPACECRAFT,
  ssoInclination,
  type MissionType,
  type OrbitChoice,
  type OrbitKind,
} from '../../lib/missionDesign'
import { G0 } from '../../lib/maneuvers'
import { predictPasses, type Station } from '../../lib/passes'
import { betaSeries, eclipseAnalytic } from '../../lib/power'
import { naturalDecay } from '../../lib/reentry'
import { currentActivity, densityWith, forecastF107, useSpaceWeather } from '../../lib/spaceWeather'
import { LineChart } from '../charts/LineChart'
import { Row } from '../dossier/Row'
import { Fold } from '../detail'
import { fx } from '../format'

interface Props {
  satellites: SatRecord[]
  station: Station
  now: number
  missions: SatRecord[]
  onLaunch: (r: SatRecord) => void
  onRemove: (norad: number) => void
  onShow: (norad: number) => void
}

const PROPULSION = [
  { id: 'none', label: 'None', isp: 0 },
  { id: 'cold', label: 'Cold gas', isp: 70 },
  { id: 'hydrazine', label: 'Hydrazine', isp: 220 },
  { id: 'electric', label: 'Electric', isp: 1200 },
]

const LTDN_OPTIONS = [
  { h: 6, label: '06:00 dawn-dusk' },
  { h: 9.5, label: '09:30' },
  { h: 10.5, label: '10:30' },
  { h: 13.5, label: '13:30' },
]

function years(days: number, reentered: boolean) {
  if (!reentered) return 'over 200 years'
  if (days < 365) return `${fx(days / 30.44, 0)} months`
  return `${fx(days / 365.25, 1)} years`
}

/** Diseñador de misión en tres pasos: misión, satélite y órbita con su análisis */
export function DesignTab(p: Props) {
  const [step, setStep] = useState(1)
  const [type, setType] = useState<MissionType>('imaging')
  const [regionId, setRegionId] = useState('iberia')
  const [life, setLife] = useState(3)
  const [scId, setScId] = useState('3u')
  const [loadW, setLoadW] = useState<number | null>(null)
  const [mass, setMass] = useState<number | null>(null)
  const [prop, setProp] = useState('none')
  const [name, setName] = useState('My satellite')
  const [custom, setCustom] = useState<OrbitChoice | null>(null)
  // Instante de referencia fijo mientras se diseña, para que los resultados no cambien solos
  const [t0] = useState(p.now)

  const region = REGIONS.find((r) => r.id === regionId)!
  const base = SPACECRAFT.find((s) => s.id === scId)!
  const sc = { ...base, massKg: mass ?? base.massKg, loadW: loadW ?? base.loadW }
  const rec = recommend(type, region, sc)
  const orbit = custom ?? rec.orbit
  const deferred = useDeferredValue(orbit)
  const isp = PROPULSION.find((x) => x.id === prop)!.isp
  const sw = useSpaceWeather()

  // Satélite virtual con el que se calcula todo (las mismas rutinas que para los reales)
  const record = useMemo(() => makeRecord(deferred, sc, name || 'My satellite', 990000, t0), [deferred, sc.massKg, sc.dragM2, name, t0]) // eslint-disable-line react-hooks/exhaustive-deps
  const m = useMemo(() => meanElements(record), [record])

  const analysis = useMemo(() => {
    const h = deferred.altKm
    // Cobertura de la región: oportunidades por día (10° para enlaces, 60° para imagen nadir ±25°)
    const minEl = type === 'imaging' ? 60 : 10
    const site = { name: region.label, lat: region.lat, lon: region.lon, altKm: 0 }
    const days = 3
    const pr = region.global ? null : predictPasses(record, site, t0, days * 24, minEl)
    const regionPasses = pr && pr.kind === 'passes' ? pr.passes : []
    const gaps = regionPasses.slice(1).map((q, k) => (q.aos - regionPasses[k].los) / 3_600_000)
    // Potencia: peor eclipse del año (|β| mínimo) y mejor caso
    const betas = betaSeries(record, t0, 365, 2).map((b) => Math.abs(b.beta))
    const ecl = eclipseAnalytic(h, Math.min(...betas))
    const eclBest = eclipseAnalytic(h, Math.max(...betas))
    const eclipseMin = ecl.fraction * m.periodMin
    const solar = solarSizing(sc.loadW, m.periodMin, eclipseMin)
    // Comunicaciones con la estación propia
    const preset = LINK_PRESETS[sc.band === 'uhf' ? 0 : sc.band === 's' ? 1 : 2]
    const cp = predictPasses(record, p.station, t0, 48, 5)
    const commPasses = cp.kind === 'passes' ? cp.passes : []
    let contactS = 0
    let bits = 0
    for (const ps of commPasses) {
      for (let k = 1; k < ps.track.length; k++) {
        const dt = (ps.track[k].t - ps.track[k - 1].t) / 1000
        contactS += dt
        if (linkAt(ps.track[k].range, preset.freqMHz * 1e6, preset.p).margin >= 3) bits += dt * preset.p.rateBps
      }
    }
    // Vida orbital con la previsión solar si está disponible
    const act = sw ? { f107: currentActivity(sw).mean90, ap: currentActivity(sw).ap } : null
    // Más allá del final de la previsión de NOAA se usa la atmósfera media de un ciclo completo
    const rho = (hh: number, tSec: number) => {
      const f = sw && act ? forecastF107(sw, t0 + tSec * 1000) : null
      return f != null && act ? densityWith(hh, { f107: f, ap: act.ap }) : densityWith(hh, null)
    }
    const bc = ballisticCoefficient(sc)
    const decay = naturalDecay(h, 0.0005, bc, 200, rho)
    // Regla de los 5 años: hay que dejar LEO como mucho 5 años después del fin de la misión.
    // Sin propulsión la caída natural debe durar menos de (misión + 5) años; si no, una vela de
    // frenado desplegada al final (BC necesario por bisección, cálculo conservador desde h).
    const limitDays = (isp ? 5 : life + 5) * 365.25
    let sailM2 = 0
    if (!isp && decay.days > limitDays) {
      let lo = 1
      let hi = bc
      for (let k = 0; k < 30; k++) {
        const mid = (lo + hi) / 2
        if (naturalDecay(h, 0.0005, mid, 200, rho).days > 5 * 365.25) hi = mid
        else lo = mid
      }
      sailM2 = Math.max(0, sc.massKg / (2.2 * lo) - sc.dragM2)
    }
    // Δv: mantenimiento contra el arrastre y desorbitado si la caída natural tarda más de 5 años
    // Con propulsión se mantiene la altitud durante la misión y, si la caída natural desde ahí
    // supera 5 años, se hace un encendido final de desorbitado.
    const keep = dragMakeupPerYear(rho(h, 0), h, bc) * life
    const deorbit = decay.days > 5 * 365.25 ? deorbitDv(h) : 0
    const dvTotal = (keep + deorbit) * 1.1
    const propMass = isp ? sc.massKg * (Math.exp(dvTotal / (isp * G0)) - 1) : 0
    // Basura: objetos que cruzan la franja ±25 km
    const hist = altitudeHistogram(p.satellites)
    const band = hist.filter((b) => Math.abs(b.alt - h) <= 25).reduce((s, b) => s + b.n, 0)
    const risk = collisionProbability(band, h, 50, sc.dragM2 * 2, life)
    return { limitDays, regionPasses, gaps, days, minEl, ecl, eclBest, eclipseMin, solar, preset, commPasses, contactS, bits, decay, sailM2, keep, deorbit, dvTotal, propMass, hist, band, risk, bc }
  }, [record, deferred, type, region, sc.loadW, sc.massKg, sc.band, p.station, life, isp, sw, p.satellites]) // eslint-disable-line react-hooks/exhaustive-deps

  const a = analysis
  const lam = footprintHalfAngle(deferred.altKm, type === 'imaging' ? 60 : 10)
  const solarFits = a.solar.areaBody <= sc.bodySolarM2 ? 'body' : a.solar.areaPointing <= sc.deploySolarM2 ? 'deploy' : 'none'
  // Con propulsión el desorbitado final garantiza el cumplimiento
  const compliant = isp > 0 || a.decay.days <= a.limitDays
  const setOrbit = (patch: Partial<OrbitChoice>) => setCustom({ ...orbit, ...patch })

  return (
    <>
      <ol className="steps" aria-label="Design steps">
        {['Mission', 'Spacecraft', 'Results'].map((s, k) => (
          <li key={s}>
            <button className="step" aria-current={step === k + 1 ? 'step' : undefined} onClick={() => setStep(k + 1)}>
              <span className="step-num">{k + 1}</span> {s}
            </button>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <>
          <p className="lead">What will your satellite do, and where does it matter?</p>
          <div className="choice-list" role="radiogroup" aria-label="Mission type">
            {MISSION_TYPES.map((t) => (
              <button key={t.id} className="choice" role="radio" aria-checked={type === t.id} onClick={() => (setType(t.id), setCustom(null))}>
                <span className="choice-title">{t.label}</span>
                <span className="choice-desc">{t.description}</span>
              </button>
            ))}
          </div>
          <label className="select-row">
            Region of interest
            <select value={regionId} onChange={(e) => (setRegionId(e.target.value), setCustom(null))}>
              {REGIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <div className="block-title-row" style={{ marginTop: 14 }}>
            <span className="block-note" style={{ margin: 0 }}>
              Mission duration
            </span>
            <div className="seg" role="radiogroup" aria-label="Mission duration">
              {[1, 3, 5].map((y) => (
                <button key={y} className="seg-btn text" role="radio" aria-checked={life === y} onClick={() => setLife(y)}>
                  {y} {y === 1 ? 'year' : 'years'}
                </button>
              ))}
            </div>
          </div>
          <div className="btn-row" style={{ marginTop: 20 }}>
            <button className="btn primary" onClick={() => setStep(2)}>
              Next: spacecraft
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <p className="lead">How big is it? Size sets mass, power, drag and the radio it can carry.</p>
          <div className="choice-list" role="radiogroup" aria-label="Spacecraft size">
            {SPACECRAFT.map((s) => (
              <button
                key={s.id}
                className="choice"
                role="radio"
                aria-checked={scId === s.id}
                onClick={() => {
                  setScId(s.id)
                  setMass(null)
                  setLoadW(null)
                  setCustom(null)
                }}
              >
                <span className="choice-title">{s.label}</span>
                <span className="choice-desc">
                  {fx(s.massKg, s.massKg < 10 ? 1 : 0)} kg, about {fx(s.loadW, 0)} W of average load, {s.band === 'uhf' ? 'UHF' : s.band === 's' ? 'S-band' : 'X-band'} radio
                </span>
              </button>
            ))}
          </div>
          <div className="form-grid">
            <label>
              Mass <span className="unit">kg</span>
              <input type="number" min={0.5} step={0.5} value={sc.massKg} onChange={(e) => setMass(Math.max(0.5, Number(e.target.value)))} />
            </label>
            <label>
              Average power load <span className="unit">W</span>
              <input type="number" min={0.5} step={0.5} value={sc.loadW} onChange={(e) => setLoadW(Math.max(0.5, Number(e.target.value)))} />
            </label>
          </div>
          <div className="block-title-row" style={{ marginTop: 14 }}>
            <span className="block-note" style={{ margin: 0 }}>
              Propulsion
            </span>
            <div className="seg" role="radiogroup" aria-label="Propulsion">
              {PROPULSION.map((x) => (
                <button key={x.id} className="seg-btn text" role="radio" aria-checked={prop === x.id} onClick={() => setProp(x.id)}>
                  {x.label}
                </button>
              ))}
            </div>
          </div>
          <div className="btn-row" style={{ marginTop: 20 }}>
            <button className="btn primary" onClick={() => setStep(3)}>
              Next: see the results
            </button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <section className="block rec">
            <h3 className="block-title">{custom ? 'Your orbit' : 'Recommended orbit'}</h3>
            <p className="rec-orbit">
              {deferred.kind === 'sso'
                ? `Sun-synchronous, ${fx(deferred.altKm, 0)} km, i = ${fx(ssoInclination(deferred.altKm), 2)}°, descending node at ${LTDN_OPTIONS.find((o) => o.h === deferred.ltdn)?.label.slice(0, 5) ?? fx(deferred.ltdn, 1) + ' h'}`
                : deferred.kind === 'equatorial'
                  ? `Equatorial, ${fx(deferred.altKm, 0)} km`
                  : `Inclined, ${fx(deferred.altKm, 0)} km, i = ${fx(deferred.incDeg, 1)}°`}
            </p>
            {!custom && (
              <ul className="rec-reasons">
                {rec.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            {custom && (
              <button className="link" onClick={() => setCustom(null)}>
                Back to the recommended orbit
              </button>
            )}
          </section>

          <Fold title="Adjust the orbit" summary="altitude, type, node time">
            <div className="seg" role="radiogroup" aria-label="Orbit type" style={{ marginBottom: 6 }}>
              {(
                [
                  ['sso', 'Sun-synchronous'],
                  ['inclined', 'Inclined'],
                  ['equatorial', 'Equatorial'],
                ] as [OrbitKind, string][]
              ).map(([k, l]) => (
                <button key={k} className="seg-btn text" role="radio" aria-checked={orbit.kind === k} onClick={() => setOrbit({ kind: k })}>
                  {l}
                </button>
              ))}
            </div>
            <div className="slider">
              <label htmlFor="alt">
                Altitude <strong>{fx(orbit.altKm, 0)} km</strong>
              </label>
              <input id="alt" type="range" min={300} max={1200} step={10} value={orbit.altKm} onChange={(e) => setOrbit({ altKm: Number(e.target.value) })} />
            </div>
            {orbit.kind === 'inclined' && (
              <div className="slider">
                <label htmlFor="inc">
                  Inclination <strong>{fx(orbit.incDeg, 1)}°</strong>
                </label>
                <input id="inc" type="range" min={5} max={110} step={0.5} value={orbit.incDeg} onChange={(e) => setOrbit({ incDeg: Number(e.target.value) })} />
              </div>
            )}
            {orbit.kind === 'sso' && (
              <div className="btn-row">
                {LTDN_OPTIONS.map((o) => (
                  <button key={o.h} className="btn small" aria-pressed={orbit.ltdn === o.h} onClick={() => setOrbit({ ltdn: o.h })}>
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </Fold>

          <Fold title="Orbit" summary={`${fx(m.periodMin, 1)} min, ${fx(1440 / m.periodMin, 1)} orbits a day`}>
            <table className="data">
              <tbody>
                <Row label="Period" value={fx(m.periodMin, 2)} unit="min" />
                <Row label="Inclination" value={fx(m.i, 2)} unit="°" />
                <Row
                  label="Nodal precession"
                  value={fx(m.raanDot, 3)}
                  unit="°/day"
                  explain={{
                    text: <>J2 turns the orbital plane. A sun-synchronous orbit needs +0.9856 °/day, one turn per year, to keep the same local time.</>,
                    tex: '\\cos i_{SSO} = -\\frac{\\dot\\Omega_\\odot}{\\tfrac{3}{2}\\,n\\,J_2\\,(R_\\oplus/a)^2}',
                  }}
                />
                <Row label="Ground track shift per orbit" value={fx((360 * m.periodMin * 60) / 86164.1, 1)} unit="° west" />
              </tbody>
            </table>
          </Fold>

          <Fold
            title="Coverage"
            summary={region.global ? 'whole Earth' : `${fx(a.regionPasses.length / a.days, 1)} ${type === 'imaging' ? 'imaging chances' : 'passes'} a day over ${region.label}`}
          >
            <table className="data">
              <tbody>
                <Row
                  label={type === 'imaging' ? 'Swath for imaging (nadir ±25°)' : 'Coverage circle (10° elevation)'}
                  value={fx(2 * RE * (lam / 57.2958), 0)}
                  unit="km wide"
                  explain={{
                    text: <>Width on the ground of the region the satellite can serve at one instant, from the central angle λ of its coverage circle.</>,
                    tex: '\\lambda = 90^\\circ - \\varepsilon - \\arcsin\\left(\\frac{R_\\oplus\\cos\\varepsilon}{R_\\oplus + h}\\right)',
                  }}
                />
                {!region.global && (
                  <>
                    <Row label={type === 'imaging' ? 'Imaging chances per day' : 'Passes per day over the region'} value={fx(a.regionPasses.length / a.days, 1)} tone="active" />
                    <Row label="Longest gap without access" value={a.gaps.length ? fx(Math.max(...a.gaps), 1) : '—'} unit="h" />
                  </>
                )}
              </tbody>
            </table>
            <p className="block-note">
              {type === 'imaging'
                ? 'An imaging chance is a pass that climbs above 60° over the region center, close enough to nadir for sharp images.'
                : 'A pass counts when the satellite rises above 10° as seen from the region center.'}
            </p>
          </Fold>

          <Fold title="Power" summary={`${solarFits === 'body' ? 'body panels suffice' : solarFits === 'deploy' ? 'needs deployable panels' : 'more panel than this bus can carry'}, ${fx(a.solar.batteryWh, 0)} Wh battery`}>
            <table className="data">
              <tbody>
                <Row label="Longest eclipse of the year" value={fx(a.eclipseMin, 1)} unit="min" />
                <Row label="Shortest eclipse of the year" value={fx(a.eclBest.fraction * m.periodMin, 1)} unit="min" />
                <Row
                  label="Solar array power required"
                  value={fx(a.solar.psa, 1)}
                  unit="W"
                  explain={{
                    text: <>The array must run the load in sunlight and recharge the battery for the eclipse, through converters that are not perfect (X_e = 0.65, X_d = 0.85).</>,
                    tex: 'P_{sa} = \\frac{P_e T_e / X_e + P_d T_d / X_d}{T_d}',
                  }}
                />
                <Row label="Panel area, Sun-pointing" value={fx(a.solar.areaPointing, 3)} unit="m²" tone={solarFits === 'none' ? 'warn' : undefined} />
                <Row label="Panel area, body-mounted" value={fx(a.solar.areaBody, 3)} unit="m²" />
                <Row label="Available on this bus" value={`${fx(sc.bodySolarM2, 2)} / ${fx(sc.deploySolarM2, 2)}`} unit="m² body / deployed" />
                <Row label="Battery capacity" value={fx(a.solar.batteryWh, 1)} unit="Wh" explain={{ text: <>Eclipse energy at 25 % depth of discharge, which lets a lithium-ion battery survive the ~5,500 cycles of each year in LEO.</> }} />
              </tbody>
            </table>
          </Fold>

          <Fold title="Communications" summary={`${fx(a.commPasses.length / 2, 1)} passes a day, ${fx(a.bits / 8 / 1e6 / 2, a.bits < 8e7 ? 2 : 0)} MB a day`}>
            <table className="data">
              <tbody>
                <Row label="Ground station" value={p.station.name} />
                <Row label="Passes per day (above 5°)" value={fx(a.commPasses.length / 2, 1)} />
                <Row label="Contact time per day" value={fx(a.contactS / 2 / 60, 0)} unit="min" />
                <Row label="Radio" value={a.preset.label} />
                <Row label="Data downlinked per day" value={fx(a.bits / 8 / 1e6 / 2, 2)} unit="MB" tone="active" explain={{ text: <>Sum over all passes of the time with at least 3 dB of link margin, times the data rate.</> }} />
              </tbody>
            </table>
            <p className="block-note">Change the ground station in the Passes tab of any satellite; a second station far from the first roughly doubles the data.</p>
          </Fold>

          <Fold title="Lifetime and debris rules" summary={`${years(a.decay.days, a.decay.reentered)}, ${compliant ? 'meets the 5-year rule' : 'breaks the 5-year rule'}`}>
            <table className="data">
              <tbody>
                <Row label="Natural orbital lifetime" value={years(a.decay.days, a.decay.reentered)} tone={compliant ? 'good' : 'caution'} />
                <Row label="Ballistic coefficient" value={fx(a.bc, 0)} unit="kg/m²" />
                <Row
                  label="5-year rule (FCC, 2022)"
                  value={!compliant ? 'Not met' : isp && a.deorbit ? 'Met with a deorbit burn' : 'Met'}
                  tone={compliant ? 'good' : 'warn'}
                  explain={{
                    text: (
                      <>
                        Satellites licensed in the US must leave LEO within 5 years of the end of their mission, so without propulsion the natural
                        lifetime must stay under the mission length plus 5 years. Europe’s Zero Debris approach points the same way.
                      </>
                    ),
                  }}
                />
                {!compliant && <Row label="Drag sail to deploy at end of mission" value={fx(a.sailM2, 2)} unit="m²" />}
              </tbody>
            </table>
            {a.decay.reentered && a.decay.series.length > 2 && (
              <LineChart
                data={a.decay.series.map((s) => ({ x: s.days / 365.25, y: s.h }))}
                label="Mean altitude over time"
                formatX={(x) => `${fx(x, 1)} y`}
                formatY={(y) => fx(y, 0)}
                yUnit="km"
                height={130}
              />
            )}
            <p className="block-note">{sw
                ? 'Uses NOAA’s solar cycle forecast for the atmosphere while it lasts and a cycle-average atmosphere after that. Solar activity can change the lifetime by a factor of three.'
                : 'Uses a cycle-average atmosphere; solar activity can change the lifetime by a factor of three.'}</p>
          </Fold>

          <Fold title="Δv and propellant" summary={isp ? `${fx(a.dvTotal, 0)} m/s, ${a.propMass < 1 ? `${fx(a.propMass * 1000, 0)} g` : `${fx(a.propMass, 1)} kg`} of propellant` : 'no propulsion on board'}>
            <table className="data">
              <tbody>
                <Row
                  label={`Drag makeup over ${life} ${life === 1 ? 'year' : 'years'}`}
                  value={fx(a.keep, 1)}
                  unit="m/s"
                  explain={{ text: <>Speed lost to drag that has to be restored to hold the altitude.</>, tex: '\\Delta v_{\\text{year}} = \\frac{\\rho v^2}{2\\,BC}\\cdot t_{\\text{year}}' }}
                />
                <Row label="Deorbit at end of life" value={a.deorbit ? fx(a.deorbit, 0) : 'not needed'} unit={a.deorbit ? 'm/s' : ''} />
                <Row label="Total with 10 % margin" value={fx(a.dvTotal, 1)} unit="m/s" tone="active" />
                {isp > 0 && <Row label="Propellant mass" value={fx(a.propMass, 3)} unit="kg" />}
              </tbody>
            </table>
            {!isp && (
              <p className="block-note">
                These are the figures a propulsion system would have to cover. Without one the satellite cannot hold its altitude; it simply decays as
                shown in the lifetime section. Pick a propulsion type in step 2 to size the propellant.
              </p>
            )}
          </Fold>

          <Fold title="Debris environment" summary={`${a.band.toLocaleString('en-US')} tracked objects within ±25 km`}>
            <LineChart
              data={a.hist.map((b) => ({ x: b.alt, y: b.n }))}
              label="Tracked objects crossing each 25 km altitude band"
              formatX={(x) => `${fx(x, 0)} km`}
              formatY={(y) => fx(y, 0)}
              yUnit="objects"
              marker={{ x: deferred.altKm, label: 'your orbit' }}
              height={140}
            />
            <table className="data">
              <tbody>
                <Row
                  label={`Collision probability over ${life} ${life === 1 ? 'year' : 'years'}`}
                  value={a.risk.probability < 1e-4 ? `${(a.risk.probability * 1e6).toFixed(1)} in a million` : `${fx(a.risk.probability * 100, 3)} %`}
                  explain={{
                    text: <>Kinetic gas model with the tracked population only (objects larger than about 10 cm), so it is a lower bound. Fragments below 10 cm are far more numerous and can still disable a satellite.</>,
                    tex: 'P = 1 - e^{-n\\,\\sigma\\,v_{rel}\\,t}',
                  }}
                />
              </tbody>
            </table>
          </Fold>

          <section className="block launch">
            <label className="select-row">
              Name
              <input className="cmp-input" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="btn-row">
              <button className="btn primary" onClick={() => p.onLaunch(makeRecord(orbit, sc, name || 'My satellite', 990001 + p.missions.length + Math.floor(Math.random() * 900), p.now))}>
                Launch it to the globe
              </button>
            </div>
            <p className="block-note">It appears as a virtual satellite: open it like any other to see its passes, power, maneuvers or conjunctions. It is saved in this browser only.</p>
          </section>
        </>
      )}

      {p.missions.length > 0 && (
        <section className="block">
          <h3 className="block-title">Your satellites</h3>
          <ul className="sky-list">
            {p.missions.map((r) => (
              <li key={r.NORAD_CAT_ID} className="mission-item">
                <button className="sky-item" onClick={() => p.onShow(r.NORAD_CAT_ID)}>
                  <span className="dot" style={{ background: '#ff7ad9' }} />
                  <span className="sky-item-name">{r.OBJECT_NAME}</span>
                  <span className="sky-item-meta">
                    {fx(meanElements(r).apogeeAlt, 0)} km, {fx(Number(r.INCLINATION), 1)}°
                  </span>
                </button>
                <button className="icon-btn small" aria-label={`Remove ${r.OBJECT_NAME}`} onClick={() => p.onRemove(r.NORAD_CAT_ID)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
