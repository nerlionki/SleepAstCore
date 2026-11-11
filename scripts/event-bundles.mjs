export function bundleItemCatalog(data) {
  const { catalog, pokemonCatalog = [] } = data['calc-tables.json'].modules.items
  return [...catalog, ...pokemonCatalog]
}

export function validateEventBundles(value, archive = false) {
  const valid = condition => { if (!condition) throw Error('Invalid event bundle catalog') }
  const object = value => value && typeof value === 'object' && !Array.isArray(value)
  const text = value => typeof value === 'string' && value.trim().length > 0
  const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value).toISOString().slice(0, 10) === value
  valid(object(value) && value.schemaVersion === 1 && Array.isArray(value.bundles))
  const ids = new Set()
  for (const row of value.bundles) {
    valid(object(row) && text(row.id) && !ids.has(row.id) && text(row.name) && text(row.eventName))
    ids.add(row.id)
    valid(date(row.eventEndsOn) && (archive && row.announcedOn === null || date(row.announcedOn) && row.announcedOn <= row.eventEndsOn))
    if (archive) valid(text(row.eventId))
    const dateTime = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
    const unknownArchiveSale = archive && row.saleStartsAt === null && row.saleEndsAt === null
    valid(unknownArchiveSale
      || archive && date(row.saleStartsAt) && date(row.saleEndsAt) && row.saleStartsAt <= row.saleEndsAt
      || dateTime(row.saleStartsAt) && dateTime(row.saleEndsAt) && row.saleStartsAt < row.saleEndsAt)
    valid(object(row.price) && text(row.price.unit) && Number.isSafeInteger(row.price.amount) && row.price.amount >= 0 && Number.isSafeInteger(row.purchaseLimit) && row.purchaseLimit > 0)
    valid(Array.isArray(row.items) && row.items.length > 0 && row.items.every(item => object(item) && text(item.name) && Number.isSafeInteger(item.quantity) && item.quantity > 0
      && (item.itemId === undefined || Number.isSafeInteger(item.itemId) && item.itemId > 0)
      && (item.pokemonItemId === undefined || item.itemId === undefined && typeof item.pokemonItemId === 'string'
        && /^(?:Candy|Incense)-[1-9]\d*$/.test(item.pokemonItemId))
      && (item.unmapped === undefined || item.unmapped === true && item.itemId === undefined && item.pokemonItemId === undefined)
      && (item.pokemonSeedId === undefined || Number.isSafeInteger(item.pokemonSeedId) && item.pokemonSeedId > 0
        && item.itemId === undefined && item.pokemonItemId === undefined && item.pokemonIncense === undefined)
      && (item.pokemonIncense === undefined || object(item.pokemonIncense) && item.itemId === undefined
        && Number.isSafeInteger(item.pokemonIncense.pokemonId) && item.pokemonIncense.pokemonId > 0
        && Number.isSafeInteger(item.pokemonIncense.typeId) && item.pokemonIncense.typeId >= 1 && item.pokemonIncense.typeId <= 18)))
    if (row.valuation !== undefined) valid(validateBundleValuation(row.valuation, row.items.map(item => item.name)))
    const officialSourceUrl = url => {
      if (/^https:\/\/www\.pokemonsleep\.net\//.test(url)) return true
      const wrapped = url.match(/^https:\/\/web\.archive\.org\/web\/\d+(?:id_)?\/(https:\/\/www\.pokemonsleep\.net\/.*)$/)
      return wrapped != null && /^https:\/\/www\.pokemonsleep\.net\//.test(wrapped[1])
    }
    valid(Array.isArray(row.sources) && row.sources.length > 0 && row.sources.every(source => object(source) && typeof source.url === 'string'
      && (source.kind === 'official' && officialSourceUrl(source.url)
        || source.kind === 'rae' && /^https:\/\/pks\.raenonx\.cc\//.test(source.url)
        || archive && source.kind === 'wiki' && /^https:\/\/bulbapedia\.bulbagarden\.net\/wiki\//.test(source.url))))
  }
  return value
}

function indexBundleItems(items, pairs) {
  const fold = name => {
    let result = name.normalize('NFKC').toLowerCase()
    for (const [a, b] of pairs) result = result.replaceAll(a, b)
    return result.replace(/[\s_\-']/g, '')
  }
  const byName = new Map()
  const byId = new Map()
  for (const item of items) {
    byId.set(item.id, item)
    for (const name of new Set([item.name, ...(item.aliases ?? [])].map(fold))) {
      const matches = byName.get(name) ?? []
      matches.push(item)
      byName.set(name, matches)
    }
  }
  return content => {
    const matches = byName.get(fold(content.name)) ?? []
    const id = content.pokemonItemId ?? content.itemId
    if (id === undefined) {
      const legacyMatches = matches.filter(row => typeof row.id === 'number')
      return legacyMatches.length === 1 ? legacyMatches[0] : undefined
    }
    const item = byId.get(id)
    if (!item || matches.length && !matches.some(row => row.id === item.id)) throw Error(`Invalid bundle item reference: ${content.name} #${id}`)
    return item
  }
}

/** Calculated only by the resource publisher; clients receive ready-to-display ratios. */
export function calculateEventBundleValue(bundle, items, pairs = []) {
  return bundleValue(bundle, indexBundleItems(items, pairs))
}

function bundleValue(bundle, resolve) {
  let biscuitDiamonds = 0, totalDiamonds = 0
  const excluded = []
  for (const content of bundle.items) {
    const item = content.unmapped || content.pokemonSeedId !== undefined ? undefined : resolve(content)
    if (item?.diamondPrice === undefined) { excluded.push(content.name); continue }
    if (!Number.isFinite(item.diamondPrice) || item.diamondPrice <= 0) throw Error('Invalid diamond unit price')
    const diamonds = item.diamondPrice * content.quantity
    totalDiamonds += diamonds
    if (item.category === '沙布蕾') biscuitDiamonds += diamonds
  }
  const comparable = bundle.price.unit === '钻石' && bundle.price.amount > 0
  const ratio = diamonds => comparable ? (Math.round(diamonds * 100 / bundle.price.amount) / 100).toFixed(2) : null
  return { schemaVersion: 1, biscuitDiamonds, totalDiamonds, biscuits: ratio(biscuitDiamonds), total: ratio(totalDiamonds), excluded }
}
export function buildEventBundles(value, items, pairs = [], archive = false) {
  const catalog = structuredClone(validateEventBundles(value, archive))
  if (!items.some(item => item.diamondPrice !== undefined)) throw Error('Missing bundle diamond price catalog')
  const resolve = indexBundleItems(items, pairs)
  for (const bundle of catalog.bundles) {
    bundle.items = bundle.items.map(({ unmapped: _, ...content }) => {
      if (content.pokemonSeedId !== undefined) return content
      const item = resolve(content)
      if (!item) return { ...content, unmapped: true }
      if (typeof item.id === 'number') return { ...content, itemId: item.id }
      // Older clients use the published incense metadata to render the bottle and portrait.
      const linked = item.pokemonItem
      return {
        ...content,
        pokemonItemId: item.id,
        ...(linked.kind === 'incense' ? { pokemonIncense: { pokemonId: linked.pokemonId, typeId: linked.typeId } } : {}),
      }
    })
    bundle.valuation = bundleValue(bundle, resolve)
  }
  return validateEventBundles(catalog, archive)
}
// RAE PokemonType order from the attached incense manifest. These are image IDs, not item IDs.
const incenseTypes = ['一般', '火', '水', '电', '草', '冰', '格斗', '毒', '地面', '飞行', '超能', '虫', '岩石', '幽灵', '龙', '恶', '钢', '妖精']
export function resolveBundlePokemon(pokedex, announcedPokemon, id) {
  const fromPokedex = pokedex.find(poke => poke.id === id)
  if (fromPokedex) return fromPokedex
  const announced = announcedPokemon.find(row => row.imageId === id || row.nationalDex === id)
  if (!announced || typeof announced.type !== 'string') return undefined
  return { id, name: announced.name, berryType: announced.type }
}
export function validateBundleArtwork(catalog, pokedex, assets, items, announcedPokemon = []) {
  const pokemonFor = id => resolveBundlePokemon(pokedex, announcedPokemon, id)
  for (const item of items) {
    const linked = item.pokemonItem
    if (!linked) continue
    if (!assets[item.imageFile]) throw Error(`Missing Pokémon item artwork: ${item.id}`)
    if (linked.kind !== 'incense') continue
    const pokemon = pokemonFor(linked.pokemonId)
    if (!pokemon || pokemon.berryType !== incenseTypes[linked.typeId - 1]
      || !assets[`images/incense/pokemon/${linked.typeId}.webp`] || !assets[`images/pokemon/icons/${linked.pokemonId}.webp`]) {
      throw Error(`Invalid Pokémon incense artwork: ${item.id}`)
    }
  }
  for (const bundle of catalog.bundles) for (const row of bundle.items) {
    if (row.pokemonSeedId !== undefined && (!pokemonFor(row.pokemonSeedId)
      || !assets['items/32.webp'] || !assets[`images/pokemon/icons/${row.pokemonSeedId}.webp`])) {
      throw Error(`Invalid Pokémon main skill seed artwork: ${bundle.id} / ${row.name}`)
    }
    if (!row.pokemonIncense) continue
    const { pokemonId, typeId } = row.pokemonIncense
    const pokemon = pokemonFor(pokemonId)
    if (!pokemon || pokemon.berryType !== incenseTypes[typeId - 1] || !assets[`images/incense/pokemon/${typeId}.webp`] || !assets[`images/pokemon/icons/${pokemonId}.webp`]) {
      throw Error(`Invalid Pokémon incense artwork: ${bundle.id} / ${row.name}`)
    }
  }
}

export function validateBundleValuation(value, names) {
  const ratio = x => x === null || typeof x === 'string' && /^\d+\.\d{2}$/.test(x)
  return value && value.schemaVersion === 1 && Number.isFinite(value.biscuitDiamonds) && value.biscuitDiamonds >= 0
    && Number.isFinite(value.totalDiamonds) && value.totalDiamonds >= value.biscuitDiamonds
    && ratio(value.biscuits) && ratio(value.total) && Array.isArray(value.excluded)
    && value.excluded.every(name => typeof name === 'string' && names.includes(name))
}
