import { useId, useState, type ReactNode } from 'react'
import { Tex } from '../Tex'
import { useDetail } from '../detail'

export interface Explain {
  /** Qué significa, en palabras */
  text: ReactNode
  /** Fórmula general */
  tex?: string
  /** La misma fórmula con los números de este satélite */
  calc?: string
}

interface Props {
  sym?: ReactNode
  label: ReactNode
  value: ReactNode
  unit?: string
  explain?: Explain
  tone?: 'good' | 'caution' | 'warn' | 'active'
}

/** Fila de tabla técnica. Si tiene explicación, se despliega debajo al pulsar «?» */
export function Row({ sym, label, value, unit, explain, tone }: Props) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <>
      <tr className={open ? 'is-open' : undefined}>
        <th scope="row">
          {sym && <span className="sym">{sym}</span>}
          <span className="lbl">{label}</span>
          {explain && (
            <button className="why" aria-expanded={open} aria-controls={id} aria-label={open ? 'Hide explanation' : 'How it is computed'} onClick={() => setOpen((o) => !o)}>
              ?
            </button>
          )}
        </th>
        <td className={tone ? `tone-${tone}` : undefined}>{value}</td>
        <td className="unit">{unit}</td>
      </tr>
      {explain && open && (
        <tr className="explain" id={id}>
          <td colSpan={3}>
            <div className="explain-text">{explain.text}</div>
            {explain.tex && <Tex block>{explain.tex}</Tex>}
            {explain.calc && <Tex block>{explain.calc}</Tex>}
          </td>
        </tr>
      )}
    </>
  )
}

export function Table({ caption, children, note }: { caption: ReactNode; children: ReactNode; note?: ReactNode }) {
  return (
    <section className="block">
      <table className="data">
        <caption>{caption}</caption>
        <tbody>{children}</tbody>
      </table>
      {note && <p className="block-note">{note}</p>}
    </section>
  )
}

/** Párrafo introductorio de una pestaña; en la vista esencial, su versión corta si la tiene */
export function Lead({ children, short }: { children: ReactNode; short?: ReactNode }) {
  const detail = useDetail()
  return <p className="lead">{detail === 'essentials' && short ? short : children}</p>
}
