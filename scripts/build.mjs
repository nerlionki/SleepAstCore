import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { installOcrNameCatalog } from './ocr-names.mjs'
import { validateActivityResource } from './validate-activities.mjs'
import { validateActivityCatalog } from './activity-model.mjs'
import { installProductionRankings } from './production-rankings.mjs'
import { buildEventBundles, bundleItemCatalog, validateBundleArtwork } from './event-bundles.mjs'
import { validateI18n } from './i18n.mjs'
import { validateActivityArchive } from './activity-archive.mjs'
import { validateSkillResources } from './validate-skill-resources.mjs'
import { validateIdImages } from './id-images.mjs'
import { installItemCatalog } from './item-catalog.mjs'
const root = path.resolve(import.meta.dirname, '..')
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
const version = (process.env.RESOURCE_VERSION || pkg.version).replace(/^v/, '')
if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version)) throw new Error('Resource version must be a numeric release version')
const api = process.env.RESOURCE_API_VERSION || '1'
if (!['1', '2'].includes(api)) throw new Error('Invalid resource API version')
const context = process.env.RESOURCE_CONTEXT || 'prod'
if (!['prod', 'test'].includes(context)) throw new Error('RESOURCE_CONTEXT must be prod or test')
const directory = `${context}/resources/v${api}/releases/${version}`
const dist = path.join(root, 'dist')
// Context is validated above; rebuilding test must preserve prod artifacts.
// Both components are validated above; rebuilding v2 preserves all v1 artifacts.
await fs.rm(path.join(dist, context, 'resources', `v${api}`), { recursive: true, force: true })
await fs.mkdir(path.join(dist, directory), { recursive: true })
const sha256 = value => createHash('sha256').update(value).digest('hex')
const data = {}
for (const file of (await fs.readdir(path.join(root, 'src/data'))).filter(file => file.endsWith('.json')).sort()) {
  data[file] = JSON.parse(await fs.readFile(path.join(root, 'src/data', file), 'utf8'))
}
if (api === '1') {
  data['activities.json'] = JSON.parse(await fs.readFile(path.join(root, 'src/compat/activities-v1.json'), 'utf8'))
  data['meta.json'] = JSON.parse(await fs.readFile(path.join(root, 'src/compat/meta-v1.json'), 'utf8'))
}
if (Object.keys(data).length !== 43) throw new Error('Changing the data file set requires updating the client contract')
const bundleItems = bundleItemCatalog(data)
const bundleTextPairs = data['compatibility-maps.json'].modules.text.PAIR
data['meta.json'].eventBundles = buildEventBundles(JSON.parse(await fs.readFile(path.join(root, 'src/catalogs/event-bundles.json'), 'utf8')), bundleItems, bundleTextPairs)
if (api === '2') {
  data['meta.json'].i18n = validateI18n(JSON.parse(await fs.readFile(path.join(root, 'src/catalogs/i18n.json'), 'utf8')))
  const archive = JSON.parse(await fs.readFile(path.join(root, 'src/catalogs/activity-archive.json'), 'utf8'))
  validateActivityArchive(archive, data)
  data['meta.json'].activityArchive = archive
  const archivedBundles = JSON.parse(await fs.readFile(path.join(root, 'src/catalogs/archived-event-bundles.json'), 'utf8'))
  data['meta.json'].archivedEventBundles = buildEventBundles(archivedBundles, bundleItems, bundleTextPairs, true)
  const eventIds = new Set([...data['activities.json'].activities, ...archive.events].map(event => event.id))
  if (archivedBundles.bundles.some(bundle => !eventIds.has(bundle.eventId))) throw Error('Archived bundle refers to an unknown activity')
}
await installProductionRankings(data, context)
installItemCatalog(data)
if (api === '1') validateActivityResource(data)
else {
  if (data['activities.json'].schemaVersion !== 2) throw new Error('v2 requires activity schema 2')
  validateActivityCatalog(data['activities.json'], data)
  // Older v2 clients reject unknown activity fields, including source annotations.
  const activitySources = {}
  for (const activity of data['activities.json'].activities) {
    if (activity.sources === undefined) continue
    activitySources[activity.id] = activity.sources
    delete activity.sources
  }
  data['meta.json'].activitySources = activitySources
}
installOcrNameCatalog(data)
validateSkillResources(data)
const payload = JSON.stringify(data)
await fs.writeFile(path.join(dist, directory, 'data.json'), payload)
const assets = {}
const reused = { schemaVersion: 1, context, version, files: [] }
const baseline = process.env.RESOURCE_BASE_MANIFEST
  ? JSON.parse(await fs.readFile(process.env.RESOURCE_BASE_MANIFEST, 'utf8')) : null
