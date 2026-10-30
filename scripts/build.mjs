import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { validateActivityResource } from './validate-activities.mjs'
import { applyTestMocks, addTestMockImages, testMockVersion } from './mock-catalog.mjs'
import { installProductionRankings } from './production-rankings.mjs'
const root = path.resolve(import.meta.dirname, '..')
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
const version = (process.env.RESOURCE_VERSION || (process.env.RESOURCE_CONTEXT === 'test' ? testMockVersion : pkg.version)).replace(/^v/, '')
if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version)) throw new Error('Resource version must be a numeric release version')
const context = process.env.RESOURCE_CONTEXT || 'prod'
if (!['prod', 'test'].includes(context)) throw new Error('RESOURCE_CONTEXT must be prod or test')
const directory = `${context}/resources/v1/releases/${version}`
const dist = path.join(root, 'dist')
// Context is validated above; rebuilding test must preserve prod artifacts.
await fs.rm(path.join(dist, context), { recursive: true, force: true })
await fs.mkdir(path.join(dist, directory), { recursive: true })
const sha256 = value => createHash('sha256').update(value).digest('hex')
const data = {}
for (const file of (await fs.readdir(path.join(root, 'src/data'))).filter(file => file.endsWith('.json')).sort()) {
  data[file] = JSON.parse(await fs.readFile(path.join(root, 'src/data', file), 'utf8'))
}
if (Object.keys(data).length !== 43) throw new Error('Changing the data file set requires updating the client contract')
if (context === 'test') applyTestMocks(data)
await installProductionRankings(data, context)
validateActivityResource(data)
const payload = JSON.stringify(data)
await fs.writeFile(path.join(dist, directory, 'data.json'), payload)
const assets = {}
const reused = { schemaVersion: 1, context, version, files: [] }
const baseline = process.env.RESOURCE_BASE_MANIFEST
  ? JSON.parse(await fs.readFile(process.env.RESOURCE_BASE_MANIFEST, 'utf8')) : null
if (baseline && (baseline.schemaVersion !== 1 || baseline.contract !== 'sleepast-data-v1'
  || baseline.clientMajor !== 2 || !/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(baseline.version)
  || !baseline.data?.path?.startsWith('/' + context + '/resources/v1/releases/' + baseline.version + '/')
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
      const previousPrefix = '/' + context + '/resources/v1/releases/' + baseline?.version + '/'
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
if (context === 'test') addTestMockImages(assets)
const manifest = {
  schemaVersion: 1, contract: 'sleepast-data-v1', clientMajor: 2, version,
  data: { path: `/${directory}/data.json`, bytes: Buffer.byteLength(payload), sha256: sha256(payload) },
  files: Object.keys(data), assets,
}
await fs.writeFile(path.join(dist, context, 'resources/v1/manifest.json'), JSON.stringify(manifest))
if (reused.files.length) await fs.writeFile(path.join(dist, context, 'resources/v1/reused-assets.json'), JSON.stringify(reused))
console.log(`Built ${version}: ${Object.keys(data).length} JSON files, ${Object.keys(assets).length} image entries, ${reused.files.length} unchanged image files reused`)
