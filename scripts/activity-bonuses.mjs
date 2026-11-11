// Builds activity-archive bonusGroups from announcement lines and activity rules.
// Entity references store catalog ids. Copy is kept only when no id exists.
import { readFileSync, writeFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const read = file => JSON.parse(readFileSync(new URL(file, root), 'utf8'))
const archive = read('src/catalogs/activity-archive.json')
const activities = read('src/data/activities.json')
const islands = read('src/data/islands.json')
const berries = read('src/data/berries.json')
const ingredients = read('src/data/ingredients.json')
const pokedex = read('src/data/pokedex.json')
const skills = read('src/data/skill-tables.json').modules.mainSkills.MAIN_SKILLS
const i18n = read('src/catalogs/i18n.json')
const announced = read('src/data/meta.json').announcedContent?.ingredients ?? []
function activityFor(event) {
  const linked = activities.activities.filter(row => row.id === event.id || row.source === event.source)
  return linked.sort((a, b) => (b.rules?.length ?? 0) - (a.rules?.length ?? 0))[0]
}
const islandOrder = new Map(islands.map((island, index) => [island.id, index]))
const exIslands = new Set(islands.filter(island => island.ex).map(island => island.id))
const GROUP_ORDER = ['energy', 'candy', 'research', 'sleep', 'ingredient', 'helper']
const TYPES = ['一般', '火', '水', '电', '草', '冰', '格斗', '毒', '地面', '飞行', '超能力', '虫', '岩石', '幽灵', '龙', '恶', '钢', '妖精']
const SPECIALTY = { 技能: '技能型', 食材: '食材型', 树果: '树果型' }
const FIELD_GROUP = {
  drowsyPowerMultiplier: 'energy',
  cookingEnergyMultiplier: 'energy',
  berryEnergyMultiplier: 'energy',
  potSizeMultiplier: 'helper',
  potCapacityBonus: 'helper',
  researchExpMultiplier: 'research',
  dreamShardsMultiplier: 'research',
  researchCandyMultiplier: 'research',
  sleepExpMultiplier: 'research',
  ingredientCountBonus: 'ingredient',
  berryCountBonus: 'helper',
  skillRateMultiplier: 'helper',
  skillLevelBonus: 'helper',
  carryCapacityBonus: 'helper',
  carryCapacityMultiplier: 'helper',
  mealRecoveryBonus: 'helper',
  mealRecoveryMultiplier: 'helper',
  helpIntervalMultiplier: 'helper',
  skillIngredientMultiplier: 'helper',
  skillBerryMultiplier: 'helper',
  skillDreamShardsMultiplier: 'helper',
  skillHealingMultiplier: 'helper',
  skillStrengthMultiplier: 'helper'
}

const fold = value => value.normalize('NFKC').replace(/\s+/g, '').replace(/[（(].*?[）)]/g, '')
const aliasToId = new Map()
for (const [traditional, simplified] of Object.entries(i18n.aliases ?? {})) aliasToId.set(fold(simplified), traditional)
const pokemonByName = new Map()
for (const pokemon of pokedex) {
  pokemonByName.set(fold(pokemon.name), pokemon.id)
  const simplified = i18n.aliases?.[pokemon.name]
  if (simplified) pokemonByName.set(fold(simplified), pokemon.id)
}
const skillIdsByName = new Map()
for (const skill of skills) {
  for (const name of [skill.name, ...(skill.aliases ?? [])]) {
    const key = fold(name)
    const ids = skillIdsByName.get(key) ?? []
    if (!ids.includes(skill.id)) ids.push(skill.id)
    skillIdsByName.set(key, ids)
  }
}
const ingredientByName = new Map()
for (const row of ingredients) ingredientByName.set(fold(row.name), row.id)
for (const row of announced) if (row.key && row.name) ingredientByName.set(fold(row.name), row.key)
const berryByName = new Map()
for (const berry of berries) {
  berryByName.set(fold(berry.name), berry.id)
  const simplified = i18n.aliases?.[berry.name]
  if (simplified) berryByName.set(fold(simplified), berry.id)
}
berryByName.set(fold('苹野果'), berryByName.get(fold('蘋野果')) ?? berryByName.get(fold('苹野果')))
berryByName.set(fold('野苹果'), berryByName.get(fold('蘋野果')))

const num = text => Number(String(text).replace(/,/g, ''))
const scale = (value, factor) => Math.round(value * factor * 1000) / 1000
const addDays = (iso, days) => new Date(Date.parse(iso + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10)
const eventDays = event => {
  const days = []
  for (let day = event.startsOn; day < event.endsOn; day = addDays(day, 1)) days.push(day)
  return days
}
const findDay = (event, month, date) => eventDays(event).find(day => Number(day.slice(5, 7)) === month && Number(day.slice(8)) === date)
const oneDay = iso => ({ startsOn: iso, endsOn: addDays(iso, 1) })
const sortIslands = ids => [...ids].sort((a, b) => (islandOrder.get(a) ?? 99) - (islandOrder.get(b) ?? 99))
const clean = line => line.replace(/\s*※[\s\S]*$/, '').replace(/\s*→[\s\S]*$/, '').trim()
const field = (id, value, kind, scope = [], filters = {}) => ({
  group: FIELD_GROUP[id],
  effect: id,
  ref: { kind: 'field', id },
  parts: [{ kind, value }],
  scope,
  filters
})
const textRow = (group, label, value, scope = []) => ({
  group,
  ref: { kind: 'text', value: label },
  parts: [{ kind: 'text', value }],
  scope,
  filters: {}
})

function pokemonId(name) {
  const id = pokemonByName.get(fold(name))
  return id
}
function namesIn(text) {
  return [...text.matchAll(/「([^」]+)」/g)].map(match => match[1])
}
function typesIn(text) {
  const found = []
  for (const type of [...TYPES].sort((a, b) => b.length - a.length)) {
    if (text.includes(type + '属性')) found.push(type)
  }
  return found
}
function specialtyIn(text) {
  const match = /专长为「(技能|食材|树果)」/.exec(text)
  return match ? SPECIALTY[match[1]] : undefined
}
function teamIds(text) {
  const match = /若将(.+?)编组/.exec(text)
  if (!match) return []
  return match[1].split(/或|和|、/).map(name => pokemonId(name.trim())).filter(id => id)
}
function skillRef(name) {
  const ids = skillIdsByName.get(fold(name)) ?? []
  if (ids.length === 1) return { kind: 'skill', id: ids[0] }
  if (ids.length > 1) return { kind: 'skillFamily', id: name }
  return { kind: 'text', value: name }
}
function ingredientRef(name) {
  const id = ingredientByName.get(fold(name))
  if (id === undefined) return { kind: 'text', value: name }
  return { kind: 'ingredient', id }
}

function conditions(text, extra = []) {
  const scope = []
  const filters = { types: typesIn(text), specialties: [], skillFamilies: [] }
  const specialty = specialtyIn(text)
  if (specialty) {
    filters.specialties.push(specialty)
    scope.push({ kind: 'specialty', id: specialty })
  }
  for (const type of filters.types) scope.push({ kind: 'type', id: type })
  const family = /「(食材精选S)」/.exec(text)
  if (family && !text.includes('效果')) {
    filters.skillFamilies.push(family[1])
    scope.push({ kind: 'skillFamily', id: family[1] })
  }
  if (/第1次|当天第1次/.test(text) && !/点心时间/.test(text)) scope.push({ kind: 'text', value: '第1次' })
  if (/1天仅限1次|一天仅限1次/.test(text)) scope.push({ kind: 'text', value: '每日1次' })
  const team = teamIds(text)
  if (team.length) scope.push({ kind: 'team', ids: team })
  return { scope: [...scope, ...extra], filters }
}

function parseLine(raw) {
  const note = raw.match(/※([\s\S]*)$/)?.[1] ?? ''
  const line = clean(raw)
  if (!line) return { skip: true }
  if (/尚未发现的宝可梦睡姿/.test(line)) return { rows: [textRow('sleep', '未发现睡姿', '出现提升')] }
  if (/友情点数皆会提升\s*([0-9]+)/.test(line)) {
    const amount = num(/友情点数皆会提升\s*([0-9]+)/.exec(line)[1])
    return { rows: [{ group: 'research', ref: { kind: 'text', value: '友情点数' }, parts: [{ kind: 'add', value: amount }], scope: [{ kind: 'text', value: '特别出没' }], filters: {} }] }
  }
  if (/出现概率|特别概率|出没|活动兑换|美梦好礼|活动道具|活动睡意之力|彩庆花|扭糖机|可让许多帮手|可以多多培育|可以获得各种研究奖励|日后发表/.test(line)) return { skip: true }
  if (/喜欢的树果|树果：主树果|树果」中/.test(line)) return { berry: true, line }
  if (/不容易吃饱|大只的卡比兽/.test(line)) return { note: line }
  if (/迷你糖果增强/.test(line)) return { mini: true }
  if (/可以使用期间限定的「糖果增强」/.test(line)) return { rows: [textRow('candy', '糖果增强', '开启')] }
  if (/可以拍摄奇迹快照/.test(line)) return { rows: [textRow('research', '奇迹快照', '开启')] }

  const cooking = /料理的最终能量为\s*([0-9.]+)\s*倍/.exec(line)
  if (cooking) {
    const base = num(cooking[1])
    const crit = num(/漂亮成功时为\s*([0-9.]+)/.exec(line)?.[1] ?? scale(base, 2))
    const sunday = num(/周日漂亮成功时为\s*([0-9.]+)/.exec(line)?.[1] ?? scale(base, 3))
    return { rows: [
      field('cookingEnergyMultiplier', base, 'multiply'),
      field('cookingEnergyMultiplier', crit, 'multiply', [{ kind: 'text', value: '漂亮成功' }]),
      field('cookingEnergyMultiplier', sunday, 'multiply', [{ kind: 'text', value: '周日漂亮成功' }])
    ] }
  }
  const pot = /锅子容量.*?([0-9.]+)\s*倍/.exec(line)
  if (pot) {
    const sunday = /周日为\s*([0-9.]+)/.exec(line)
    const rows = [field('potSizeMultiplier', num(pot[1]), 'multiply')]
    if (sunday) rows.push(field('potSizeMultiplier', num(sunday[1]), 'multiply', [{ kind: 'text', value: '周日' }]))
    return { rows }
  }
  const drowsy = /睡意之力.*?([0-9.]+)\s*倍/.exec(line)
  if (drowsy) {
    const { scope, filters } = conditions(line)
    const row = field('drowsyPowerMultiplier', num(drowsy[1]), 'multiply', scope, filters)
    return { rows: [row] }
  }
  const sleepExp = /睡眠\s*EXP[：:]?(?:变成)?\s*([0-9.]+)\s*倍/.exec(line)
  if (sleepExp) return { rows: [field('sleepExpMultiplier', num(sleepExp[1]), 'multiply')] }
  const points = /红利睡眠点数[：:]?\s*\+?\s*([0-9,]+)/.exec(line)
  if (points) return { rows: [textRow('research', '红利睡眠点数', '')].map(row => ({ ...row, parts: [{ kind: 'add', value: num(points[1]) }] })) }
  const dish = /料理必定会是「([^」]+)」/.exec(line)
  if (dish) {
    const category = /沙拉/.test(dish[1]) ? 'salad' : /咖/.test(dish[1]) ? 'curry' : 'dessert'
    return { rows: [{ group: 'energy', ref: { kind: 'text', value: '料理类型' }, parts: [{ kind: 'category', value: category }], scope: [], filters: {} }] }
  }
  const vitality = /活力(?:回复量)?\+?\s*([0-9]+)/.exec(line)
  if (vitality && /活力/.test(line)) return { rows: [field('mealRecoveryBonus', num(vitality[1]), 'add')] }
  const carryTimes = /持有上限变成\s*([0-9.]+)\s*倍/.exec(line)
  if (carryTimes) {
    const { scope, filters } = conditions(line)
    return { rows: [field('carryCapacityMultiplier', num(carryTimes[1]), 'multiply', scope, filters)] }
  }
  const carryAdd = /持有上限(?:会增加|\+)\s*([0-9]+)/.exec(line)
  if (carryAdd) {
    const { scope, filters } = conditions(line)
    return { rows: [field('carryCapacityBonus', num(carryAdd[1]), 'add', scope, filters)] }
  }
  const skillRate = /主技能发动概率(?:会是|变成)\s*([0-9.]+)\s*倍/.exec(line)
  if (skillRate) {
    const { scope, filters } = conditions(line)
    return { rows: [field('skillRateMultiplier', num(skillRate[1]), 'multiply', scope, filters)] }
  }
  const skillLevel = /主技能等级\+(\d+)/.exec(line)
  if (skillLevel) {
    const { scope, filters } = conditions(line)
    return { rows: [field('skillLevelBonus', num(skillLevel[1]), 'add', scope, filters)] }
  }
  const ingredientAdd = /食材数量会增加\s*([0-9]+)\s*个/.exec(line)
  if (ingredientAdd) {
    const { scope, filters } = conditions(line)
    return { rows: [field('ingredientCountBonus', num(ingredientAdd[1]), 'add', scope, filters)] }
  }
  const berryAdd = /树果数量会增加\s*([0-9]+)\s*个/.exec(line)
  if (berryAdd) {
    const { scope, filters } = conditions(line)
    return { rows: [field('berryCountBonus', num(berryAdd[1]), 'add', scope, filters)] }
  }
  const skillEffect = /主技能(.+?)的效果(?:量)?变成\s*([0-9.]+)\s*倍/.exec(line)
  if (skillEffect) {
    const names = namesIn(skillEffect[1])
    const extra = namesIn(note).map(skillRef)
    const rows = names.map(name => ({
      group: 'helper',
      ref: skillRef(name),
      parts: [{ kind: 'multiply', value: num(skillEffect[2]) }],
      scope: [{ kind: 'text', value: '效果量' }, ...extra.filter(ref => ref.kind === 'skill' && ref.id !== skillRef(name).id)],
      filters: {}
    }))
    return { rows }
  }
  const skillShards = /透过主技能获得的梦之碎片数量变成\s*([0-9.]+)\s*倍/.exec(line)
  if (skillShards) return { rows: [field('skillDreamShardsMultiplier', num(skillShards[1]), 'multiply', [{ kind: 'text', value: '效果量' }])] }
  const skillIngredient = /透过主技能获得的食材数量变成\s*([0-9.]+)\s*倍/.exec(line)
  if (skillIngredient) return { rows: [field('skillIngredientMultiplier', num(skillIngredient[1]), 'multiply', [{ kind: 'text', value: '效果量' }])] }
  const candy = /糖果获得量.*?([0-9.]+)\s*倍/.exec(line)
  if (candy) {
    const { scope } = conditions(line)
    const snapshot = /奇迹快照/.test(line) ? [{ kind: 'text', value: '奇迹快照' }] : []
    return { rows: [field('researchCandyMultiplier', num(candy[1]), 'multiply', [...scope, ...snapshot])] }
  }
  const shards = /梦之碎片.*?([0-9,.]+)\s*(?:倍|个)/.exec(line)
  if (shards && /梦之碎片/.test(line) && !/主技能「/.test(line)) {
    const flat = /多\s*[0-9,]/.test(line)
    const { scope } = conditions(line)
    const snapshot = /奇迹快照/.test(line) ? [{ kind: 'text', value: '奇迹快照' }] : []
    if (flat) return { rows: [{ group: 'research', ref: { kind: 'text', value: '梦之碎片' }, parts: [{ kind: 'add', value: num(shards[1]) }], scope: [...scope, ...snapshot], filters: {} }] }
    return { rows: [field('dreamShardsMultiplier', num(shards[1]), 'multiply', [...scope, ...snapshot])] }
  }
  const research = /研究\s*EXP变成(?:平常的)?\s*([0-9.]+)\s*倍/.exec(line)
  if (research) {
    const snapshot = /奇迹快照/.test(line) ? [{ kind: 'text', value: '奇迹快照' }] : []
    return { rows: [field('researchExpMultiplier', num(research[1]), 'multiply', snapshot)] }
  }
  const extra = /额外捡来「([^」]+)」/.exec(line)
  if (extra) return { rows: [{ group: 'ingredient', ref: ingredientRef(extra[1]), parts: [{ kind: 'text', value: '有时' }], scope: [], filters: {} }] }
  if (/贪吃/.test(line)) {
    const scope = /第1次/.test(line) ? [{ kind: 'text', value: '第1次' }] : []
    return { rows: [textRow('sleep', '贪吃', '必定1只', scope)] }
  }
  if (/尚未发现的宝可梦睡姿/.test(line)) return { rows: [textRow('sleep', '未发现睡姿', '出现提升')] }
  if (/异色/.test(line)) return { rows: [textRow('sleep', '异色', '可能出现')] }
  if (/其他睡眠类型/.test(line)) return { rows: [{ group: 'sleep', effect: 'eventMix', ref: { kind: 'field', id: 'eventMix' }, parts: [{ kind: 'mix', value: 'some' }], scope: [], filters: {} }] }
  return { unknown: line }
}

function parseDates(event, title) {
  if (title === 'EX营地奖励') return { ex: true, ranges: null }
  const days = eventDays(event)
  const dayNo = [...title.matchAll(/第(\d+)天/g)].map(match => Number(match[1]))
  if (dayNo.length && /天/.test(title) && !/\d\/\d/.test(title)) {
    return { ranges: dayNo.map(index => days[index - 1]).filter(Boolean).map(oneDay) }
  }
  const dates = []
  let rest = title
  for (const match of title.matchAll(/(\d{1,2})\/(\d{1,2})(?:\s*\([^)]*\))?\s*[～~]\s*(?:\([^)]*\)\s*)?(\d{1,2})\/(\d{1,2})/g)) {
    rest = rest.replace(match[0], ' ')
    const start = findDay(event, Number(match[1]), Number(match[2]))
    const end = findDay(event, Number(match[3]), Number(match[4]))
    if (start && end) dates.push({ startsOn: start, endsOn: addDays(end, 1) })
  }
  for (const match of rest.matchAll(/(\d{1,2})\/(\d{1,2})/g)) {
    const day = findDay(event, Number(match[1]), Number(match[2]))
    if (day) dates.push(oneDay(day))
  }
  if (!dates.length && title.startsWith('最后一天')) {
    const last = days.at(-1)
    return { ranges: last ? [oneDay(last)] : null }
  }
  if (!dates.length || /^所有日子$/.test(title)) return { ranges: null }
  const whole = dates.length === 1 && dates[0].startsOn === event.startsOn && dates[0].endsOn === event.endsOn
  return { ranges: whole ? null : dates }
}

