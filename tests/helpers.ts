/** Utilidades comunes de las pruebas */
import type { SatRecord } from '../src/data/types'

export const DEG = Math.PI / 180

/** Registro OMM sintético (elementos medios) para las funciones que leen el catálogo */
export function omm(o: { n: number; e?: number; i: number; raan?: number; argp?: number; m?: number; bstar?: number; epoch?: string; name?: string }): SatRecord {
  return {
    OBJECT_NAME: o.name ?? 'TEST',
    OBJECT_ID: '2000-001A',
    EPOCH: o.epoch ?? '2026-01-01T00:00:00.000000',
    MEAN_MOTION: o.n,
    ECCENTRICITY: o.e ?? 0.0001,
    INCLINATION: o.i,
    RA_OF_ASC_NODE: o.raan ?? 0,
    ARG_OF_PERICENTER: o.argp ?? 0,
    MEAN_ANOMALY: o.m ?? 0,
    EPHEMERIS_TYPE: 0,
    CLASSIFICATION_TYPE: 'U',
    NORAD_CAT_ID: 99999,
    ELEMENT_SET_NO: 999,
    REV_AT_EPOCH: 0,
    BSTAR: o.bstar ?? 0.0001,
    MEAN_MOTION_DOT: 0,
    MEAN_MOTION_DDOT: 0,
    GROUP: 'test',
  } as SatRecord
}
