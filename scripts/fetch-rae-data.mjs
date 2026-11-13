import { open, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { replaceFile, root } from './rae/files.mjs';
import { mergeRecord } from './rae/merge.mjs';
import { findRecord, flight, request, site, validateId } from './rae/source.mjs';

const usage = '用法：node scripts/fetch-rae-data.mjs <pokemon|meal|ingredient|map|berry|main-skill> <RAE 编号> [项目宝可梦 ID]';
const routes = { pokemon: 'pokedex', meal: 'meal', ingredient: 'ingredient/info', map: 'map', berry: 'berry/info', 'main-skill': 'mainskill/info' };

function extract(kind, id, html) {
  const text = flight(html);
  if (kind === 'ingredient') {
    const ingredient = findRecord(text, 'ingredient', value =>
      String(value.id) === id && Number.isFinite(value.energy));
    if (ingredient) return ingredient;
    const relatedImages = [...new Set(
      [...html.matchAll(/\/images\/ingredient\/(\d+)\.png/g)].map(match => match[1])
    )];
    return {
      detailAvailable: false,
      imageReferenced: relatedImages.includes(id),
      note: '食材详情页未提供可核验的结构化基础能量。可用 meal 查用量，基础能量须另行核对。'
    };
  }

  if (kind === 'meal') return findRecord(text, 'meal', value => String(value.id) === id);
  if (kind === 'berry') return findRecord(text, 'berryData', value => String(value.id) === id);
  if (kind === 'main-skill') return findRecord(text, 'mainSkillData', value => String(value.id) === id);
  if (kind === 'map') return findRecord(text, 'serverData', value => String(value.mapId) === id);

  const page = findRecord(text, 'data', value => String(value.pokemon?.id) === id);
  if (!page) throw new Error('页面找不到对应编号的宝可梦资料');
  const {
    pokemon, pokemonProducingParams, sleepStyleLinkages, sleepStyleBaseDataMap,
    sleepStyleGroupedDataList, berryData, snorlaxDataMap, spoRemapDataMap
  } = page;
  if (!Array.isArray(sleepStyleLinkages) || !sleepStyleBaseDataMap)
    throw new Error('RAE 宝可梦页睡姿字段缺失');

  const names = findRecord(text, 'SleepFace', value => typeof value.onSnorlax === 'string');
  const sleepStyleNames = Object.fromEntries(
    Object.values(sleepStyleBaseDataMap).map(({ i18nKey }) => [i18nKey, names?.[i18nKey] ?? null])
  );
  return {
    pokemon,
    pokemonProducingParams: pokemonProducingParams ?? null,
    productionRatesSettled: pokemonProducingParams?.settled === true,
    sleepStyleLinkages,
    sleepStyleBaseDataMap,
    sleepStyleNames,
    sleepStyleGroupedDataList,
    berryData,
    snorlaxDataMap,
    spoRemapDataMap
  };
}

async function main([kind, rawId, rawTargetId, ...extra]) {
  if (kind === '--help') return console.log(usage);
  if (!Object.hasOwn(routes, kind) || extra.length || (rawTargetId && kind !== 'pokemon')) throw new Error(usage);
  const id = validateId(rawId, kind === 'pokemon');
  const targetId = validateId(rawTargetId ?? id);
  const source = `${site}/zh/${routes[kind]}/${id}`;
  const response = await request(source);
  if (new URL(response.url).pathname !== new URL(source).pathname)
    throw new Error(`RAE 重定向到其他页面 ${response.url}`);
  const html = await response.text();
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  if (!title) throw new Error('RAE 页面没有标题');
  const data = extract(kind, id, html);
  if (!data) throw new Error('页面找不到对应编号的资料');
  const result = { kind, id, targetId, source, fetchedAt: new Date().toISOString(), title, data };
  const file = path.join(root, 'src/data/rae-update-source.json');
  const lockFile = file + '.lock';
  const lock = await open(lockFile, 'wx');
  let merged;
  try {
    const current = JSON.parse(await readFile(file, 'utf8'));
    merged = await mergeRecord(result);
    const records = (current.fetchedRecords ??= {});
    const byId = (records[kind] ??= {});
    byId[id] = result;
    await replaceFile(file, JSON.stringify(current, null, 2) + '\n');
  } finally {
    await lock.close();
    await rm(lockFile, { force: true });
  }
  console.log(JSON.stringify({ file, record: ['fetchedRecords', kind, id], merged }));
  if (merged.skipped) process.exitCode = 2;
}

main(process.argv.slice(2)).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
