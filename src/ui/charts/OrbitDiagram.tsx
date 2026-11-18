import { RE } from '../../lib/astrodynamics'

/**
 * La órbita vista desde encima de su plano, a escala: la Tierra en un foco, el perigeo a
 * la derecha, el apogeo a la izquierda y el satélite en su anomalía verdadera ν.
 */
export function OrbitDiagram({ a, e, nu }: { a: number; e: number; nu: number | null }) {
  const W = 340
  const H = 200
  const ra = a * (1 + e)
  const rp = a * (1 - e)
  const b = a * Math.sqrt(1 - e * e)
  const M = 58 // margen lateral para las etiquetas
  const scale = Math.min((W - 2 * M) / (ra + rp), (H - 30) / (2 * Math.max(b, RE)))
  const fx = M + ra * scale // foco (centro de la Tierra) en x
  const cy = H / 2
  const cx = fx - a * e * scale // centro de la elipse
  const theta = nu ?? 0
  const r = (a * (1 - e * e)) / (1 + e * Math.cos(theta))
  const sx = fx + r * Math.cos(theta) * scale
  const sy = cy - r * Math.sin(theta) * scale
  const earthR = RE * scale
  return (
    <figure className="chart orbit-diagram">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Orbit drawn to scale">
        <ellipse cx={cx} cy={cy} rx={a * scale} ry={b * scale} className="od-orbit" />
        <line x1={fx - ra * scale} x2={fx + rp * scale} y1={cy} y2={cy} className="od-apsides" />
        <circle cx={fx} cy={cy} r={earthR} className="od-earth" />
        <circle cx={fx + rp * scale} cy={cy} r={3} className="od-apsis" />
        <circle cx={fx - ra * scale} cy={cy} r={3} className="od-apsis" />
        <text x={fx + rp * scale + 7} y={cy + 4} textAnchor="start" className="chart-tick">perigee</text>
        <text x={fx - ra * scale - 7} y={cy + 4} textAnchor="end" className="chart-tick">apogee</text>
        {nu !== null && (
          <>
            <line x1={fx} y1={cy} x2={sx} y2={sy} className="od-radius" />
            <circle cx={sx} cy={sy} r={5} className="od-sat" />
            <text x={sx + 8} y={sy - 6} className="chart-ref-label">
              ν = {Math.round((theta * 180) / Math.PI)}°
            </text>
          </>
        )}
      </svg>
      <figcaption className="chart-readout">
        <span>Orbital plane to scale, Earth at the focus. {e < 0.01 ? 'Near-circular orbit: both apsides lie at almost the same distance from the focus.' : ''}</span>
      </figcaption>
    </figure>
  )
}
