// Generated from PokeSleepAst core/src/resources/activityModel.ts; keep validators in sync.
/** Data-only activity contract. Safe to load before installing a resource snapshot. */
export const ACTIVITY_MODEL_VERSION = 2;
export const ACTIVITY_CAPABILITIES = ['numeric-effects', 'ingredient-effects', 'conditional-recipes', 'scoped-rules', 'phases', 'feature-status'];
export const NUMERIC_ACTIVITY_EFFECTS = {
    helpIntervalMultiplier: 'multiply', berryCountBonus: 'add', berryEnergyMultiplier: 'multiply', ingredientCountBonus: 'add',
    skillRateMultiplier: 'multiply', skillLevelBonus: 'add', skillStrengthMultiplier: 'multiply', potSizeMultiplier: 'multiply',
    cookingEnergyMultiplier: 'multiply', cookingCritBonus: 'add', cookingCritMultiplier: 'multiply', drowsyPowerMultiplier: 'multiply',
    researchExpMultiplier: 'multiply', dreamShardsMultiplier: 'multiply', researchCandyMultiplier: 'multiply', sleepExpMultiplier: 'multiply',
    candyExpMultiplier: 'multiply', candyShardMultiplier: 'multiply', encounterWeightMultiplier: 'multiply',
    carryCapacityBonus: 'add', carryCapacityMultiplier: 'multiply', potCapacityBonus: 'add', mealRecoveryBonus: 'add',
    mealRecoveryMultiplier: 'multiply', skillIngredientMultiplier: 'multiply', skillBerryMultiplier: 'multiply',
    skillDreamShardsMultiplier: 'multiply', skillHealingMultiplier: 'multiply',
};
export const MEMBER_ACTIVITY_FIELDS = new Set([
    'helpIntervalMultiplier', 'berryCountBonus', 'berryEnergyMultiplier', 'ingredientCountBonus', 'skillRateMultiplier', 'skillLevelBonus',
    'skillStrengthMultiplier', 'researchExpMultiplier', 'dreamShardsMultiplier', 'researchCandyMultiplier', 'sleepExpMultiplier',
    'candyExpMultiplier', 'candyShardMultiplier', 'encounterWeightMultiplier', 'carryCapacityBonus', 'carryCapacityMultiplier',
    'fixedIngredientDrops', 'skillIngredientMultiplier', 'skillBerryMultiplier', 'skillDreamShardsMultiplier', 'skillHealingMultiplier',
]);
const categories = ['curry', 'salad', 'dessert'];
const structuredKeys = ['eventMix', 'shinyUp', 'allRecipeCategories', 'fixedIngredientDrops', 'extraIngredientEnergyMultipliers', 'recipeEnergyModifiers', 'availableRecipeCategories', 'favoredBerries'];
const object = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
function requireValid(condition, message = '活动资料结构或功能不兼容') { if (!condition)
    throw new Error(message); }
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const date = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const keys = (value, allowed) => requireValid(Object.keys(value).every(key => allowed.includes(key)));
const strings = (value) => Array.isArray(value) && value.length > 0 && value.every(item => typeof item === 'string' && item.length > 0) && new Set(value).size === value.length;
const ids = (value) => Array.isArray(value) && value.length > 0 && value.every(item => Number.isSafeInteger(item) && item > 0) && new Set(value).size === value.length;
const weekdays = (value) => Array.isArray(value) && value.length > 0 && value.every(day => Number.isInteger(day) && day >= 0 && day <= 6);
export function validateActivityEffects(value) {
    requireValid(object(value));
    keys(value, [...Object.keys(NUMERIC_ACTIVITY_EFFECTS), ...structuredKeys]);
    for (const [key, number] of Object.entries(value)) {
        if (key in NUMERIC_ACTIVITY_EFFECTS) {
            requireValid(finite(number) && number >= (['helpIntervalMultiplier', 'potSizeMultiplier', 'carryCapacityMultiplier', 'cookingCritMultiplier', 'drowsyPowerMultiplier', 'candyExpMultiplier'].includes(key) ? 0.01 : 0) && number <= 10000);
            if (key === 'skillLevelBonus')
                requireValid(Number.isInteger(number));
            if (key === 'cookingCritBonus')
                requireValid(number <= 1);
        }
    }
    if ('eventMix' in value)
        requireValid(['off', 'some', 'all'].includes(String(value.eventMix)));
    for (const key of ['shinyUp', 'allRecipeCategories'])
        if (key in value)
            requireValid(typeof value[key] === 'boolean');
    for (const key of ['fixedIngredientDrops', 'extraIngredientEnergyMultipliers'])
        if (key in value) {
            const map = value[key];
            requireValid(object(map) && Object.keys(map).length > 0);
            requireValid(Object.entries(map).every(([name, amount]) => name.length > 0 && !['__proto__', 'constructor', 'prototype'].includes(name) && finite(amount) && amount >= 0 && amount <= 10000 && (key !== 'fixedIngredientDrops' || Number.isInteger(amount))));
        }
    if ('availableRecipeCategories' in value)
        requireValid(strings(value.availableRecipeCategories) && value.availableRecipeCategories.every(category => categories.includes(category)));
    if ('favoredBerries' in value)
        requireValid(strings(value.favoredBerries) && value.favoredBerries.length <= 3);
    if ('recipeEnergyModifiers' in value) {
        requireValid(Array.isArray(value.recipeEnergyModifiers) && value.recipeEnergyModifiers.length > 0);
        const seen = new Set();
        for (const rule of value.recipeEnergyModifiers) {
            requireValid(object(rule));
            keys(rule, ['id', 'ingredientNames', 'recipeNames', 'categories', 'multiplier']);
            requireValid(typeof rule.id === 'string' && rule.id.length > 0 && !seen.has(rule.id));
            seen.add(rule.id);
            requireValid(finite(rule.multiplier) && rule.multiplier >= 0 && rule.multiplier <= 10000);
            requireValid(['ingredientNames', 'recipeNames', 'categories'].some(key => key in rule));
            for (const key of ['ingredientNames', 'recipeNames', 'categories'])
                if (key in rule)
                    requireValid(strings(rule[key]) && (key !== 'categories' || rule[key].every(category => categories.includes(category))));
        }
    }
}
/** The same validator is transpiled to SleepAstCore's build/verify boundary. */
export function validateActivityCatalog(value, data) {
    requireValid(object(value));
    keys(value, ['schemaVersion', 'modelVersion', 'requiredCapabilities', 'version', 'activities']);
    requireValid((value.schemaVersion === 1 || value.schemaVersion === 2) && typeof value.version === 'string' && value.version.length > 0 && Array.isArray(value.activities));
    if (value.schemaVersion === 2)
        requireValid(value.modelVersion === ACTIVITY_MODEL_VERSION && Array.isArray(value.requiredCapabilities) && value.requiredCapabilities.every(capability => ACTIVITY_CAPABILITIES.includes(capability)));
    const rows = (name) => (Array.isArray(data?.[name]) ? data[name] : []);
    const pokeIds = new Set(rows('pokedex.json').map(row => row.id)), islandIds = new Set(rows('islands.json').map(row => row.id));
    const announced = object(data?.['meta.json']) && object(data['meta.json'].announcedContent) ? data['meta.json'].announcedContent : {};
    const announcedRows = (key) => (Array.isArray(announced[key]) ? announced[key] : []);
    if (data)
        for (const ingredient of rows('ingredients.json'))
            requireValid(Number.isSafeInteger(ingredient.id) && typeof ingredient.name === 'string' && finite(ingredient.energy) && ingredient.energy >= 0, '完整食材目录不能包含未公布能量；请放入公告资料');
    if (data)
        for (const kind of ['ingredients', 'recipes', 'pokemon'])
            for (const row of announcedRows(kind)) {
                if ('imageFile' in row)
                    requireValid(typeof row.imageFile === 'string' && /^(ingredient|meal|pokemon\/(icons|portrait))\/[\w.-]+\.webp$/.test(row.imageFile) && !row.imageFile.includes('..'), '公告图片必须使用资源包中的固定相对路径');
                if (kind === 'pokemon' && row.runtimeId == null)
                    requireValid(Number.isSafeInteger(row.nationalDex) || Number.isSafeInteger(row.imageId), '未公布宝可梦必须提供稳定图鉴展示编号');
            }
    if (data)
        for (const recipe of rows('recipes.json')) {
            requireValid(typeof recipe.name === 'string' && finite(recipe.baseEnergy) && recipe.baseEnergy >= 0 && finite(recipe.bonus) && recipe.bonus >= 0 && Number.isInteger(recipe.pot) && Number(recipe.pot) >= 0 && Array.isArray(recipe.ingredients), '完整食谱目录不能包含未公布数值；请放入公告资料');
            requireValid(recipe.ingredients.every(ingredient => object(ingredient) && typeof ingredient.name === 'string' && Number.isInteger(ingredient.count) && Number(ingredient.count) > 0));
        }
    const ingredientNames = new Set([...rows('ingredients.json'), ...announcedRows('ingredients')].map(row => row.name));
    const berryNames = new Set(rows('berries.json').map(row => row.name));
    const pokemonNames = new Set([...rows('pokedex.json'), ...announcedRows('pokemon')].map(row => row.name));
    const skillTables = data?.['skill-tables.json'];
    const skillIds = new Set((skillTables?.modules?.mainSkills?.MAIN_SKILLS ?? []).map(row => row.id));
    const recipeNames = new Set([...rows('recipes.json'), ...announcedRows('recipes')].map(row => row.name).filter(name => typeof name === 'string'));
    const unique = new Set();
    function phase(phase, parent) {
        requireValid(object(phase) && date(phase.startsOn) && date(phase.endsOn) && phase.startsOn < phase.endsOn && Array.isArray(phase.rules));
        if (parent)
            requireValid(phase.startsOn >= String(parent.startsOn) && phase.endsOn <= String(parent.endsOn));
        if ('weekdays' in phase)
            requireValid(weekdays(phase.weekdays));
        for (const rule of phase.rules) {
            requireValid(object(rule));
            keys(rule, ['target', 'effects', 'firstResearchOnly', 'conditions']);
            validateActivityEffects(rule.effects);
            if ('firstResearchOnly' in rule)
                requireValid(typeof rule.firstResearchOnly === 'boolean');
            if ('target' in rule) {
                const target = rule.target;
                requireValid(object(target));
                keys(target, ['islands', 'pokemonIds', 'pokemonNames', 'types', 'specialties', 'skillIds', 'skillFamilies']);
                for (const [key, values] of Object.entries(target)) {
                    requireValid(key === 'pokemonIds' || key === 'skillIds' ? ids(values) : strings(values));
                    if (data)
                        requireValid(values.every(item => key === 'islands' ? islandIds.has(item) : key === 'pokemonIds' ? pokeIds.has(item) : key === 'pokemonNames' ? pokemonNames.has(item) : key === 'skillIds' ? typeof item === 'number' && skillIds.has(item) : true));
                }
                if (['pokemonIds', 'pokemonNames', 'types', 'specialties', 'skillIds', 'skillFamilies'].some(key => key in target))
                    requireValid(Object.keys(rule.effects).every(key => MEMBER_ACTIVITY_FIELDS.has(key)));
            }
            if ('conditions' in rule) {
                requireValid(object(rule.conditions));
                keys(rule.conditions, ['teamPokemonIdsAny', 'weekdays']);
                if ('teamPokemonIdsAny' in rule.conditions)
                    requireValid(ids(rule.conditions.teamPokemonIdsAny) && (!data || rule.conditions.teamPokemonIdsAny.every(id => pokeIds.has(id))));
                if ('weekdays' in rule.conditions)
                    requireValid(weekdays(rule.conditions.weekdays));
            }
            if (data) {
                for (const map of [rule.effects.fixedIngredientDrops, rule.effects.extraIngredientEnergyMultipliers])
                    if (map)
                        requireValid(Object.keys(map).every(name => ingredientNames.has(name)));
                for (const modifier of rule.effects.recipeEnergyModifiers ?? []) {
                    if (modifier.ingredientNames)
                        requireValid(modifier.ingredientNames.every(name => ingredientNames.has(name)));
                    if (modifier.recipeNames)
                        requireValid(modifier.recipeNames.every(name => recipeNames.has(name)));
                }
                if (rule.effects.favoredBerries)
                    requireValid(rule.effects.favoredBerries.every(name => berryNames.has(name)));
            }
        }
        if ('spawns' in phase) {
            requireValid(Array.isArray(phase.spawns));
            const seen = new Set();
            for (const row of phase.spawns) {
                requireValid(object(row) && Number.isSafeInteger(row.id) && Number.isSafeInteger(row.pokeId) && (!data || pokeIds.has(row.pokeId)) && typeof row.island === 'string' && (!data || islandIds.has(row.island)) && Number.isInteger(row.stars) && Number(row.stars) >= 1 && Number(row.stars) <= 5 && finite(row.dpr) && row.dpr >= 0 && typeof row.dprSource === 'string' && typeof row.name === 'string' && typeof row.sleepType === 'string' && typeof row.styleName === 'string' && Number.isInteger(row.unlockRank) && Number(row.unlockRank) >= 0 && Number(row.unlockRank) <= 34 && row.limited !== true && (row.styleId == null || Number.isSafeInteger(row.styleId)));
                const key = `${row.island}:${row.pokeId}:${row.stars}:${row.styleId ?? ''}`;
                requireValid(!seen.has(key));
                seen.add(key);
            }
        }
    }
    for (const event of value.activities) {
        requireValid(object(event));
        keys(event, ['id', 'name', 'source', 'sources', 'priority', 'stacking', 'startsOn', 'endsOn', 'weekdays', 'rules', 'phases', 'spawns', 'miniCandyBoost', 'favoriteBerries', 'features', 'tutorialEligible']);
        requireValid(typeof event.id === 'string' && event.id.length > 0 && !unique.has(event.id) && typeof event.name === 'string' && event.name.length > 0 && typeof event.source === 'string' && event.source.length > 0 && Number.isSafeInteger(event.priority) && (event.stacking == null || event.stacking === 'max'));
        if ('sources' in event) {
            requireValid(Array.isArray(event.sources) && event.sources.length > 0);
            for (const row of event.sources) {
                requireValid(object(row));
                keys(row, ['kind', 'url', 'note']);
                requireValid(['official', 'rae', 'wiki'].includes(String(row.kind)) && typeof row.url === 'string' && row.url.length > 0 && (row.note == null || typeof row.note === 'string'));
            }
        }
        if ('tutorialEligible' in event)
            requireValid(typeof event.tutorialEligible === 'boolean');
        unique.add(event.id);
        phase(event);
        if ('phases' in event) {
            requireValid(Array.isArray(event.phases));
            for (const p of event.phases) {
                requireValid(object(p));
                keys(p, ['startsOn', 'endsOn', 'weekdays', 'rules', 'spawns']);
                phase(p, event);
            }
        }
        if ('miniCandyBoost' in event) {
            const b = event.miniCandyBoost;
            requireValid(object(b));
            keys(b, ['exp', 'shards', 'dailyLimit']);
            requireValid(['exp', 'shards', 'dailyLimit'].every(key => finite(b[key]) && Number(b[key]) > 0) && Number.isInteger(b.dailyLimit));
        }
        if ('favoriteBerries' in event) {
            requireValid(object(event.favoriteBerries));
            requireValid(Object.entries(event.favoriteBerries).every(([island, berry]) => typeof berry === 'string' && (!data || islandIds.has(island) && berryNames.has(berry))));
        }
        if ('features' in event) {
            requireValid(Array.isArray(event.features));
            const seen = new Set();
            for (const feature of event.features) {
                requireValid(object(feature));
                keys(feature, ['id', 'name', 'status', 'domains', 'description', 'source', 'islands', 'parameters']);
                requireValid(typeof feature.id === 'string' && feature.id.length > 0 && !seen.has(feature.id));
                seen.add(feature.id);
                requireValid(typeof feature.name === 'string' && typeof feature.description === 'string' && typeof feature.source === 'string' && ['informational', 'requires-input', 'unsupported'].includes(String(feature.status)));
                requireValid(strings(feature.domains) && feature.domains.every(domain => ['production', 'cooking', 'research', 'candy', 'capture', 'globalProgress'].includes(domain)));
                if ('islands' in feature)
                    requireValid(strings(feature.islands) && (!data || feature.islands.every(id => islandIds.has(id))));
                if ('parameters' in feature)
                    requireValid(object(feature.parameters));
                if (feature.id === 'shiny-boost' && object(feature.parameters) && ('rate' in feature.parameters || 'pokemonIds' in feature.parameters)) {
                    const { rate, pokemonIds } = feature.parameters;
                    requireValid(finite(rate) && rate >= 0 && rate <= 1 && feature.domains.includes('research'), '活动闪光模拟概率无效');
                    if (pokemonIds !== undefined)
                        requireValid(ids(pokemonIds) && (!data || pokemonIds.every(id => pokeIds.has(id))), '活动闪光物种引用无效');
                }
            }
        }
    }
}
