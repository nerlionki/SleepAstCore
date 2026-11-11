// Mirrors the client activity archive validator.
const bonusGroups = new Set(['energy', 'candy', 'research', 'sleep', 'ingredient', 'helper']);
const bonusFields = new Set(['drowsyPowerMultiplier', 'sleepExpMultiplier', 'researchCandyMultiplier', 'eventMix', 'dreamShardsMultiplier', 'skillRateMultiplier', 'ingredientCountBonus', 'skillLevelBonus', 'cookingEnergyMultiplier', 'potSizeMultiplier', 'mealRecoveryBonus', 'berryCountBonus', 'skillIngredientMultiplier', 'researchExpMultiplier', 'skillDreamShardsMultiplier', 'carryCapacityBonus', 'carryCapacityMultiplier', 'potCapacityBonus', 'berryEnergyMultiplier', 'helpIntervalMultiplier', 'mealRecoveryMultiplier', 'skillBerryMultiplier', 'skillHealingMultiplier', 'skillStrengthMultiplier']);

function validBonus(event, data, date) {
    const text = value => typeof value === 'string' && !!value.trim();
    const islands = data?.['islands.json'];
    const berries = data?.['berries.json'];
    const ingredients = data?.['ingredients.json'];
    const skills = data?.['skill-tables.json']?.modules?.mainSkills?.MAIN_SKILLS;
    const pokemon = data?.['pokedex.json'];
    const announced = data?.['meta.json'];
    const pokemonIds = new Set([...(pokemon ?? []).map(row => row.id), ...(announced?.announcedContent?.pokemon ?? []).map(row => row.imageId)]);
    const ingredientKeys = new Set((announced?.announcedContent?.ingredients ?? []).map(row => row.key));
    const known = (id, rows) => !data || rows?.some(row => row.id === id);
    const refOk = ref => {
        if (!ref) return false;
        if (ref.kind === 'field') return typeof ref.id === 'string' && bonusFields.has(ref.id);
        if (ref.kind === 'text') return text(ref.value);
        if (ref.kind === 'type' || ref.kind === 'specialty' || ref.kind === 'skillFamily') return text(ref.id);
        if (ref.kind === 'skill') return Number.isSafeInteger(ref.id) && known(ref.id, skills);
        if (ref.kind === 'pokemon') return Number.isSafeInteger(ref.id) && ref.id > 0 && (!data || pokemonIds.has(ref.id));
        if (ref.kind === 'ingredient') return Number.isSafeInteger(ref.id) && known(ref.id, ingredients) || typeof ref.id === 'string' && (!data || ingredientKeys.has(ref.id));
        if (ref.kind === 'team') return Array.isArray(ref.ids) && ref.ids.length > 0 && ref.ids.every(id => Number.isSafeInteger(id) && id > 0 && (!data || pokemonIds.has(id)));
        return false;
    };
    const partOk = part => {
        if (!part) return false;
        if (part.kind === 'multiply' || part.kind === 'add' || part.kind === 'limit') return typeof part.value === 'number' && Number.isFinite(part.value) && (part.text === undefined || text(part.text));
        if (part.kind === 'text') return text(part.value);
        if (part.kind === 'mix') return part.value === 'some' || part.value === 'all';
        if (part.kind === 'category') return part.value === 'curry' || part.value === 'salad' || part.value === 'dessert';
        return false;
    };
    const scopeOk = scope => scope === undefined || Array.isArray(scope) && scope.every(refOk);
    const itemOk = item => !!item && refOk(item.ref) && Array.isArray(item.parts) && item.parts.length > 0 && item.parts.every(partOk) && scopeOk(item.scope)
        && (item.startsOn === undefined && item.endsOn === undefined || !!item.startsOn && !!item.endsOn && date(item.startsOn) && date(item.endsOn) && item.startsOn < item.endsOn);
    if (event.bonusGroups !== undefined && (!Array.isArray(event.bonusGroups) || !event.bonusGroups.every(block => block && Array.isArray(block.area)
        && block.area.every(id => typeof id === 'string' && (!data || islands?.some(row => row.id === id))) && new Set(block.area).size === block.area.length
        && Array.isArray(block.groups) && block.groups.length > 0 && new Set(block.groups.map(group => group?.id)).size === block.groups.length
        && block.groups.every(group => group && bonusGroups.has(group.id ?? '') && Array.isArray(group.items) && group.items.length > 0 && group.items.every(itemOk))))) return false;
    const berriesOk = ids => Array.isArray(ids) && ids.length > 0 && ids.every(id => Number.isSafeInteger(id) && id > 0 && known(id, berries));
    if (event.berryGroup !== undefined && (!event.berryGroup || !Array.isArray(event.berryGroup.items) || !event.berryGroup.items.length
        || !event.berryGroup.items.every(item => item && typeof item.island === 'string' && (!data || islands?.some(row => row.id === item.island)) && berriesOk(item.berries) && scopeOk(item.scope)))) return false;
    if (event.notes !== undefined && (!Array.isArray(event.notes) || !event.notes.length || !event.notes.every(text))) return false;
    return true;
}

