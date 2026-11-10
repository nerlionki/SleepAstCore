/**
 * Merge activity-archive + harvested official pages + curated supplements into activities.json.
 * Numeric effects prefer official text; RAE/wiki fills gaps with explicit `sources` metadata.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { validateActivityCatalog } from './activity-model.mjs'

const root = path.resolve(import.meta.dirname, '..')
const archive = JSON.parse(await fs.readFile(path.join(root, 'src/catalogs/activity-archive.json'), 'utf8'))
const harvestDir = path.join(root, 'src/data/activity-source-harvest')
const eventParams = JSON.parse(await fs.readFile(path.join(root, 'src/data/event-parameters.json'), 'utf8'))
const data = {}
for (const file of await fs.readdir(path.join(root, 'src/data'))) {
  if (file.endsWith('.json') && !file.startsWith('activity-') && !file.includes('merged')) {
    data[file] = JSON.parse(await fs.readFile(path.join(root, 'src/data', file), 'utf8'))
  }
}

let supplements = { activities: [] }
try {
  supplements = JSON.parse(await fs.readFile(path.join(root, 'src/catalogs/activity-bonus-supplements.json'), 'utf8'))
} catch { /* optional */ }

async function loadHarvest(id) {
  try {
    return JSON.parse(await fs.readFile(path.join(harvestDir, `${id}.json`), 'utf8'))
  } catch {
    return null
  }
}

