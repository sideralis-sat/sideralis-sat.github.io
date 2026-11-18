import type { FrameMode } from '../lib/frame'

export function FrameToggle({ mode, onChange }: { mode: FrameMode; onChange: (m: FrameMode) => void }) {
  const other: FrameMode = mode === 'ECEF' ? 'ECI' : 'ECEF'
  return (
    <>
      <div className="seg frame frame-full" role="radiogroup" aria-label="Reference frame">
        <button className="seg-btn" role="radio" aria-checked={mode === 'ECEF'} title="ECEF: Earth-centered, Earth-fixed (rotating) frame" onClick={() => onChange('ECEF')}>
          ECEF
        </button>
        <button className="seg-btn" role="radio" aria-checked={mode === 'ECI'} title="ECI: Earth-centered inertial frame; the Earth rotates with GMST" onClick={() => onChange('ECI')}>
          ECI
        </button>
      </div>
      {/* Versión compacta para barras estrechas: un solo botón que alterna el marco */}
      <button className="frame-compact" title={`Reference frame: ${mode}. Switch to ${other}`} aria-label={`Reference frame ${mode}, switch to ${other}`} onClick={() => onChange(other)}>
        {mode}
      </button>
    </>
  )
}