if (baseline && (baseline.schemaVersion !== 1 || baseline.contract !== `sleepast-data-v${api}`
  || baseline.clientMajor !== 2 || !/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(baseline.version)
  || !baseline.data?.path?.startsWith('/' + context + '/resources/v' + api + '/releases/' + baseline.version + '/')
  || !baseline.assets || typeof baseline.assets !== 'object')) throw Error('Invalid image baseline')
async function copyImages(source, prefix) {
  for (const item of await fs.readdir(source, { withFileTypes: true })) {
    const file = path.join(source, item.name)
    const relative = `${prefix}${item.name}`
    if (item.isDirectory()) await copyImages(file, `${relative}/`)
    else if (/\.(webp|png|jpe?g|svg)$/i.test(item.name)) {
      const bytes = await fs.readFile(file)
      const target = `${directory}/${relative}`
      if (assets[relative]) throw Error(`Duplicate asset: ${relative}`)
      const item = { path: '/' + target, bytes: bytes.length, sha256: sha256(bytes) }
      const previous = baseline?.assets[relative]
      const previousPrefix = '/' + context + '/resources/v' + api + '/releases/' + baseline?.version + '/'
      if (previous && previous.path?.startsWith(previousPrefix) && !/[\\?#%]/.test(previous.path)
        && !previous.path.split('/').includes('..') && previous.bytes === item.bytes && previous.sha256 === item.sha256
        && previous.path !== item.path) {
        reused.files.push({ asset: relative, ...item, source: previous.path })
      } else {
        await fs.mkdir(path.dirname(path.join(dist, target)), { recursive: true })
        await fs.writeFile(path.join(dist, target), bytes)
      }
      assets[relative] = item
    }
  }
}
await copyImages(path.join(root, 'src/assets/imgs'), 'images/')
await copyImages(path.join(root, 'public/items'), 'items/')
await copyImages(path.join(root, 'public/sprites'), 'sprites/')
validateIdImages(data, assets)
validateBundleArtwork(data['meta.json'].eventBundles, data['pokedex.json'], assets, bundleItems)
if (api === '2') validateBundleArtwork(data['meta.json'].archivedEventBundles, data['pokedex.json'], assets, [])
if (api === '2') for (const rows of Object.values(data['meta.json'].announcedContent ?? {})) {
  if (!Array.isArray(rows)) continue
  for (const row of rows) if (row?.imageFile && !assets['images/' + row.imageFile]) throw new Error('Missing announced image: ' + row.imageFile)
}
const manifest = {
  schemaVersion: 1, contract: `sleepast-data-v${api}`, clientMajor: 2, version,
  data: { path: `/${directory}/data.json`, bytes: Buffer.byteLength(payload), sha256: sha256(payload) },
  ...(api === '2' ? { activityModelVersion: 2, requiredCapabilities: data['activities.json'].requiredCapabilities } : {}),
  files: Object.keys(data), assets,
}
await fs.writeFile(path.join(dist, context, `resources/v${api}/manifest.json`), JSON.stringify(manifest))
if (reused.files.length) await fs.writeFile(path.join(dist, context, `resources/v${api}/reused-assets.json`), JSON.stringify(reused))
console.log(`Built ${version}: ${Object.keys(data).length} JSON files, ${Object.keys(assets).length} image entries, ${reused.files.length} unchanged image files reused`)
