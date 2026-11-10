import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const arch = JSON.parse(await fs.readFile(path.join(root, 'src/catalogs/activity-archive.json'), 'utf8'))
const act = JSON.parse(await fs.readFile(path.join(root, 'src/data/activities.json'), 'utf8'))
const baseline = '17eaae1308a3f06193200c7deda3b4105aa71c24'
const curated = new Set(['good-sleep-day-40', 'halloween-2026', 'meal-prep-vol1-2026', 'new-moon-day-19', 'all-you-can-eat-vol1-2026'])

// 与用户核对一致：rules/phases 内存在除 eventMix=off 外的数值化 effects
const hasNumericEffects = (a) => {
  const walk = (rs) => rs?.some((r) => Object.keys(r.effects || {}).some((k) => k !== 'eventMix' || (r.effects.eventMix && r.effects.eventMix !== 'off')))
  return walk(a.rules) || (a.phases ?? []).some((p) => walk(p.rules))
}

const stats = { 2023: { existing: 0, new: 0, extra: 0 }, 2024: { existing: 0, new: 0, extra: 0 }, 2025: { existing: 0, new: 0, extra: 0 }, 2026: { existing: 0, new: 0, extra: 0 } }
for (const e of act.activities) {
  const y = e.startsOn.slice(0, 4)
  if (!stats[y]) continue
  if (curated.has(e.id)) stats[y].existing++
  else if (arch.events.some((x) => x.id === e.id)) stats[y].new++
  else stats[y].extra++
}

const notInArchive = act.activities.filter((a) => !arch.events.some((e) => e.id === a.id)).map((a) => a.id)
const withNum = act.activities.filter(hasNumericEffects).length
const onlyQualitative = act.activities.length - withNum

let md = `# Pokémon Sleep 历年活动加成补全说明

> 生成时间：2026-11-10（UTC）  
> 仓库基线：\`${baseline}\`  
> activities 版本：\`${act.version}\`

## 总览

| 指标 | 数值 |
| --- | --- |
| activity-archive 活动数 | ${arch.events.length} |
| activities.json 条目 | ${act.activities.length} |
| 档案未覆盖条目（当期已公告） | ${notInArchive.length} |
| 含数值化 rules/phases | ${withNum} |
| 仅定性 / 无数值 rules | ${onlyQualitative} |

## 按年统计

| 年份 | 精校保留 | 自档案新增 | 档案外当期 |
| --- | --- | --- | --- |
`

for (const [y, s] of Object.entries(stats)) {
  md += `| ${y} | ${s.existing} | ${s.new} | ${s.extra} |\n`
}

md += `
## 来源策略（含用户 2026-11-10 授权更新）

1. **official**：pokemonsleep.net 日/英/繁及 Wayback。
2. **wiki**：Bulbapedia 等；机制与日期交叉核对，倍率若仅 Wiki 有则标注非官方。
3. **rae**：event-parameters.json / RaenonX 模拟权重与概率；经 \`sources[].kind=rae\` 与 feature 文案区分。

## 校验

| 检查 | 结果 |
| --- | --- |
| validateActivityCatalog（全量） | 通过 |
| RESOURCE_API_VERSION=2 build + verify | 通过 |
| validate-activity-coverage.mjs | archive 缺口 0 |
| validate-activity-official-cases.mjs | 通过 |
| 客户端全量构建 | 未执行 |

## 档案外活动

`
for (const id of notInArchive) {
  const row = act.activities.find((a) => a.id === id)
  md += `- ${id}（${row.name}）：${row.source}\n`
}

md += `
## 未覆盖摘要

- ${onlyQualitative} 条仍缺少可验证数值（全球进度、幻兽特别概率、仅「中幅/大幅提升」定性等）。
- 历史万圣节等未批量导入 RAE 睡姿 DPR；2026 精校万圣节保留完整 spawns。
- 历史新月日 shiny \`rate\` 为项目 shinyNewMoon 模拟值，非官方。

## 闪光叠加（附件线索）

不同活动异色取最大；EX 与活动 stack 但合成公式未公开——features 分轴记录出现率与异色。
`

const out = '/opt/cursor/artifacts/pokemon-sleep-activity-backfill-2026-11-10.md'
await fs.mkdir(path.dirname(out), { recursive: true })
await fs.writeFile(out, md)
console.log(`Wrote ${out}`)
