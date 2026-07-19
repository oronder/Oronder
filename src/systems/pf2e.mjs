import {
    fix_relative_url,
    Logger,
    ownership_to_discord_ids,
    rolls_to_str,
    value_count
} from '../util.mjs'

/**
 * Pathfinder Second Edition (pf2e v8.x) adapter.
 *
 * Verified against the compiled pf2e system (v8.2.0):
 * - actor.skills[slug] / actor.saves[slug] / actor.perception are Statistic
 *   objects; statistic.roll({skipDialog: true}) rolls without a dialog and
 *   resolves to a CheckRoll (Statistic.roll delegates to check.roll).
 * - actor.initiative.roll(args) resolves to {combatant, roll} and updates the
 *   encounter tracker; it requires an active encounter.
 * - Strikes live in actor.system.actions; strike.variants[0].roll(params)
 *   rolls the attack and strike.damage/strike.critical roll damage. Those
 *   only accept an event (not skipDialog), so a synthetic event with
 *   shiftKey === game.user.settings.show*Dialogs is passed, which
 *   eventToRollParams() always resolves to skipDialog: true.
 * - Character data: system.details.level.value, system.details.xp.{value,max},
 *   system.details.{ancestry,heritage,background,class} (name objects),
 *   system.attributes.{hp,ac,classDC}, system.movement.speeds.land.value,
 *   actor.inventory.coins.{pp,gp,sp,cp}.
 */

/**
 * A fake mouse event whose shiftKey state guarantees eventToRollParams()
 * returns skipDialog: true regardless of the user's dialog preference.
 * @param {string} setting 'showCheckDialogs' or 'showDamageDialogs'
 */
const skip_dialog_event = setting => ({
    shiftKey: Boolean(game.user?.settings?.[setting]),
    ctrlKey: false,
    metaKey: false
})

/**
 * Map pf2e skill statistics to the wire contract. Regular skills keep their
 * slug; lore skills are keyed `lore-*` (e.g. "warfare-lore" -> "lore-warfare")
 * and carry their display label.
 */
function export_skills(actor) {
    const out = {}
    for (const [slug, statistic] of Object.entries(actor.skills ?? {})) {
        if (statistic.lore) {
            const base = slug.replace(/-lore$/, '')
            out[`lore-${base}`] = {
                mod: statistic.mod,
                rank: statistic.rank ?? 0,
                label: statistic.label
            }
        } else {
            out[slug] = {
                mod: statistic.mod,
                rank: statistic.rank ?? 0
            }
        }
    }
    return out
}

function export_weapons(actor) {
    return (actor.system.actions ?? [])
        .filter(strike => strike.item)
        .map(strike => ({
            id: strike.item.id,
            name: strike.item.name,
            type: 'weapon',
            attack: `1d20 + ${strike.totalModifier}`,
            img: fix_relative_url(strike.item.img) ?? null
        }))
}

// noinspection JSValidateJSDoc
/**
 @param {Actor} actor
 @param {Object} id_map
 @param {Object} world
 */
function export_actor(actor, id_map, world) {
    const system = actor.system
    const abilities = Object.fromEntries(
        Object.entries(actor.abilities ?? system.abilities ?? {}).map(
            ([abrv, a]) => [abrv, {mod: a.mod}]
        )
    )

    const saves = Object.fromEntries(
        ['fortitude', 'reflex', 'will'].map(slug => [
            slug,
            {mod: actor.saves?.[slug]?.mod ?? 0}
        ])
    )

    const coins = actor.inventory?.coins ?? {}
    const currency = {
        pp: coins.pp ?? 0,
        gp: coins.gp ?? 0,
        sp: coins.sp ?? 0,
        cp: coins.cp ?? 0
    }

    const equipment = actor.items
        .filter(item => item.type === 'equipment')
        .map(item => item.name)

    return {
        id: actor.id,
        name: actor.name,
        discord_ids: ownership_to_discord_ids(actor, id_map),
        portrait_url: fix_relative_url(actor.img),
        equipment: equipment,
        world: world,
        abilities: abilities,
        skills: export_skills(actor),
        attributes: {
            hp: {max: system.attributes.hp.max},
            ac: {value: system.attributes.ac.value},
            speed: system.movement?.speeds?.land?.value ?? 0,
            class_dc: system.attributes.classDC?.value ?? null,
            saves: saves,
            perception: {mod: actor.perception?.mod ?? 0}
        },
        details: {
            level: system.details.level.value,
            class: actor.class?.name ?? system.details.class?.name ?? '',
            ancestry:
                actor.ancestry?.name ?? system.details.ancestry?.name ?? '',
            heritage:
                actor.heritage?.name ?? system.details.heritage?.name ?? '',
            background: actor.background?.name ?? '',
            xp: {
                value: system.details.xp?.value ?? 0,
                max: system.details.xp?.max ?? 1000
            }
        },
        currency: currency,
        weapons: export_weapons(actor)
    }
}

// noinspection JSValidateJSDoc
/**
 @param {Actor} actor
 @param {Object} id_map
 @return {[boolean, string[]]}
 */
