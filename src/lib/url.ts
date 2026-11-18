/**
 * Estado de la vista en la URL, para poder compartir un enlace que abra exactamente
 * lo mismo: satélite, pestaña, marco de referencia, vista y (opcional) instante.
 *
 *   ?sat=25544&tab=passes&frame=eci&view=sky&t=2026-11-18T20:15:00Z&cmp=48274
 *
 * Los nombres de pestaña van en inglés en la URL; internamente se usan los identificadores
 * del dosier.
 */
import type { FrameMode } from './frame'

export type DossierTabId = 'estado' | 'orbita' | 'energia' | 'pases' | 'maniobra' | 'conjunciones' | 'reentrada' | 'comparar'
export type ViewMode = 'globe' | 'sky'

export interface UrlState {
  sat?: number
  tab?: DossierTabId
  frame?: FrameMode
  view?: ViewMode
  /** Instante de simulación (ms). Solo se escribe al compartir, no al navegar */
  t?: number
  /** Satélite con el que se compara */
  cmp?: number
}

const TAB_SLUG: Record<DossierTabId, string> = {
  estado: 'state',
  orbita: 'orbit',
  energia: 'power',
  pases: 'passes',
  maniobra: 'maneuver',
  conjunciones: 'conjunctions',
  reentrada: 'reentry',
  comparar: 'compare',
}
const SLUG_TAB = new Map(Object.entries(TAB_SLUG).map(([k, v]) => [v, k as DossierTabId]))

export function readUrl(): UrlState {
  const q = new URLSearchParams(window.location.search)
  const out: UrlState = {}
  const sat = Number(q.get('sat'))
  if (Number.isInteger(sat) && sat > 0) out.sat = sat
  const tab = SLUG_TAB.get(q.get('tab') ?? '')
  if (tab) out.tab = tab
  const frame = q.get('frame')?.toUpperCase()
  if (frame === 'ECI' || frame === 'ECEF') out.frame = frame
  const view = q.get('view')
  if (view === 'sky' || view === 'globe') out.view = view
  const t = Date.parse(q.get('t') ?? '')
  if (Number.isFinite(t)) out.t = t
  const cmp = Number(q.get('cmp'))
  if (Number.isInteger(cmp) && cmp > 0) out.cmp = cmp
  return out
}

export function urlFor(s: UrlState): string {
  const q = new URLSearchParams()
  if (s.sat) q.set('sat', String(s.sat))
  if (s.sat && s.tab && s.tab !== 'estado') q.set('tab', TAB_SLUG[s.tab])
  if (s.cmp) q.set('cmp', String(s.cmp))
  if (s.frame && s.frame !== 'ECEF') q.set('frame', s.frame.toLowerCase())
  if (s.view && s.view !== 'globe') q.set('view', s.view)
  if (s.t !== undefined) q.set('t', new Date(Math.round(s.t / 1000) * 1000).toISOString().replace('.000Z', 'Z'))
  const qs = q.toString()
  return `${window.location.pathname}${qs ? `?${qs}` : ''}`
}

/** Actualiza la barra de direcciones sin recargar ni llenar el historial */
export function writeUrl(s: UrlState) {
  const next = urlFor(s)
  if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, '', next)
}

/** Enlace absoluto para compartir */
export function shareLink(s: UrlState): string {
  return `${window.location.origin}${urlFor(s)}`
}
