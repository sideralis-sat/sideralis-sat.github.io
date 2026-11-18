import { useState } from 'react'
import type { LightSegment, LightState } from '../../lib/power'
import { fx } from '../format'

// Validados para daltonismo y contraste sobre el papel (#f4f5f7)
export const LIGHT_COLORS: Record<LightState, string> = { sun: '#b97a0c', penumbra: '#a33a12', umbra: '#5446d0' }
export const LIGHT_LABELS: Record<LightState, string> = { sun: 'Sunlight', penumbra: 'Penumbra', umbra: 'Umbra' }

const pad = (n: number) => String(n).padStart(2, '0')
const hhmm = (ms: number) => {
  const d = new Date(ms)
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

/** Línea temporal de luz y sombra: segmentos con hueco de 2 px, leyenda y lectura al pasar */
export function LightBar({ segments, now }: { segments: LightSegment[]; now: number }) {
  const [hover, setHover] = useState<LightSegment | null>(null)
  if (!segments.length) return null
  const t0 = segments[0].start
  const t1 = segments[segments.length - 1].end
  const W = 340
  const x = (t: number) => ((t - t0) / (t1 - t0)) * W
  const ticks = 4
  return (
    <figure className="chart lightbar">
      <svg viewBox={`0 0 ${W} 40`} role="img" aria-label="Sunlight and eclipse sequence over the next revolutions">
        {segments.map((s) => (
          <rect
            key={s.start}
            x={x(s.start) + 1}
            width={Math.max(1, x(s.end) - x(s.start) - 2)}
            y={4}
            height={18}
            rx={2}
            fill={LIGHT_COLORS[s.state]}
            opacity={hover && hover !== s ? 0.55 : 1}
            onPointerEnter={() => setHover(s)}
            onPointerLeave={() => setHover(null)}
          />
        ))}
        {now >= t0 && now <= t1 && <line x1={x(now)} x2={x(now)} y1={0} y2={26} className="chart-marker" />}
        {Array.from({ length: ticks + 1 }, (_, i) => t0 + ((t1 - t0) * i) / ticks).map((t, i) => (
          <text key={t} x={x(t)} y={37} className="chart-tick" textAnchor={i === 0 ? 'start' : i === ticks ? 'end' : 'middle'}>
            {hhmm(t)}
          </text>
        ))}
      </svg>
      <figcaption className="chart-readout">
        {hover ? (
          <>
            <strong>{fx((hover.end - hover.start) / 60000, 1)} min</strong> <span>{LIGHT_LABELS[hover.state]}, {hhmm(hover.start)} to {hhmm(hover.end)} UTC</span>
          </>
        ) : (
          <span className="legend">
            {(Object.keys(LIGHT_COLORS) as LightState[]).map((k) => (
              <span key={k}>
                <i style={{ background: LIGHT_COLORS[k] }} />
                {LIGHT_LABELS[k]}
              </span>
            ))}
          </span>
        )}
      </figcaption>
    </figure>
  )
}
