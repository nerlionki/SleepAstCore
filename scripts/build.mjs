import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { validateActivityResource } from './validate-activities.mjs'
const root = path.resolve(import.meta.dirname, '..')
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
const version = (process.env.RESOURCE_VERSION || pkg.version).replace(/^v/, '')
if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version)) throw new Error('Resource version must be a numeric release version')
const directory = `resources/v1/releases/${version}`
const dist = path.join(root, 'dist')
await fs.rm(dist, { recursive: true, force: true })
await fs.mkdir(path.join(dist, directory), { recursive: true })
const sha256 = value => createHash('sha256').update(value).digest('hex')
const data = {}
for (const file of (await fs.readdir(path.join(root, 'src/data'))).filter(file => file.endsWith('.json')).sort()) {
  data[file] = JSON.parse(await fs.readFile(path.join(root, 'src/data', file), 'utf8'))
}
if (Object.keys(data).length !== 43) throw new Error('Changing the data file set requires updating the client contract')
validateActivityResource(data)
const payload = JSON.stringify(data)
await fs.writeFile(path.join(dist, directory, 'data.json'), payload)
const assets = {}
async function copyImages(source, prefix) {
  for (const item of await fs.readdir(source, { withFileTypes: true })) {
    const file = path.join(source, item.name)
    const relative = `${prefix}${item.name}`
    if (item.isDirectory()) await copyImages(file, `${relative}/`)
    else if (/\.(webp|png|jpe?g|svg)$/i.test(item.name)) {
      const bytes = await fs.readFile(file)
      const target = `${directory}/${relative}`
      await fs.mkdir(path.dirname(path.join(dist, target)), { recursive: true })
      await fs.writeFile(path.join(dist, target), bytes)
      if (assets[relative]) throw new Error(`Duplicate asset: ${relative}`)
      assets[relative] = { path: `/${target}`, bytes: bytes.length, sha256: sha256(bytes) }
    }
  }
}
await copyImages(path.join(root, 'src/assets/imgs'), 'images/')
await copyImages(path.join(root, 'public/items'), 'items/')
await copyImages(path.join(root, 'public/sprites'), 'sprites/')
const manifest = {
  schemaVersion: 1, contract: 'sleepast-data-v1', clientMajor: 2, version,
  data: { path: `/${directory}/data.json`, bytes: Buffer.byteLength(payload), sha256: sha256(payload) },
  files: Object.keys(data), assets,
}
await fs.writeFile(path.join(dist, 'resources/v1/manifest.json'), JSON.stringify(manifest))
console.log(`Built ${version}: ${Object.keys(data).length} JSON files, ${Object.keys(assets).length} images`)
