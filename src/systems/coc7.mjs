/**
 * Call of Cthulhu 7th edition export, for the server's v1 CoC7 contract.
 *
 * Like pf2e, this builds an explicit payload: the shared hp and skills plus a
 * CoC7-specific `body`. CoC7 has no coins, so the shared currency is left out.
 * Every value is the final one from the prepared actor; the server doesn't
 * recompute any CoC7 rules. The caller adds the system-neutral fields (id,
 * name, portrait_url, discord_ids, world).
 */

export const GAME_SYSTEM = 'CoC7'

const CHARACTERISTICS = ['str', 'con', 'siz', 'dex', 'app', 'int', 'pow', 'edu']

/**
 * The conditions the server knows, keyed as in actor.system.conditions. Sent
 * in English whatever the world's language, since the bot matches on them;
 * CoC7's own labels for the insanities are "Bout of Madness" and "Insanity".
 */
const CONDITIONS = {
    criticalWounds: 'Major Wound',
    dying: 'Dying',
    dead: 'Dead',
    unconscious: 'Unconscious',
    tempoInsane: 'Temporary Insanity',
    indefInsane: 'Indefinite Insanity',
    prone: 'Prone'
}

/**
 * Why a CoC7 investigator can't sync yet, as a localization key, or null.
 * The type and owner checks are shared and happen before this.
 * @param {Actor} actor
 * @returns {string|null}
 */
export function missing(actor) {
    // A freshly created investigator has every characteristic blank until
    // they're rolled or bought, and the server requires them.
    if (
        !CHARACTERISTICS.some(key => actor.system.characteristics[key]?.value)
    ) {
        return 'oronder.No-Characteristics'
    }
    return null
}

/**
 * @param {*} value a number, or a string a keeper may have typed in
 * @returns {number|null}
 */
function int(value) {
    const parsed = parseInt(value, 10)
    return Number.isNaN(parsed) ? null : parsed
}

/**
 * The damage bonus as CoC7 shows it, signed: CoC7 computes -2, -1 or 0 as
 * numbers and larger bonuses as dice ("1D4", "2D6"); a manual value is text.
 * @param {*} db actor.system.attribs.db.value
 * @returns {string|null}
 */
function damage_bonus(db) {
    if (db === null || db === undefined || db === '') {
        return null
    }
    const text = String(db).trim()
    return /^\d/.test(text) && text !== '0' ? `+${text}` : text
}

/**
 * Credit as the sheet shows it: typed in when the keeper turned on manual
 * credit, otherwise derived from Credit Rating and the world's money table.
 * @param {Actor} actor
 */
function credit(actor) {
    const {monetary, flags} = actor.system
    const text = value => (value === '' || value === undefined ? null : value)
    if (flags?.manualCredit) {
        return {
            spending_level: text(monetary.spendingLevel),
            cash: text(monetary.cash),
            assets: text(monetary.assets)
        }
    }
    return {
        spending_level: text(actor.system.formattedMonetaryValue('spending')),
        cash: text(actor.system.formattedMonetaryValue('cash')),
        assets: text(actor.system.formattedMonetaryValue('assets'))
    }
}

/**
 * @param {Actor} actor
 * @param {Item} weapon
 */
function export_weapon(actor, weapon) {
    const {skill, properties, range} = weapon.system
    // CoC7 links the skill by item id when a weapon is added to the sheet.
    // An unlinked weapon only carries a name, or a CoC7 id ("i.skill.…") as
    // the compendium weapons do.
    const name = skill?.main?.name
    const linked =
        actor.items.get(skill?.main?.id) ??
        (name?.startsWith('i.')
            ? actor.getFirstItemByCoCID?.(name)
            : name
              ? actor.items.getName(name)
              : undefined)
    const main = linked?.type === 'skill' ? linked : undefined
    return {
        name: weapon.name,
        skill: main?.name ?? null,
        target: main ? int(main.system.value) : null,
        damage: range?.normal?.damage || null,
        db: properties?.addb ? 'full' : properties?.ahdb ? 'half' : 'none',
        impale: Boolean(properties?.impl),
        ranged: Boolean(properties?.rngd)
    }
}

/**
 * @param {Actor} actor
 * @returns {Promise<object>} the payload minus the system-neutral fields
 */
export async function export_actor(actor) {
    const {attribs, characteristics, conditions, infos} = actor.system
    const pair = attrib => ({
        value: int(attrib?.value) ?? 0,
        max: int(attrib?.max) ?? 0
    })

    return {
        game_system: GAME_SYSTEM,
        hp: pair(attribs.hp),
        // Keyed by item id: CoC7's own skill id (cocid) isn't unique, e.g. an
        // investigator can have two "own language" skills.
        skills: Object.fromEntries(
            actor.items
                .filter(item => item.type === 'skill')
                .map(skill => [
                    skill.id,
                    {label: skill.name, mod: int(skill.system.value) ?? 0}
                ])
        ),
        body: {
            // An occupation or archetype item when there is one, otherwise
            // what was typed into the sheet's header.
            occupation: actor.occupation?.name || infos?.occupation || null,
            archetype: actor.archetype?.name || infos?.archetype || null,
            age: infos?.age || null,
            characteristics: Object.fromEntries(
                CHARACTERISTICS.map(key => [
                    key,
                    int(characteristics[key]?.value) ?? 0
                ])
            ),
            mp: pair(attribs.mp),
            san: pair(attribs.san),
            luck: int(attribs.lck?.value),
            mov: int(attribs.mov?.value),
            build: int(attribs.build?.value),
            db: damage_bonus(attribs.db?.value),
            weapons: actor.items
                .filter(item => item.type === 'weapon')
                .map(weapon => export_weapon(actor, weapon)),
            credit: credit(actor),
            conditions: Object.entries(CONDITIONS)
                .filter(([key]) => conditions?.[key]?.value)
                .map(([, name]) => name)
        }
    }
}
