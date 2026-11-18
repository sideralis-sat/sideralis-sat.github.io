#!/usr/bin/env node
/**
 * Descarga el catálogo de satélites activos de CelesTrak (formato OMM/JSON)
 * y genera public/data/catalog.json con cada satélite asignado a su constelación.
 *
 * Política de uso de CelesTrak (https://celestrak.org/usage-policy.php):
 *  - Los datos GP se actualizan cada 2 horas: no hay que pedirlos más a menudo.
 *  - Ante cualquier respuesta distinta de HTTP 200 hay que dejar de pedir y avisar
 *    a una persona. Si se insiste, CelesTrak bloquea la IP.
 *  - Están empezando a limitar las descargas grandes (el grupo "active" y Starlink).
 *
 * Por eso este script:
 *  - guarda cada descarga en una caché en tu carpeta de usuario (~/.cenit-cache),
 *    que se conserva aunque descomprimas una versión nueva del proyecto;
 *  - no vuelve a pedir un archivo hasta que pasan 2 horas;
 *  - no descarga Starlink, OneWeb, Kuiper ni Qianfan por separado (ya vienen dentro
 *    de "active"; se reconocen por su nombre);
 *  - se detiene en cuanto CelesTrak responde con un error y usa lo que tenga guardado.
 *
 * Uso:
 *   node scripts/fetch-data.mjs           descarga lo que haga falta y regenera el catálogo
 *   node scripts/fetch-data.mjs --soft    nunca falla (se usa antes de `vite`)
 *   node scripts/fetch-data.mjs --force   ignora la caché (con moderación)
 */
import { copyFile, mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE_ROOT = process.env.CENIT_CACHE ?? join(homedir(), '.cenit-cache')
const CACHE_DIR = join(CACHE_ROOT, 'celestrak')
const CATALOG_BACKUP = join(CACHE_ROOT, 'catalog.json')
const OUT_FILE = join(ROOT, 'public', 'data', 'catalog.json')
const SW_FILE = join(ROOT, 'public', 'data', 'spaceweather.json')
const SW_CACHE = join(CACHE_ROOT, 'swpc')
const GROUPS_FILE = join(ROOT, 'src', 'data', 'constellations.json')

const BASE_URL = 'https://celestrak.org/NORAD/elements/gp.php'
const MAX_AGE_MS = 2 * 60 * 60 * 1000
const USER_AGENT = 'Cenit-satellite-tracker/0.4 (proyecto personal educativo)'

const args = new Set(process.argv.slice(2))
const SOFT = args.has('--soft')
const FORCE = args.has('--force')

const log = (...m) => console.log('[datos]', ...m)
const warn = (...m) => console.warn('[datos] aviso:', ...m)

/** Tras la primera respuesta de error no se vuelve a llamar a CelesTrak en esta ejecución */
let networkStopped = null

async function fileAgeMs(path) {
  try {
    return Date.now() - (await stat(path)).mtimeMs
  } catch {
    return Infinity
  }
}

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'))
const hours = (ms) => (ms / 3.6e6).toFixed(1).replace('.', ',')

/** Un grupo de CelesTrak, desde la caché o la red. Devuelve { data, source } o null */
async function getGroup(group) {
  const cacheFile = join(CACHE_DIR, `${group}.json`)
  const age = await fileAgeMs(cacheFile)
  const cached = async (why) => {
    if (age === Infinity) return null
    if (why) warn(`${why}; uso la copia guardada de hace ${hours(age)} h de "${group}".`)
    return { data: await readJson(cacheFile), source: 'caché' }
  }

  if (!FORCE && age < MAX_AGE_MS) return cached()
  if (networkStopped) return cached(networkStopped)

  const url = `${BASE_URL}?GROUP=${encodeURIComponent(group)}&FORMAT=json`
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
    const text = await res.text()
    if (res.status !== 200) {
      networkStopped = `CelesTrak ha respondido HTTP ${res.status} (${text.slice(0, 120).trim() || 'sin mensaje'})`
      warn(`${networkStopped}. No se harán más peticiones en esta ejecución, como pide su política de uso.`)
      if (res.status === 403)
        warn('Un 403 suele significar que se ha descargado demasiado a menudo. Espera unas horas antes de volver a intentarlo.')
      return cached(null)
    }
    // Con grupos inexistentes o vacíos CelesTrak responde texto plano en vez de JSON
    if (!text.trimStart().startsWith('[')) {
      warn(`"${group}": CelesTrak no ha devuelto datos (${text.slice(0, 100).trim()}).`)
      return cached(null)
    }
    await writeFile(cacheFile, text)
    return { data: JSON.parse(text), source: 'descargado' }
  } catch (err) {
    networkStopped = `sin conexión con CelesTrak (${err.message})`
    return cached(networkStopped)
  }
}

/**
 * Meteorología espacial del Space Weather Prediction Center (NOAA): flujo solar F10.7,
 * índices geomagnéticos Kp/ap y la predicción del ciclo solar. Son datos públicos sin
 * límite estricto, pero también se guardan en caché (3 horas) para no pedirlos de más.
 */
const SWPC = {
  f107: 'https://services.swpc.noaa.gov/json/f107_cm_flux.json',
  kp: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',
  cycle: 'https://services.swpc.noaa.gov/json/solar-cycle/predicted-solar-cycle.json',
}

