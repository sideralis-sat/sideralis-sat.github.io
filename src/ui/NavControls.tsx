import { useEffect, useRef } from 'react'
import { viewState } from '../lib/viewState'
import { HomeIcon, MinusIcon, PlusIcon, TiltIcon } from './icons'

interface Props {
  onZoom: (factor: number) => void
  onHome: () => void
  onNorth: () => void
  onTilt: () => void
}

/** Brújula (gira con el rumbo; clic = norte arriba), inclinación y zoom */
export function NavControls({ onZoom, onHome, onNorth, onTilt }: Props) {
  const needle = useRef<SVGGElement>(null)
  useEffect(() => {
    let raf = 0
    const loop = () => {
      needle.current?.setAttribute('transform', `rotate(${-viewState.headingDeg} 22 22)`)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="nav" role="group" aria-label="Navigation">
      <button className="compass" aria-label="Reset heading to north" title="Reset heading to north (N)" onClick={onNorth}>
        <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden>
          <circle cx="22" cy="22" r="20" className="compass-ring" />
          <g ref={needle}>
            <path d="M22 6 L26 22 L22 20 L18 22 Z" className="compass-n" />
            <path d="M22 38 L18 22 L22 24 L26 22 Z" className="compass-s" />
            <text x="22" y="5.2" textAnchor="middle" className="compass-label">N</text>
          </g>
        </svg>
      </button>
      <div className="nav-stack">
        <button className="icon-btn" aria-label="Zoom in" title="Zoom in (+)" onClick={() => onZoom(0.5)}>
          <PlusIcon />
        </button>
        <button className="icon-btn" aria-label="Zoom out" title="Zoom out (−)" onClick={() => onZoom(2)}>
          <MinusIcon />
        </button>
        <button className="icon-btn" aria-label="Tilt the view" title="Camera tilt (or right-drag)" onClick={onTilt}>
          <TiltIcon />
        </button>
        <button className="icon-btn" aria-label="Home view" title="Home view" onClick={onHome}>
          <HomeIcon />
        </button>
      </div>
    </div>
  )
}
