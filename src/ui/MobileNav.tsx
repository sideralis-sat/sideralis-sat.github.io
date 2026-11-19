import type { ReactNode } from 'react'
import { BookIcon, ChartIcon, GlobeIcon, HelpIcon, RocketIcon, ZenithIcon } from './icons'

type Drawer = 'learn' | 'analysis' | 'missions' | null

interface Props {
  view: 'globe' | 'sky'
  drawer: Drawer
  onGlobe: () => void
  onSky: () => void
  onDrawer: (d: Exclude<Drawer, null>) => void
  onHelp: () => void
}

/**
 * Navegación entre secciones, con icono y nombre siempre visibles: barra lateral en el
 * ordenador y barra inferior en el móvil (lo decide el CSS).
 */
export function MobileNav(p: Props) {
  const item = (id: string, label: string, icon: ReactNode, active: boolean, onClick: () => void) => (
    <button key={id} className={`mnav-item ${active ? 'is-on' : ''}`} aria-current={active ? 'page' : undefined} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  )
  return (
    <nav className="mnav" aria-label="Sections">
      <img className="mnav-mark" src={`${import.meta.env.BASE_URL}brand-patch.png`} width="40" height="40" alt="" />
      {item('globe', 'Globe', <GlobeIcon />, p.view === 'globe' && !p.drawer, p.onGlobe)}
      {item('sky', 'Sky', <ZenithIcon />, p.view === 'sky' && !p.drawer, p.onSky)}
      {item('missions', 'Missions', <RocketIcon />, p.drawer === 'missions', () => p.onDrawer('missions'))}
      {item('analysis', 'Analysis', <ChartIcon />, p.drawer === 'analysis', () => p.onDrawer('analysis'))}
      {item('learn', 'Learn', <BookIcon />, p.drawer === 'learn', () => p.onDrawer('learn'))}
      <button className="mnav-item mnav-help" onClick={p.onHelp}>
        <HelpIcon />
        <span>Help</span>
      </button>
    </nav>
  )
}
