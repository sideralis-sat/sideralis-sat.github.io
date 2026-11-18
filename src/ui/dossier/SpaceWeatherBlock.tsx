import type { SpaceWeather } from '../../lib/spaceWeather'
import { currentActivity } from '../../lib/spaceWeather'
import { LineChart } from '../charts/LineChart'
import { fx } from '../format'
import { Row } from './Row'
import { Fold } from '../detail'

const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })

/** Estado de la actividad solar y geomagnética (NOAA SWPC) */
export function SpaceWeatherBlock({ sw }: { sw: SpaceWeather }) {
  const now = currentActivity(sw)
  const f107 = sw.f107.map((d) => ({ x: Date.parse(d.t), y: d.flux }))
  const cycle = sw.cycle.map((c) => ({ x: Date.parse(`${c.month}-15T00:00:00Z`), y: c.f107 }))
  const storm = now.kpMax >= 5
  return (
    <Fold title="Space weather" summary={`F10.7 ${fx(now.f107, 0)} sfu, Kp max ${fx(now.kpMax, 1)}`}>
      <table className="data">
        <tbody>
          <Row
            label="Solar flux F10.7"
            value={fx(now.f107, 0)}
            unit="sfu"
            tone="active"
            explain={{
              text: (
                <>
                  Solar radio flux at 10.7 cm, measured daily at Penticton (Canada). It tracks the extreme ultraviolet that heats the thermosphere:
                  about 70 sfu at solar minimum and over 200 at maximum. 1 sfu = 10⁻²² W m⁻² Hz⁻¹.
                </>
              ),
            }}
          />
          <Row label="F10.7, 90-day mean" value={fx(now.mean90, 0)} unit="sfu" />
          <Row
            label="Ap, last 24 h"
            value={fx(now.ap, 0)}
            explain={{
              text: (
                <>
                  Planetary geomagnetic index on a linear scale (the 3-hourly Kp is logarithmic). During storms the solar wind dumps energy into the
                  polar thermosphere and density at 400 km can double within hours, which is what doomed 38 freshly launched Starlink satellites in
                  February 2022.
                </>
              ),
            }}
          />
          <Row label="Kp max, last 24 h" value={fx(now.kpMax, 1)} tone={storm ? 'warn' : undefined} unit={storm ? 'storm' : ''} />
        </tbody>
      </table>
      {f107.length > 2 && (
        <LineChart data={f107} label="Daily F10.7, last weeks" formatX={(x) => day.format(x)} formatY={(y) => fx(y, 0)} yUnit="sfu" height={130} />
      )}
      {cycle.length > 2 && (
        <LineChart
          data={cycle}
          label="Predicted F10.7, solar cycle 25"
          formatX={(x) => String(new Date(x).getUTCFullYear())}
          formatY={(y) => fx(y, 0)}
          yUnit="sfu (monthly)"
          height={130}
        />
      )}
      <p className="block-note">
        Source: NOAA Space Weather Prediction Center, downloaded {day.format(Date.parse(sw.generatedAt))}. Solar cycle 25 peaked around 2024–25 and is
        now declining towards a minimum near 2030, so a satellite launched today decays more slowly each year.
      </p>
    </Fold>
  )
}
