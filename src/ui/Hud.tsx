import { useEffect, useState } from 'react'
import { julianDate } from '../lib/astrodynamics'
import type { SimClock } from '../lib/clock'
import { frameAngles, type FrameMode } from '../lib/frame'
import { TILE_ATTRIBUTION } from '../lib/imagery'
import { viewState } from '../lib/viewState'
import { count, fx, latStr, lonStr, timeAgo } from './format'

interface Props {
  clock: SimClock
  mode: FrameMode
  shown: number
  total: number
  generatedAt: string
  onResetFilters: () => void
}

/** Barra inferior con lecturas técnicas: cursor, cámara, tiempo sidéreo y datos */
export function Hud({ clock, mode, shown, total, generatedAt, onResetFilters }: Props) {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((t) => t + 1), 200)
    return () => clearInterval(id)
  }, [])
  const now = clock.now()
  const gmst = (frameAngles(now, mode).gmst * 180) / Math.PI
  const c = viewState.cursor
  const generated = Date.parse(generatedAt)
  const stale = Date.now() - generated > 3 * 86_400_000

  return (
    <footer className="hud">
      <dl className="hud-cells">
        <div className="hud-cell hud-cursor">
          <dt>Cursor</dt>
          <dd>{c ? `${latStr(c.lat, 4)}  ${lonStr(c.lon, 4)}` : '—'}</dd>
        </div>
        <div className="hud-cell hud-tech">
          <dt>Camera</dt>
          <dd>
            h {fx(viewState.altitudeKm, 0)} km  ψ {fx(viewState.headingDeg, 1)}°  θ {fx(viewState.tiltDeg, 1)}°
          </dd>
        </div>
        <div className="hud-cell hud-tech">
          <dt>JD</dt>
          <dd>{fx(julianDate(now), 5)}</dd>
        </div>
        <div className="hud-cell hud-tech">
          <dt>GMST</dt>
          <dd>{fx(gmst, 4)}°</dd>
        </div>
        <div className="hud-cell">
          <dt>Objects</dt>
          <dd>
            {shown === 0 ? (
              <button className="link" onClick={onResetFilters}>
                0 shown: reset filters
              </button>
            ) : (
              `${count(shown)} / ${count(total)}`
            )}
          </dd>
        </div>
      </dl>
      <p className={`hud-source ${stale ? 'is-stale' : ''}`}>
        GP elements:{' '}
        <a href="https://celestrak.org" target="_blank" rel="noreferrer">
          CelesTrak
        </a>{' '}
        ({timeAgo(generated)}
        {stale && ', out of date: run npm run fetch-data'}). SGP4 propagation. Imagery: NASA, {TILE_ATTRIBUTION}.
      </p>
    </footer>
  )
}
