/**
 * Imágenes por teselas para cuando te acercas al globo (esquema XYZ, Web Mercator).
 * Puedes cambiar de proveedor con variables en un archivo .env (ver README).
 */

/** Imagen de día: fotografía de satélite de alta resolución */
export const DAY_TILE_URL: string =
  import.meta.env.VITE_TILE_URL ?? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

export const TILE_ATTRIBUTION: string = import.meta.env.VITE_TILE_ATTRIBUTION ?? 'Esri, Maxar, Earthstar Geographics'

export const TILE_MAX_ZOOM = 12

/**
 * Luces nocturnas de la NASA (Black Marble / City Lights, servicio GIBS), hasta zoom 8.
 * Se prueban en orden: si la primera dirección no responde se pasa a la siguiente,
 * y si ninguna funciona se usa la textura nocturna global.
 */
export const NIGHT_TILE_URLS: string[] = import.meta.env.VITE_NIGHT_TILE_URL
  ? [import.meta.env.VITE_NIGHT_TILE_URL]
  : [
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png',
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default/2012-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg',
      'https://map1.vis.earthdata.nasa.gov/wmts-webmerc/VIIRS_CityLights_2012/default//GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg',
    ]

export const NIGHT_TILE_MAX_ZOOM = 8

export const fillTemplate = (url: string, z: number, x: number, y: number) =>
  url.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
