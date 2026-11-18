import { useEffect, useState } from 'react'
import type { SimClock } from '../lib/clock'
import { duration, isoUtc } from './format'
import { PauseIcon, PlayIcon, ReverseIcon } from './icons'

const SPEEDS = [1, 10, 60, 600]

/** Reloj UTC de la simulación con pausa, aceleración y sentido del tiempo */
export function TimeControls({ clock }: { clock: SimClock }) {
  const [, tick] = useState(0)
  const [lastSpeed, setLastSpeed] = useState(1)
  useEffect(() => {
    const id = setInterval(() => tick((t) => t + 1), 250)
    return () => clearInterval(id)
  }, [])

  const now = clock.now()
  const speed = clock.speed
  const paused = speed === 0
  const reverse = (paused ? lastSpeed : speed) < 0
  const mag = Math.abs(paused ? lastSpeed : speed)
  const live = clock.isLive()
  const set = (s: number) => {
    clock.setSpeed(s)
    if (s !== 0) setLastSpeed(s)
    tick((t) => t + 1)
  }

  return (
    <div className="time" role="group" aria-label="Simulation time">
      <div className="time-readout">
        <time dateTime={new Date(now).toISOString()}>
          <span className="time-date">{isoUtc(now).slice(0, 10)} </span>
          {isoUtc(now).slice(11, 16)}
          <span className="time-sec">{isoUtc(now).slice(16)}</span>
        </time>
        <span className="time-zone">UTC</span>
        {live ? (
          <span className="time-live">Live</span>
        ) : (
          <>
            <span className="time-offset">{duration(now - Date.now())}</span>
            {/* Vuelta al tiempo real en el mismo hueco que la marca «Live», para no ensanchar la barra */}
            <button
              className="time-golive"
              title={`${duration(now - Date.now())} from now. Back to live: real time at ×1`}
              aria-label="Back to live"
              onClick={() => {
                clock.goLive()
                setLastSpeed(1)
                tick((t) => t + 1)
              }}
            >
              Live
            </button>
          </>
        )}
      </div>
      <div className="time-buttons">
        <button className="seg-btn" aria-label={paused ? 'Resume' : 'Pause'} title={paused ? 'Resume' : 'Pause'} onClick={() => set(paused ? lastSpeed : 0)}>
          {paused ? <PlayIcon /> : <PauseIcon />}
        </button>
        <button
          className="seg-btn time-reverse"
          aria-pressed={reverse}
          aria-label="Run time backwards"
          title="Propagate backwards"
          onClick={() => set(-(paused ? lastSpeed : speed))}
        >
          <ReverseIcon />
        </button>
        <div className="seg speed-full" role="radiogroup" aria-label="Time rate">
          {SPEEDS.map((s) => (
            <button key={s} className="seg-btn" role="radio" aria-checked={mag === s} onClick={() => set(reverse ? -s : s)}>
              ×{s}
            </button>
          ))}
        </div>
        {/* En barras estrechas los botones de ritmo y sentido se cambian por un desplegable */}
        <select className="speed-compact" aria-label="Time rate" value={reverse ? -mag : mag} onChange={(e) => set(Number(e.target.value))}>
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              ×{s}
            </option>
          ))}
          {SPEEDS.map((s) => (
            // Ritmo negativo: el tiempo corre hacia atrás. Etiqueta corta para que el desplegable no ensanche la barra
            <option key={-s} value={-s} aria-label={`×${s} backwards`}>
              ×−{s}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