export function validateActivityArchive(value, data) {
    const archive = value;
    const date = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
        && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
    const ids = new Set();
    if (!archive || archive.schemaVersion !== 1 || !Array.isArray(archive.events)
        || !archive.events.every(event => {
            if (!event || typeof event.id !== 'string' || !/^[a-z0-9-]+$/.test(event.id) || ids.has(event.id)
                || typeof event.name !== 'string' || !event.name.trim() || event.announcedOn !== null && !date(event.announcedOn)
                || !date(event.startsOn) || !date(event.endsOn) || event.startsOn >= event.endsOn
                || typeof event.source !== 'string' || !/^(?:(?:https:\/\/web\.archive\.org\/web\/\d+\/)?https:\/\/www\.pokemonsleep\.net\/(?:zh\/|en\/)?news\/\d+_?\/|https:\/\/www\.serebii\.net\/pokemonsleep\/events\/[a-z0-9.-]+\.shtml)$/.test(event.source))
                return false;
            ids.add(event.id);
            if (event.bonusSections !== undefined && (!Array.isArray(event.bonusSections) || !event.bonusSections.every(section => section && typeof section.title === 'string' && section.title.trim() && Array.isArray(section.lines)
                && section.lines.length > 0 && section.lines.every(line => typeof line === 'string' && line.trim()))))
                return false;
            if (!validBonus(event, data, date)) return false;
            return true;
        }))
        throw Error('历史活动公告资料无效');
    if (archive.encounterUps !== undefined) {
        const pokemon = data?.['pokedex.json'];
        const islands = data?.['islands.json'];
        const active = data?.['activities.json'];
        const announced = data?.['meta.json'];
        const pokemonIds = new Set([...(pokemon ?? []).map(row => row.id), ...(announced?.announcedContent?.pokemon ?? []).map(row => row.imageId)]);
        if (!archive.encounterUps || Array.isArray(archive.encounterUps) || typeof archive.encounterUps !== 'object'
            || !Object.entries(archive.encounterUps).every(([id, groups]) => /^[a-z0-9-]+$/.test(id) && Array.isArray(groups)
                && (!data || ids.has(id) || active?.activities?.some(event => event.id === id))
                && groups.length > 0 && groups.every(group => group && (group.tier === undefined || ['large', 'medium', 'small', 'special'].includes(group.tier))
                && Array.isArray(group.pokemonIds) && group.pokemonIds.length > 0 && new Set(group.pokemonIds).size === group.pokemonIds.length
                && group.pokemonIds.every(id => Number.isSafeInteger(id) && id > 0 && (!data || pokemonIds.has(id)))
                && (group.islands === undefined || Array.isArray(group.islands) && group.islands.length > 0
                    && group.islands.every(id => typeof id === 'string' && (!data || islands?.some(row => row.id === id))))
                && (group.label === undefined || typeof group.label === 'string' && group.label.trim()))))
            throw Error('活动出没提升资料无效');
    }
}
