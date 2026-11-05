/** Canonical game image files are addressed by stable catalog IDs; legacy aliases remain published. */
export function validateIdImages(data, assets) {
  const requireImage = file => { if (!assets[file]) throw new Error('Missing ID-linked image: ' + file) }
  for (const [name, folder] of [['berries.json', 'berry'], ['ingredients.json', 'ingredient'], ['recipes.json', 'meal'], ['subskills.json', 'subSkill']]) {
    for (const row of data[name]) requireImage(`images/${folder}/${row.id}.webp`)
  }
  for (const row of data['pokedex.json']) for (const folder of ['pokemon/icons', 'pokemon/portrait']) requireImage(`images/${folder}/${row.id}.webp`)
  for (const row of data['skill-tables.json'].modules.mainSkills.MAIN_SKILLS) if (row.imageAvailable) requireImage(`images/mainSkill/${row.id}.webp`)
  for (const row of data['calc-tables.json'].modules.items.catalog) requireImage(`items/${row.id}.webp`)
  const flower = data['event-parameters.json'].flower
  requireImage(`images/flower/${flower.id}.webp`)
  requireImage('images/berry/0.webp')
  requireImage('images/ingredient/0.webp')
  const announced = data['meta.json'].announcedContent ?? {}
  for (const [kind, folder] of [['ingredients', 'ingredient'], ['recipes', 'meal']]) for (const row of announced[kind] ?? []) {
    if (row.imageId == null) continue
    if (row.imageFile && row.imageFile !== `${folder}/${row.imageId}.webp`) throw new Error('Announced image differs from its ID: ' + row.imageFile)
    requireImage(`images/${folder}/${row.imageId}.webp`)
  }
  for (const row of announced.pokemon ?? []) if (row.imageId != null) {
    if (!assets[`images/pokemon/icons/${row.imageId}.webp`] && !assets[`images/pokemon/portrait/${row.imageId}.webp`]) throw new Error('Missing announced Pokemon image: ' + row.imageId)
  }
  // PokeSleepAst 2.0.1 resolves these paths from bundled code and the published maps.
  const rae = data['compatibility-maps.json'].modules.raeImage
  for (const image of Object.values(rae.SUBSKILL_IMAGE)) requireImage(`images/subSkill/${image}.webp`)
  for (const file of Object.values(rae.POKEMON_FILE)) {
    for (const folder of ['pokemon/icons', 'pokemon/portrait', 'pokemon/icons/shiny', 'pokemon/portrait/shiny']) {
      requireImage(`images/${folder}/${file}.webp`)
    }
  }
  data['berries.json'].forEach((_, index) => requireImage(`images/berry/${index + 1}.webp`))
  for (const skill of data['skill-tables.json'].modules.mainSkills.MAIN_SKILLS) requireImage(`images/mainSkill/${skill.id}.webp`)
  const rules = data['rule-catalogs.json'].modules.items
  const runtime = data['runtime-parameters.json'].modules.items.module.values
  const sharedIds = new Set(rules.moduleList1.values)
  requireImage(`items/${runtime.p003}.webp`)
  for (const [index] of rules.moduleList0.values.entries()) {
    data['calc-tables.json'].modules.items.types.forEach((_, offset) => {
      const id = runtime.p001 + index * runtime.p002 + offset
      requireImage(`items/${sharedIds.has(id) ? runtime.p003 : id}.webp`)
    })
  }
}
