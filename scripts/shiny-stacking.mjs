const object = value => !!value && typeof value === 'object' && !Array.isArray(value)
const date = value =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value

export function validateShinyStacking(catalog, data) {
  if (!object(catalog) || catalog.schemaVersion !== 1 || !Array.isArray(catalog.officialRules) || !Array.isArray(catalog.events)) {
    throw Error('异色叠加规则资料无效')
  }
  const pokeIds = new Set((data?.['pokedex.json'] ?? []).map(row => row.id))
  const activityIds = new Set((data?.['activities.json']?.activities ?? []).map(row => row.id))
  for (const rule of catalog.officialRules) {
    if (!object(rule) || typeof rule.id !== 'string' || typeof rule.conclusion !== 'string' || !rule.conclusion.trim()) {
      throw Error('异色叠加官方规则无效')
    }
  }
  const seen = new Set()
  for (const event of catalog.events) {
    if (!object(event) || typeof event.eventId !== 'string' || !/^[a-z0-9-]+$/.test(event.eventId) || seen.has(event.eventId)) {
      throw Error('异色叠加活动条目无效')
    }
    seen.add(event.eventId)
    if (!date(event.startsOn) || !date(event.endsOn) || event.startsOn >= event.endsOn) throw Error('异色叠加活动日期无效')
    if (data && !activityIds.has(event.eventId)) throw Error('异色叠加引用了未知活动: ' + event.eventId)
    if (event.pokemonIds != null) {
      if (!Array.isArray(event.pokemonIds) || event.pokemonIds.length === 0 || new Set(event.pokemonIds).size !== event.pokemonIds.length
        || !event.pokemonIds.every(id => Number.isSafeInteger(id) && id > 0 && pokeIds.has(id))) {
        throw Error('异色叠加物种范围无效')
      }
    }
    if (event.publishedRate != null && (typeof event.publishedRate !== 'number' || !Number.isFinite(event.publishedRate))) {
      throw Error('异色叠加公开概率无效')
    }
  }
  return catalog
}
