/**
 * Reloj de simulación. Por ahora va en tiempo real (speed = 1), pero ya admite
 * acelerar, pausar o retroceder para el control de tiempo de una fase posterior.
 */
export class SimClock {
  private realRef = performance.now()
  private simRef = Date.now()
  speed = 1
  /** Se incrementa cuando el tiempo salta, para que quien dependa de él se reinicie */
  epoch = 0

  now(): number {
    return this.simRef + (performance.now() - this.realRef) * this.speed
  }

  setSpeed(speed: number) {
    this.simRef = this.now()
    this.realRef = performance.now()
    if (Math.sign(speed) !== Math.sign(this.speed)) this.epoch++
    this.speed = speed
  }

  /** true si va en tiempo real (×1 y sin desfase apreciable) */
  isLive(): boolean {
    return this.speed === 1 && Math.abs(this.now() - Date.now()) < 2000
  }

  /** Vuelve al tiempo real */
  goLive() {
    this.speed = 1
    this.jumpTo(Date.now())
  }

  jumpTo(ms: number) {
    this.simRef = ms
    this.realRef = performance.now()
    this.epoch++
  }
}
