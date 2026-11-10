/** Data-only validation: safe before installing a resource snapshot or importing calculators. */
export function validateMainSkillModels(data                         ) {
  const obj = (v     )                      => v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  const valid = (test         , message        ) => { if (!test) throw new Error('主技能模型：' + message) }
  const finite = (v         ) => typeof v === 'number' && Number.isFinite(v)
  const positiveInt = (v         ) => Number.isSafeInteger(v) && Number(v) > 0
  const probability = (v         ) => finite(v) && Number(v) >= 0 && Number(v) <= 1
  const tables = obj(obj(data['skill-tables.json']).modules)
  const main = obj(tables.mainSkills), execution = obj(main.execution)
  const skills = main.MAIN_SKILLS         
  const calc = obj(obj(data['calc-tables.json']).modules), items = obj(calc.items)
  const pokemon = data['pokedex.json']         , ingredients = data['ingredients.json']         , berries = data['berries.json']         
  valid(Array.isArray(skills) && Array.isArray(pokemon) && Array.isArray(ingredients) && Array.isArray(berries), '目录缺失')
  const skillIds = new Set(skills.map(s => s.id)), pokeIds = new Set(pokemon.map(p => p.id)), ingredientIds = new Set(ingredients.map(i => i.id))
  valid(execution.schemaVersion === 1 && positiveInt(execution.recursionLimit) && execution.recursionLimit <= 32 && finite(execution.energyCap)
    && execution.energyCap > 0 && positiveInt(execution.sameSpeciesCap), '执行契约不兼容')
  const reset = obj(obj(execution.stateResets).onceBonus)
  valid(['sleepStart', 'sleepEnd'].includes(reset.event) && probability(reset.expected) && typeof reset.sampled === 'boolean', '状态重置配置无效')
  valid(Array.isArray(execution.classificationRules), '旧技能名称分类配置缺失')
  for (const rule of execution.classificationRules) {
    valid(typeof rule.pattern === 'string' && ['charge', 'healAll', 'healOne', 'healSelf', 'support', 'typeAccel', 'helpAccel', 'other'].includes(rule.kind), '旧技能分类配置无效')
    new RegExp(rule.pattern)
  }
  valid(items.catalogVersion === 1 && Array.isArray(items.catalog) && items.catalog.length, '道具目录缺失')
  const itemIds = new Set        ()
  for (const item of items.catalog) {
    valid(positiveInt(item.id) && !itemIds.has(item.id) && typeof item.name === 'string' && item.name.trim()
      && typeof item.category === 'string' && item.imageFile === `items/${item.id}.webp`, '道具 ID 或图片无效')
    itemIds.add(item.id)
    if (item.maxHeld != null) valid(positiveInt(item.maxHeld), '道具持有上限无效')
    if (item.useEffect != null) valid(item.useEffect.op === 'heal' && finite(item.useEffect.amount) && item.useEffect.amount >= 0
      && finite(item.useEffect.energyCap) && item.useEffect.energyCap > 0 && typeof item.useEffect.ignoreNegativeNature === 'boolean', '未支持的道具使用效果')
    if (item.legacyRewardKey != null) valid(item.legacyRewardKey === 'berryJuice', '未支持的旧奖励映射')
  }
  valid(itemIds.has(obj(items.roles).berryJuice) && items.catalog.find((i     ) => i.id === items.roles.berryJuice)?.useEffect, '道具消费引用缺失')
  if (items.pokemonCatalog !== undefined) {
    valid(Array.isArray(items.pokemonCatalog), '宝可梦道具目录无效')
    const pokemonItemIds = new Set()
    for (const item of items.pokemonCatalog) {
      const linked = obj(obj(item).pokemonItem)
      const prefix = linked.kind === 'candy' ? 'Candy' : 'Incense'
      valid((linked.kind === 'candy' || linked.kind === 'incense' && positiveInt(linked.typeId) && linked.typeId <= 18)
        && pokeIds.has(linked.pokemonId) && item.id === `${prefix}-${linked.pokemonId}` && !pokemonItemIds.has(item.id)
        && typeof item.name === 'string' && item.name.trim() && typeof item.category === 'string'
        && item.imageFile === `items/${item.id}.webp` && item.diamondPrice === undefined, '宝可梦道具 ID 或图片无效')
      pokemonItemIds.add(item.id)
    }
  }
  valid(new Set(berries.map(row => row.id)).size === berries.length && berries.every(row => positiveInt(row.id)), '树果缺少稳定 ID')
  const subskills = data['subskills.json']         
  valid(subskills.every(row => row.imageFile === `subSkill/${row.id}.webp`), '副技能图片必须对应 ID')
  const flower = obj(obj(data['event-parameters.json']).flower)
  valid(positiveInt(flower.id) && flower.imageFile === `flower/${flower.id}.webp`, '彩庆花图片必须对应 ID')
  const condition = (value     , depth = 0)       => {
    valid(value && depth < 16, '条件层数无效')
    const c = obj(value)
    if (c.all) { valid(Array.isArray(c.all) && c.all.length, '组合条件无效'); c.all.forEach((v     ) => condition(v, depth + 1)); return }
    if (c.teamPokemon) valid(Array.isArray(c.teamPokemon) && c.teamPokemon.length && c.teamPokemon.every((id        ) => pokeIds.has(id)), '条件宝可梦引用无效')
    else if (c.teamSkillTags) valid(Array.isArray(c.teamSkillTags) && c.teamSkillTags.length && c.teamSkillTags.every((tag         ) => typeof tag === 'string' && tag.length), '技能标签条件无效')
    else if (c.firstIngredient != null) valid(c.firstIngredient === true, '首个食材条件无效')
    else valid(typeof c.targetTypeNot === 'string' && berries.some(b => b.type === c.targetTypeNot), '未支持的条件')
  }
  const amount = (value     , skill     , depth = 0)       => {
    valid(depth < 16, '数值表达式过深')
    if (finite(value)) return
    const v = obj(value)
    if (v.column != null) { valid(skill.columns.includes(v.column) && (v.percent == null || typeof v.percent === 'boolean'), '数值列不存在'); return }
    if (v.range) { valid(Array.isArray(v.range) && v.range.length === 2 && v.range.every((key        ) => skill.columns.includes(key)), '区间引用无效'); return }
    if (v.table) { valid(Array.isArray(obj(tables.skillEffects)[v.table]) && obj(tables.skillEffects)[v.table].length >= skill.maxLevel
      && obj(tables.skillEffects)[v.table].every((row     ) => Array.isArray(row) && row.length >= execution.sameSpeciesCap && row.every(finite)), '效果表引用无效'); return }
    for (const key of ['add', 'multiply', 'maximum', 'divide']) if (v[key]) {
      valid(Array.isArray(v[key]) && v[key].length > 0 && (key !== 'divide' || v[key].length === 2), '算术表达式无效')
      v[key].forEach((child     ) => amount(child, skill, depth + 1))
      if (key === 'divide') valid(finite(v[key][1]) && v[key][1] !== 0, '除数必须是非零常数')
      return
    }
    if (v.level === true) return
    if (v.skill != null) { const target = skills.find(s => s.id === v.skill); valid(target, '技能数值引用无效'); amount(v.value, target, depth + 1); return }
    if (v.when) { condition(v.when); amount(v.then, skill, depth + 1); amount(v.otherwise, skill, depth + 1); return }
    if (v.expected != null) { amount(v.expected, skill, depth + 1); amount(v.sampled, skill, depth + 1); return }
    valid(v.randomMultiplier && probability(v.randomMultiplier.chance) && finite(v.randomMultiplier.hit) && finite(v.randomMultiplier.miss), '未支持的数值表达式')
  }
  const target = (t     ) => {
    valid(['self', 'team', 'random'].includes(t.kind) && (t.count == null || positiveInt(t.count)), '目标配置无效')
    if (t.sampled) valid(probability(t.sampled.lowestChance) && typeof t.sampled.randomLowestTies === 'boolean', '随机目标配置无效')
    if (t.expected && !t.expected.supportSize) {
      if (t.expected.rankWeights) valid(Array.isArray(t.expected.rankWeights) && t.expected.rankWeights.length === t.expected.fullTeamSize
        && t.expected.rankWeights.every((v        ) => finite(v) && v >= 0) && t.expected.rankWeights.some((v        ) => v > 0), '目标权重无效')
      else valid(finite(t.expected.firstWeight) && t.expected.firstWeight > 0 && finite(t.expected.otherWeight) && t.expected.otherWeight > 0, '目标权重无效')
    }
  }
  const effects = (rows     , skill     , depth = 0)       => {
    valid(Array.isArray(rows) && rows.length <= 32 && depth < 16, '效果列表无效')
    for (const e of rows) {
      valid(['charge', 'currency', 'giveItem', 'heal', 'help', 'skillOnlyHelp', 'ingredients', 'firstIngredient', 'pot', 'crit', 'zone', 'berries', 'drainEnergy', 'sequence', 'accumulateRelease', 'onceBonus'].includes(e?.op), '未支持的计算算子')
      if (e.condition) condition(e.condition)
      if (e.target) target(e.target)
      if (e.profiles) valid(Array.isArray(e.profiles) && e.profiles.length && e.profiles.every((p        ) => ['expected', 'sampled'].includes(p)), '结算口径无效')
      if (e.chance) valid(probability(e.chance.probability) && (e.chance.test == null || ['lt', 'gte'].includes(e.chance.test))
        && (e.chance.expectedProbability == null || probability(e.chance.expectedProbability)), '发动概率无效')
      if (e.op === 'sequence' || e.op === 'onceBonus') { effects(e.effects, skill, depth + 1); if (e.op === 'onceBonus') valid(probability(e.releaseChance) && finite(e.bonus) && e.bonus >= 0, '状态概率无效'); continue }
      if (e.op === 'accumulateRelease') {
        valid(positiveInt(e.maxStacks) && e.maxStacks <= 100 && probability(e.releaseChance) && Number.isInteger(e.extraTable)
          && Array.isArray(skill.extra?.[e.extraTable]?.levels) && skill.extra[e.extraTable].levels.length >= skill.maxLevel
          && skill.extra[e.extraTable].levels.every((row       ) => row.length > e.maxStacks && row.every(v => finite(Number(v)))), '蓄积状态表无效'); continue
      }
      if (e.op === 'berries') { amount(e.selfAmount, skill); amount(e.otherAmount, skill) } else amount(e.amount, skill)
      if (e.op === 'giveItem') valid(itemIds.has(e.itemId), '发放道具引用不存在')
      if (e.op === 'currency') valid(['dreamShards', 'candies'].includes(e.currency), '奖励资源无效')
      if (e.op === 'ingredients') {
        valid(positiveInt(e.draws), '食材分配数无效')
        if (e.pool) valid(Array.isArray(e.pool) && e.pool.length && new Set(e.pool).size === e.pool.length && e.pool.every((id        ) => ingredientIds.has(id)), '食材池引用无效')
        if (e.roundingBonus != null) amount(e.roundingBonus, skill)
      }
    }
  }
  for (const skill of skills) {
    valid(skill.imageFile === `mainSkill/${skill.id}.webp` && typeof skill.imageAvailable === 'boolean', '主技能图片必须对应 ID 或明确标记无图')
    if (skill.columns.length) valid(skill.levels.length >= skill.maxLevel && skill.levels.every((row       ) => row.length >= skill.columns.length), '主技能等级表不完整')
    const model = obj(skill.model)
    valid(['charge', 'healAll', 'healOne', 'healSelf', 'support', 'typeAccel', 'helpAccel', 'other'].includes(model.classification)
      && Array.isArray(model.tags) && model.tags.every((v         ) => typeof v === 'string') && typeof model.copyable === 'boolean'
      && typeof model.comparisonFastPath === 'boolean', '技能效果元资料无效')
    effects(model.effects, skill)
    if (model.comparisonFastPath) valid(model.effects.length === 1 && ['charge', 'heal'].includes(model.effects[0].op)
      && !model.effects[0].condition && !model.effects[0].chance && !model.selection, '复合技能不能绕过效果执行器')
    if (model.chargeValue != null) amount(model.chargeValue, skill)
    if (model.displayValue != null) amount(model.displayValue, skill)
    if (model.selection) {
      const s = model.selection
      valid(['random', 'copy', 'choose'].includes(s.kind), '技能选择器无效')
      if (s.kind !== 'copy') valid(Array.isArray(s.pool) && s.pool.length && s.pool.every((id        ) => skillIds.has(id)), '技能选择池无效')
      if (s.kind !== 'random') valid(skillIds.has(s.fallbackSkillId), '失败回退技能无效')
      if (s.kind === 'choose') valid(Array.isArray(s.owners) && s.owners.length && s.owners.every((id        ) => pokeIds.has(id)), '技能所有者无效')
      if (s.kind === 'copy') valid(!model.copyable && Array.isArray(s.blockedPokemon) && s.blockedPokemon.every((id        ) => pokeIds.has(id)), '复制规则无效')
    }
  }
  const visit = (id        , seen             ) => {
    valid(!seen.has(id), '技能选择器存在循环')
    const s = skills.find(skill => skill.id === id)?.model.selection
    const children = s ? [...(s.kind === 'random' || s.kind === 'choose' ? s.pool : []), ...(s.fallbackSkillId != null ? [s.fallbackSkillId] : [])] : []
    for (const child of new Set        (children)) visit(child, new Set([...seen, id]))
  }
  skills.forEach(skill => visit(skill.id, new Set()))
  const mew = obj(tables.mew), owner = skills.find(skill => skill.id === mew.ownerSkillId)
  valid(owner?.model.selection?.kind === 'choose' && owner.model.selection.owners.includes(mew.ownerPokemonId)
    && owner.model.selection.fallbackSkillId === mew.defaultSkillId && Array.isArray(mew.MEW_SKILLS)
    && mew.MEW_SKILLS.every((choice     ) => owner.model.selection.pool.includes(choice.id) && finite(choice.multiplier) && choice.multiplier > 0), '技能选择倍率或所有者配置不一致')
}
