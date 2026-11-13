import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { replaceFile, root } from './files.mjs';

const tables = {
  ingredient: 'ingredients', berry: 'berries', meal: 'recipes',
  pokemon: 'pokedex', map: 'encounter-bands', 'main-skill': 'skill-tables'
};
const mapIds = {
  1: 'greengrass', 2: 'cyan', 3: 'taupe', 4: 'snowdrop',
  5: 'lapis'
};
const positive = value => Number.isSafeInteger(value) && value > 0;
const nonnegative = value => Number.isSafeInteger(value) && value >= 0;
const dataPath = name => path.join(root, 'src/data', name + '.json');

async function patchFor(kind, id, row, data) {
  if (kind === 'ingredient') {
    if (!positive(data.energy) || !nonnegative(data.price)) return null;
    return { energy: data.energy, shards: data.price };
  }
  if (kind === 'berry') {
    if (data.isEvent !== false || !Array.isArray(data.energy)) return null;
    const energyLv1 = data.energy.find(level => level.lv === 1)?.energy;
    const energyHigh = data.energy.find(level => level.lv === 70)?.energy;
    if (!positive(energyLv1) || !positive(energyHigh)) return null;
    return { energyLv1, energyHigh };
  }
  if (kind === 'pokemon') {
    const pokemon = data.pokemon;
    const patch = {};
    if (positive(pokemon.stats?.maxCarry)) patch.carry = pokemon.stats.maxCarry;
    if (positive(pokemon.stats?.friendshipPoints)) patch.friendship = pokemon.stats.friendshipPoints;
    if (positive(pokemon.medalGroup)) patch.medalGroup = pokemon.medalGroup;
    if (positive(pokemon.serverSideData?.helpFrequencyBaseSec))
      patch.interval = pokemon.serverSideData.helpFrequencyBaseSec;
    const rates = data.pokemonProducingParams;
    if (data.productionRatesSettled && rates?.settled === true && String(rates.pokemonId) === id) {
      if (Number.isFinite(rates.ingredientSplit) && rates.ingredientSplit >= 0 && rates.ingredientSplit <= 1)
        patch.ingredientRate = rates.ingredientSplit;
      if (Number.isFinite(rates.skillPercent) && rates.skillPercent >= 0 && rates.skillPercent <= 100)
        patch.skillRate = rates.skillPercent / 100;
    }
    return patch;
  }
  if (kind === 'meal') {
    // Recipe strength and bonus are coupled. Preserve the existing recipe when the source disagrees.
    if (row.mix || !positive(data.baseStrength) || data.ingredientCount !== row.pot ||
        !Array.isArray(data.ingredients) || data.ingredients.length !== row.ingredients.length ||
        !row.ingredients.every(item => data.ingredients.some(source =>
          source.id === item.id && source.quantity === item.count))) return null;
    const ingredients = JSON.parse(await readFile(dataPath('ingredients'), 'utf8'));
    const rawEnergy = row.ingredients.reduce((sum, item) =>
      sum + item.count * ingredients.find(ingredient => ingredient.id === item.id)?.energy, 0);
    const bonus = Math.round((data.baseStrength / rawEnergy - 1) * 100) / 100;
    return data.baseStrength === row.baseEnergy || bonus === row.bonus
      ? { baseEnergy: data.baseStrength } : null;
  }
  if (kind === 'main-skill') {
    if (!positive(data.maxLevel) || data.maxLevel !== row.levels?.length) return null;
    const patch = { maxLevel: data.maxLevel };
    const effects = row.model?.effects;
    if (effects?.length !== 2) return patch;
    const pot = effects.find(effect => effect.op === 'pot')?.amount;
    const crit = effects.find(effect => effect.op === 'crit')?.amount;
    if (!pot || !crit || crit.percent !== true || row.columns.length !== 2) return patch;
    const potColumn = row.columns.indexOf(pot.column);
    const critColumn = row.columns.indexOf(crit.column);
    if (potColumn < 0 || critColumn < 0 || potColumn === critColumn) return patch;
    const capacities = data.effect?.cookingPotExpansion?.byLevel;
    const rates = data.effect?.cookingCritRate?.byLevel;
    if (capacities?.length !== data.maxLevel || rates?.length !== data.maxLevel) return patch;
    const levels = row.levels.map((level, index) => {
      const capacity = capacities.find(entry => entry.level === index + 1)?.data?.capacity;
      const rate = rates.find(entry => entry.level === index + 1)?.data?.successRate;
      if (!nonnegative(capacity) || !Number.isFinite(rate) || rate < 0 || rate > 1) return null;
      const next = [...level];
      next[potColumn] = String(capacity);
      next[critColumn] = `${Number((rate * 100).toFixed(8))}%`;
      return next;
    });
    if (levels.every(Boolean)) patch.levels = levels;
    return patch;
  }
  return null;
}

export async function mergeRecord({ kind, id, targetId, data }) {
  const file = dataPath(tables[kind]);
  const table = JSON.parse(await readFile(file, 'utf8'));
  if (data.detailAvailable === false)
    return { file, skipped: 'RAE 尚未提供匹配的资料' };

  if (kind === 'map') {
    const key = mapIds[id];
    const bands = data.mapServerSideData?.spawnCounts;
    if (!key || !Object.hasOwn(table, key) || !Array.isArray(bands) ||
        bands.length !== table[key].length || !bands.every(({ count, range }, index) =>
          count === table[key][index].count && nonnegative(range?.start) &&
          (nonnegative(range.end) && range.end >= range.start ||
            index === bands.length - 1 && range.end === '$Infinity')))
      return { file, skipped: '地图或出现数量档位无法完整对应' };
    const next = bands.map(({ count, range }) => ({
      count, min: range.start, max: range.end === '$Infinity' ? null : range.end
    }));
    const fields = JSON.stringify(next) === JSON.stringify(table[key]) ? [] : [key];
    if (fields.length) {
      table[key] = next;
      await replaceFile(file, JSON.stringify(table, null, 2) + '\n');
    }
    return { file, fields };
  }

  const rows = kind === 'main-skill' ? table.modules.mainSkills.MAIN_SKILLS : table;
  const row = rows.find(item => String(item.id) === targetId);
  if (!row) return { file, skipped: '正式表没有对应编号，需要先核对新增条目的完整字段及生效条件' };
  const patch = await patchFor(kind, id, row, data);
  if (!patch) return { file, skipped: '来源字段与正式表无法安全合并' };
  const fields = Object.keys(patch).filter(key => JSON.stringify(row[key]) !== JSON.stringify(patch[key]));
  if (fields.length) {
    Object.assign(row, patch);
    await replaceFile(file, JSON.stringify(table, null, 2) + '\n');
  }
  return { file, fields };
}
