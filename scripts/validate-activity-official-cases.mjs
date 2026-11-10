import fs from 'node:fs/promises'
import path from 'node:path'
import { validateActivityCatalog } from './activity-model.mjs'

const root = path.resolve(import.meta.dirname, '..')
const data = {}
for (const file of await fs.readdir(path.join(root, 'src/data'))) {
  if (file.endsWith('.json') && !file.includes('harvest')) {
    data[file] = JSON.parse(await fs.readFile(path.join(root, 'src/data', file), 'utf8'))
  }
}
const cases = JSON.parse(await fs.readFile(path.join(root, 'test-data/activity-model-official-cases.json'), 'utf8'))
validateActivityCatalog(cases, data)
console.log(`Official mechanic examples: ${cases.activities.length} activities validated`)
