import { validateOcrNameCatalog } from './ocr-names.mjs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { validateActivityResource } from './validate-activities.mjs'
import { validateActivityCatalog, ACTIVITY_CAPABILITIES } from './activity-model.mjs'
import { buildEventBundles, bundleItemCatalog, validateBundleArtwork, validateEventBundles } from './event-bundles.mjs'
import { validateI18n } from './i18n.mjs'
import { validateActivityArchive } from './activity-archive.mjs'
import { validateShinyStacking } from './shiny-stacking.mjs'
import { validateSkillResources } from './validate-skill-resources.mjs'
import { validateIdImages } from './id-images.mjs'
const root = path.resolve(process.argv[2] || path.join(import.meta.dirname, '../dist'))
const api = process.env.RESOURCE_API_VERSION || '1'
if (!['1', '2'].includes(api)) throw new Error('Invalid resource API version')
const context = process.env.RESOURCE_CONTEXT || 'prod'
if (!['prod', 'test'].includes(context)) throw new Error('Invalid context')
const manifest = JSON.parse(await fs.readFile(path.join(root, context, `resources/v${api}/manifest.json`), 'utf8'))
if (manifest.schemaVersion !== 1 || manifest.contract !== `sleepast-data-v${api}` || manifest.clientMajor !== 2) throw new Error('Invalid contract')
if (api === '2' && (manifest.activityModelVersion !== 2 || !Array.isArray(manifest.requiredCapabilities) || !manifest.requiredCapabilities.every(capability => ACTIVITY_CAPABILITIES.includes(capability)))) throw new Error('Invalid activity model version')
const prefix = `/${context}/resources/v${api}/releases/${manifest.version}/`
const sourceRoot = path.resolve(import.meta.dirname, '..')
let reused = { files: [] }
try { reused = JSON.parse(await fs.readFile(path.join(root, context, `resources/v${api}/reused-assets.json`), 'utf8')) }
catch (error) { if (error.code !== 'ENOENT') throw error }
if (reused.files.length && (reused.schemaVersion !== 1 || reused.context !== context || reused.version !== manifest.version)) throw Error('Invalid image reuse contract')
const reusedByPath = new Map()
for (const item of reused.files) {
  const asset = manifest.assets[item.asset]
  if (!asset || asset.path !== item.path || asset.bytes !== item.bytes || asset.sha256 !== item.sha256
    || reusedByPath.has(item.path) || !item.path.startsWith(prefix)
    || !new RegExp('^/' + context + '/resources/v' + api + '/releases/\\d+\\.\\d+\\.\\d+(?:\\.\\d+)?/').test(item.source)
    || /[\\?#%]/.test(item.source) || item.source.split('/').includes('..') || item.source === item.path) throw Error('Invalid reused image')
  const roots = [['images/', 'src/assets/imgs/'], ['items/', 'public/items/'], ['sprites/', 'public/sprites/']]
  const mapping = roots.find(([key]) => item.asset.startsWith(key))
  if (!mapping || item.asset.split('/').includes('..') || /[\\?#%]/.test(item.asset)) throw Error('Invalid image source')
  const local = path.resolve(sourceRoot, mapping[1], item.asset.slice(mapping[0].length))
  if (!local.startsWith(path.resolve(sourceRoot, mapping[1]) + path.sep)) throw Error('Invalid image source')
  reusedByPath.set(item.path, local)
}
for (const item of [manifest.data, ...Object.values(manifest.assets)]) {
  if (!item.path.startsWith(prefix) || item.path.includes('..') || item.path.includes('\\')) throw new Error('Invalid resource path')
  let bytes
  try { bytes = await fs.readFile(path.join(root, item.path.slice(1))) }
  catch (error) {
    if (error.code !== 'ENOENT' || !reusedByPath.has(item.path)) throw error
    bytes = await fs.readFile(reusedByPath.get(item.path))
  }
  if (bytes.length !== item.bytes || createHash('sha256').update(bytes).digest('hex') !== item.sha256) throw new Error(`Invalid resource: ${item.path}`)
}
const data = JSON.parse(await fs.readFile(path.join(root, manifest.data.path.slice(1)), 'utf8'))
validateSkillResources(data)
validateIdImages(data, manifest.assets)
if (manifest.files.length !== 43 || manifest.files.slice().sort().join() !== Object.keys(data).sort().join()) throw new Error('Incomplete data bundle')
if (api === '1') validateActivityResource(data)
else {
  if (data['activities.json'].schemaVersion !== 2) throw new Error('v2 requires activity schema 2')
  validateActivityCatalog(data['activities.json'], data)
  if (JSON.stringify(manifest.requiredCapabilities) !== JSON.stringify(data['activities.json'].requiredCapabilities)) throw new Error('Manifest and activity capabilities differ')
}
validateOcrNameCatalog(data)
validateEventBundles(data['meta.json'].eventBundles)
const bundleItems = bundleItemCatalog(data)
const bundleTextPairs = data['compatibility-maps.json'].modules.text.PAIR
validateBundleArtwork(data['meta.json'].eventBundles, data['pokedex.json'], manifest.assets, bundleItems)
if (api === '2') {
  validateI18n(data['meta.json'].i18n)
  validateActivityArchive(data['meta.json'].activityArchive, data)
  validateShinyStacking(data['meta.json'].shinyStacking, data)
  const archive = data['meta.json'].archivedEventBundles
  validateBundleArtwork(archive, data['pokedex.json'], manifest.assets, [])
  const eventIds = new Set([...data['activities.json'].activities, ...data['meta.json'].activityArchive.events].map(event => event.id))
  const rebuilt = buildEventBundles(archive, bundleItems, bundleTextPairs, true)
  if (JSON.stringify(archive) !== JSON.stringify(rebuilt) || archive.bundles.some(bundle => !eventIds.has(bundle.eventId))) {
    throw Error('Invalid archived bundle references or precomputed valuations')
  }
}
const rebuiltBundles = buildEventBundles(data['meta.json'].eventBundles, bundleItems, bundleTextPairs)
if (JSON.stringify(rebuiltBundles) !== JSON.stringify(data['meta.json'].eventBundles)) throw Error('Invalid bundle item references or precomputed valuations')
console.log(`Verified ${manifest.version}: data and all ${Object.keys(manifest.assets).length} images`)
