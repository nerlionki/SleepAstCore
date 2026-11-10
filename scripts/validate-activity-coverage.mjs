import fs from 'node:fs/promises'
import path from 'node:path'
import { validateActivityCatalog } from './activity-model.mjs'
import { validateActivityArchive } from './activity-archive.mjs'

const root = path.resolve(import.meta.dirname, '..')
const data = {}
for (const file of await fs.readdir(path.join(root, 'src/data'))) {
  if (file.endsWith('.json') && !file.includes('merged') && !file.includes('backfill') && !file.includes('harvest')) {
    data[file] = JSON.parse(await fs.readFile(path.join(root, 'src/data', file), 'utf8'))
  }
}
const archive = JSON.parse(await fs.readFile(path.join(root, 'src/catalogs/activity-archive.json'), 'utf8'))
const activitiesPath = process.argv[2] || path.join(root, 'src/data/activities.json')
const activities = JSON.parse(await fs.readFile(activitiesPath, 'utf8'))

validateActivityArchive(archive)
validateActivityCatalog(activities, data)

const archiveIds = new Set(archive.events.map(e => e.id))
const activityIds = new Set(activities.activities.map(a => a.id))
const missing = archive.events.filter(e => !activityIds.has(e.id))
const extra = activities.activities.filter(a => !archiveIds.has(a.id))

const byYear = {}
for (const e of activities.activities) {
  const y = e.startsOn.slice(0, 4)
  byYear[y] = (byYear[y] || 0) + 1
}

function hasNumericRules(a) {
  const walk = (rules) => rules?.some(r => r.effects && Object.keys(r.effects).some(k => k !== 'eventMix' || r.effects[k] !== 'off'))
  return walk(a.rules) || a.phases?.some(p => walk(p.rules))
}

const emptyNumeric = activities.activities.filter(a => !hasNumericRules(a) && !(a.features?.length))

const errors = []
for (const a of activities.activities) {
  if (a.startsOn >= a.endsOn) errors.push(`${a.id}: invalid dates`)
  if (a.source && !a.source.includes('pokemonsleep.net') && !a.source.includes('serebii.net')) errors.push(`${a.id}: non-official source`)
  for (const p of a.phases ?? []) {
    if (p.startsOn < a.startsOn || p.endsOn > a.endsOn) errors.push(`${a.id}: phase out of bounds`)
  }
}

let gapsJson = []
try {
  gapsJson = JSON.parse(await fs.readFile(path.join(root, 'src/data/activity-backfill-gaps.json'), 'utf8')).gaps ?? []
} catch { /* optional */ }

const report = {
  archiveEvents: archive.events.length,
  activityEntries: activities.activities.length,
  missingFromActivities: missing.length,
  notInArchive: extra.map(a => a.id),
  onlyQualitative: emptyNumeric.length,
  byYear,
  gaps: gapsJson.length,
  validationErrors: errors,
}
console.log(JSON.stringify(report, null, 2))
if (errors.length) process.exit(1)
