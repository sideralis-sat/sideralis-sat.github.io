import type { SatRecord } from '../data/types'
import type { SimClock } from './clock'
import type { WorkerRequest, WorkerResponse } from '../workers/propagator.worker'

interface Frame {
  time: number
  positions: Float32Array
  valid: Uint8Array
}

export interface StreamSample {
  /** Fotogramas entre los que interpolar (pueden ser el mismo) */
  a: Frame | null
  b: Frame | null
  /** 0..1 entre a y b */
  alpha: number
}

/**
 * Pide posiciones al worker por adelantado (una cada `step` de tiempo simulado)
 * y en cada fotograma indica entre qué dos instantes interpolar. Así el SGP4 corre
 * unas pocas veces por segundo y el movimiento se ve fluido a 60 fps.
 *
 * Hay hasta dos peticiones en vuelo y un colchón de varios pasos por delante, para que al
 * acelerar (×60, ×600) los fotogramas lleguen antes de hacer falta y los puntos no se paren.
 * Al saltar en el tiempo o cambiar de ritmo, lo pedido se cancela (el worker descarta lo que
 * aún no ha empezado) y mientras llega lo nuevo se mantiene el último fotograma dibujado.
 */
export class PositionStream {
  readonly count: number
  ready = false
  lastPropagationMs = 0
  onReady?: (info: { count: number; failed: number }) => void

  private worker: Worker
  private frames: Frame[] = []
  private inflight = 0
  /** Último instante pedido (puede no haber llegado aún) */
  private requested: number | null = null
  private gen = 0
  private epoch = -1
  private lastSpeed = 1
  /** Duración media de una propagación completa en el worker (ms reales) */
  private workerMs = 40
  /** Última muestra usada para dibujar (la usan la selección y el marcador) */
  current: { a: Frame | null; b: Frame | null; alpha: number } = { a: null, b: null, alpha: 0 }

  constructor(records: SatRecord[]) {
    this.count = records.length
    this.worker = new Worker(new URL('../workers/propagator.worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.handle(e.data)
    this.send({ type: 'init', records })
  }

  private send(msg: WorkerRequest) {
    this.worker.postMessage(msg)
  }

  private handle(msg: WorkerResponse) {
    if (msg.type === 'ready') {
      this.ready = true
      this.onReady?.(msg)
      return
    }
    if (msg.gen !== this.gen) return // respuesta de antes de un salto de tiempo o de ritmo
    this.inflight = Math.max(0, this.inflight - 1)
    this.lastPropagationMs = msg.ms
    this.workerMs = 0.7 * this.workerMs + 0.3 * msg.ms
    // Ordenados en el sentido de avance: tras un cambio de ritmo pueden llegar fotogramas
    // nuevos anteriores a uno que se conservó del ritmo anterior
    const dir = this.lastSpeed < 0 ? -1 : 1
    const f = this.frames
    let k = f.length
    while (k > 0 && dir * (f[k - 1].time - msg.time) > 0) k--
    f.splice(k, 0, { time: msg.time, positions: msg.positions, valid: msg.valid })
  }

  private request(time: number) {
    this.inflight++
    this.requested = time
    this.send({ type: 'propagate', time, gen: this.gen })
  }

  /** Olvida lo pedido: las respuestas en vuelo se ignorarán y el worker las descarta sin calcularlas */
  private cancelRequests() {
    this.gen++
    this.inflight = 0
    this.requested = null
  }

  /** Descarta lo calculado (tras un salto de tiempo o cambio de sentido) */
  reset() {
    this.cancelRequests()
    this.frames = []
  }

  /** Muestra para el instante del reloj; reinicia si el tiempo ha saltado o cambiado de sentido */
  tick(clock: SimClock): StreamSample {
    if (clock.epoch !== this.epoch) {
      this.epoch = clock.epoch
      this.reset()
    }
    return this.sample(clock.now(), clock.speed)
  }

  sample(simNow: number, speed: number): StreamSample {
    const dir = speed < 0 ? -1 : 1
    const mag = Math.abs(speed)
    // Una propagación cada 250 ms reales como poco (más si el worker es lento); entre ellas
    // se interpola. Con ×600 eso son 150 s simulados por paso: la cuerda en LEO se separa
    // del arco ~20 km, menos que el tamaño de un punto a esa escala.
    const realMs = Math.max(250, 2.5 * this.workerMs)
    const stepAbs = Math.min(Math.max(mag * realMs, 1000), 150_000)
    const ahead = (t: number) => dir * (t - simNow) // > 0 si t está "por delante"
    const f = this.frames

    // Cambio fuerte de ritmo (×4 o más, al acelerar o al frenar): lo pedido tiene el
    // espaciado del ritmo anterior. Se cancela y se conserva solo el tramo que se dibuja.
    const prev = Math.abs(this.lastSpeed)
    if (speed !== 0 && (mag > 4 * prev || mag * 4 < prev)) {
      this.cancelRequests()
      while (f.length >= 2 && ahead(f[1].time) <= 0) f.shift()
      if (f.length > 2) f.length = 2
    }
    if (speed !== 0) this.lastSpeed = speed

    // Quitar fotogramas que ya han quedado atrás (dejando uno como inicio del tramo)
    while (f.length >= 2 && ahead(f[1].time) <= 0) f.shift()

    // Si lo último pedido ya ha quedado atrás (worker lento, pestaña oculta), lo que esté en
    // vuelo llegaría caducado: se cancela y se vuelve a pedir desde ahora con margen
    if (this.requested !== null && ahead(this.requested) < 0) this.cancelRequests()

    if (this.ready) {
      // Colchón de 3 pasos por delante y como mucho 2 peticiones en vuelo. La primera petición
      // se adelanta lo que tardará en llegar, para que no nazca caducada.
      while (this.inflight < 2) {
        const from = this.requested
        if (from === null) {
          this.request(simNow + dir * mag * (1.3 * this.workerMs + 30))
          continue
        }
        if (ahead(from) >= 3 * stepAbs) break
        this.request(from + dir * stepAbs)
      }
    }

    // Sin fotogramas (justo tras un salto) se mantiene lo último dibujado en vez de vaciar
    // la escena o saltar hacia atrás
    const a = f[0] ?? null
    if (!a) return this.current
    const b = f[1] ?? a
    let alpha = 0
    if (b !== a) alpha = Math.min(1, Math.max(0, (simNow - a.time) / (b.time - a.time)))

    this.current = { a, b, alpha }
    return this.current
  }

  /** Posición interpolada (coordenadas de escena) del satélite i en el fotograma actual */
  positionOf(i: number, out: number[] | Float32Array): boolean {
    const { a, b, alpha } = this.current
    if (!a || !b || !a.valid[i] || !b.valid[i]) return false
    const o = i * 3
    for (let k = 0; k < 3; k++) out[k] = a.positions[o + k] + (b.positions[o + k] - a.positions[o + k]) * alpha
    return true
  }

  dispose() {
    this.worker.terminate()
  }
}
