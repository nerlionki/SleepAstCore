import { createHash } from 'node:crypto';

export const site = 'https://pks.raenonx.cc';
const cdn = 'https://cdn.raenonx.cc/api/content/pks';

export function validateId(id, forms = false) {
  const pattern = forms ? /^[1-9]\d*(?:-[A-Za-z0-9]+)?$/ : /^[1-9]\d*$/;
  if (!pattern.test(id ?? '')) throw new Error('请输入有效的 RAE 编号');
  return id;
}

export async function request(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
  return response;
}

export async function png(sourcePath) {
  const source = `${cdn}?src=${sourcePath}`;
  const bytes = Buffer.from(await (await request(source)).arrayBuffer());
  if (
    bytes.length < 33 ||
    bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    bytes.subarray(12, 16).toString('ascii') !== 'IHDR' ||
    bytes.subarray(-12).toString('hex') !== '0000000049454e44ae426082'
  ) throw new Error(`RAE 未返回完整 PNG ${source}`);
  return {
    bytes,
    source,
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    sha256: createHash('sha256').update(bytes).digest('hex')
  };
}

export function flight(html) {
  const text = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)]
    .map(match => JSON.parse(match[1])).join('');
  if (!text) throw new Error('页面未包含可识别的 RAE 数据');
  return text;
}

function readValue(text, start) {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{' || char === '[') depth++;
    else if ((char === '}' || char === ']') && --depth === 0)
      return JSON.parse(text.slice(start, index + 1));
  }
  throw new Error('RAE 页面数据不完整');
}

export function findRecord(text, key, matches) {
  const marker = JSON.stringify(key) + ':{';
  for (let at = text.indexOf(marker); at >= 0; at = text.indexOf(marker, at + marker.length)) {
    const value = readValue(text, at + marker.length - 1);
    if (matches(value)) return value;
  }
  return undefined;
}