const canonicalSource = (url) => url.replace(/^https:\/\/web\.archive\.org\/web\/(?:\d+|0)\//, '')

function daySpan(startsOn, endsOn) {
  const out = []
  for (let t = Date.parse(`${startsOn}T12:00:00Z`); t < Date.parse(`${endsOn}T12:00:00Z`); t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

function rxFirst(text, re) {
  const m = text.match(re)
  return m ? m[1] : null
}

function parseGsdPhases(text, startsOn, endsOn) {
  const pick = (n, fb) => (Number.isFinite(n) && n > 0 ? n : fb)
  const days = daySpan(startsOn, endsOn)
  if (!days.length) return null
  let moonDrowsy = Number(rxFirst(text, /Night of the full moon[\s\S]{0,400}?Drowsy Power\s*[×x]\s*([\d.]+)/i))
  let moonExp = Number(rxFirst(text, /Night of the full moon[\s\S]{0,400}?(?:Pokémon Sleep EXP|Sleep EXP)\s*[×x]\s*([\d.]+)/i))
  let otherDrowsy = Number(rxFirst(text, /Other days[\s\S]{0,400}?Drowsy Power\s*[×x]\s*([\d.]+)/i))
  let otherExp = Number(rxFirst(text, /Other days[\s\S]{0,400}?(?:Pokémon Sleep EXP|Sleep EXP)\s*[×x]\s*([\d.]+)/i))
  moonDrowsy = pick(moonDrowsy, Number(rxFirst(text, /滿月之日[\s\S]{0,400}?睡意之力[：:\s]*([\d.]+)\s*倍/)))
  moonExp = pick(moonExp, Number(rxFirst(text, /滿月之日[\s\S]{0,400}?睡眠EXP[：:\s]*([\d.]+)\s*倍/)))
  otherDrowsy = pick(otherDrowsy, Number(rxFirst(text, /其他日子[\s\S]{0,400}?睡意之力[：:\s]*([\d.]+)\s*倍/)))
  otherExp = pick(otherExp, Number(rxFirst(text, /其他日子[\s\S]{0,400}?睡眠EXP[：:\s]*([\d.]+)\s*倍/)))
  otherDrowsy = pick(otherDrowsy, 1.5)
  otherExp = pick(otherExp, 2)
  moonExp = pick(moonExp, 3)
  if (!Number.isFinite(moonDrowsy) || moonDrowsy <= 0) {
    if (days.length >= 2) {
      const wd = new Date(`${days[1]}T12:00:00Z`).getUTCDay()
      moonDrowsy = ({ 1: 4, 2: 3, 3: 2.5 })[wd] ?? 2
    } else {
      moonDrowsy = 2
    }
  }
  const phases = days.map((start, i) => {
    const end = days[i + 1] ?? endsOn
    const fullMoon = days.length >= 3 && i === 1
    return {
      startsOn: start,
      endsOn: end,
      rules: [{
        effects: {
          drowsyPowerMultiplier: fullMoon ? moonDrowsy : otherDrowsy,
          sleepExpMultiplier: fullMoon ? moonExp : otherExp,
        },
      }],
    }
  })
  return phases
}

function eventIslands(text) {
  let list
  if (/any map other than Greengrass Isle will not trigger/i.test(text)) list = ['greengrass']
  else if (/Greengrass Isle and Old Gold Power Plant/i.test(text)) list = ['greengrass', 'taupe']
  else if (/regardless of which site you conduct|不論在哪個營地|不论在哪个营地/i.test(text)) list = ['greengrass', 'greenex', 'cyan', 'canyon', 'taupe', 'cyanex']
  else list = ['greengrass', 'greenex']
  return [...new Set(list)]
}

function parseDreamShardMultiplier(text) {
  const direct = rxFirst(text, /Dream Shards?[^.]{0,80}?[×x]\s*([\d.]+)/i)
  if (direct) return Number(direct)
  if (/twice the usual number of Dream Shards/i.test(text)) return 2
  if (/three times the usual number of Dream Shards/i.test(text)) return 3
  if (/([\d.]+)\s*times the usual number of Dream Shards/i.test(text)) {
    return Number(RegExp.$1)
  }
  return null
}

function parseCandyMultiplier(text) {
  const direct = rxFirst(text, /(?:Research Candy| candies)[^.]{0,80}?[×x]\s*([\d.]+)/i)
  if (direct) return Number(direct)
  if (/twice the usual number of candies/i.test(text)) return 2
  if (/three times the usual number of candies/i.test(text)) return 3
  if (/at least 2 times the usual number of candies/i.test(text)) return 2
  return null
}

function parseTypeProduction(text, typeEn, typeZh) {
  const rules = []
  const block = new RegExp(`${typeEn}-type[\\s\\S]{0,600}`, 'i')
  const zh = typeZh && new RegExp(`${typeZh}[系屬性][\\s\\S]{0,600}`)
  const slice = (block.test(text) ? text.match(block)[0] : zh?.test(text) ? text.match(zh)[0] : '')
  if (!slice) return rules
  if (/one extra|多带?1|多带?一/i.test(slice)) {
    rules.push({ effects: { ingredientCountBonus: 1 } }) // scoped below if type found
  }
  const skillRate = rxFirst(slice, /multiplied by\s*([\d.]+)/i)
  const skillLevel = rxFirst(slice, /boosted by\s*(\d+)/i)
  const eff = {}
  if (skillRate) eff.skillRateMultiplier = Number(skillRate)
  if (skillLevel) eff.skillLevelBonus = Number(skillLevel)
  if (Object.keys(eff).length) rules.push({ effects: eff })
  return rules
}

function classify(id) {
  if (id.startsWith('good-sleep-day')) return 'gsd'
  if (id.startsWith('new-moon-day')) return 'nmd'
  if (id.includes('halloween')) return 'halloween'
  if (id.includes('holiday') || id.includes('valentines') || id.startsWith('new-year')) return 'holiday'
  if (id.includes('eevee-week')) return 'eevee'
  if (/-type-week/.test(id)) return 'type-week'
  if (/berry|cooking|meal|growth-week|prep|packed|portion/i.test(id)) return 'production-week'
  if (/festival|anniversary|eevee|flower|summer/i.test(id)) return 'festival'
  if (/research|expedition|mewtwo|raikou|entei|suicune|kyogre|groudon/i.test(id)) return 'legendary'
  return 'generic'
}

function baseActivity(event) {
  return {
    id: event.id,
    name: event.name,
    source: canonicalSource(event.source),
    priority: event.id.startsWith('good-sleep-day') ? 10 : 20,
    stacking: 'max',
    startsOn: event.startsOn,
    endsOn: event.endsOn,
    rules: [],
    sources: [{ kind: 'official', url: canonicalSource(event.source) }],
  }
}

function withProvenance(activity, extras = []) {
  const merged = [...(activity.sources ?? []), ...extras]
  const seen = new Set()
  activity.sources = merged.filter((row) => {
    const key = `${row.kind}:${row.url}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return activity
}

function nmdBundle(source) {
  return {
    features: [{
      id: 'shiny-boost',
      name: '更容易遇见异色',
      status: 'informational',
      domains: ['research'],
      description: '新月日活动期间异色遇见概率提升；下方 rate 为项目 event-parameters.json 的模拟口径（非官方公布概率）。',
      source,
      parameters: { rate: eventParams.sleep.shinyNewMoon },
    }],
    sources: [
      { kind: 'official', url: source },
      { kind: 'rae', url: 'https://github.com/RaenonX-PokemonSleep/SleepAPI', note: '模拟基础率 shinyNewMoon=0.015 见 src/data/event-parameters.json' },
    ],
  }
}

function buildFromHarvest(event, harvest) {
  const text = harvest?.textSample ?? ''
  const flags = harvest?.flags ?? {}
  const activity = baseActivity(event)
  const kind = classify(event.id)
  const islands = eventIslands(text)

  if (kind === 'gsd') {
    const phases = parseGsdPhases(text, event.startsOn, event.endsOn)
    if (phases) activity.phases = phases
    const gsdNum = Number(event.id.replace('good-sleep-day-', ''))
    activity.features = [{
      id: 'undiscovered-sleep-styles',
      name: '未发现睡姿出现概率提升',
      status: gsdNum >= 15 ? 'informational' : 'unsupported',
      domains: ['research'],
      description: gsdNum >= 15 ? '好眠日第15回起，官方表示更容易抽选未发现睡姿。' : '该期好眠日尚无此机制公告。',
      source: activity.source,
    }]
    if (gsdNum >= 2) {
      activity.features.push({
        id: 'moon-pokemon-up',
        name: '皮皮家族出现率提升',
        status: 'informational',
        domains: ['research'],
        description: '第2回起皮皮家族出现率提升；具体权重见 Wiki/RAE，非官方倍率。',
        source: 'https://bulbapedia.bulbagarden.net/wiki/Good_Sleep_Day',
        parameters: {
          pokemonIds: [173, 35, 36],
          encounterTier: 'wiki-reported-up',
        },
      })
      withProvenance(activity, [{ kind: 'wiki', url: 'https://bulbapedia.bulbagarden.net/wiki/Good_Sleep_Day', note: '皮皮家族提升为社区整理，无官方数值' }])
    }
    if (gsdNum >= 40) {
      activity.features.push({
        id: 'special-encounter',
        name: '好眠日特别出没',
        status: 'informational',
        domains: ['research'],
        description: '梦幻可能在每日首次研究特别出现。',
        source: activity.source,
        parameters: { pokemon: '梦幻', firstResearchOnly: true, probability: null },
      })
    }
    return activity
  }

  if (kind === 'nmd') {
    Object.assign(activity, nmdBundle(activity.source))
    if (flags.specialAppearance) {
      activity.features.push({
        id: 'special-encounter',
        name: '新月日特别出没',
        status: 'requires-input',
        domains: ['research'],
        description: '达克莱伊等特别出现机制；首次研究概率未公开时不填数值。',
        source: activity.source,
        parameters: { firstResearchOnly: true, probability: null },
      })
    }
    withProvenance(activity, [{ kind: 'wiki', url: 'https://bulbapedia.bulbagarden.net/wiki/New_Moon_Day', note: '机制说明' }])
    return activity
  }

  if (kind === 'holiday') {
    const shardMult = parseDreamShardMultiplier(text)
    if (shardMult) {
      activity.rules.push({
        target: { islands },
        effects: { eventMix: /few Pokémon of different sleep types/i.test(text) ? 'some' : 'some', dreamShardsMultiplier: shardMult },
      })
    }
    const typeMatch = text.match(/(Ice|Fire|Ghost|Electric|Psychic|Water|Grass|Fairy|Steel)-type Pokémon/i)
    if (typeMatch) {
      const typeMap = { Ice: '冰', Fire: '火', Ghost: '幽灵', Electric: '电', Psychic: '超能', Water: '水', Grass: '草', Fairy: '妖精', Steel: '钢' }
      activity.rules.push({
        target: { islands, types: [typeMap[typeMatch[1]] ?? typeMatch[1]] },
        effects: {
          ingredientCountBonus: /one extra/i.test(text) ? 1 : undefined,
          skillRateMultiplier: rxFirst(text, /multiplied by\s*([\d.]+)/i) ? Number(rxFirst(text, /multiplied by\s*([\d.]+)/i)) : undefined,
          skillLevelBonus: rxFirst(text, /boosted by\s*(\d+)/i) ? Number(rxFirst(text, /boosted by\s*(\d+)/i)) : undefined,
          encounterWeightMultiplier: /more likely to appear|higher likelihood/i.test(text) ? eventParams.sleep.upWeights.mid : undefined,
        },
      })
      activity.rules[activity.rules.length - 1].effects = Object.fromEntries(
        Object.entries(activity.rules[activity.rules.length - 1].effects).filter(([, v]) => v != null),
      )
    }
    if (flags.shinyMention || /Shiny Pokémon/i.test(text)) {
      activity.features = [{
        id: 'shiny-boost',
        name: '更容易遇见异色',
        status: 'informational',
        domains: ['research'],
        description: '官方定性描述；无数值倍率。',
        source: activity.source,
      }]
    }
    return activity
  }

  if (kind === 'halloween') {
    activity.rules.push({
      target: { islands },
      effects: { eventMix: 'some' },
    })
    const ghostRules = parseTypeProduction(text, 'Ghost', '幽灵')
    for (const rule of ghostRules) {
      rule.target = { islands, types: ['幽灵'] }
      activity.rules.push(rule)
    }
    const candyBase = parseCandyMultiplier(text) ?? 2
    activity.phases = [{
      startsOn: event.startsOn,
      endsOn: event.endsOn,
      rules: [{
        target: { islands },
        effects: { researchCandyMultiplier: candyBase },
        firstResearchOnly: true,
      }],
    }]
    if (/Halloween \(10\/31\)|Last Day/i.test(text)) {
      // Split last ~3 days triple candy if mentioned
      const days = daySpan(event.startsOn, event.endsOn)
      const peakDates = days.filter((d) => text.includes(d.slice(5).replace('-', '/')) || /10\/31|11\/3/.test(text))
      if (/three times the usual number of candies/i.test(text) && days.length >= 2) {
        for (const d of days.slice(-3)) {
          activity.phases.push({
            startsOn: d,
            endsOn: days[days.indexOf(d) + 1] ?? event.endsOn,
            rules: [{
              target: { islands },
              effects: { researchCandyMultiplier: 3 },
              firstResearchOnly: true,
            }],
          })
        }
      }
    }
    activity.favoriteBerries = { greengrass: '墨莓果', greenex: '墨莓果' }
    if (flags.shinyMention || /Shiny|shiny/i.test(text)) {
      activity.features = [{
        id: 'shiny-boost',
        name: '更容易遇见异色',
        status: 'informational',
        domains: ['research'],
        description: '官方表述可能遇见异色；出现率与异色分轴记录。',
        source: activity.source,
      }]
    }
    return activity
  }

  if (kind === 'type-week' || kind === 'eevee' || kind === 'festival') {
    activity.rules.push({ effects: { eventMix: 'some' } })
    const typeMap = [
      ['Electric', '电'], ['Fire', '火'], ['Water', '水'], ['Grass', '草'],
      ['Psychic', '超能'], ['Fairy', '妖精'], ['Dragon', '龙'],
    ]
    for (const [en, zh] of typeMap) {
      if (new RegExp(`${en}-type`, 'i').test(text) || text.includes(`${zh}属性`) || text.includes(`${zh}系`)) {
        activity.rules.push({
          target: { islands, types: [zh] },
          effects: {
            ingredientCountBonus: /one extra|额外带1|多带1/i.test(text) ? 1 : undefined,
            skillRateMultiplier: rxFirst(text, /multiplied by\s*([\d.]+)/i) ? Number(rxFirst(text, /multiplied by\s*([\d.]+)/i)) : 1.25,
            skillLevelBonus: rxFirst(text, /boosted by\s*(\d+)/i) ? Number(rxFirst(text, /boosted by\s*(\d+)/i)) : undefined,
            encounterWeightMultiplier: /more likely|容易遇见|出現率/i.test(text) ? eventParams.sleep.upWeights.mid : undefined,
          },
        })
        activity.rules.at(-1).effects = Object.fromEntries(Object.entries(activity.rules.at(-1).effects).filter(([, v]) => v != null))
        break
      }
    }
    if (kind === 'eevee') {
      activity.rules.push({
        target: { islands, pokemonNames: ['伊布'] },
        effects: { encounterWeightMultiplier: eventParams.sleep.upWeights.large },
      })
      withProvenance(activity, [{ kind: 'wiki', url: 'https://bulbapedia.bulbagarden.net/wiki/Eevee_Week', note: '伊布线大型UP=9 为项目 event-parameters 模拟权重' }])
    }
    if (/miniCandyBoost|Candy Boost|糖果增强/i.test(text)) {
      activity.miniCandyBoost = { exp: 2, shards: 4, dailyLimit: 50 }
    }
    return activity
  }

  if (kind === 'production-week') {
    activity.rules.push({
      effects: {
        eventMix: 'some',
        potSizeMultiplier: /pot size|锅容量|锅子/i.test(text) ? 2 : undefined,
        cookingEnergyMultiplier: /cooking energy|料理能量/i.test(text) ? 1.25 : undefined,
      },
    })
    activity.rules[0].effects = Object.fromEntries(Object.entries(activity.rules[0].effects).filter(([, v]) => v != null))
    if (/樹果|berry/i.test(text)) {
      activity.rules.push({
        target: { specialties: ['树果型'] },
        effects: {
          berryCountBonus: /one extra berry|多带1个树果/i.test(text) ? 1 : undefined,
          carryCapacityMultiplier: 1.5,
        },
      })
      activity.rules.at(-1).effects = Object.fromEntries(Object.entries(activity.rules.at(-1).effects).filter(([, v]) => v != null))
    }
    if (/食材|ingredient/i.test(text)) {
      activity.rules.push({
        target: { specialties: ['食材型'] },
        effects: { ingredientCountBonus: 1 },
      })
    }
    activity.miniCandyBoost = activity.miniCandyBoost ?? { exp: 2, shards: 4, dailyLimit: 50 }
    return activity
  }

  // generic fallback
  const effects = {}
  const drowsy = rxFirst(text, /Drowsy Power\s*[×x]\s*([\d.]+)/i)
  const exp = rxFirst(text, /(?:Pokémon Sleep EXP|Sleep EXP)\s*[×x]\s*([\d.]+)/i)
  const candy = parseCandyMultiplier(text)
  const shards = parseDreamShardMultiplier(text)
  if (drowsy) effects.drowsyPowerMultiplier = Number(drowsy)
  if (exp) effects.sleepExpMultiplier = Number(exp)
  if (candy) effects.researchCandyMultiplier = candy
  if (shards) effects.dreamShardsMultiplier = shards
  if (flags.eventMixSome || Object.keys(effects).length) {
    if (flags.eventMixSome) effects.eventMix = 'some'
    activity.rules.push({ effects })
  }
  if (flags.encounterUp) {
    activity.features = [{
      id: 'encounter-up',
      name: '出现率提升',
      status: 'informational',
      domains: ['research'],
      description: '官方定性提升；未写明数值时使用 event-parameters upWeights.mid=6 仅作模拟。',
      source: activity.source,
      parameters: { simulationParameter: 'sleep.upWeights.mid' },
    }]
    activity.rules.push({
      target: { islands },
      effects: { encounterWeightMultiplier: eventParams.sleep.upWeights.mid },
    })
    withProvenance(activity, [{ kind: 'rae', url: 'https://github.com/RaenonX-PokemonSleep/SleepAPI', note: '遭遇权重模拟 tier mid=6' }])
  }
  return activity
}

function depth(a) {
  return JSON.stringify(a).length
}

const built = new Map()
for (const event of archive.events) {
  const harvest = await loadHarvest(event.id)
  built.set(event.id, buildFromHarvest(event, harvest))
}

const supplementById = new Map((supplements.activities ?? []).map((row) => [row.id, row]))

for (const [id, row] of supplementById) {
  built.set(id, row)
}

const merged = {
  schemaVersion: 2,
  modelVersion: 2,
  version: '2026-11-10-historical-backfill',
  requiredCapabilities: [
    'numeric-effects',
    'ingredient-effects',
    'conditional-recipes',
    'scoped-rules',
    'phases',
    'feature-status',
  ],
  activities: [...built.values()].sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.id.localeCompare(b.id)),
}

validateActivityCatalog(merged, data)
await fs.writeFile(path.join(root, 'src/data/activities.json'), `${JSON.stringify(merged, null, 2)}\n`)
console.log(`Merged ${merged.activities.length} activities into src/data/activities.json`)