function rulesOf(activity, event) {
  if (!activity) return []
  const base = (activity.rules ?? []).map(rule => ({ ...rule, startsOn: event.startsOn, endsOn: event.endsOn }))
  const phases = (activity.phases ?? []).flatMap(phase => (phase.rules ?? []).map(rule => ({ ...rule, startsOn: phase.startsOn, endsOn: phase.endsOn })))
  return [...base, ...phases]
}
function overlaps(rule, ranges) {
  if (!ranges?.length) return true
  return ranges.some(range => rule.startsOn < range.endsOn && range.startsOn < rule.endsOn)
}
function areasFor(activity, event, row, ranges) {
  if (!row.effect) return [[]]
  let matched = rulesOf(activity, event).filter(rule => rule.effects && Object.hasOwn(rule.effects, row.effect))
  const narrow = (key, values) => {
    if (!values?.length) return
    const next = matched.filter(rule => values.some(value => (rule.target?.[key] ?? []).includes(value)))
    if (next.length) matched = next
  }
  narrow('types', row.filters?.types)
  narrow('specialties', row.filters?.specialties)
  narrow('skillFamilies', row.filters?.skillFamilies)
  const dated = matched.filter(rule => overlaps(rule, ranges))
  if (dated.length) matched = dated
  const sets = []
  const seen = new Set()
  for (const rule of matched) {
    const area = sortIslands(rule.target?.islands ?? [])
    const key = area.join(',')
    if (seen.has(key)) continue
    seen.add(key)
    sets.push(area)
  }
  return sets.length ? sets : [[]]
}

