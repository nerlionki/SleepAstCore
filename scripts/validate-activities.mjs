// Shared contract validator, mirrored from the client resource boundary.
// Kept independent of data wrappers so cold-start validation cannot initialize
// calculation modules against the bundled snapshot before remote activation.
const effectKeys = new Set(['helpIntervalMultiplier', 'berryCountBonus', 'berryEnergyMultiplier', 'ingredientCountBonus', 'skillRateMultiplier', 'skillLevelBonus', 'skillStrengthMultiplier', 'potSizeMultiplier', 'cookingEnergyMultiplier', 'cookingCritBonus', 'cookingCritMultiplier', 'drowsyPowerMultiplier', 'researchExpMultiplier', 'dreamShardsMultiplier', 'researchCandyMultiplier', 'sleepExpMultiplier', 'candyExpMultiplier', 'candyShardMultiplier', 'encounterWeightMultiplier', 'eventMix', 'shinyUp'])
const object = (value         )                                   => !!value && typeof value === 'object' && !Array.isArray(value)
function requireValid(condition         )                    { if (!condition) throw new Error('活动资料结构或功能不兼容') }
const finite = (value         ) => typeof value === 'number' && Number.isFinite(value)
const date = (value         )                  => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
export function validateActivityResource(data                         ) {
  const catalog = data['activities.json']
  requireValid(object(catalog) && Object.keys(catalog).every(key => ['schemaVersion','version','activities'].includes(key)) && catalog.schemaVersion === 1 && typeof catalog.version === 'string' && catalog.version.length > 0 && Array.isArray(catalog.activities))
  const pokes = data['pokedex.json'], islands = data['islands.json']
  requireValid(Array.isArray(pokes) && Array.isArray(islands))
  const pokeIds = new Set(pokes.map(poke => poke.id)), islandIds = new Set(islands.map(island => island.id))
  const ids = new Set        ()
  function phase(value         , parent                          ) {
    requireValid(object(value) && date(value.startsOn) && date(value.endsOn) && value.startsOn < value.endsOn && Array.isArray(value.rules))
    if (parent) requireValid(value.startsOn >= String(parent.startsOn) && value.endsOn <= String(parent.endsOn))
    if (value.weekdays != null) requireValid(Array.isArray(value.weekdays) && value.weekdays.every(day => Number.isInteger(day) && day >= 0 && day <= 6))
    for (const rule of value.rules) {
      requireValid(object(rule) && Object.keys(rule).every(key => ['target', 'effects', 'firstResearchOnly'].includes(key)) && object(rule.effects))
      if (rule.firstResearchOnly != null) requireValid(typeof rule.firstResearchOnly === 'boolean')
      for (const [key, number] of Object.entries(rule.effects)) {
        requireValid(effectKeys.has(key))
        if (key === 'eventMix') requireValid(['off', 'some', 'all'].includes(String(number)))
        else if (key === 'shinyUp') requireValid(typeof number === 'boolean')
        else requireValid(finite(number) && Number(number) >= (['helpIntervalMultiplier','potSizeMultiplier','cookingCritMultiplier'].includes(key) ? 0.01 : 0) && Number(number) <= 10000 && (key !== 'skillLevelBonus' || Number.isInteger(number)) && (key !== 'cookingCritBonus' || Number(number) <= 1))
      }
      if (rule.target != null) {
        requireValid(object(rule.target) && Object.keys(rule.target).every(key => ['islands', 'pokemonIds', 'types', 'specialties'].includes(key)))
        for (const [key, values] of Object.entries(rule.target)) {
          requireValid(Array.isArray(values) && values.length > 0)
          requireValid(values.every(value => key === 'pokemonIds' ? pokeIds.has(value) : key === 'islands' ? islandIds.has(value) : typeof value === 'string' && value.length > 0))
        }
        const target = rule.target, effects = rule.effects
        if (['pokemonIds', 'types', 'specialties'].some(key => key in target)) requireValid(!['potSizeMultiplier','cookingEnergyMultiplier','cookingCritBonus','cookingCritMultiplier','drowsyPowerMultiplier','eventMix','shinyUp'].some(key => key in effects))
      }
    }
    if (value.spawns != null) {
      requireValid(Array.isArray(value.spawns))
      const seen = new Set        ()
      for (const row of value.spawns) {
        requireValid(object(row) && pokeIds.has(row.pokeId) && islandIds.has(row.island) && Number.isSafeInteger(row.id) && Number.isInteger(row.stars) && Number(row.stars) >= 1 && Number(row.stars) <= 5 && finite(row.dpr) && Number(row.dpr) >= 0 && typeof row.dprSource === 'string' && typeof row.sleepType === 'string' && typeof row.styleName === 'string' && typeof row.name === 'string' && Number.isInteger(row.unlockRank) && Number(row.unlockRank) >= 0 && Number(row.unlockRank) <= 34 && row.limited !== true && (row.styleId == null || Number.isSafeInteger(row.styleId)))
        const key = `${row.island}:${row.pokeId}:${row.stars}:${row.styleId ?? ''}`
        requireValid(!seen.has(key)); seen.add(key)
      }
    }
  }
  for (const event of catalog.activities) {
    requireValid(object(event) && Object.keys(event).every(key => ['id','name','source','priority','startsOn','endsOn','weekdays','rules','phases','stacking','spawns','miniCandyBoost','favoriteBerries'].includes(key)) && typeof event.id === 'string' && !ids.has(event.id) && typeof event.name === 'string' && typeof event.source === 'string' && Number.isSafeInteger(event.priority) && (event.stacking == null || event.stacking === 'max'))
    ids.add(event.id); phase(event)
    if (event.favoriteBerries != null) {
      requireValid(object(event.favoriteBerries) && Array.isArray(data['berries.json']))
      const berries = new Set(data['berries.json'].map(berry => berry.name))
      requireValid(Object.entries(event.favoriteBerries).every(([island, berry]) => islandIds.has(island) && berries.has(berry)))
    }
    if (event.phases != null) {
      requireValid(Array.isArray(event.phases))
      for (const row of event.phases) { requireValid(object(row) && Object.keys(row).every(key => ['startsOn','endsOn','weekdays','rules','spawns'].includes(key))); phase(row, event) }
    }
    if (event.miniCandyBoost != null) {
      const boost = event.miniCandyBoost
      requireValid(object(boost) && Object.keys(boost).length === 3 && ['exp','shards','dailyLimit'].every(key => finite(boost[key]) && Number(boost[key]) > 0) && Number.isInteger(boost.dailyLimit))
    }
  }
}
