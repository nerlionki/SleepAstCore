/** OCR display-name catalog is derived from maintained pokedex names, never model class indices. */
export function createOcrNameCatalog(pokedex) {
  if (!Array.isArray(pokedex) || !pokedex.length) throw Error('OCR names require a nonempty pokedex')
  const pokemonNames = {}
  for (const pokemon of pokedex) {
    const id = String(pokemon.id)
    if (!Number.isInteger(pokemon.id) || typeof pokemon.name !== 'string' || !pokemon.name.trim() || pokemonNames[id]) throw Error('Invalid or duplicate OCR species name: ' + id)
    pokemonNames[id] = pokemon.name
  }
  return { schemaVersion: 1, pokemonNames, characters: [...new Set(Object.values(pokemonNames).join(''))].sort().join('') }
}

export function installOcrNameCatalog(data) {
  const maps = data['compatibility-maps.json']
  if (!maps?.modules) throw Error('OCR names require compatibility maps')
  maps.modules.ocrNameCompletion = createOcrNameCatalog(data['pokedex.json'])
}

export function validateOcrNameCatalog(data) {
  const actual = data['compatibility-maps.json']?.modules?.ocrNameCompletion
  const expected = createOcrNameCatalog(data['pokedex.json'])
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error('OCR name catalog differs from maintained pokedex names')
}
