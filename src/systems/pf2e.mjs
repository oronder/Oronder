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
 * A kineticist's elemental blasts, as strikes: pf2e doesn't list them in
 * actor.system.actions, so without these a kineticist could only attack
 * unarmed. One per element and per melee/ranged form.
 * @param {Actor} actor
 */
async function export_blasts(actor) {
    const ElementalBlast = game.pf2e?.ElementalBlast
    if (!ElementalBlast) {
        return []
    }
    let blast
    try {
        blast = new ElementalBlast(actor)
    } catch {
        return [] // not a kineticist
    }
    const mod = blast.statistic?.mod
    if (mod === undefined || !blast.configs?.length) {
        return []
    }

    const blasts = []
    for (const config of blast.configs) {
        const element =
            config.element.charAt(0).toUpperCase() + config.element.slice(1)
        const damageType =
            config.damageTypes.find(type => type.selected)?.value ??
            config.damageTypes[0]?.value
        for (const melee of [true, false]) {
            let damage = ''
            try {
                damage = String(
                    (await blast.damage({
                        element: config.element,
                        damageType,
                        melee,
                        getFormula: true
                    })) ?? ''
                )
            } catch {
                // as with strikes, the attack stands without a formula
            }
            blasts.push({
                name: `${config.label} (${element}, ${melee ? 'Melee' : 'Ranged'})`,
                // pf2e only calls a blast ready while Channel Elements is
                // active, which is a combat-time toggle; outside Foundry the
                // blast is always available.
                ready: true,
                // pf2e leaves its own step labels blank unless channelling, so
                // use the standard penalties; blasts aren't agile.
                attack: [mod, mod - 5, mod - 10],
                damage,
                traits: [
                    ...new Set([
                        ...(config.item?.system?.traits?.value ?? []),
                        config.element,
                        ...(melee || !config.range?.max
                            ? []
                            : [`range-${config.range.max}`])
                    ])
                ]
            })
        }
    }
    return blasts
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
    )
        .concat(await export_blasts(actor))
        .filter(strike => strike.attack.length === 3)

    // pf2e keeps known rituals in its own ritual collection (no statistic),
    // and a spellcasting entry can also be given the ritual category.
    // Rituals aren't cast with a spell attack or DC; the server reads a null
    // attack as "nothing to roll", so they stay on the sheet without being
    // offered as an attack.
    const isRitual = entry => entry.isRitual || entry.category === 'ritual'
    const spellcasting = actor.spellcasting.contents
        .filter(entry =>
            entry.isRitual ? entry.spells?.size > 0 : entry.statistic
        )
        .map(entry => ({
            name: entry.name,
            tradition: entry.tradition ?? null,
            attack: isRitual(entry) ? null : entry.statistic.check.mod,
            dc: isRitual(entry) ? null : entry.statistic.dc.value,
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