function berryScope(line) {
  if (/主树果」会从|主树果会从/.test(line)) return '主树果为其中一种'
  if (/副树果」则会随机|副树果则会随机/.test(line)) return '副树果随机'
  if (/其中1种必定会是/.test(line)) return '一种副树果随机'
  if (/另外的?1种|另外1种/.test(line)) return '另一种随机'
  if (/另外的?2种|另外2种/.test(line)) return '另两种随机'
  return undefined
}
function berryIds(line) {
  const ids = []
  const seen = new Set()
  for (const [name, id] of berryByName) {
    if (!name || id === undefined || seen.has(id)) continue
    if (line.includes(name) || [...(i18n.aliases ? Object.entries(i18n.aliases) : [])].some(([from, to]) => fold(to) === name && line.includes(from))) {
      // matched by simplified key stored in the map
    }
  }
  for (const berry of berries) {
    const names = [berry.name, i18n.aliases?.[berry.name], berry.name === '蘋野果' ? '苹野果' : '', berry.name === '蘋野果' ? '野苹果' : ''].filter(Boolean)
    if (names.some(name => line.includes(name)) && !seen.has(berry.id)) {
      seen.add(berry.id)
      ids.push(berry.id)
    }
  }
  return ids
}
function buildBerries(activity, statements) {
  const favorite = activity?.favoriteBerries ?? {}
  const islands = sortIslands(Object.keys(favorite))
  if (!statements.length && !islands.length) return undefined
  const items = []
  const general = statements.filter(item => !item.ex)
  const ex = statements.filter(item => item.ex)
  const targets = islands.length ? islands : []
  if (!targets.length) return undefined
  for (const island of targets) {
    const source = exIslands.has(island) && ex.length ? ex.at(-1) : general.at(-1) ?? ex.at(-1)
    const berries = source?.ids?.length ? source.ids : [berryByName.get(fold(favorite[island]))].filter(id => id)
    if (!berries.length) continue
    const item = { island, berries }
    if (source?.scope) item.scope = [{ kind: 'text', value: source.scope }]
    items.push(item)
  }
  return items.length ? { items } : undefined
}

