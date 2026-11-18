import { useEffect, useMemo, useRef, useState } from 'react'

export interface ScatterPoint {
  x: number
  y: number
  /** Índice de la serie (color) */
  s: number
  /** Objeto del catálogo al que pertenece */
  i: number
}

interface Props {
  points: ScatterPoint[]
  series: { label: string; color: string }[]
  label: string
  xLabel: string
  yLabel: string
  formatX: (x: number) => string
  formatY: (y: number) => string
  xDomain?: [number, number]
  yDomain?: [number, number]
  /** Texto para el objeto bajo el puntero */
  describe: (p: ScatterPoint) => string
  onPick?: (i: number) => void
  highlight?: number | null
  height?: number
  logY?: boolean
}

const PAD = { l: 52, r: 12, t: 12, b: 34 }

function niceTicks(a: number, b: number, n = 5) {
  const raw = (b - a) / n
  const p = Math.pow(10, Math.floor(Math.log10(Math.abs(raw) || 1)))
  const m = raw / p
  const step = (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p
  const out: number[] = []
  for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(v)
  return out
}

/** Diagrama de dispersión en canvas para miles de puntos, con lectura y selección al pasar el puntero */
export function ScatterCanvas(p: Props) {
  const cv = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState<ScatterPoint | null>(null)
  const H = p.height ?? 300

  const dom = useMemo(() => {
    const xs = p.points.map((q) => q.x)
    const ys = p.points.map((q) => q.y)
    let [x0, x1] = p.xDomain ?? [Math.min(...xs), Math.max(...xs)]
    let [y0, y1] = p.yDomain ?? [Math.min(...ys), Math.max(...ys)]
    if (!Number.isFinite(x0) || x1 - x0 < 1e-9) [x0, x1] = [x0 - 1 || 0, x1 + 1 || 1]
    if (!Number.isFinite(y0) || y1 - y0 < 1e-9) [y0, y1] = [y0 - 1 || 0, y1 + 1 || 1]
    const padX = (x1 - x0) * 0.03
    const padY = (y1 - y0) * 0.05
    return p.xDomain && p.yDomain ? { x0, x1, y0, y1 } : { x0: x0 - padX, x1: x1 + padX, y0: p.logY ? y0 : y0 - padY, y1: y1 + padY }
  }, [p.points, p.xDomain, p.yDomain, p.logY])

  const scale = (w: number) => {
    const ly = (v: number) => (p.logY ? Math.log10(Math.max(v, 1e-9)) : v)
    const sx = (x: number) => PAD.l + ((x - dom.x0) / (dom.x1 - dom.x0)) * (w - PAD.l - PAD.r)
    const sy = (y: number) => PAD.t + (1 - (ly(y) - ly(dom.y0)) / (ly(dom.y1) - ly(dom.y0))) * (H - PAD.t - PAD.b)
    return { sx, sy }
  }

  useEffect(() => {
    const c = cv.current!
    const dpr = window.devicePixelRatio || 1
    const w = c.clientWidth
    c.width = Math.round(w * dpr)
    c.height = Math.round(H * dpr)
    const g = c.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, w, H)
    const { sx, sy } = scale(w)
    const css = getComputedStyle(c)
    const ink3 = css.getPropertyValue('--ink-3').trim() || '#747e8e'
    const grid = '#e0e4ea'
    g.font = '10.5px "Schibsted Grotesk", system-ui, sans-serif'
    g.fillStyle = ink3
    g.strokeStyle = grid
    g.lineWidth = 1
    const yTicks = p.logY
      ? [1, 10, 100, 1000, 10000, 100000].filter((v) => v >= dom.y0 && v <= dom.y1)
      : niceTicks(dom.y0, dom.y1, 5)
    g.textAlign = 'right'
    g.textBaseline = 'middle'
    for (const v of yTicks) {
      const y = sy(v)
      g.beginPath()
      g.moveTo(PAD.l, y)
      g.lineTo(w - PAD.r, y)
      g.stroke()
      g.fillText(p.formatY(v), PAD.l - 6, y)
    }
    g.textAlign = 'center'
    g.textBaseline = 'top'
    for (const v of niceTicks(dom.x0, dom.x1, Math.max(3, Math.floor(w / 80)))) {
      const x = sx(v)
      g.beginPath()
      g.moveTo(x, PAD.t)
      g.lineTo(x, H - PAD.b)
      g.stroke()
      g.fillText(p.formatX(v), x, H - PAD.b + 5)
    }
    g.fillText(p.xLabel, PAD.l + (w - PAD.l - PAD.r) / 2, H - 13)
    g.save()
    g.translate(11, PAD.t + (H - PAD.t - PAD.b) / 2)
    g.rotate(-Math.PI / 2)
    g.fillText(p.yLabel, 0, -6)
    g.restore()
    // Puntos: 2 px con un anillo del color del papel para separar los solapes
    for (const q of p.points) {
      const x = sx(q.x)
      const y = sy(q.y)
      if (x < PAD.l - 2 || x > w - PAD.r + 2 || y < PAD.t - 2 || y > H - PAD.b + 2) continue
      g.fillStyle = p.series[q.s].color
      g.globalAlpha = 0.75
      g.beginPath()
      g.arc(x, y, 2, 0, Math.PI * 2)
      g.fill()
    }
    g.globalAlpha = 1
    const mark = (i: number) => {
      for (const q of p.points) {
        if (q.i !== i) continue
        g.strokeStyle = '#11151c'
        g.lineWidth = 2
        g.beginPath()
        g.arc(sx(q.x), sy(q.y), 6, 0, Math.PI * 2)
        g.stroke()
      }
    }
    if (p.highlight !== null && p.highlight !== undefined) mark(p.highlight)
    if (hover) mark(hover.i)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.points, p.series, dom, hover, p.highlight, H])

  const near = (e: React.PointerEvent) => {
    const c = cv.current!
    const r = c.getBoundingClientRect()
    const { sx, sy } = scale(r.width)
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    let best: ScatterPoint | null = null
    let bd = 8
    for (const q of p.points) {
      const d = Math.hypot(sx(q.x) - x, sy(q.y) - y)
      if (d < bd) {
        bd = d
        best = q
      }
    }
    return best
  }

  return (
    <figure className="chart">
      <canvas
        ref={cv}
        className="scatter"
        style={{ height: H, cursor: hover ? 'pointer' : 'default' }}
        role="img"
        aria-label={p.label}
        onPointerMove={(e) => setHover(near(e))}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => {
          const q = near(e as unknown as React.PointerEvent)
          if (q && p.onPick) p.onPick(q.i)
        }}
      />
      <figcaption className="chart-readout">
        {hover ? (
          <strong>{p.describe(hover)}</strong>
        ) : (
          <span className="legend">
            {p.series.map((s) => (
              <span key={s.label}>
                <i style={{ background: s.color }} /> {s.label}
              </span>
            ))}
          </span>
        )}
      </figcaption>
    </figure>
  )
}
