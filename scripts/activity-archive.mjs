// Mirrors the client activity archive validator.
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
