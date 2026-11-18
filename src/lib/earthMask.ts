/**
 * ¿Océano o tierra? Se consulta la máscara de agua (la textura especular del globo:
 * blanca en el mar, negra en tierra).
 */
let mask: { data: Uint8ClampedArray; w: number; h: number } | null = null
let loading: Promise<void> | null = null

export function loadEarthMask() {
  if (loading) return loading
  loading = new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(img, 0, 0)
      mask = { data: ctx.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height }
      resolve()
    }
    img.onerror = () => resolve()
    img.src = `${import.meta.env.BASE_URL}textures/earth_specular_2048.jpg`
  })
  return loading
}

/** true = océano, false = tierra, null = desconocido */
export function isOcean(lat: number, lon: number): boolean | null {
  if (!mask) return null
  const x = Math.floor(((lon + 180) / 360) * mask.w) % mask.w
  const y = Math.min(mask.h - 1, Math.floor(((90 - lat) / 180) * mask.h))
  return mask.data[(y * mask.w + x) * 4] > 128
}
