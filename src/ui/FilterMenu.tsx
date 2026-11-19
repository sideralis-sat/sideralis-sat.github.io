import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { CheckIcon, ChevronIcon, CloseIcon } from './icons'
import { count as fmtCount } from './format'

export interface FilterOption {
  id: string
  label: string
  description?: string
  color?: string
  count?: number
}

interface Props {
  label: string
  options: FilterOption[]
  hidden: Set<string>
  onToggle: (id: string) => void
  onSetAll: (show: boolean) => void
  /** Pulsar con Alt (o mantener pulsado en móvil) muestra solo esa opción */
  onSolo?: (id: string) => void
  footer?: ReactNode
  /** Sin «Mostrar/Ocultar todo» ni recuentos (p. ej. capas) */
  simple?: boolean
}

export function FilterMenu({ label, options, hidden, onToggle, onSetAll, onSolo, footer, simple }: Props) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const shownCount = options.filter((o) => !hidden.has(o.id)).length
  const partial = shownCount < options.length

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    // Esc cierra solo el menú (fase de captura: así no cierra también la ficha del satélite)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <div className="filter" ref={wrap}>
      <button
        className={`chip ${partial && !simple ? 'is-active' : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        {label}
        {partial && !simple && (
          <span className="chip-badge">
            {shownCount}/{options.length}
          </span>
        )}
        <ChevronIcon />
      </button>

      {/* En móvil el menú es una hoja inferior con fondo oscurecido: tocar fuera o «Done» la cierra */}
      {open && <div className="menu-backdrop" onClick={() => setOpen(false)} aria-hidden />}
      {open && (
        <div className="menu" role="group" aria-label={label}>
          <div className="menu-head">
            <span className="menu-title">{label}</span>
            <button className="btn small primary" onClick={() => setOpen(false)}>
              Done
            </button>
            <button className="icon-btn menu-x" aria-label="Close" onClick={() => setOpen(false)}>
              <CloseIcon />
            </button>
          </div>
          {!simple && <div className="menu-actions">
            <button className="link" onClick={() => onSetAll(true)} disabled={!partial}>
              Show all
            </button>
            <button className="link" onClick={() => onSetAll(false)} disabled={shownCount === 0}>
              Hide all
            </button>
          </div>}
          <ul className="menu-list">
            {options.map((o) => {
              const on = !hidden.has(o.id)
              return (
                <li key={o.id}>
                  <button
                    className="menu-item"
                    role="checkbox"
                    aria-checked={on}
                    onClick={(e) => (e.altKey && onSolo ? onSolo(o.id) : onToggle(o.id))}
                    onDoubleClick={() => onSolo?.(o.id)}
                    style={o.color ? ({ '--c': o.color } as CSSProperties) : undefined}
                  >
                    <span className={`check ${o.color ? 'has-color' : ''}`} aria-hidden>
                      {on && <CheckIcon />}
                    </span>
                    <span className="menu-item-text">
                      <span className="menu-item-label">{o.label}</span>
                      {o.description && <span className="menu-item-desc">{o.description}</span>}
                    </span>
                    {o.count !== undefined && <span className="menu-item-count">{fmtCount(o.count)}</span>}
                  </button>
                  {onSolo && (
                    <button className="menu-only" onClick={() => onSolo(o.id)} title={`Show only ${o.label}`}>
                      Only
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          {footer && <p className="menu-footer">{footer}</p>}
        </div>
      )}
    </div>
  )
}
