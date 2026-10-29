import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { validateActivityResource } from './validate-activities.mjs'
const root = path.resolve(process.argv[2] || path.join(import.meta.dirname, '../dist'))
const context = process.env.RESOURCE_CONTEXT || 'prod'
if (!['prod', 'test'].includes(context)) throw new Error('Invalid context')
const manifest = JSON.parse(await fs.readFile(path.join(root, context, 'resources/v1/manifest.json'), 'utf8'))
if (manifest.schemaVersion !== 1 || manifest.contract !== 'sleepast-data-v1' || manifest.clientMajor !== 2) throw new Error('Invalid contract')
const prefix = `/${context}/resources/v1/releases/${manifest.version}/`
for (const item of [manifest.data, ...Object.values(manifest.assets)]) {
  if (!item.path.startsWith(prefix) || item.path.includes('..') || item.path.includes('\\')) throw new Error('Invalid resource path')
  const bytes = await fs.readFile(path.join(root, item.path.slice(1)))
  if (bytes.length !== item.bytes || createHash('sha256').update(bytes).digest('hex') !== item.sha256) throw new Error(`Invalid resource: ${item.path}`)
}
const data = JSON.parse(await fs.readFile(path.join(root, manifest.data.path.slice(1)), 'utf8'))
if (manifest.files.length !== 43 || manifest.files.slice().sort().join() !== Object.keys(data).sort().join()) throw new Error('Incomplete data bundle')
validateActivityResource(data)
console.log(`Verified ${manifest.version}: data and all ${Object.keys(manifest.assets).length} images`)