function fromActivity(activity, event) {
  const rows = []
  for (const rule of rulesOf(activity, event)) {
    const effects = rule.effects ?? {}
    const scope = []
    const filters = { types: rule.target?.types ?? [], specialties: rule.target?.specialties ?? [], skillFamilies: rule.target?.skillFamilies ?? [] }
    for (const id of filters.types) scope.push({ kind: 'type', id })
    for (const id of filters.specialties) scope.push({ kind: 'specialty', id })
    for (const id of filters.skillFamilies) scope.push({ kind: 'skillFamily', id })
    for (const id of rule.target?.skillIds ?? []) scope.push({ kind: 'skill', id })
    for (const id of rule.target?.pokemonIds ?? []) if (!effects.encounterWeightMultiplier) scope.push({ kind: 'pokemon', id })
    if (rule.conditions?.teamPokemonIdsAny?.length) scope.push({ kind: 'team', ids: rule.conditions.teamPokemonIdsAny })
    if (rule.firstResearchOnly) scope.push({ kind: 'text', value: '第1次' })
    const ranges = rule.startsOn === event.startsOn && rule.endsOn === event.endsOn ? null : [{ startsOn: rule.startsOn, endsOn: rule.endsOn }]
    for (const [key, value] of Object.entries(effects)) {
      if (key === 'encounterWeightMultiplier' || key === 'eventMix' || value === null || typeof value === 'object') continue
      if (!FIELD_GROUP[key]) continue
      const produced = key === 'cookingEnergyMultiplier'
        ? [field(key, value, 'multiply', scope, filters), field(key, scale(value, 2), 'multiply', [...scope, { kind: 'text', value: '漂亮成功' }], filters), field(key, scale(value, 3), 'multiply', [...scope, { kind: 'text', value: '周日漂亮成功' }], filters)]
        : [field(key, value, FIELD_GROUP[key] && typeof value === 'number' ? (key.endsWith('Bonus') || key.endsWith('LevelBonus') ? 'add' : 'multiply') : 'multiply', scope, filters)]
      for (const row of produced) rows.push({ row, area: sortIslands(rule.target?.islands ?? []), ranges })
    }
    if (effects.eventMix) rows.push({ row: { group: 'sleep', effect: 'eventMix', ref: { kind: 'field', id: 'eventMix' }, parts: [{ kind: 'mix', value: effects.eventMix }], scope, filters }, area: sortIslands(rule.target?.islands ?? []), ranges })
    for (const [name, amount] of Object.entries(effects.fixedIngredientDrops ?? {})) {
      rows.push({ row: { group: 'ingredient', ref: ingredientRef(name), parts: [{ kind: 'add', value: amount }], scope, filters }, area: sortIslands(rule.target?.islands ?? []), ranges })
    }
    for (const [name, amount] of Object.entries(effects.extraIngredientEnergyMultipliers ?? {})) {
      rows.push({ row: { group: 'energy', ref: ingredientRef(name), parts: [{ kind: 'multiply', value: amount }], scope, filters }, area: sortIslands(rule.target?.islands ?? []), ranges })
    }
    for (const modifier of effects.recipeEnergyModifiers ?? []) {
      for (const name of modifier.ingredientNames ?? []) {
        rows.push({ row: { group: 'energy', ref: ingredientRef(name), parts: [{ kind: 'multiply', value: modifier.multiplier }], scope, filters }, area: sortIslands(rule.target?.islands ?? []), ranges })
      }
    }
    if (effects.availableRecipeCategories?.length) {
      const categories = effects.availableRecipeCategories
      const parts = ['curry', 'salad', 'dessert'].every(id => categories.includes(id))
        ? [{ kind: 'text', value: '全部' }]
        : categories.map(value => ({ kind: 'category', value }))
      rows.push({ row: { group: 'energy', ref: { kind: 'text', value: '料理类型' }, parts, scope, filters }, area: sortIslands(rule.target?.islands ?? []), ranges })
    }
  }
  if (activity.miniCandyBoost) rows.push({ row: candyRow(activity.miniCandyBoost), area: [], ranges: null })
  return rows
}
function candyRow(boost) {
  return {
    group: 'candy',
    ref: { kind: 'text', value: '迷你糖果增强' },
    parts: [
      { kind: 'multiply', value: boost.exp, text: '经验' },
      { kind: 'multiply', value: boost.shards, text: '梦碎' },
      { kind: 'limit', value: boost.dailyLimit, text: '每日' }
    ],
    scope: [],
    filters: {}
  }
}
function kindOfField(key) {
  return key.endsWith('Bonus') || key === 'skillLevelBonus' ? 'add' : 'multiply'
}

