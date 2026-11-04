import { spawnSync } from 'node:child_process'
import path from 'node:path'
const command = process.argv[2]
if (!['build', 'verify'].includes(command)) throw new Error('Expected build or verify')
const result = spawnSync(process.execPath, [path.join(import.meta.dirname, `${command}.mjs`), ...process.argv.slice(3)], {
  stdio: 'inherit', env: { ...process.env, RESOURCE_API_VERSION: '2' },
})
if (result.error) throw result.error
process.exitCode = result.status ?? 1
