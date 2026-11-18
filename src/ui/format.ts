const fmtCache = new Map<number, Intl.NumberFormat>()
/** Número con `d` decimales, punto decimal y sin separador de miles (formato técnico) */
export function fx(v: number, d = 0) {
  let f = fmtCache.get(d)
  if (!f) {
    f = new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false })
    fmtCache.set(d, f)
  }
  return f.format(v).replace('-', '−')
}
/** Número entero con separador de miles (recuentos) */
export const count = (v: number) => new Intl.NumberFormat('en-US').format(v)

/** Notación científica compacta: 1.2345e−4 */
export function sci(v: number, d = 4) {
  if (v === 0) return '0'
  const [m, e] = v.toExponential(d).split('e')
  return `${fx(Number(m), d)}e${Number(e) < 0 ? '−' : '+'}${Math.abs(Number(e))}`
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
export function timeAgo(ms: number, now = Date.now()) {
  const mins = Math.round((now - ms) / 60000)
  if (Math.abs(mins) < 60) return rtf.format(-mins, 'minute')
  const hours = Math.round(mins / 60)
  if (Math.abs(hours) < 48) return rtf.format(-hours, 'hour')
  return rtf.format(-Math.round(hours / 24), 'day')
}

export const latStr = (v: number, d = 3) => `${fx(Math.abs(v), d)}° ${v >= 0 ? 'N' : 'S'}`
export const lonStr = (v: number, d = 3) => `${fx(Math.abs(v), d)}° ${v >= 0 ? 'E' : 'W'}`

const pad = (n: number, w = 2) => String(n).padStart(w, '0')
/** 2026-11-17 21:30:12 */
export function isoUtc(ms: number) {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}
/** Duración con signo: +1 d 02:03:04 */
export function duration(ms: number) {
  const sign = ms < 0 ? '−' : '+'
  let s = Math.round(Math.abs(ms) / 1000)
  const d = Math.floor(s / 86400)
  s -= d * 86400
  const h = Math.floor(s / 3600)
  s -= h * 3600
  const m = Math.floor(s / 60)
  s -= m * 60
  return `${sign}${d ? `${d} d ` : ''}${pad(h)}:${pad(m)}:${pad(s)}`
}
export function period(min: number) {
  if (min < 120) return `${fx(min, 2)} min`
  const h = Math.floor(min / 60)
  return `${h} h ${fx(min - h * 60, 1)} min`
}
