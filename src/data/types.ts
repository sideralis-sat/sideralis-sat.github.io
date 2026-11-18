import type { OMMJsonObject } from 'satellite.js'

/** Registro OMM de CelesTrak + la constelación asignada por scripts/fetch-data.mjs */
export type SatRecord = OMMJsonObject & { NORAD_CAT_ID: number; GROUP: string }

export interface Catalog {
  generatedAt: string
  source: string
  counts: Record<string, number>
  satellites: SatRecord[]
}

export interface Constellation {
  id: string
  label: string
  color: string
  /** Grupo o grupos de CelesTrak (GROUP de gp.php) */
  celestrak: string | string[] | null
  match: string | null
}
