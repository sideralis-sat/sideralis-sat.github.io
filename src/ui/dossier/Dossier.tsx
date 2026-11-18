import { useContext, useEffect, useRef, useState, type CSSProperties } from 'react'
import { DetailContext } from '../detail'
import type { Constellation, SatRecord } from '../../data/types'
import type { SimClock } from '../../lib/clock'
import { meanElements } from '../../lib/astrodynamics'
import { ORBIT_CLASSES, orbitElements } from '../../lib/orbit'
import type { Station } from '../../lib/passes'
import type { ReentryResult } from '../../lib/reentry'
import { fx, latStr, lonStr } from '../format'
import { CloseIcon, CopyIcon, FollowIcon, ShareIcon, TargetIcon } from '../icons'
import { CompareTab } from './CompareTab'
import { ConjunctionsTab } from './ConjunctionsTab'
import { EnergyTab } from './EnergyTab'
import { ManeuverTab, type ManeuverDrawing } from './ManeuverTab'
import { useSimNow, useTelemetry } from './hooks'
import { OrbitTab } from './OrbitTab'
import { PassesTab } from './PassesTab'
import { ReentryTab } from './ReentryTab'
import { StateTab } from './StateTab'

export type { DossierTabId as DossierTab } from '../../lib/url'
import type { DossierTabId as DossierTab } from '../../lib/url'

/** Pestañas principales: lo que se consulta de un satélite */
const TABS: [DossierTab, string][] = [
  ['estado', 'State'],
  ['orbita', 'Orbit'],
  ['energia', 'Power'],
  ['pases', 'Passes'],
]
/** Herramientas: lo que se hace con él, agrupado bajo una sola pestaña */
const TOOLS: [DossierTab, string][] = [
  ['maniobra', 'Maneuver'],
  ['conjunciones', 'Conjunctions'],
  ['reentrada', 'Reentry'],
  ['comparar', 'Compare'],
]
const isTool = (t: DossierTab) => TOOLS.some(([id]) => id === t)

interface Props {
  record: SatRecord
  constellation: Constellation
  clock: SimClock
  tab: DossierTab
  onTab: (t: DossierTab) => void
  following: boolean
  station: Station
  pickingStation: boolean
  reentry: ReentryResult | null
  onClose: () => void
  onCenter: () => void
  onFollow: () => void
  onStation: (s: Station) => void
  onPickStation: () => void
  onReentry: (r: ReentryResult | null) => void
  onFlyTo: (lat: number, lon: number) => void
  /** Devuelve el enlace a esta vista */
  onShare: () => string
  maneuver: ManeuverDrawing | null
  satellites: SatRecord[]
  compare: number | null
  onCompare: (i: number | null) => void
  onConjunction: (other: number, tca: number) => void
  onManeuver: (d: ManeuverDrawing | null) => void
}

