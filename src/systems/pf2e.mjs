/**
 * Pathfinder 2e export, for the server's v1 pf2e contract (Oronder-Server #28).
 *
 * Unlike dnd5e, which sends its roll data as-is, this builds an explicit
 * payload: a shared section every new system sends (hp, skills, currency) plus
 * a pf2e-specific `body`. The caller adds the system-neutral fields (id, name,
 * portrait_url, discord_ids, world).
 */

export const GAME_SYSTEM = 'pf2e'

/**
 * Why a pf2e character can't sync yet, as a localization key, or null.
 * The type and owner checks are shared and happen before this.
 * @param {Actor} actor
 * @returns {string|null}
 */
export function missing(actor) {
    if (!actor.ancestry) {
        return 'oronder.No-Ancestry'
    }
    if (!actor.class) {
        return 'oronder.No-Class'
    }
    return null
}

/**
 * A pf2e statistic as the server wants it: the final modifier and the
 * proficiency rank, 0 (untrained) to 4 (legendary).
 */
const stat = statistic => ({mod: statistic.mod, rank: statistic.rank ?? 0})

/**
 * @param {object} strike one of actor.system.actions
 */
async function export_strike(strike) {
    let damage = ''
    try {
        damage = String((await strike.damage?.({getFormula: true})) ?? '')
    } catch {
        // Some strikes can't build a formula outside a roll; the attack still
        // stands on its own.
    }
    return {
        name: strike.label,
        // pf2e lists a strike for every weapon carried, held or not.
        ready: Boolean(strike.ready),
        // The multiple attack penalty ladder: always three steps in pf2e, with
        // agile weapons changing the penalties (-4/-8) rather than the count.
        attack: strike.variants.map(v => strike.totalModifier + v.penalty),
        damage,
        traits: strike.item?.system?.traits?.value ?? []
    }
}

/**
 * @param {Actor} actor
 * @returns {Promise<object>} the payload minus the system-neutral fields
 */
export async function export_actor(actor) {
    const {hp} = actor.system.attributes
    const {xp} = actor.system.details
    // pf2e also carries Starfinder currencies (credits, upb); the shared
    // currency shape is the four coins.
    const {pp = 0, gp = 0, sp = 0, cp = 0} = actor.inventory.coins

    const strikes = (
        await Promise.all(
            actor.system.actions
                .filter(action => action.type === 'strike')
                .map(export_strike)
        )
    ).filter(strike => strike.attack.length === 3)

    const spellcasting = actor.spellcasting.contents
        .filter(entry => entry.statistic)
        .map(entry => ({
            name: entry.name,
            tradition: entry.tradition,
            attack: entry.statistic.check.mod,
            dc: entry.statistic.dc.value,
            spells: entry.spells?.contents.map(spell => spell.name) ?? []
        }))

    return {
        game_system: GAME_SYSTEM,
        hp: {value: hp.value, max: hp.max, temp: hp.temp ?? 0},
        skills: Object.fromEntries(
            Object.entries(actor.skills).map(([slug, skill]) => [
                slug,
                {
                    label: skill.label,
                    ...stat(skill),
                    lore: Boolean(skill.lore)
                }
            ])
        ),
        currency: {pp, gp, sp, cp},
        body: {
            level: actor.level,
            xp: {value: xp.value, max: xp.max},
            ancestry: actor.ancestry?.name,
            heritage: actor.heritage?.name,
            background: actor.background?.name,
            class: actor.class?.name,
            ac: actor.armorClass.value,
            perception: stat(actor.perception),
            attributes: Object.fromEntries(
                Object.entries(actor.system.abilities).map(([key, ability]) => [
                    key,
                    ability.mod
                ])
            ),
            saves: Object.fromEntries(
                Object.entries(actor.saves).map(([key, save]) => [
                    key,
                    stat(save)
                ])
            ),
            strikes,
            ...(spellcasting.length ? {spellcasting} : {})
        }
    }
}
