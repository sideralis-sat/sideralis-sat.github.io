/// <reference lib="webworker" />
/**
 * Propagación SGP4 fuera del hilo principal.
 * Recibe los registros OMM una vez y, cada vez que se le pide un instante,
 * devuelve todas las posiciones en coordenadas de escena (Float32Array, transferido sin copia).
 */
import { json2satrec, propagate, type SatRec } from 'satellite.js'
import type { SatRecord } from '../data/types'
import { EARTH_RADIUS_KM } from '../lib/coords'

export type WorkerRequest =
  | { type: 'init'; records: SatRecord[] }
  | { type: 'propagate'; time: number; gen: number }

export type WorkerResponse =
  | { type: 'ready'; count: number; failed: number }
  | { type: 'positions'; time: number; gen: number; positions: Float32Array; valid: Uint8Array; ms: number }

let satrecs: (SatRec | null)[] = []

function post(msg: WorkerResponse, transfer: Transferable[] = []) {
  ;(self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, transfer)
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data

  if (msg.type === 'init') {
    let failed = 0
    satrecs = msg.records.map((r) => {
      try {
        const s = json2satrec(r)
        if (s.error) throw new Error(String(s.error))
        return s
      } catch {
        failed++
        return null
      }
    })
    post({ type: 'ready', count: satrecs.length, failed })
    return
  }

  if (msg.type === 'propagate') {
    // No se calcula al recibir: se encola y se atiende en la siguiente vuelta del bucle de
    // eventos, para que las peticiones viejas (de antes de un salto o cambio de ritmo) que
    // sigan en cola se descarten sin gastar una propagación completa en cada una
    pending.push(msg)
    if (!scheduled) {
      scheduled = true
      setTimeout(drain, 0)
    }
  }
}

type PropagateRequest = Extract<WorkerRequest, { type: 'propagate' }>
let pending: PropagateRequest[] = []
let scheduled = false

function drain() {
  scheduled = false
  if (!pending.length) return
  let newest = pending[0].gen
  for (const p of pending) if (p.gen > newest) newest = p.gen
  pending = pending.filter((p) => p.gen === newest)
  propagateAll(pending.shift()!)
  if (pending.length) {
    scheduled = true
    setTimeout(drain, 0)
  }
}

function propagateAll(msg: PropagateRequest) {
  const t0 = performance.now()
  const n = satrecs.length
  const positions = new Float32Array(n * 3)
  const valid = new Uint8Array(n)
  const date = new Date(msg.time)
  const R = EARTH_RADIUS_KM

  for (let i = 0; i < n; i++) {
    const s = satrecs[i]
    if (!s) continue
    const pv = propagate(s, date, { communityDecayCheckEnabled: true })
    const p = pv?.position
    if (!p || !Number.isFinite(p.x)) continue
    const o = i * 3
    positions[o] = p.x / R
    positions[o + 1] = p.z / R
    positions[o + 2] = -p.y / R
    valid[i] = 1
  }

  post({ type: 'positions', time: msg.time, gen: msg.gen, positions, valid, ms: performance.now() - t0 }, [positions.buffer, valid.buffer])
}
