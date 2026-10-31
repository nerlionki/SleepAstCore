export function validateEventBundles(value) {
  const valid = condition => { if (!condition) throw Error('Invalid event bundle catalog') }
  const object = value => value && typeof value === 'object' && !Array.isArray(value)
  const text = value => typeof value === 'string' && value.trim().length > 0
  const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value).toISOString().slice(0, 10) === value
  valid(object(value) && value.schemaVersion === 1 && Array.isArray(value.bundles))
  const ids = new Set()
  for (const row of value.bundles) {
    valid(object(row) && text(row.id) && !ids.has(row.id) && text(row.name) && text(row.eventName))
    ids.add(row.id)
    valid(date(row.announcedOn) && date(row.eventEndsOn) && row.announcedOn <= row.eventEndsOn)
    valid(typeof row.saleStartsAt === 'string' && typeof row.saleEndsAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(row.saleStartsAt) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(row.saleEndsAt) && Number.isFinite(Date.parse(row.saleStartsAt)) && Date.parse(row.saleStartsAt) < Date.parse(row.saleEndsAt))
    valid(object(row.price) && text(row.price.unit) && Number.isSafeInteger(row.price.amount) && row.price.amount >= 0 && Number.isSafeInteger(row.purchaseLimit) && row.purchaseLimit > 0)
    valid(Array.isArray(row.items) && row.items.length > 0 && row.items.every(item => object(item) && text(item.name) && Number.isSafeInteger(item.quantity) && item.quantity > 0))
    valid(Array.isArray(row.sources) && row.sources.length > 0 && row.sources.every(source => object(source) && ['official', 'rae'].includes(source.kind) && typeof source.url === 'string' && (source.kind === 'official' ? /^https:\/\/www\.pokemonsleep\.net\// : /^https:\/\/pks\.raenonx\.cc\//).test(source.url)))
  }
  return value
}