function syncable(actor, id_map) {
    if (actor.type !== 'character') {
        return [false, ['oronder.NPC']]
    }
    if (!ownership_to_discord_ids(actor, id_map).length) {
        return [false, ['oronder.No-Owner']]
    }
    if (!(actor.ancestry?.name ?? actor.system.details.ancestry?.name)) {
        return [false, ['oronder.No-Ancestry']]
    }
    if (!(actor.class?.name ?? actor.system.details.class?.name)) {
        return [false, ['oronder.No-Class']]
    }
    if (!actor.system.details.level?.value) {
        return [false, ['oronder.No-Level']]
    }
    return [true, []]
}

// noinspection JSValidateJSDoc
/**
 * Skip updates that only change hp (value/temp/...) or xp — those do not
 * affect the synced payload enough to warrant a re-upload.
 @param {Actor} actor
 @param {{}} data
 @param {{}} update_options
 @return {boolean}
 */
function skippable(actor, data, update_options) {
    const relevant_change_keys = Object.keys(data).filter(
        k => !['_id', '_stats'].includes(k)
    )
    if (!relevant_change_keys.length) return true

    if (relevant_change_keys.length > 1 || !('system' in data)) return false

    let changes = value_count(data.system)

    if (data.system?.attributes?.hp !== undefined)
        changes -= value_count(data.system.attributes.hp)

    if (data.system?.details?.xp !== undefined)
        changes -= value_count(data.system.details.xp)

    return changes === 0
}

const cancelled = () => ({res: 'Roll was cancelled.', ephemeral: true})

async function roll_statistic(statistic, missing) {
    if (!statistic) {
        return {res: missing, ephemeral: true}
    }
    const roll = await statistic.roll({skipDialog: true})
    return roll ? {res: rolls_to_str(roll)} : cancelled()
}

async function incoming_attack(actor, data) {
    const strike = (actor.system.actions ?? []).find(
        a => a.item?.id === data.item_id
    )
    if (!strike) {
        return {
            res: game.i18n.localize('oronder.Item-Not-Found'),
            ephemeral: true
        }
    }

    const atk_roll = await strike.variants[0].roll({
        event: skip_dialog_event('showCheckDialogs')
    })
    if (!atk_roll) return cancelled()

    let out = `${strike.item.name}: ${rolls_to_str(atk_roll)}`

    try {
        // 3 = critical success. Damage rolls post to chat; the string total
        // is appended for Discord.
        const damage_fn =
            atk_roll.degreeOfSuccess === 3 ? strike.critical : strike.damage
        const dmg_roll = await damage_fn?.({
            event: skip_dialog_event('showDamageDialogs')
        })
        if (dmg_roll?.total !== undefined) {
            out += `\nDamage: ${rolls_to_str(dmg_roll)}`
        }
    } catch (e) {
        console.warn('Oronder | pf2e damage roll failed', e)
    }

    return {res: out}
}

async function incoming_initiative(actor) {
    if (!game.combat) {
        return {res: 'No Combat Found', ephemeral: true}
    }
    const result = await actor.initiative?.roll({skipDialog: true})
    if (!result?.roll) return cancelled()
    return {res: rolls_to_str(result.roll)}
}

// noinspection JSValidateJSDoc
/**
 @param {Actor} actor
 @param {Object} data
 @return {Promise<Object>}
 */
async function handle_roll(actor, data) {
    switch (data['type']) {
        case 'skill':
            return roll_statistic(
                actor.skills?.[data.stat],
                `Skill "${data.stat}" not found.`
            )
        case 'save':
            return roll_statistic(
                actor.saves?.[data.stat],
                `Save "${data.stat}" not found.`
            )
        case 'perception':
            return roll_statistic(actor.perception, 'Perception not found.')
        case 'init':
            return incoming_initiative(actor)
        case 'attack':
            return incoming_attack(actor, data)
        default:
            return {
                res: `Unsupported roll type "${data['type']}" for pf2e.`,
                ephemeral: true
            }
    }
}

// noinspection JSValidateJSDoc
/**
 @param {Actor} actor
 @param {number} xp
 */
async function xp_write(actor, xp) {
    Logger.info(`${actor.name} xp: ${actor.system.details.xp?.value} -> ${xp}`)
    await actor.update({'system.details.xp.value': xp})
}

// noinspection JSValidateJSDoc
/**
 @param {Actor} actor
 @param {TokenDocument} token_doc
 */
function hp(actor, token_doc) {
    const merged = {
        ...actor.system.attributes.hp,
        ...token_doc?.delta?.system?.attributes?.hp
    }
    merged.effectiveMax ??= merged.max
    return merged
}

// noinspection JSValidateJSDoc
/**
 @param {Actor} actor
 @return {number|null}
 */
function ac(actor) {
    return actor.system.attributes.ac?.value ?? null
}

export default {
    id: 'pf2e',
    supports_xp: true,
    syncable,
    export_actor,
    skippable,
    handle_roll,
    xp_write,
    hp,
    ac
}
