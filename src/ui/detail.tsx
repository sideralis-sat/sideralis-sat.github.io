import { createContext, useContext, useState, type ReactNode } from 'react'

/**
 * Nivel de detalle de la interfaz.
 *   essentials  lo imprescindible de cada pestaña, con textos cortos
 *   full        todas las tablas, calculadoras y explicaciones
 * Ninguna función desaparece: en «essentials» quedan a un clic.
 */
export type Detail = 'essentials' | 'full'

export const DetailContext = createContext<{ detail: Detail; setDetail: (d: Detail) => void }>({ detail: 'essentials', setDetail: () => {} })

export const useDetail = () => useContext(DetailContext).detail

const KEY = 'cenit.detail'

export function useDetailState() {
  const [detail, set] = useState<Detail>(() => {
    try {
      return localStorage.getItem(KEY) === 'full' ? 'full' : 'essentials'
    } catch {
      return 'essentials'
    }
  })
  const setDetail = (d: Detail) => {
    set(d)
    try {
      localStorage.setItem(KEY, d)
    } catch {
      /* almacenamiento no disponible */
    }
  }
  return { detail, setDetail }
}

/** Solo se muestra con todo el detalle */
export function Full({ children }: { children: ReactNode }) {
  return useDetail() === 'full' ? <>{children}</> : null
}

/** Solo se muestra en la vista esencial */
export function Brief({ children }: { children: ReactNode }) {
  return useDetail() === 'essentials' ? <>{children}</> : null
}

/**
 * Bloque plegable con título y una línea de resumen visible aunque esté cerrado.
 * Se usa para calculadoras y análisis largos: el resultado clave se ve sin abrirlo.
 */
export function Fold({ title, summary, children, open: initial = false }: { title: string; summary?: ReactNode; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial)
  return (
    <section className={`block fold ${open ? 'is-open' : ''}`}>
      <button className="fold-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="fold-title">{title}</span>
        {summary && !open && <span className="fold-summary">{summary}</span>}
        <span className="fold-chevron" aria-hidden>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>
      {open && <div className="fold-body">{children}</div>}
    </section>
  )
}

/** «Más detalle»: invita a cambiar al nivel completo desde una pestaña en vista esencial */
export function MoreDetail({ what }: { what: string }) {
  const { detail, setDetail } = useContext(DetailContext)
  if (detail === 'full') return null
  return (
    <p className="more-detail">
      <button className="link" onClick={() => setDetail('full')}>
        Show full detail
      </button>{' '}
      for {what}.
    </p>
  )
}
