import { useEffect } from 'react'
import { CloseIcon } from './icons'

export type WelcomeAction = 'iss' | 'sky' | 'design' | 'imaging' | 'learn'

interface Props {
  onAction: (a: WelcomeAction) => void
  onClose: () => void
}

const STARTS: { id: WelcomeAction; title: string; desc: string }[] = [
  { id: 'iss', title: 'Find the International Space Station', desc: 'Where it is now and when it passes over you' },
  { id: 'sky', title: 'See what is above me', desc: 'The satellites over your location right now' },
  { id: 'imaging', title: 'When will a satellite photograph my town?', desc: 'Sentinel and Landsat passes, with the cloud forecast' },
  { id: 'design', title: 'Design my own satellite', desc: 'Orbit, solar power and lifetime, step by step' },
  { id: 'learn', title: 'Learn how orbits work', desc: 'Short notes with diagrams and exercises' },
]

/** Bienvenida para quien entra por primera vez: qué es esto y por dónde empezar */
export function Welcome({ onAction, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="welcome-backdrop" onClick={onClose}>
      <section className="welcome panel" role="dialog" aria-modal="true" aria-labelledby="welcome-title" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn welcome-close" aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </button>
        <h2 id="welcome-title" className="welcome-title">
          Every satellite in orbit, right now
        </h2>
        <p className="welcome-lead">
          Each dot on the globe is a real satellite or piece of debris, drawn where it is at this moment from public tracking data.
        </p>
        <ul className="welcome-how">
          <li>
            <strong>Tap a dot</strong> or search a name to see what it is and where it is going.
          </li>
          <li>
            <strong>Drag</strong> to turn the Earth; <strong>pinch</strong> or scroll to zoom.
          </li>
          <li>
            <strong>Constellations</strong> shows only the groups you choose, such as GPS or Starlink.
          </li>
        </ul>
        <h3 className="welcome-sub">Start with</h3>
        <div className="welcome-starts">
          {STARTS.map((s) => (
            <button key={s.id} className="welcome-start" onClick={() => onAction(s.id)}>
              <span className="welcome-start-title">{s.title}</span>
              <span className="welcome-start-desc">{s.desc}</span>
            </button>
          ))}
        </div>
        <button className="btn welcome-explore" onClick={onClose}>
          Just explore
        </button>
      </section>
    </div>
  )
}
