import { useState } from 'react'
import type { SatRecord } from '../../data/types'
import type { SimClock } from '../../lib/clock'
import type { Station } from '../../lib/passes'
import { useSimNow } from '../dossier/hooks'
import { CloseIcon } from '../icons'
import { DesignTab } from './DesignTab'
import { ImagingTab } from './ImagingTab'
import { RemovalTab } from './RemovalTab'

interface Props {
  onClose: () => void
  satellites: SatRecord[]
  groupIndex: Uint8Array
  station: Station
  clock: SimClock
  missions: SatRecord[]
  onLaunch: (r: SatRecord) => void
  onRemove: (norad: number) => void
  onShowNorad: (norad: number) => void
  onShowIndex: (i: number) => void
  targets: number[]
  onTargets: (t: number[]) => void
}

/** Herramientas de misión: diseñar un satélite propio y planificar la retirada de basura */
export function MissionDrawer(p: Props) {
  const [tab, setTab] = useState<'design' | 'imaging' | 'removal'>('design')
  const now = useSimNow(p.clock, 60_000)
  return (
    <aside className="panel learn analysis" aria-label="Missions">
      <header className="learn-head">
        <h2 className="learn-title">Missions</h2>
        <button className="icon-btn" aria-label="Close" onClick={p.onClose}>
          <CloseIcon />
        </button>
      </header>
      <div className="tabs" role="tablist">
        <button role="tab" className="tab" aria-selected={tab === 'design'} onClick={() => setTab('design')}>
          Satellite design
        </button>
        <button role="tab" className="tab" aria-selected={tab === 'imaging'} onClick={() => setTab('imaging')}>
          Earth imaging
        </button>
        <button role="tab" className="tab" aria-selected={tab === 'removal'} onClick={() => setTab('removal')}>
          Debris removal
        </button>
      </div>
      <div className="learn-body">
        {tab === 'design' && (
          <DesignTab satellites={p.satellites} station={p.station} now={now} missions={p.missions} onLaunch={p.onLaunch} onRemove={p.onRemove} onShow={p.onShowNorad} />
        )}
        {tab === 'imaging' && (
          <ImagingTab
            satellites={p.satellites}
            station={p.station}
            now={now}
            onShowAt={(norad, t) => {
              // Primero el salto en el tiempo, para que el globo se centre donde estará el satélite
              p.clock.jumpTo(t - 90_000)
              p.onShowNorad(norad)
            }}
          />
        )}
        {tab === 'removal' && (
          <RemovalTab satellites={p.satellites} groupIndex={p.groupIndex} now={now} targets={p.targets} onTargets={p.onTargets} onShow={p.onShowIndex} />
        )}
      </div>
    </aside>
  )
}
