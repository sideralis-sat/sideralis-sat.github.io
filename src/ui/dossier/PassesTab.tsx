import { useEffect, useMemo, useState } from 'react'
import type { SatRecord } from '../../data/types'
import { compass, dopplerShift, lookAt, predictPasses, sunElevation, type Pass, type Station } from '../../lib/passes'
import { LineChart } from '../charts/LineChart'
import { SkyPlot } from '../charts/SkyPlot'
import { tn } from '../Tex'
import { fx, latStr, lonStr } from '../format'
import { LinkBudget } from './LinkBudget'
import { Lead, Row, Table } from './Row'
import { Fold, Full } from '../detail'

const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
const hm = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })

interface Props {
  record: SatRecord
  station: Station
  now: number
  onStation: (s: Station) => void
  onPickOnGlobe: () => void
  picking: boolean
}

export function PassesTab({ record, station, now, onStation, onPickOnGlobe, picking }: Props) {
  const [minEl, setMinEl] = useState(10)
  const [freqMHz, setFreqMHz] = useState(437.8)
  const [sel, setSel] = useState(0)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  // Recalcula al cambiar satélite, estación o máscara, y cuando el tiempo simulado avanza mucho
  const bucket = Math.floor(now / 1_800_000)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const result = useMemo(() => predictPasses(record, station, now - 15 * 60_000, 48, minEl), [record, station, minEl, bucket])
  const passes = result.kind === 'passes' ? result.passes.filter((p) => p.los > now) : []
  useEffect(() => setSel(0), [record, station, minEl])
  const pass: Pass | undefined = passes[Math.min(sel, passes.length - 1)]

  const live = lookAt(record, station, now, true)
  const sunEl = sunElevation(station, now)

  const useMyLocation = () => {
    setGeoError(null)
    if (!navigator.geolocation) return setGeoError('This browser does not support geolocation.')
    navigator.geolocation.getCurrentPosition(
      (p) => onStation({ name: 'My location', lat: p.coords.latitude, lon: p.coords.longitude, altKm: (p.coords.altitude ?? 0) / 1000 }),
      () => setGeoError('Could not get your position. Check the browser’s location permission, or pick the point on the globe instead.'),
      { enableHighAccuracy: false, timeout: 10_000 },
    )
  }

  const doppler = pass?.track.map((l) => ({ x: l.t, y: dopplerShift(freqMHz * 1e6, l.rangeRate) / 1000 })) ?? []

  return (
    <>
      <Lead short={<>When the object rises over your ground station, how high it climbs and whether you can see it.</>}>
        Visibility windows over the ground station, from acquisition of signal (AOS) to loss of signal (LOS). In LEO each window lasts
        minutes, and the number per day depends on the orbit inclination and the station latitude.
      </Lead>

      <section className="block station">
        <div className="station-head">
          <div>
            <p className="station-name">{station.name}</p>
            <p className="station-coords">
              {latStr(station.lat, 3)}, {lonStr(station.lon, 3)}, {fx(station.altKm * 1000, 0)} m
            </p>
          </div>
          <button className="btn small" onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
            Set station
          </button>
        </div>
        {editing && (
          <div className="station-edit">
            <div className="btn-row">
              <button className="btn small" onClick={useMyLocation}>
                Use my location
              </button>
              <button className="btn small" aria-pressed={picking} onClick={onPickOnGlobe}>
                {picking ? 'Click a point on the globe…' : 'Pick on the globe'}
              </button>
            </div>
            <div className="form-grid">
              <label>
                Latitude <span className="unit">°</span>
                <input type="number" step={0.01} min={-90} max={90} value={station.lat} onChange={(e) => onStation({ ...station, name: 'Custom', lat: Number(e.target.value) })} />
              </label>
              <label>
                Longitude <span className="unit">°</span>
                <input type="number" step={0.01} min={-180} max={180} value={station.lon} onChange={(e) => onStation({ ...station, name: 'Custom', lon: Number(e.target.value) })} />
              </label>
            </div>
            {geoError && <p className="block-note tone-caution">{geoError}</p>}
          </div>
        )}
      </section>

      <Full>
      <Table caption="Current topocentric coordinates">
        <Row
          sym="El"
          label="Elevation"
          value={live ? fx(live.el, 2) : '—'}
          unit="°"
          tone={live && live.el > 0 ? 'good' : undefined}
          explain={{
            text: (
              <>
                Angle above the local horizon plane. In operations a 5–10° elevation mask is applied, because of local obstructions and the
                higher atmospheric attenuation and multipath at low elevation.
              </>
            ),
            tex: 'El = \\arcsin\\left(\\frac{\\rho_Z}{|\\vec\\rho|}\\right),\\qquad \\vec\\rho = \\vec r_{\\text{sat}} - \\vec r_{\\text{station}}\\ \\text{(in South-East-Zenith axes)}',
          }}
        />
        <Row sym="Az" label="Azimuth" value={live ? `${fx(live.az, 1)} (${compass(live.az)})` : '—'} unit="°" explain={{ text: <>Angle in the horizon plane measured clockwise from geographic north.</>, tex: 'Az = \\operatorname{atan2}(\\rho_E,\\ -\\rho_S)' }} />
        <Row sym="ρ" label="Slant range" value={live ? fx(live.range, 0) : '—'} unit="km" />
        <Row
          sym="ṙ"
          label="Range rate"
          value={live ? fx(live.rangeRate, 3) : '—'}
          unit="km/s"
          explain={{ text: <>Time derivative of slant range: negative while approaching, positive while receding. It sets the Doppler shift.</>, tex: '\\dot\\rho = \\frac{d|\\vec\\rho|}{dt}' }}
        />
        <Row label="Sun elevation at station" value={fx(sunEl, 1)} unit="°" explain={{ text: <>With the Sun below −6° (end of civil twilight) a sunlit satellite can be seen with the naked eye.</> }} />
      </Table>
      </Full>

      <section className="block">
        <div className="block-title-row">
          <h3 className="block-title">Pass prediction (48 h)</h3>
          <div className="seg" role="radiogroup" aria-label="Minimum elevation">
            {[0, 10, 30].map((v) => (
              <button key={v} className="seg-btn" role="radio" aria-checked={minEl === v} onClick={() => setMinEl(v)}>
                ≥{v}°
              </button>
            ))}
          </div>
        </div>
        {result.kind === 'always' && (
          <p className="block-note">
            Continuously visible from the station (El {fx(result.look.el, 1)}°, Az {fx(result.look.az, 1)}°), as expected for a geostationary
            object: the antenna can stay fixed.
          </p>
        )}
        {result.kind === 'never' && (
          <p className="block-note">
            No passes above {minEl}° in the next 48 h. Possible causes: inclination too low for the station latitude or, in GEO, a longitude below
            the horizon.
          </p>
        )}
        {passes.length > 0 && (
          <ul className="pass-list">
            {passes.map((p, k) => (
              <li key={p.aos}>
                <button className="pass" aria-pressed={k === sel} onClick={() => setSel(k)}>
                  <span className="pass-day">{dayFmt.format(p.aos)}</span>
                  <span className="pass-time">{hm.format(p.aos)}</span>
                  <span className="pass-el">{fx(p.maxEl, 0)}°</span>
                  <span className="pass-dur">{fx((p.los - p.aos) / 60000, 1)} min</span>
                  <span className="pass-dir">
                    {compass(p.azAos)} → {compass(p.azLos)}
                  </span>
                  {p.visible && <span className="pass-vis" title="Visible to the naked eye">visible</span>}
                  {p.aos <= now && p.los > now && <span className="pass-now">now</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="block-note">Local times. “Visible” means the object is sunlit, the Sun is below −6° and the object is above 10°.</p>
      </section>

      {pass && (
        <>
          <SkyPlot track={pass.track} live={live && now >= pass.aos && now <= pass.los ? live : null} />
          <Table caption={`Pass on ${dayFmt.format(pass.aos)}`}>
            <Row label="Acquisition of signal (AOS)" value={timeFmt.format(pass.aos)} unit={`${fx(pass.azAos, 0)}° ${compass(pass.azAos)}`} />
            <Row label="Time of closest approach (TCA)" value={timeFmt.format(pass.tca)} unit={`${fx(pass.maxEl, 1)}°`} />
            <Row label="Loss of signal (LOS)" value={timeFmt.format(pass.los)} unit={`${fx(pass.azLos, 0)}° ${compass(pass.azLos)}`} />
            <Row label="Duration" value={fx((pass.los - pass.aos) / 60000, 2)} unit="min" />
            <Row label="Minimum slant range" value={fx(Math.min(...pass.track.map((l) => l.range)), 0)} unit="km" />
          </Table>

          <Fold title="Doppler shift" summary={`±${fx(Math.max(...doppler.map((d) => Math.abs(d.y))), 1)} kHz at ${fx(freqMHz, 1)} MHz`}>
            <div className="block-title-row">
              <span className="block-note" style={{ margin: 0 }}>Carrier frequency</span>
              <label className="inline-input">
                f₀
                <input type="number" step={0.001} min={1} value={freqMHz} onChange={(e) => setFreqMHz(Math.max(1, Number(e.target.value)))} />
                MHz
              </label>
            </div>
            <LineChart
              data={doppler}
              label="Doppler shift during the pass"
              formatX={(x) => hm.format(x)}
              formatY={(y) => fx(y, 1)}
              yUnit="kHz"
              refs={[{ y: 0, label: 'TCA' }]}
            />
            <table className="data">
              <tbody>
                <Row
                  sym="Δf"
                  label="Maximum shift"
                  value={`±${fx(Math.max(...doppler.map((d) => Math.abs(d.y))), 2)}`}
                  unit="kHz"
                  explain={{
                    text: (
                      <>
                        The received frequency rises while the satellite approaches and falls as it recedes, crossing zero at TCA. Ground stations
                        correct for it in real time (Doppler tracking) on both uplink and downlink.
                      </>
                    ),
                    tex: 'f = f_0\\left(1 - \\frac{\\dot\\rho}{c}\\right)\\quad\\Rightarrow\\quad \\Delta f = -f_0\\,\\frac{\\dot\\rho}{c}',
                    calc: `\\Delta f_{\\max} \\approx ${tn(freqMHz, 1)}\\cdot10^6\\cdot\\frac{${tn(Math.max(...pass.track.map((l) => Math.abs(l.rangeRate))), 2)}}{299792.458} = ${tn(Math.max(...doppler.map((d) => Math.abs(d.y))), 2)}\\ \\text{kHz}`,
                  }}
                />
              </tbody>
            </table>
          </Fold>
          <LinkBudget pass={pass} freqMHz={freqMHz} onFreq={setFreqMHz} />
        </>
      )}
    </>
  )
}
