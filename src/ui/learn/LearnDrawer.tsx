import { useEffect, useRef, useState } from 'react'
import { CloseIcon } from '../icons'
import { LESSONS, SOURCES, type LearnActions } from './lessons'
import type { SatRecord } from '../../data/types'
import type { SimClock } from '../../lib/clock'
import { ExerciseBlock } from './ExerciseBlock'
import { EXERCISES } from './exercises'

/** Las notas, agrupadas por tema para que el índice no sea una lista interminable */
const GROUPS = [
  { title: 'Orbits', ids: ['orbita', 'elementos', 'marcos', 'traza', 'regimenes'] },
  { title: 'Perturbations and data', ids: ['j2', 'sgp4', 'sombra'] },
  { title: 'Operations', ids: ['pases', 'gnss', 'dop', 'enlace', 'maniobras', 'reentrada', 'basura'] },
  { title: 'Mission tools', ids: ['diseno', 'astrofoto'] },
]

interface Props {
  open: boolean
  onClose: () => void
  actions: LearnActions
  satellites: SatRecord[] | null
  clock: SimClock
}

/** Panel lateral con lecciones de mecánica orbital y botones «Pruébalo» */
export function LearnDrawer({ open, onClose, actions, satellites, clock }: Props) {
  const [current, setCurrent] = useState<string | null>(null)
  const body = useRef<HTMLDivElement>(null)
  const lesson = LESSONS.find((l) => l.id === current) ?? null
  const idx = lesson ? LESSONS.indexOf(lesson) : -1

  useEffect(() => {
    body.current?.scrollTo({ top: 0 })
  }, [current])

  if (!open) return null
  return (
    <aside className="panel learn" aria-label="Fundamentals">
      <header className="learn-head">
        {lesson ? (
          <button className="link" onClick={() => setCurrent(null)}>
            Contents
          </button>
        ) : (
          <h2 className="learn-title">Orbital mechanics fundamentals</h2>
        )}
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </button>
      </header>

      <div className="learn-body" ref={body}>
        {!lesson && (
          <>
            <p className="lead">
              Technical notes on the models and equations behind the app. Each one ends with an exercise built from live catalog data and a worked case you can run on the globe.
            </p>
            {GROUPS.map((g) => (
              <section key={g.title} className="lesson-group">
                <h3 className="lesson-group-title">{g.title}</h3>
                <ol className="lesson-list">
                  {LESSONS.filter((l) => g.ids.includes(l.id)).map((l) => (
                    <li key={l.id}>
                      <button className="lesson-card" onClick={() => setCurrent(l.id)}>
                        <span className="lesson-num">{LESSONS.indexOf(l) + 1}</span>
                        <span className="lesson-card-title">{l.title}</span>
                        <span className="lesson-card-sum">{l.summary}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
            <section className="sources">
              <h3>Sources</h3>
              <ul>
                {SOURCES.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        {lesson && (
          <article className="lesson">
            <p className="lesson-index">
              Note {idx + 1} of {LESSONS.length}
            </p>
            <h2>{lesson.title}</h2>
            {lesson.body}
            {satellites && EXERCISES[lesson.id] && <ExerciseBlock ex={EXERCISES[lesson.id]} satellites={satellites} now={clock.now()} />}
            {lesson.tries.length > 0 && (
              <div className="try">
                <p className="try-label">Worked case</p>
                <div className="btn-row">
                  {lesson.tries.map((t) => (
                    <button key={t.label} className="btn" onClick={() => t.run(actions)}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <nav className="lesson-nav">
              {idx > 0 && (
                <button className="link" onClick={() => setCurrent(LESSONS[idx - 1].id)}>
                  Previous: {LESSONS[idx - 1].title}
                </button>
              )}
              {idx < LESSONS.length - 1 && (
                <button className="link" onClick={() => setCurrent(LESSONS[idx + 1].id)}>
                  Next: {LESSONS[idx + 1].title}
                </button>
              )}
            </nav>
          </article>
        )}
      </div>
    </aside>
  )
}
