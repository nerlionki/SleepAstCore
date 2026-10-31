import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { validateActivityResource } from './validate-activities.mjs'
import { validateEventBundles } from './event-bundles.mjs'
const root = path.resolve(process.argv[2] || path.join(import.meta.dirname, '../dist'))
const context = process.env.RESOURCE_CONTEXT || 'prod'
if (!['prod', 'test'].includes(context)) throw new Error('Invalid context')
const manifest = JSON.parse(await fs.readFile(path.join(root, context, 'resources/v1/manifest.json'), 'utf8'))
if (manifest.schemaVersion !== 1 || manifest.contract !== 'sleepast-data-v1' || manifest.clientMajor !== 2) throw new Error('Invalid contract')
const prefix = `/${context}/resources/v1/releases/${manifest.version}/`
const sourceRoot = path.resolve(import.meta.dirname, '..')
let reused = { files: [] }
try { reused = JSON.parse(await fs.readFile(path.join(root, context, 'resources/v1/reused-assets.json'), 'utf8')) }
catch (error) { if (error.code !== 'ENOENT') throw error }
if (reused.files.length && (reused.schemaVersion !== 1 || reused.context !== context || reused.version !== manifest.version)) throw Error('Invalid image reuse contract')
const reusedByPath = new Map()
for (const item of reused.files) {
  const asset = manifest.assets[item.asset]
  if (!asset || asset.path !== item.path || asset.bytes !== item.bytes || asset.sha256 !== item.sha256
    || reusedByPath.has(item.path) || !item.path.startsWith(prefix)
    || !new RegExp('^/' + context + '/resources/v1/releases/\\d+\\.\\d+\\.\\d+(?:\\.\\d+)?/').test(item.source)
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
if (manifest.files.length !== 43 || manifest.files.slice().sort().join() !== Object.keys(data).sort().join()) throw new Error('Incomplete data bundle')
validateActivityResource(data)
validateEventBundles(data['meta.json'].eventBundles)
console.log(`Verified ${manifest.version}: data and all ${Object.keys(manifest.assets).length} images`)