function assemble(placed) {
  const areas = new Map()
  for (const entry of placed) {
    const key = entry.area.join(',')
    if (!areas.has(key)) areas.set(key, { area: entry.area, groups: new Map() })
    const bucket = areas.get(key).groups
    if (!bucket.has(entry.row.group)) bucket.set(entry.row.group, [])
    const item = { ref: entry.row.ref, parts: entry.row.parts }
    if (entry.row.scope?.length) item.scope = entry.row.scope
    if (entry.ranges?.length === 1) {
      item.startsOn = entry.ranges[0].startsOn
      item.endsOn = entry.ranges[0].endsOn
    }
    const list = bucket.get(entry.row.group)
    const copies = entry.ranges?.length > 1
      ? entry.ranges.map(range => ({ ...item, startsOn: range.startsOn, endsOn: range.endsOn }))
      : [item]
    for (const copy of copies) {
      const signature = JSON.stringify(copy)
      if (!list.some(existing => JSON.stringify(existing) === signature)) list.push(copy)
    }
  }
  return [...areas.values()]
    .sort((a, b) => (a.area.length === 0) - (b.area.length === 0) || (islandOrder.get(a.area[0]) ?? 99) - (islandOrder.get(b.area[0]) ?? 99))
    .map(area => ({
      area: area.area,
      groups: GROUP_ORDER.filter(id => area.groups.has(id)).map(id => ({ id, items: area.groups.get(id) }))
    }))
}

