import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { CONSTELLATIONS } from '../data/constellations'
import type { SatRecord } from '../data/types'
import { CloseIcon, SearchIcon } from './icons'

interface Props {
  satellites: SatRecord[]
  groupIndex: Uint8Array
  onSelect: (index: number) => void
}

const MAX_RESULTS = 8

export function SearchBox({ satellites, groupIndex, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listId = useId()
  const wrap = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  const names = useMemo(() => satellites.map((s) => String(s.OBJECT_NAME).toLowerCase()), [satellites])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const exact: number[] = []
    const starts: number[] = []
    const contains: number[] = []
    const isNum = /^\d+$/.test(q)
    for (let i = 0; i < names.length && exact.length + starts.length < MAX_RESULTS; i++) {
      if (isNum && String(satellites[i].NORAD_CAT_ID) === q) exact.push(i)
      else if (names[i].startsWith(q) || (isNum && String(satellites[i].NORAD_CAT_ID).startsWith(q))) starts.push(i)
      else if (contains.length < MAX_RESULTS && names[i].includes(q)) contains.push(i)
    }
    return [...exact, ...starts, ...contains].slice(0, MAX_RESULTS)
  }, [query, names, satellites])

  useEffect(() => setActive(0), [query])

  // "/" enfoca el buscador desde cualquier parte, como en muchas webs
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        input.current?.focus()
      }
    }
    const onClick = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onClick)
    }
  }, [])

  function choose(i: number) {
    onSelect(i)
    setOpen(false)
    setQuery('')
    input.current?.blur()
  }

  const showList = open && query.trim().length > 0

  return (
    <div className="search" ref={wrap}>
      <div className="search-field">
        <SearchIcon />
        <input
          ref={input}
          type="search"
          placeholder="Search by name or NORAD ID"
          aria-label="Search satellites"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && results[active] !== undefined ? `${listId}-${active}` : undefined}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(results.length - 1, a + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(0, a - 1))
            } else if (e.key === 'Enter' && results[active] !== undefined) {
              choose(results[active])
            } else if (e.key === 'Escape') {
              setQuery('')
              input.current?.blur()
            }
          }}
        />
        {query && (
          <button className="icon-btn small" aria-label="Clear search" onClick={() => setQuery('')}>
            <CloseIcon />
          </button>
        )}
      </div>

      {showList && (
        <ul className="search-results" id={listId} role="listbox">
          {results.length === 0 && <li className="search-empty">No matches in the catalog. Try part of the name (for example “STARLINK” or “ISS”) or the NORAD catalog number.</li>}
          {results.map((i, k) => {
            const c = CONSTELLATIONS[groupIndex[i]]
            return (
              <li
                key={i}
                id={`${listId}-${k}`}
                role="option"
                aria-selected={k === active}
                className="search-result"
                onPointerEnter={() => setActive(k)}
                onPointerDown={(e) => {
                  e.preventDefault()
                  choose(i)
                }}
              >
                <span className="dot" style={{ background: c.color }} aria-hidden />
                <span className="search-result-name">{satellites[i].OBJECT_NAME}</span>
                <span className="search-result-meta">
                  {c.label}
                  <span className="search-result-id">{satellites[i].NORAD_CAT_ID}</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
