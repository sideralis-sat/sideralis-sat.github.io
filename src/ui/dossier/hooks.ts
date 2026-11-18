import { useEffect, useState } from 'react'
import { telemetry, type Telemetry } from '../../lib/astrodynamics'
import type { SimClock } from '../../lib/clock'
import type { SatRecord } from '../../data/types'

/** Telemetría del satélite actualizada 4 veces por segundo (tiempo de simulación) */
export function useTelemetry(record: SatRecord, clock: SimClock, ms = 250) {
  const [t, setT] = useState<Telemetry | null>(() => telemetry(record, clock.now()))
  useEffect(() => {
    const update = () => setT(telemetry(record, clock.now()))
    update()
    const id = setInterval(update, ms)
    return () => clearInterval(id)
  }, [record, clock, ms])
  return t
}

/** Instante de simulación, refrescado cada `ms` */
export function useSimNow(clock: SimClock, ms = 1000) {
  const [now, setNow] = useState(() => clock.now())
  useEffect(() => {
    const id = setInterval(() => setNow(clock.now()), ms)
    return () => clearInterval(id)
  }, [clock, ms])
  return now
}
