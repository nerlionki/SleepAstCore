import { validateMainSkillModels } from './skill-effect-model.mjs'
/** Validate new skill data before installing a snapshot; never mix old remote tables with bundled fields. */
export function validateSkillResources(data                         ) {
  validateMainSkillModels(data)
  const object = (value         )                      => value && typeof value === 'object' && !Array.isArray(value) ? value                        : {}
  const tables = object(object(data['skill-tables.json']).modules)
  const skills = object(tables.mainSkills).MAIN_SKILLS
  const subskills = data['subskills.json']
  const sp = object(tables.sp)
  const values = object(sp.skillValues)
  const bonus = object(sp.bonus)
  const finite = (value         ) => typeof value === 'number' && Number.isFinite(value) && value >= 0
  if (!Array.isArray(skills) || !skills.length || !Array.isArray(subskills) || !subskills.length
    || !Array.isArray(tables.mainSkills.SKILL_GROUPS) || !tables.mainSkills.SKILL_GROUPS.length
    || !Object.keys(values).length || !Object.keys(object(bonus.inventory)).length
    || !Array.isArray(bonus.teamSubskills) || !['team', 'energyUp', 'energyDown'].every(key => finite(bonus[key]))) {
    throw new Error('技能资料不完整')
  }
  const skillIds = new Set        ()
  for (const skill of skills) {
    if (!Number.isSafeInteger(skill.id) || skillIds.has(skill.id) || typeof skill.name !== 'string'
      || !Number.isSafeInteger(skill.maxLevel) || skill.maxLevel < 1 || !Array.isArray(skill.aliases)
      || !Array.isArray(skill.columns) || !Array.isArray(skill.levels)) throw new Error('主技能资料无效')
    skillIds.add(skill.id)
  }
  // Some skills intentionally have no SP estimate. Missing estimates keep the existing explicit error.
  for (const [id, row] of Object.entries(values)) {
    if (!skillIds.has(Number(id)) || !Array.isArray(row) || !row.length || !row.every(finite)) throw new Error('主技能 SP 估值无效')
  }
  const subIds = new Set(subskills.map(skill => skill.id))
  if (subIds.size !== subskills.length || subskills.some(skill => typeof skill.id !== 'string' || typeof skill.name !== 'string'
    || !['gold', 'blue', 'white'].includes(skill.rarity))) throw new Error('副技能资料无效')
  if (Object.entries(object(bonus.inventory)).some(([id, value]) => !subIds.has(id) || !finite(value))
    || bonus.teamSubskills.some((id         ) => !subIds.has(id))) throw new Error('副技能 SP 估值无效')
  const items = object(object(object(data['calc-tables.json']).modules).items)
  if (!Array.isArray(items.groups) || !items.groups.length || typeof items.evolutionShopAcquisition !== 'string'
    || !items.evolutionShopAcquisition.trim()) throw new Error('道具资料不完整')
  const natures = data['natures.json']
  const defaults = object(object(object(data['client-defaults.json']).modules).natureLabels)
  const factors = object(object(object(data['calc-tables.json']).modules).natureLabels).FACTOR
  const stats = ['help', 'energy', 'ingredient', 'skill', 'exp']
  if (!Array.isArray(natures) || !natures.length
    || natures.some(row => typeof row?.name !== 'string' || !(row.up === null || stats.includes(row.up)) || !(row.down === null || stats.includes(row.down)))
    || !natures.some(row => row.name === defaults.neutralNature && row.up === null && row.down === null)
    || !stats.every(stat => Array.isArray(object(factors)[stat]) && factors[stat].length === 2 && factors[stat].every(finite))) {
    throw new Error('性格资料不完整')
  }
  const calc = object(object(data['calc-tables.json']).modules)
  const client = object(object(data['client-defaults.json']).modules)
  const contracts = object(object(data['runtime-contracts.json']).modules)
  const positive = (value         ) => finite(value) && Number(value) > 0
  const increasing = (value         , length        )                    => Array.isArray(value) && value.length === length
    && value.every((n, i) => Number.isSafeInteger(n) && n > 0 && (i === 0 || n > value[i - 1]))
  const gates = object(calc.ingredients).SLOT_LEVELS
  const choices = object(calc.ingredients).SLOT_CHOICES
  if (!increasing(gates, 3) || !Array.isArray(choices) || choices.length !== gates.length
    || choices.some((row, slot) => !Array.isArray(row) || !row.length || new Set(row).size !== row.length
      || row.some(index => !Number.isInteger(index) || index < 0 || index > slot))
    || !increasing(object(calc.member).SUBSKILL_GATES, 5)) throw new Error('食材或副技能解锁资料无效')
  const ribbon = object(calc.ribbon)
  if (!Array.isArray(ribbon.STAGES) || !ribbon.STAGES.length || ribbon.STAGES.some((stage     , i        ) => !positive(stage.hours)
    || !finite(stage.carry) || !Array.isArray(stage.speed) || !stage.speed.length || stage.speed.some((cut         ) => !finite(cut) || Number(cut) >= 1)
    || i > 0 && stage.hours >= ribbon.STAGES[i - 1].hours)
    || !Array.isArray(ribbon.RIBBON_HOURS) || ribbon.RIBBON_HOURS[0] !== 0
    || ribbon.STAGES.some((stage     ) => !ribbon.RIBBON_HOURS.includes(stage.hours))) throw new Error('缎带效果资料无效')
  const formula = object(sp.formula)
  if (!Array.isArray(sp.ingredientGrowth) || !sp.ingredientGrowth.length || !sp.ingredientGrowth.every(positive)
    || !positive(formula.levelNumerator) || !positive(formula.levelDenominator) || !positive(formula.helpHours)
    || !['frequencyDigits', 'helpsDigits', 'rateDigits', 'bonusDigits', 'componentDigits', 'outputDigits'].every(key => Number.isInteger(formula[key]) && formula[key] >= 0 && formula[key] <= 10)
    || !positive(object(formula.frequencyCorrection).level) || !positive(object(formula.frequencyCorrection).interval)
    || !finite(object(formula.frequencyCorrection).seconds) || !object(sp.defaults).pokeId) throw new Error('SP 模型资料不完整')
  const preset = object(client.memberPresets)
  if (![preset.editor, preset.extreme].every(row => positive(object(row).level)
    && Array.isArray(object(row).ingredientSlots) && row.ingredientSlots.length === gates.length
    && row.ingredientSlots.every((index         , slot        ) => choices[slot].includes(index))
    && Array.isArray(row.subskills) && row.subskills.length === 5 && row.subskills.every((id         ) => id === '' || subIds.has(id)))
    || !positive(preset.ocrMissingLevel) || !positive(preset.ocrMissingSkillLevel) || !finite(preset.comparisonWakeEnergy)) throw new Error('默认面板资料无效')
  const matching = object(object(object(data['compatibility-maps.json']).modules).ocrMatching)
  for (const key of ['subskillCorrections', 'mainSkillCorrections']) {
    if (!Array.isArray(matching[key]) || !matching[key].every((row         ) => Array.isArray(row) && row.length === 2 && row.every(value => typeof value === 'string'))) throw new Error('OCR 匹配资料无效')
    for (const [pattern] of matching[key]) new RegExp(pattern)
  }
  if (!matching.subskillAliases || Object.values(object(matching.subskillAliases)).some(id => !subIds.has(id))
    || !matching.natureAliases || Object.values(object(matching.natureAliases)).some(name => !natures.some(row => row.name === name))) throw new Error('OCR 匹配目录无效')
  const ranges = object(contracts.inputRanges)
  const requiredRanges = ["IslandPane.store_islandBonus_i_id_as_IslandId.min","IslandPane.store_islandBonus_i_id_as_IslandId.step","RecipeSheet.level.min","RecipeSheet.level.step","SettingsPanel.settings_areaBonus.min","SettingsPanel.settings_areaBonus.step","SettingsPanel.settings_sleepScore.min","SettingsPanel.settings_sleepScore.max","SettingsPanel.settings_dailySkillHeal.min","SettingsPanel.settings_whistleHelps.min","SettingsPanel.settings_whistleHelps.max","SettingsPanel.recipeLevelOf_settings_r_name.min","BabyEfficiencyPane.baby_iterations.min","BabyEfficiencyPane.baby_iterations.max","BabyEfficiencyPane.baby_iterations.step","CandyPane.stockOf_row_pokeId.min","CandyPane.row_start.min","CandyPane.row_start.max","CandyPane.row_target.min","CandyPane.row_target.max","CandyPane.row_use.min","CandyPane.row_remaining.min","CompletionEfficiencyPane.completion_iterations.min","CompletionEfficiencyPane.completion_iterations.max","CompletionEfficiencyPane.completion_iterations.step","EncounterTargetPane.encounter_iterations.min","EncounterTargetPane.encounter_iterations.max","EncounterTargetPane.encounter_iterations.step","SleepPane.plan_sleepScore.min","SleepPane.plan_sleepScore.max","SleepPane.plan_snorlaxStrength.min","SleepPane.researchedBefore.min","SleepPane.researchedBefore.max","SleepPane.firstResearchExtras.min","SleepPane.firstResearchExtras.max","SplitSleepPane.split_strength.min","SplitSleepPane.split_strength.step","SplitSleepPane.split_iterations.min","SplitSleepPane.split_iterations.max","SplitSleepPane.split_iterations.step","SplitSleepPane.target_countWeight.min","SplitSleepPane.target_countWeight.step","SplitSleepPane.target_candyWeight.min","SplitSleepPane.target_candyWeight.step","SplitSleepPane.target_probabilityWeight.min","SplitSleepPane.target_probabilityWeight.step","TrainPane.napDays.min","WhistlePane.whistle_current.min","WhistlePane.whistle_current.step","WhistlePane.whistle_target.min","WhistlePane.whistle_target.step","BoxOverview.overview_area.min","BoxOverview.overview_area.step","OcrCompletionDialog.selections_field.min","EnvironmentFields.extra.min","EnvironmentFields.extra.max","EnvironmentFields.extra.step","PanelFields.level.min","PanelFields.skillLevel.min","MemberEditor.model_level.min","MemberEditor.model_tune_exp.min","ScorePlanPane.score_initial.min","ScorePlanPane.score_initial.step","ScorePlanPane.options_bag_ingredient_name.min","ScorePlanPane.options_bag_ingredient_name.max","ScorePlanPane.options_bag_ingredient_name.step","ScorePlanPane.score_days.min","ScorePlanPane.score_days.max","ScorePlanPane.score_interval.min","ScorePlanPane.score_interval.max","ScorePlanPane.sleep_collectMinutes.min","ScorePlanPane.sleep_collectMinutes.max","ScorePlanPane.sleep_settleDelay.min","ScorePlanPane.sleep_settleDelay.max","ScorePlanPane.score_crit.min","ScorePlanPane.score_crit.max","ScorePlanPane.score_pot.min","ScorePlanPane.score_pot.max","ScorePlanPane.score_zone.min","ScorePlanPane.score_zone.max","ScorePlanPane.score_zone.step","ScorePlanPane.score_juice.min","ScorePlanPane.score_juice.max"]
  if (!requiredRanges.every(path => path.split('.').reduce((value         , key) => object(value)[key], ranges) != null)) throw new Error('输入范围资料不完整')
  for (const fields of Object.values(ranges)) for (const attrs of Object.values(object(fields))) {
    const resolved                         = {}
    for (const [attribute, setting] of Object.entries(object(attrs))) {
      const reference = object(setting)
      let value = typeof setting === 'number' ? setting : Array.isArray(reference.path)
        ? reference.path.reduce((value         , key        ) => object(value)[key], data[reference.file]) : undefined
      if (reference.id != null) value = Array.isArray(value) ? value.find(row => row.id === reference.id)?.[reference.field] : undefined
      if (!['min', 'max', 'step'].includes(attribute) || !finite(value) || attribute === 'step' && !positive(value)) throw new Error('输入范围引用无效')
      resolved[attribute] = value          
    }
    if (resolved.min != null && resolved.max != null && resolved.min > resolved.max) throw new Error('输入上下限顺序无效')
  }
  if (!object(calc.productionRankings).berries || !object(calc.productionRankings).ingredients
    || !object(calc.islandMeta).berrySelectionDescriptions || !finite(object(calc.islandMeta).randomBerryCount)) throw new Error('榜单或岛屿资料不完整')
}
