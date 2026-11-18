/**
 * Balance de enlace descendente (satélite → estación), en decibelios.
 *
 *   L_fs  = 20 log₁₀(4π ρ f / c)  = 92,45 + 20 log₁₀ ρ[km] + 20 log₁₀ f[GHz]   pérdidas en espacio libre
 *   EIRP  = 10 log₁₀ P_t + G_t                                                potencia radiada equivalente
 *   G/T   = G_r − 10 log₁₀ T_sys                                              figura de mérito de la estación
 *   C/N₀  = EIRP − L_fs − L_otras + G/T − 10 log₁₀ k,   10 log₁₀ k = −228,6 dBW/(K·Hz)
 *   E_b/N₀ = C/N₀ − 10 log₁₀ R_b
 *   margen = E_b/N₀ − (E_b/N₀)_requerida
 */
export const BOLTZMANN_DB = -228.6

export interface LinkParams {
  powerW: number
  txGainDbi: number
  rxGainDbi: number
  tsysK: number
  rateBps: number
  lossesDb: number
  requiredEbN0: number
}

export const fsplDb = (rangeKm: number, freqHz: number) => 92.45 + 20 * Math.log10(rangeKm) + 20 * Math.log10(freqHz / 1e9)
export const dB = (x: number) => 10 * Math.log10(x)

export function linkAt(rangeKm: number, freqHz: number, p: LinkParams) {
  const eirp = dB(p.powerW) + p.txGainDbi
  const gt = p.rxGainDbi - dB(p.tsysK)
  const fspl = fsplDb(rangeKm, freqHz)
  const cn0 = eirp - fspl - p.lossesDb + gt - BOLTZMANN_DB
  const ebn0 = cn0 - dB(p.rateBps)
  return { eirp, gt, fspl, cn0, ebn0, margin: ebn0 - p.requiredEbN0 }
}

export const LINK_PRESETS: { label: string; freqMHz: number; p: LinkParams }[] = [
  { label: 'CubeSat UHF', freqMHz: 437.8, p: { powerW: 1, txGainDbi: 0, rxGainDbi: 14, tsysK: 600, rateBps: 9600, lossesDb: 4, requiredEbN0: 9.6 } },
  { label: 'S-band TT&C', freqMHz: 2250, p: { powerW: 5, txGainDbi: 3, rxGainDbi: 35, tsysK: 250, rateBps: 1e6, lossesDb: 3, requiredEbN0: 9.6 } },
  { label: 'X-band payload', freqMHz: 8200, p: { powerW: 10, txGainDbi: 6, rxGainDbi: 48, tsysK: 180, rateBps: 300e6, lossesDb: 4, requiredEbN0: 4.5 } },
]
