import { execFileSync } from 'node:child_process'
import { repositoryExclusion } from './repository-file-policy.mjs'

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
const excluded = files.filter(file => repositoryExclusion(file))
if (excluded.length) {
  console.error('Repository policy: keep these files local only:\n' + excluded.join('\n'))
  process.exitCode = 1
} else console.log('Repository policy verified: AGENTS.md retained; other Markdown and test code excluded.')
