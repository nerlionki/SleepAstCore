/** New clients consume catalog rows. Project legacy fields for published clients during the build. */
export function installItemCatalog(data) {
  const items = data['calc-tables.json'].modules.items
  const rules = data['rule-catalogs.json'].modules.items
  const runtime = data['runtime-parameters.json'].modules.items.module.values
  const generated = new Set()
  for (const [index] of rules.moduleList0.values.entries()) for (const [offset] of items.types.entries()) generated.add(runtime.p001 + index * runtime.p002 + offset)
  const groups = new Map()
  for (const row of items.catalog) {
    if (!groups.has(row.category)) groups.set(row.category, [])
    if (!generated.has(row.id)) groups.get(row.category).push([row.id, row.name])
  }
  items.groups = [...groups]
  items.evolutionAchievements = Object.fromEntries(items.catalog.filter(row => row.category === '进化道具' && row.additionalAcquisition).map(row => [row.id, row.additionalAcquisition]))
  const acquisitions = new Set(items.catalog.filter(row => row.category === '进化道具').map(row => row.acquisition))
  if (acquisitions.size === 1) items.evolutionShopAcquisition = [...acquisitions][0]
  const juice = items.catalog.find(row => row.id === items.roles.berryJuice)
  const params = data['runtime-parameters.json'].modules
  params.scorePlan.validateScoreOptions.values.p010 = juice.maxHeld
  params.scoreSimulation.release.values.p002 = juice.maxHeld
  params.scoreSimulation.simulateScore.values.p011 = juice.useEffect.amount
  params.scoreSimulation.simulateScore.values.p012 = juice.useEffect.energyCap
}
