import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { png, validateId } from './rae/source.mjs';
import { replaceFile, root } from './rae/files.mjs';

const usage = '用法：node scripts/fetch-rae-images.mjs <pokemon|meal|ingredient|berry|main-skill> <RAE 编号> [项目资源 ID]';
const kinds = {
  pokemon: ['pokemon/icons', 'pokemon/portrait', 'pokemon/icons/shiny', 'pokemon/portrait/shiny'],
  meal: ['meal/portrait'],
  ingredient: ['ingredient'],
  berry: ['berry'],
  'main-skill': ['mainSkill/icon']
};
const targetFolders = { 'meal/portrait': 'meal', 'mainSkill/icon': 'mainSkill' };

function loadSharp() {
  const require = createRequire(import.meta.url);
  const clientRequire = createRequire(new URL('../../PokeSleepAst/app/package.json', import.meta.url));
  for (const resolve of [require, clientRequire]) {
    let modulePath;
    try {
      modulePath = resolve.resolve('sharp');
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error;
      continue;
    }
    return resolve(modulePath);
  }
  throw new Error('需要 sharp。请安装 SleepAstCore 的本地 sharp，或使用相邻 PokeSleepAst 已安装的 App 依赖。');
}

async function main([kind, rawId, rawTargetId, ...extra]) {
  if (kind === '--help') return console.log(usage);
  if (!Object.hasOwn(kinds, kind) || extra.length) throw new Error(usage);
  const id = validateId(rawId, kind === 'pokemon');
  const targetId = validateId(rawTargetId ?? id);
  const sharp = loadSharp();
  const assets = [];
  const missing = [];
  for (const folder of kinds[kind]) {
    const sourcePath = `/images/${folder}/${id}.png`;
    let original;
    try {
      original = await png(sourcePath);
    } catch (error) {
      if (!error.message.startsWith('HTTP 404 ')) throw error;
      missing.push({ sourcePath, reason: error.message });
      continue;
    }
    const { bytes, source, width, height, sha256 } = original;
    const file = `src/assets/imgs/${targetFolders[folder] ?? folder}/${targetId}.webp`;
    const image = sharp(bytes);
    if (kind === 'pokemon') image.resize({ width: folder.startsWith('pokemon/icons') ? 128 : 256 });
    assets.push({ file, bytes: await image.webp({ lossless: true }).toBuffer(), source, sourceWidth: width, sourceHeight: height, sourceSha256: sha256 });
  }

  const images = [];
  for (const { file, bytes, ...metadata } of assets) {
    const destination = path.join(root, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await replaceFile(destination, bytes);
    images.push({ file, ...metadata });
  }
  console.log(JSON.stringify({ kind, id, targetId, images, missing }, null, 2));
  if (missing.length) process.exitCode = 2;
}

main(process.argv.slice(2)).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
