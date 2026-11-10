/**
 * Fetch official / Wayback activity announcement HTML and extract machine-readable hints.
 * Output is evidence for human review and build-historical-activities.mjs — not auto-truth.
 */
import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const archive = JSON.parse(await fs.readFile(path.join(root, 'src/catalogs/activity-archive.json'), 'utf8'))
const outDir = path.join(root, 'src/data/activity-source-harvest')
await fs.mkdir(outDir, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&times;/g, '×')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractMultipliers(text) {
  const patterns = [
    /Drowsy Power\s*[×x]\s*([\d.]+)/gi,
    /睡意之力\s*[×x]\s*([\d.]+)/gi,
    /眠りのパワー\s*[×x]\s*([\d.]+)/gi,
    /Pokémon Sleep EXP\s*[×x]\s*([\d.]+)/gi,
    /寶可夢睡眠\s*EXP\s*[×x]\s*([\d.]+)/gi,
    /ポケモンスリープ\s*EXP\s*[×x]\s*([\d.]+)/gi,
    /Sleep EXP\s*[×x]\s*([\d.]+)/gi,
    /夢之碎片\s*(?:收穫量)?\s*[×x]\s*([\d.]+)/gi,
    /Dream Shards?\s*(?:received)?\s*[×x]\s*([\d.]+)/gi,
    /夢の欠片\s*[×x]\s*([\d.]+)/gi,
    /研究糖果\s*[×x]\s*([\d.]+)/gi,
    /Research Candy\s*[×x]\s*([\d.]+)/gi,
    /リサーチキャンディ\s*[×x]\s*([\d.]+)/gi,
    /multiplied by\s*([\d.]+)/gi,
    /(\d+(?:\.\d+)?)\s*倍/g,
  ]
  const hits = []
  for (const re of patterns) {
    let m
    while ((m = re.exec(text)) !== null) {
      const n = Number(m[1])
      if (Number.isFinite(n) && n > 0 && n <= 100) hits.push({ raw: m[0], value: n })
    }
  }
  return hits
}

function flags(text) {
  const lower = text.toLowerCase()
  return {
    shinyMention: /shiny|色違い|异色|異色|闪光/.test(text),
    shinyQualitativeOnly: /shiny|色違い|异色|異色|闪光/.test(text)
      && !/(\d+(?:\.\d+)?)\s*%/.test(text)
      && !/rate\s*(?:of|:)\s*[\d.]/.test(lower),
    specialAppearance: /special appearance|特別出現|特别出现|特别机率|特別出現率/i.test(text),
    eventMixSome: /event\s+mix|活動混合|活动混合|イベントミックス/i.test(text),
    encounterUp: /encounter rate|出現率|出现率|遇見機率|遇见概率/i.test(text),
    firstResearchOnly: /first research|首次研究|最初のリサーチ/i.test(text),
  }
}

async function fetchUrl(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 45000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'SleepAstCore-activity-harvest/1.0 (+official-source-index)',
        accept: 'text/html,*/*',
      },
      redirect: 'follow',
    })
    const html = await res.text()
    return { ok: res.ok, status: res.status, html, finalUrl: res.url }
  } finally {
    clearTimeout(timer)
  }
}

const index = []
let failures = 0
for (const [i, event] of archive.events.entries()) {
  const id = event.id
  let result
  try {
    result = await fetchUrl(event.source)
  } catch (error) {
    failures++
    index.push({ id, source: event.source, fetchError: String(error), multiplierHits: [], flags: {} })
    await sleep(300)
    continue
  }
  const text = stripHtml(result.html)
  const entry = {
    id,
    source: event.source,
    fetchedFrom: result.finalUrl,
    httpStatus: result.status,
    textLength: text.length,
    textSample: text.slice(0, 4000),
    multiplierHits: extractMultipliers(text),
    flags: flags(text),
    shellPage: text.length < 800 && /Official Webpage/i.test(result.html),
  }
  index.push(entry)
  await fs.writeFile(path.join(outDir, `${id}.json`), JSON.stringify(entry, null, 2))
  if ((i + 1) % 10 === 0) process.stderr.write(`Harvested ${i + 1}/${archive.events.length}\n`)
  await sleep(250)
}

await fs.writeFile(path.join(outDir, '_index.json'), JSON.stringify({
  harvestedOn: new Date().toISOString().slice(0, 10),
  events: index.length,
  failures,
  entries: index.map(({ id, httpStatus, shellPage, textLength, multiplierHits, flags: f }) => ({
    id, httpStatus, shellPage, textLength,
    multiplierCount: multiplierHits.length,
    shinyMention: f.shinyMention,
  })),
}, null, 2))
console.log(`Wrote ${index.length} harvest files to ${outDir} (${failures} fetch errors)`)
