import type { Look } from '../../lib/passes'

const R = 120
const C = 140

const toXY = (az: number, el: number) => {
  const r = ((90 - Math.max(0, el)) / 90) * R
  const a = (az * Math.PI) / 180
  return [C + r * Math.sin(a), C - r * Math.cos(a)]
}

/** Carta del cielo (proyección polar): centro = cénit, borde = horizonte, norte arriba */
export function SkyPlot({ track, live }: { track: Look[]; live?: Look | null }) {
  const pts = track.filter((l) => l.el >= 0)
  const d = pts.map((l, i) => {
    const [x, y] = toXY(l.az, l.el)
    return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join('')
  const first = pts[0]
  const last = pts[pts.length - 1]
  let top = pts[0]
  for (const l of pts) if (l.el > (top?.el ?? -1)) top = l
  return (
    <figure className="chart skyplot">
      <svg viewBox="0 0 280 280" role="img" aria-label="Azimuth-elevation polar plot of the pass">
        {[0, 30, 60].map((el) => (
          <g key={el}>
            <circle cx={C} cy={C} r={((90 - el) / 90) * R} className="sky-ring" />
            <text x={C + 3} y={C - ((90 - el) / 90) * R + 11} className="chart-tick">
              {el}°
            </text>
          </g>
        ))}
        <line x1={C - R} x2={C + R} y1={C} y2={C} className="sky-ring" />
        <line x1={C} x2={C} y1={C - R} y2={C + R} className="sky-ring" />
        {[
          ['N', 0],
          ['E', 90],
          ['S', 180],
          ['W', 270],
        ].map(([t, az]) => {
          const [x, y] = toXY(az as number, -8)
          return (
            <text key={t} x={x} y={Number(y) + 4} className="sky-card" textAnchor="middle">
              {t}
            </text>
          )
        })}
        <path d={d} fill="none" stroke="var(--plot)" strokeWidth={2} strokeLinecap="round" />
        {first && <circle cx={toXY(first.az, first.el)[0]} cy={toXY(first.az, first.el)[1]} r={4} className="sky-aos" />}
        {last && <rect x={toXY(last.az, last.el)[0] - 4} y={toXY(last.az, last.el)[1] - 4} width={8} height={8} className="sky-los" />}
        {top && (
          <text x={toXY(top.az, top.el)[0] + 7} y={toXY(top.az, top.el)[1] - 5} className="chart-ref-label">
            {Math.round(top.el)}°
          </text>
        )}
        {live && live.el >= 0 && <circle cx={toXY(live.az, live.el)[0]} cy={toXY(live.az, live.el)[1]} r={6} className="sky-live" />}
      </svg>
      <figcaption className="chart-readout legend">
        <span>
          <i className="dot-aos" />
          AOS
        </span>
        <span>
          <i className="sq-los" />
          LOS
        </span>
        {live && live.el >= 0 && (
          <span>
            <i className="dot-live" />
            Current position
          </span>
        )}
      </figcaption>
    </figure>
  )
}
