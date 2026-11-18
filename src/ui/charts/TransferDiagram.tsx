import type { ManeuverPlan } from '../../lib/maneuvers'
import { RE } from '../../lib/astrodynamics'

const S = 300
const C = S / 2

/** Plano de la maniobra a escala: órbita inicial, tramos de transferencia, órbita final e impulsos */
export function TransferDiagram({ plan }: { plan: ManeuverPlan }) {
  const r1 = plan.legs[0].rFrom
  const r2 = plan.legs[plan.legs.length - 1].rTo
  const maxR = Math.max(...plan.legs.map((l) => Math.max(l.rFrom, l.rTo)))
  const k = (C - 22) / maxR
  // Cada tramo recorre media vuelta; el primero empieza a la derecha (ángulo 0)
  const legPath = (i: number) => {
    const leg = plan.legs[i]
    const p = leg.a * (1 - leg.e * leg.e)
    const up = leg.rTo >= leg.rFrom
    let d = ''
    for (let s = 0; s <= 90; s++) {
      const f = s / 90
      const nu = up ? f * Math.PI : Math.PI + f * Math.PI
      const r = (leg.e < 1e-9 ? leg.a : p / (1 + leg.e * Math.cos(nu))) * k
      const ang = i * Math.PI + f * Math.PI
      d += `${s ? 'L' : 'M'}${(C + r * Math.cos(ang)).toFixed(1)},${(C - r * Math.sin(ang)).toFixed(1)}`
    }
    return d
  }
  const burnAt = (j: number) => {
    const r = plan.burns[j].r * k
    const ang = j * Math.PI
    return [C + r * Math.cos(ang), C - r * Math.sin(ang)]
  }
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${S} ${S}`} role="img" aria-label="Transfer geometry to scale" style={{ maxWidth: 300, margin: '0 auto' }}>
        <circle cx={C} cy={C} r={r2 * k} className="tr-target" />
        <circle cx={C} cy={C} r={r1 * k} className="tr-start" />
        <circle cx={C} cy={C} r={RE * k} className="od-earth" />
        {plan.legs.map((_, i) => (
          <path key={i} d={legPath(i)} className="tr-leg" />
        ))}
        {plan.burns.map((b, j) => {
          const [x, y] = burnAt(j)
          return (
            <g key={j}>
              <circle cx={x} cy={y} r={4.5} className="od-sat" />
              <text x={x + (j % 2 ? -8 : 8)} y={y - 8} className="chart-ref-label" textAnchor={j % 2 ? 'end' : 'start'}>
                Δv{j + 1}
              </text>
            </g>
          )
        })}
      </svg>
      <figcaption className="chart-readout">
        <span className="legend">
          <span>
            <i style={{ background: 'var(--ink)' }} /> initial orbit
          </span>
          <span>
            <i style={{ background: 'var(--yellow)' }} /> transfer
          </span>
          <span>
            <i style={{ background: 'var(--plot)' }} /> target orbit
          </span>
        </span>
      </figcaption>
    </figure>
  )
}