export function Dossier(p: Props) {
  const { record, constellation, clock, tab } = p
  const t = useTelemetry(record, clock)
  const now = useSimNow(clock, 1000)
  const [copied, setCopied] = useState(false)
  const [shared, setShared] = useState(false)
  const { detail, setDetail } = useContext(DetailContext)
  const lastTool = useRef<DossierTab>(isTool(tab) ? tab : 'maniobra')
  if (isTool(tab)) lastTool.current = tab
  // Cada pestaña empieza arriba
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    body.current?.scrollTo({ top: 0 })
  }, [tab])
  const regime = ORBIT_CLASSES.find((o) => o.id === orbitElements(record).orbitClass)!
  const sso = meanElements(record).sunSynchronous

  const periodMin = 1440 / Number(record.MEAN_MOTION)
  const lightText = t === null ? '' : t.shadow < 0.001 ? 'in sunlight' : t.shadow > 0.999 ? 'in eclipse' : 'in penumbra'

  async function copyOmm() {
    const { GROUP: _g, ...omm } = record
    try {
      await navigator.clipboard.writeText(JSON.stringify(omm, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* portapapeles no disponible */
    }
  }

  async function share() {
    try {
      await navigator.clipboard.writeText(p.onShare())
      setShared(true)
      setTimeout(() => setShared(false), 1600)
    } catch {
      /* portapapeles no disponible */
    }
  }

  return (
    <aside className="panel dossier" aria-label={`Dossier for ${record.OBJECT_NAME}`}>
      <header className="ds-head">
        <p className="ds-kicker">
          <span className="ds-group" style={{ '--c': constellation.color } as CSSProperties}>
            {constellation.label}
          </span>
          <span>{regime.label}</span>
          {sso && <span>sun-synchronous</span>}
        </p>
        <h2 className="ds-name">{record.OBJECT_NAME}</h2>
        {t && (
          <>
            <dl className="ds-figures">
              <div>
                <dt>Altitude</dt>
                <dd>
                  {fx(t.altKm, 0)} <span>km</span>
                </dd>
              </div>
              <div>
                <dt>Velocity</dt>
                <dd>
                  {fx(t.vMag, 2)} <span>km/s</span>
                </dd>
              </div>
              <div>
                <dt>Period</dt>
                <dd>
                  {fx(periodMin, periodMin < 200 ? 1 : 0)} <span>min</span>
                </dd>
              </div>
              <div>
                <dt>Inclination</dt>
                <dd>
                  {fx(Number(record.INCLINATION), 1)} <span>°</span>
                </dd>
              </div>
            </dl>
            <p className="ds-where">
              Over {latStr(t.latDeg, 1)}, {lonStr(t.lonDeg, 1)}, <span className={t.shadow < 0.5 ? 'is-sun' : 'is-shadow'}>{lightText}</span>
            </p>
          </>
        )}
        <div className="ds-meta">
          <p className="ds-ids">
            <span>NORAD {record.NORAD_CAT_ID}</span>
            <span>COSPAR {record.OBJECT_ID}</span>
          </p>
          <div className="seg detail-toggle" role="radiogroup" aria-label="Level of detail">
            <button className="seg-btn text" role="radio" aria-checked={detail === 'essentials'} onClick={() => setDetail('essentials')} title="Key results and short texts">
              Essentials
            </button>
            <button className="seg-btn text" role="radio" aria-checked={detail === 'full'} onClick={() => setDetail('full')} title="Every table, calculator and explanation">
              Full
            </button>
          </div>
        </div>
        <button className="icon-btn ds-close" aria-label="Close the dossier" onClick={p.onClose}>
          <CloseIcon />
        </button>
      </header>

      <div className="tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className="tab" onClick={() => p.onTab(id)}>
            {label}
          </button>
        ))}
        <button role="tab" aria-selected={isTool(tab)} className="tab" onClick={() => p.onTab(lastTool.current)}>
          Tools
        </button>
      </div>
      {isTool(tab) && (
        <div className="subtabs" role="tablist" aria-label="Tools">
          {TOOLS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className="subtab" onClick={() => p.onTab(id)}>
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="ds-body" role="tabpanel" ref={body}>
        {!t && <p className="callout">SGP4 does not converge with this object's current elements; it has most likely re-entered.</p>}
        {t && tab === 'estado' && <StateTab t={t} />}
        {t && tab === 'orbita' && <OrbitTab t={t} record={record} now={now} />}
        {t && tab === 'energia' && <EnergyTab t={t} record={record} now={now} />}
        {t && tab === 'pases' && (
          <PassesTab record={record} station={p.station} now={now} onStation={p.onStation} onPickOnGlobe={p.onPickStation} picking={p.pickingStation} />
        )}
        {t && tab === 'maniobra' && <ManeuverTab t={t} record={record} drawing={p.maneuver} onDraw={p.onManeuver} />}
        {t && tab === 'conjunciones' && <ConjunctionsTab record={record} satellites={p.satellites} now={now} onFocus={p.onConjunction} />}
        {t && tab === 'comparar' && <CompareTab t={t} record={record} satellites={p.satellites} compare={p.compare} onCompare={p.onCompare} clock={clock} now={now} />}
        {t && tab === 'reentrada' && <ReentryTab record={record} now={now} result={p.reentry} onResult={p.onReentry} onFlyTo={p.onFlyTo} />}
      </div>

      <footer className="ds-actions">
        <button className="btn" onClick={p.onCenter}>
          <TargetIcon />
          Center
        </button>
        <button className="btn" aria-pressed={p.following} onClick={p.onFollow}>
          <FollowIcon />
          {p.following ? 'Following' : 'Follow'}
        </button>
        <button className="btn ghost" onClick={share} aria-label="Share a link" title="Copies a link that opens this object, tab and, if you are not live, this instant">
          <ShareIcon />
          <span className="btn-text-opt">{shared ? 'Copied' : 'Share'}</span>
        </button>
        <button className="btn ghost" onClick={copyOmm} aria-label="Copy OMM" title="Copies the OMM record (CCSDS 502.0) as JSON">
          <CopyIcon />
          <span className="btn-text-opt">{copied ? 'Copied' : 'OMM'}</span>
        </button>
      </footer>
    </aside>
  )
}
