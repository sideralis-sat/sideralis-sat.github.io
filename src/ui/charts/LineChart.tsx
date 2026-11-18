import { useMemo, useRef, useState } from 'react'

export interface LinePoint {
  x: number
  y: number
}

interface Props {
  data: LinePoint[]
  /** Texto accesible / título del gráfico */
  label: string
  formatX: (x: number) => string
  formatY: (y: number) => string
  yUnit: string
  yDomain?: [number, number]
  xTicks?: number[]
  /** Bandas horizontales sombreadas (p. ej. zona sin eclipses) */
  bands?: { from: number; to: number; label: string }[]
  /** Líneas horizontales de referencia */
  refs?: { y: number; label: string }[]
  /** Marca vertical (p. ej. «ahora») */
  marker?: { x: number; label: string }
  color?: string
  height?: number
  /** Series adicionales (se dibujan detrás de la principal) */
  extra?: { data: LinePoint[]; color: string; label: string; dashed?: boolean }[]
}

const W = 340
const PAD = { l: 40, r: 10, t: 10, b: 22 }

/** Gráfico de una serie: línea de 2 px, rejilla discreta y retícula con lectura al pasar el ratón */
export function LineChart({ data, label, formatX, formatY, yUnit, yDomain, xTicks, bands, refs, marker, color = 'var(--plot)', height = 150, extra }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const svg = useRef<SVGSVGElement>(null)
  const H = height
  const { x0, x1, y0, y1, path, sx, sy, yTicks, extraPaths } = useMemo(() => {
    const x0 = data[0]?.x ?? 0
    const x1 = data[data.length - 1]?.x ?? 1
    const all = extra ? [...data, ...extra.flatMap((e) => e.data)] : data
    let y0 = yDomain?.[0] ?? Math.min(...all.map((d) => d.y))
    let y1 = yDomain?.[1] ?? Math.max(...all.map((d) => d.y))
    if (y1 - y0 < 1e-9) {
      y0 -= 1
      y1 += 1
    }
    const sx = (x: number) => PAD.l + ((x - x0) / (x1 - x0 || 1)) * (W - PAD.l - PAD.r)
    const sy = (y: number) => PAD.t + (1 - (y - y0) / (y1 - y0)) * (H - PAD.t - PAD.b)
    const path = data.map((d, i) => `${i ? 'L' : 'M'}${sx(d.x).toFixed(1)},${sy(d.y).toFixed(1)}`).join('')
    const step = niceStep((y1 - y0) / 4)
    const yTicks: number[] = []
    for (let v = Math.ceil(y0 / step) * step; v <= y1 + 1e-9; v += step) yTicks.push(v)
    const extraPaths = (extra ?? []).map((e) => e.data.map((d, i) => `${i ? 'L' : 'M'}${sx(d.x).toFixed(1)},${sy(Math.min(Math.max(d.y, y0), y1)).toFixed(1)}`).join(''))
    return { x0, x1, y0, y1, path, sx, sy, yTicks, extraPaths }
  }, [data, yDomain, H, extra])

  const onMove = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect()
    const x = x0 + (((e.clientX - r.left) / r.width) * W - PAD.l) / (W - PAD.l - PAD.r) * (x1 - x0)
    let best = 0
    for (let i = 1; i < data.length; i++) if (Math.abs(data[i].x - x) < Math.abs(data[best].x - x)) best = i
    setHover(best)
  }
  const h = hover !== null ? data[hover] : null

  return (
    <figure className="chart">
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {bands?.map((b) => (
          <g key={b.label}>
            <rect x={PAD.l} width={W - PAD.l - PAD.r} y={sy(Math.min(b.to, y1))} height={Math.max(0, sy(Math.max(b.from, y0)) - sy(Math.min(b.to, y1)))} className="chart-band" />
          </g>
        ))}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(v)} y2={sy(v)} className="chart-grid" />
            <text x={PAD.l - 5} y={sy(v) + 3} className="chart-tick" textAnchor="end">
              {formatY(v)}
            </text>
          </g>
        ))}
        {refs?.filter((r) => r.y >= y0 && r.y <= y1).map((r) => (
          <g key={r.label}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(r.y)} y2={sy(r.y)} className="chart-ref" />
            <text x={W - PAD.r} y={sy(r.y) - 3} className="chart-ref-label" textAnchor="end">
              {r.label}
            </text>
          </g>
        ))}
        {(xTicks ?? [x0, (x0 + x1) / 2, x1]).map((x, i, arr) => (
          <text key={x} x={sx(x)} y={H - 6} className="chart-tick" textAnchor={i === 0 ? 'start' : i === arr.length - 1 ? 'end' : 'middle'}>
            {formatX(x)}
          </text>
        ))}
        {marker && marker.x >= x0 && marker.x <= x1 && (
          <g>
            <line x1={sx(marker.x)} x2={sx(marker.x)} y1={PAD.t} y2={H - PAD.b} className="chart-marker" />
            <text x={sx(marker.x) + 3} y={PAD.t + 8} className="chart-ref-label">
              {marker.label}
            </text>
          </g>
        )}
        {extra?.map((e, k) => (
          <path key={e.label} d={extraPaths[k]} fill="none" stroke={e.color} strokeWidth={2} strokeDasharray={e.dashed ? '5 4' : undefined} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {h && (
          <g>
            <line x1={sx(h.x)} x2={sx(h.x)} y1={PAD.t} y2={H - PAD.b} className="chart-cross" />
            <circle cx={sx(h.x)} cy={sy(h.y)} r={4} fill={color} stroke="var(--paper)" strokeWidth={2} />
          </g>
        )}
      </svg>
      <figcaption className="chart-readout" aria-live="polite">
        {h ? (
          <>
            <strong>
              {formatY(h.y)} {yUnit}
            </strong>{' '}
            <span>{formatX(h.x)}</span>
          </>
        ) : (
          <span>{label}</span>
        )}
      </figcaption>
    </figure>
  )
}

function niceStep(raw: number) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.abs(raw) || 1)))
  const n = raw / p
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p
}
