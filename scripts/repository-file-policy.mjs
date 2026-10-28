import path from 'node:path'

const code = /\.(?:[cm]?[jt]sx?|java|py|rb|go|rs|swift|kt|kts|sh|ps1|psm1|bash|bat|cmd|c|cc|cpp|h|hpp|cs|php|vue|svelte|html)$/i
export function repositoryExclusion(file) {
  const name = path.posix.basename(file)
  if (/\.md$/i.test(name) && name !== 'AGENTS.md') return 'markdown'
  // Test fixtures and data remain distributable, including source-shaped fixtures.
  if (/(?:^|\/)(?:fixtures?|__fixtures__|test[-_]?data)(?:\/|$)/i.test(file)) return null
  if (!code.test(name)) return null
  if (/(?:^|\/)(?:test|tests|__tests__|androidTest)(?:\/|$)/.test(file)
    || /(?:^|[._-])(?:test|spec)(?:[._-]|$)/i.test(name)
    || /^(?:test|spec)(?:[_-]|[A-Z])/.test(name)
    || /(?:Test|Tests|Spec|Specs)\.(?:java|kt|kts|swift|cs|[cm]?[jt]sx?)$/.test(name)) return 'test-code'
  return null
}
