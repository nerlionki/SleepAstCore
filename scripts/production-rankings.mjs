import fs from 'node:fs/promises'

export async function installProductionRankings(data, context) {
  const rankings = JSON.parse(await fs.readFile(new URL(`../src/rankings/${context}.json`, import.meta.url), 'utf8'))
  if (rankings.schemaVersion !== 1 || rankings.level !== 70 || rankings.helpingBonus !== 5 || rankings.activeSubskills !== 4) throw Error('Invalid production-ranking assumptions')
  if (rankings.activityMode !== 'none' || rankings.helpingBonusMode !== 'actual-five-stacks' || rankings.mainSkillMode !== 'max'
    || rankings.normalInventoryModel !== 'finite-with-ribbon-carry' || rankings.nightSkillStorage !== true
    || rankings.berrySkillScope !== 'self-and-three-teammates-converted-to-ranked-berry'
    || rankings.supportSelfShare !== 0.2 || rankings.includeIngredientGatheringSkills !== false) throw Error('Invalid production-ranking model')
  const pokemon = new Map(data['pokedex.json'].map(row => [row.id, row]))
  for (const [kind, keys, maximum] of [
    ['berries', data['berries.json'].map(row => row.name), 5],
    ['ingredients', data['ingredients.json'].map(row => String(row.id)), 3],
  ]) {
    if (JSON.stringify(Object.keys(rankings[kind]).sort()) !== JSON.stringify(keys.sort())) throw Error(`Incomplete ${context} ${kind} rankings`)
    for (const [key, rows] of Object.entries(rankings[kind])) {
      if (!Array.isArray(rows) || rows.length > maximum) throw Error(`Invalid ranking: ${kind}/${key}`)
      const identities = new Set()
      let previous = Infinity
      for (const row of rows) {
        const identity = kind === 'berries' ? `${row.id}/${row.mode}` : row.id
        if (identities.has(identity) || pokemon.get(row.id)?.name !== row.name || !Number.isFinite(row.total) || row.total <= 0 || row.total > previous) throw Error(`Invalid producer: ${kind}/${key}`)
        if (kind === 'berries' && (!['full', 'normal', 'unlimited'].includes(row.mode) || typeof row.condition !== 'string' || !row.condition
          || !Number.isFinite(row.ordinary) || row.ordinary < 0 || !Number.isFinite(row.skill) || row.skill < 0
          || Math.abs(row.ordinary + row.skill - row.total) > 1e-7)) throw Error(`Invalid berry yield breakdown: ${key}`)
        identities.add(identity); previous = row.total
      }
    }
  }
  data['calc-tables.json'].modules.productionRankings = rankings
}