function build(event, activity = activityFor(event)) {
  const unknown = []
  const notes = []
  const placed = []
  const berryLines = []
  if (event.bonusSections?.length) {
    for (const section of event.bonusSections) {
      const when = parseDates(event, section.title)
      for (const raw of section.lines) {
        const parsed = parseLine(raw)
        if (parsed.skip) continue
        if (parsed.note) {
          notes.push(parsed.note)
          continue
        }
        if (parsed.berry) {
          berryLines.push({ ex: when.ex, line: parsed.line, ids: berryIds(parsed.line), scope: berryScope(parsed.line) })
          continue
        }
        if (parsed.mini) {
          const row = activity?.miniCandyBoost ? candyRow(activity.miniCandyBoost) : textRow('candy', '迷你糖果增强', '开启')
          placed.push({ row, area: [], ranges: when.ranges })
          continue
        }
        if (parsed.unknown) {
          unknown.push(parsed.unknown)
          continue
        }
        for (const row of parsed.rows ?? []) {
          // Cooking rows share one effect. Correct add/multiply was set by the parser.
          if (row.effect && row.parts[0] && row.ref?.kind === 'field' && row.parts[0].kind === 'multiply' && kindOfField(row.effect) === 'add') row.parts[0].kind = 'add'
          for (const area of areasFor(activity, event, row, when.ranges)) placed.push({ row, area, ranges: when.ranges })
        }
      }
    }
  } else if (activity) {
    placed.push(...fromActivity(activity, event))
  }
  const bonusGroups = assemble(placed)
  const berryGroup = buildBerries(activity, berryLines.length ? berryLines : activity?.favoriteBerries && !event.bonusSections ? [{ ids: [], scope: undefined }] : berryLines)
  return { bonusGroups, berryGroup, notes: [...new Set(notes)], unknown }
}

const unknown = new Map()
for (const event of archive.events) {
  const built = build(event)
  event.bonusGroups = built.bonusGroups
  if (built.berryGroup) event.berryGroup = built.berryGroup
  else delete event.berryGroup
  if (built.notes.length) event.notes = built.notes
  else delete event.notes
  for (const line of built.unknown) unknown.set(line, (unknown.get(line) ?? 0) + 1)
}
const present = new Set(archive.events.map(event => event.id))
for (const activity of activities.activities) {
  if (present.has(activity.id) || archive.events.some(event => event.source === activity.source)) continue
  const event = { id: activity.id, name: activity.name, announcedOn: null, startsOn: activity.startsOn, endsOn: activity.endsOn, source: activity.source }
  const built = build(event, activity)
  event.bonusGroups = built.bonusGroups
  if (built.berryGroup) event.berryGroup = built.berryGroup
  if (built.notes.length) event.notes = built.notes
  archive.events.push(event)
}
if (process.argv.includes('--write')) writeFileSync(new URL('src/catalogs/activity-archive.json', root), JSON.stringify(archive, null, 2) + '\n')
console.log('events', archive.events.length)
console.log('unknown', unknown.size)
for (const [line, count] of unknown) console.log(count + '\t' + line)
