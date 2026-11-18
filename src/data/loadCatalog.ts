import type { Catalog } from './types'

export class MissingCatalogError extends Error {}

export async function loadCatalog(): Promise<Catalog> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/catalog.json`, { cache: 'no-cache' })
  const type = res.headers.get('content-type') ?? ''
  // Vite devuelve index.html (200) cuando el archivo no existe
  if (res.status === 404 || !type.includes('json')) {
    throw new MissingCatalogError('public/data/catalog.json not found')
  }
  if (!res.ok) throw new Error(`Could not load the catalog (HTTP ${res.status})`)
  return res.json()
}