async function getSwpc(name) {
  const file = join(SW_CACHE, `${name}.json`)
  if (!FORCE && (await fileAgeMs(file)) < 3 * 3.6e6) return readJson(file)
  try {
    const res = await fetch(SWPC[name], { headers: { 'User-Agent': USER_AGENT } })
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    const data = JSON.parse(text)
    await writeFile(file, text)
    return data
  } catch (err) {
    if (existsSync(file)) {
      warn(`NOAA SWPC (${name}): ${err.message}; uso la copia guardada.`)
      return readJson(file)
    }
    warn(`NOAA SWPC (${name}): ${err.message}.`)
    return null
  }
}

async function spaceWeather() {
  await mkdir(SW_CACHE, { recursive: true })
  const [f107, kp, cycle] = [await getSwpc('f107'), await getSwpc('kp'), await getSwpc('cycle')]
  if (!f107 && !kp) return
  // Un valor de F10.7 por día (el de mediodía, el de referencia) y su media de 90 días
  const noon = (f107 ?? []).filter((d) => d.reporting_schedule === 'Noon' || d.ninety_day_mean)
  const out = {
    generatedAt: new Date().toISOString(),
    source: 'NOAA Space Weather Prediction Center (services.swpc.noaa.gov)',
    f107: noon.map((d) => ({ t: `${d.time_tag}Z`, flux: d.flux, mean90: d.ninety_day_mean ?? null })).sort((a, b) => a.t.localeCompare(b.t)),
    kp: (kp ?? []).map((d) => (Array.isArray(d) ? null : { t: `${d.time_tag}Z`, kp: Number(d.Kp), ap: Number(d.a_running) })).filter(Boolean),
    cycle: (cycle ?? []).map((d) => ({ month: d['time-tag'], f107: d['predicted_f10.7'], high: d['high_f10.7'], low: d['low_f10.7'] })),
  }
  await writeFile(SW_FILE, JSON.stringify(out))
  const last = out.f107[out.f107.length - 1]
  log(`meteorología espacial: F10.7 = ${last?.flux ?? '?'} sfu, ${out.kp.length} índices Kp → public/data/spaceweather.json`)
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true })
  await mkdir(dirname(OUT_FILE), { recursive: true })
  const { groups } = await readJson(GROUPS_FILE)
  await spaceWeather().catch((err) => warn(`meteorología espacial: ${err.message}`))

  const active = await getGroup('active')
  if (!active) {
    // Último recurso: el catálogo de una ejecución anterior (aunque sea de otra versión del proyecto)
    if (!existsSync(OUT_FILE) && existsSync(CATALOG_BACKUP)) {
      await copyFile(CATALOG_BACKUP, OUT_FILE)
      warn(`No hay datos nuevos. Uso el último catálogo guardado (${hours(await fileAgeMs(CATALOG_BACKUP))} h de antigüedad).`)
      return
    }
    throw new Error('No hay datos del grupo "active" ni copia guardada.')
  }
  log(`activos: ${active.data.length} (${active.source})`)

  const byId = new Map(active.data.map((s) => [s.NORAD_CAT_ID, s]))
  const membership = new Map()
  for (const g of groups) {
    if (!g.celestrak) continue
    // Una constelación puede reunir varios grupos (p. ej. las nubes de restos de cada fragmentación)
    const names = Array.isArray(g.celestrak) ? g.celestrak : [g.celestrak]
    const members = new Set()
    let total = 0
    for (const name of names) {
      const res = await getGroup(name)
      if (!res) continue
      for (const s of res.data) {
        members.add(s.NORAD_CAT_ID)
        // Los restos no están en "active": se añaden al catálogo
        if (!byId.has(s.NORAD_CAT_ID)) byId.set(s.NORAD_CAT_ID, s)
      }
      total += res.data.length
      if (res.source === 'descargado') await new Promise((r) => setTimeout(r, 500))
    }
    if (!members.size) {
      log(`${g.label}: sin lista propia, se reconocerán por el nombre`)
      continue
    }
    membership.set(g.id, members)
    log(`${g.label}: ${total}`)
  }

  const matchers = groups.map((g) => ({ ...g, re: g.match ? new RegExp(g.match, 'i') : null }))
  const counts = Object.fromEntries(groups.map((g) => [g.id, 0]))
  const satellites = []
  for (const s of byId.values()) {
    let group = 'other'
    for (const g of matchers) {
      const members = membership.get(g.id)
      if (members ? members.has(s.NORAD_CAT_ID) : g.re?.test(s.OBJECT_NAME ?? '')) {
        group = g.id
        break
      }
    }
    counts[group]++
    satellites.push({ ...s, GROUP: group })
  }

  const catalog = { generatedAt: new Date().toISOString(), source: 'CelesTrak (celestrak.org), datos GP en formato OMM', counts, satellites }
  const json = JSON.stringify(catalog)
  await writeFile(OUT_FILE, json)
  await writeFile(CATALOG_BACKUP, json)
  log(`catálogo listo: ${satellites.length} satélites (Starlink: ${counts.starlink}) → public/data/catalog.json`)
}

main().catch((err) => {
  if (SOFT && existsSync(OUT_FILE)) {
    warn(`${err.message} Sigo con el catálogo que ya existe.`)
    return
  }
  if (SOFT) {
    warn(`${err.message} La web arrancará sin datos; vuelve a ejecutar \`npm run fetch-data\` más tarde.`)
    return
  }
  console.error('[datos] error:', err.message)
  process.exit(1)
})
