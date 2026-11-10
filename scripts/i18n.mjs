const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value)
const placeholders = value => [...new Set(value.match(/\{\w+\}/g) ?? [])].sort().join()

export function validateI18n(catalog) {
  if (!isRecord(catalog) || catalog.schemaVersion !== 1 || !isRecord(catalog.locales)) {
    throw Error('Invalid localization catalog')
  }
  if (catalog.aliases !== undefined && (!isRecord(catalog.aliases) || Object.values(catalog.aliases).some(value => typeof value !== 'string' || !value.trim()))) {
    throw Error('Invalid localization aliases')
  }
  for (const [language, dictionary] of Object.entries(catalog.locales)) {
    if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/.test(language) || !isRecord(dictionary?.messages)) {
      throw Error('Invalid localization language: ' + language)
    }
    for (const [key, value] of Object.entries(dictionary.messages)) {
      if (!/\p{Script=Han}/u.test(key) || typeof value !== 'string' || !value.trim() || placeholders(key) !== placeholders(value)) {
        throw Error('Invalid translation: ' + key)
      }
    }
  }
  return catalog
}
