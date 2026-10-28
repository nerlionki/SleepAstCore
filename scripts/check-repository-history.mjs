import { execFileSync } from 'node:child_process'
import { repositoryExclusion } from './repository-file-policy.mjs'

const all = process.argv.includes('--all')
let input = ''
if (!all) for await (const chunk of process.stdin) input += chunk
const commits = all ? ['--all'] : [...new Set(input.trim().split('\n').filter(Boolean).map(line => line.split(/\s+/)[1]).filter(hash => hash && !/^0+$/.test(hash)))]
const excluded = new Set()
for (const commit of commits) {
  const paths = execFileSync('git', ['log', commit, '--format=', '--name-only', '-z', '--no-renames'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').map(file => file.replace(/^\n+|\n+$/g, '')).filter(Boolean)
  for (const file of paths) if (repositoryExclusion(file)) excluded.add(file)
}
if (excluded.size) {
  console.error('Repository history contains local-only files; migrate the old history before pushing:\n' + [...excluded].sort().join('\n'))
  process.exitCode = 1
} else console.log('Repository history policy verified.')
