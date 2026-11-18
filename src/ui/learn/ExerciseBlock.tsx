import { useEffect, useMemo, useState } from 'react'
import type { SatRecord } from '../../data/types'
import { Tex } from '../Tex'
import { fx } from '../format'
import { makeCtx, type Exercise } from './exercises'

interface Props {
  ex: Exercise
  satellites: SatRecord[]
  now: number
}

/**
 * Ejercicio con datos reales: el enunciado usa los elementos del satélite de referencia en el
 * instante de la simulación, se comprueba la respuesta con una tolerancia relativa y se puede
 * desplegar la solución con los números.
 */
export function ExerciseBlock({ ex, satellites, now }: Props) {
  const rec = useMemo(() => ex.ref(satellites), [ex, satellites])
  // Los datos se fijan al abrir el ejercicio para que el enunciado no cambie mientras se resuelve
  const ctx = useMemo(() => (rec ? makeCtx(rec, now) : null), [rec, ex]) // eslint-disable-line react-hooks/exhaustive-deps
  const [value, setValue] = useState('')
  const [result, setResult] = useState<null | { ok: boolean; err: number }>(null)
  const [showSol, setShowSol] = useState(false)
  useEffect(() => {
    setValue('')
    setResult(null)
    setShowSol(false)
  }, [ex])

  if (!ctx) return null
  const answer = ex.answer(ctx)
  const check = () => {
    const v = Number(value.replace(',', '.'))
    if (!Number.isFinite(v)) return
    const err = (v - answer) / Math.abs(answer || 1)
    setResult({ ok: Math.abs(err) <= ex.tol, err })
  }

  return (
    <div className="exercise">
      <p className="try-label">Exercise with live data</p>
      <p className="exercise-prompt">{ex.prompt(ctx)}</p>
      <form
        className="exercise-form"
        onSubmit={(e) => {
          e.preventDefault()
          check()
        }}
      >
        <label className="inline-input">
          <span className="visually-hidden">Your answer</span>
          <input type="text" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Your answer" />
          {ex.unit}
        </label>
        <button className="btn small primary" type="submit" disabled={!value.trim()}>
          Check
        </button>
        <button className="btn small ghost" type="button" onClick={() => setShowSol((s) => !s)} aria-expanded={showSol}>
          {showSol ? 'Hide solution' : 'Show solution'}
        </button>
      </form>
      {result && (
        <p className={`exercise-result ${result.ok ? 'tone-good' : 'tone-warn'}`} role="status">
          {result.ok
            ? `Correct: ${fx(answer, ex.digits)} ${ex.unit}.`
            : `Not yet: your value is ${fx(Math.abs(result.err) * 100, 1)} % ${result.err > 0 ? 'high' : 'low'}. Tolerance is ±${fx(ex.tol * 100, 1)} %.`}
        </p>
      )}
      {showSol && <Tex block>{ex.solution(ctx)}</Tex>}
    </div>
  )
}
