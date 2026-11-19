import type { ReactNode } from 'react'
import { BookIcon, ChartIcon, GlobeIcon, RocketIcon, ZenithIcon } from './icons'

type Drawer = 'learn' | 'analysis' | 'missions' | null

interface Props {
  view: 'globe' | 'sky'
  drawer: Drawer
  onGlobe: () => void
  onSky: () => void
  onDrawer: (d: Exclude<Drawer, null>) => void
}

/**
 * Barra de navegación inferior para móvil: cada sección con su icono y su nombre, como en
 * cualquier app. En pantallas grandes no se muestra (esas secciones están en la barra superior).
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
      {item('globe', 'Globe', <GlobeIcon />, p.view === 'globe' && !p.drawer, p.onGlobe)}
      {item('sky', 'Sky', <ZenithIcon />, p.view === 'sky' && !p.drawer, p.onSky)}
      {item('missions', 'Missions', <RocketIcon />, p.drawer === 'missions', () => p.onDrawer('missions'))}
      {item('analysis', 'Analysis', <ChartIcon />, p.drawer === 'analysis', () => p.onDrawer('analysis'))}
      {item('learn', 'Learn', <BookIcon />, p.drawer === 'learn', () => p.onDrawer('learn'))}
    </nav>
  )
}
