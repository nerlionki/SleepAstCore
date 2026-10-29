import fs from 'node:fs'
const catalog = JSON.parse(fs.readFileSync(new URL('../test-data/mock-catalog.json', import.meta.url), 'utf8'))
export const testMockVersion = catalog.resourceVersion
export function applyTestMocks(data) {
  const dex = data['pokedex.json']
  const ingredients = data['ingredients.json']
  const recipes = data['recipes.json']
  const images = data['compatibility-maps.json'].modules.raeImage
  const growth = data['growth-meta.json']
  const nut = structuredClone(catalog.ingredient)
  if (ingredients.some(item => item.id === nut.id || item.name === nut.name)) throw Error('Mock ingredient conflicts with source data')
  ingredients.push(nut)
  for (const mock of catalog.pokemon) {
    if (dex.some(item => item.id === mock.id)) throw Error(`Mock Pokemon conflicts with source data: ${mock.id}`)
    const template = dex.find(item => item.id === mock.templateId)
    if (!template) throw Error(`Missing mock template: ${mock.templateId}`)
    const poke = { ...structuredClone(template), id: mock.id, name: mock.name, formKey: mock.name, mock: true }
    if (mock.specialty) poke.specialty = mock.specialty
    if (mock.skillTemplateId) poke.mainSkill = dex.find(item => item.id === mock.skillTemplateId).mainSkill
    // Keep the all-rounder's complete ingredient table; normal specialists retain
    // their three-slot structure. All mock Pokemon can produce the new ingredient.
    poke.ingredients[0] = { id: nut.id, name: nut.name, amounts: [...poke.ingredients[0].amounts] }
    dex.push(poke)
    data['pokemon-en.json'][mock.id] = mock.en
    images.POKEMON_FILE[mock.id] = images.POKEMON_FILE[mock.templateId] ?? String(mock.templateId)
    data['evolution.json'][mock.id] = { prev: mock.prev ?? 0, next: mock.next ? [[mock.next, [['candy', 40], ['level', 15]]]] : [] }
    data['evolution-left.json'][mock.id] = mock.next ? 1 : 0
    growth.expType[mock.id] = growth.expType[mock.templateId]
    growth.family[mock.id] = `mock-${mock.prev ?? mock.id}`
    if (mock.next) growth.evolve[mock.id] = [15]
    if (poke.specialty === '全部') data['mythical.json'][mock.id] = { firstIngredient: nut.name, appear: '测试源 MOCK 占位数据' }
  }
  for (const mock of catalog.recipes) {
    if (recipes.some(item => item.name === mock.name)) throw Error(`Mock recipe conflict: ${mock.name}`)
    const second = ingredients.find(item => item.id === 5)
    const components = [{ id: nut.id, name: nut.name, count: 10 }, { id: second.id, name: second.name, count: 5 }]
    const base = components.reduce((sum, item) => sum + ingredients.find(ingredient => ingredient.id === item.id).energy * item.count, 0)
    recipes.push({ name: mock.name, category: mock.category, pot: 15, baseEnergy: Math.round(base * 1.2), bonus: 0.2, mix: false, ingredients: components, mock: true })
    images.MEAL_ID[mock.name] = mock.imageId
  }
  data['meta.json'].testMock = { version: testMockVersion, description: catalog.description, pokemon: catalog.pokemon.map(({ id, name }) => ({ id, name })), ingredients: [nut.name], recipes: catalog.recipes.map(item => item.name) }
}
export function addTestMockImages(assets) {
  const aliases = { [`images/ingredient/${catalog.ingredient.id}.webp`]: 'images/ingredient/19.webp' }
  for (const recipe of catalog.recipes) aliases[`images/meal/${recipe.imageId}.webp`] = `images/meal/${recipe.imageTemplateId}.webp`
  for (const [alias, source] of Object.entries(aliases)) {
    if (!assets[source] || assets[alias]) throw Error(`Invalid mock image alias: ${alias}`)
    assets[alias] = { ...assets[source] }
  }
}
