import {
    fix_relative_url,
    Logger,
    ownership_to_discord_ids,
    value_count
} from '../util.mjs'

/**
 * Call of Cthulhu 7e (system id "CoC7", v8.x) adapter.
 *
 * Verified against the compiled CoC7 system (v8.14):
 * - Characteristics: actor.system.characteristics.<abrv>.value with abrvs
 *   str con siz dex app int pow edu.
 * - Attributes: actor.system.attribs.{hp,mp,san}.{value,max}, .lck.value,
 *   .db.value, .mov.value, .build.value.
 * - Skills are embedded items of type 'skill'; the effective target number
 *   is item.system.value. Weapons are items of type 'weapon' with
 *   system.skill.main.{name,id} and system.range.normal.damage.
 * - Occupation/archetype are embedded items (actor.occupation getter) with a
 *   string fallback at actor.system.infos.{occupation,archetype}.
 * - The system's roll APIs (characteristicCheck/skillCheck/attributeCheck/
 *   weaponCheck) fire CoC7RollNormalize.trigger() which renders chat cards
 *   but never resolves to a result, so this adapter performs the d100 math
 *   itself (with injectable dice for tests) and posts a plain chat message.
 */

const CHARACTERISTICS = ['str', 'con', 'siz', 'dex', 'app', 'int', 'pow', 'edu']

const default_die = () => Math.floor(Math.random() * 10)

/**
 * Roll a d100 with optional bonus/penalty dice.
 * Advantage adds one bonus die (extra tens die, keep the lower total),
 * Disadvantage one penalty die (keep the higher total).
 *
 * @param {string|null} advantage 'Advantage', 'Disadvantage' or null
 * @param {() => number} die injectable d10 returning 0..9 (tens and units)
 * @return {{total: number, tens: number[], units: number}}
 */
export function d100_roll(advantage = null, die = default_die) {
    const units = die()
    const tens_count = advantage ? 2 : 1
    const tens = Array.from({length: tens_count}, die)
    const totals = tens.map(t =>
        t === 0 && units === 0 ? 100 : t * 10 + units
    )
    const total =
        advantage === 'Advantage'
            ? Math.min(...totals)
            : advantage === 'Disadvantage'
              ? Math.max(...totals)
              : totals[0]
    return {total, tens, units}
}

/**
 * CoC7 success level for a d100 roll against a target value.
 * @param {number} total 1..100
 * @param {number} value target
 * @return {string}
 */
export function success_level(total, value) {
    if (total === 1) return 'Critical success'
    if (value < 50 ? total >= 96 : total === 100) return 'Fumble'
    if (total <= Math.floor(value / 5)) return 'Extreme success'
    if (total <= Math.floor(value / 2)) return 'Hard success'
    if (total <= value) return 'Regular success'
    return 'Failure'
}

/**
 * "65 / rolled 43: Regular success"
 */
export function format_check(value, total) {
    return `${value} / rolled ${total}: ${success_level(total, value)}`
}

function skill_items(actor) {
    return actor.items.filter(i => i.type === 'skill')
}

function find_skill(actor, name) {
    if (typeof actor.getSkillByName === 'function') {
        const skill = actor.getSkillByName(name)
        if (skill) return skill
    }
    const lowered = String(name).toLowerCase()
    return skill_items(actor).find(i => i.name.toLowerCase() === lowered)
}

// noinspection JSValidateJSDoc
/**
 @param {Actor} actor
 @param {Object} id_map
 @param {Object} world
 */
function export_actor(actor, id_map, world) {
    const system = actor.system
    const characteristics = Object.fromEntries(
        CHARACTERISTICS.map(abrv => [
            abrv,
            {value: system.characteristics?.[abrv]?.value ?? 0}
        ])
    )

    const attribs = {
        hp: {
            value: system.attribs?.hp?.value ?? 0,
            max: system.attribs?.hp?.max ?? 0
        },
        san: {
            value: system.attribs?.san?.value ?? 0,
            max: system.attribs?.san?.max ?? 99
        },
        mp: {
            value: system.attribs?.mp?.value ?? 0,
            max: system.attribs?.mp?.max ?? 0
        },
        lck: {value: system.attribs?.lck?.value ?? 0},
        // db may be a string ("+1d4") or a number (-2) depending on build
        db: system.attribs?.db?.value ?? 0,
        mov: system.attribs?.mov?.value ?? 0,
        build: system.attribs?.build?.value ?? 0
    }

    const skills = skill_items(actor).map(skill => ({
        id: skill.id,
        name: skill.name,
        value: skill.system.value ?? 0
    }))

    const weapons = actor.items
        .filter(i => i.type === 'weapon')
        .map(weapon => {
            const main_skill = weapon.system.skill?.main
            const skill =
                (main_skill?.id ? actor.items.get(main_skill.id) : null) ??
                (main_skill?.name ? find_skill(actor, main_skill.name) : null)
            return {
                id: weapon.id,
                name: weapon.name,
                type: 'weapon',
                skill: main_skill?.name ?? '',
                value: skill?.system?.value ?? 0,
                damage: weapon.system.range?.normal?.damage ?? '',
                img: fix_relative_url(weapon.img) ?? null
            }
        })

    const equipment = actor.items
        .filter(i => i.type === 'item')
        .map(i => i.name)

    return {
        id: actor.id,
        name: actor.name,
        discord_ids: ownership_to_discord_ids(actor, id_map),
        portrait_url: fix_relative_url(actor.img),
        equipment: equipment,
        world: world,
        characteristics: characteristics,
        attribs: attribs,
        skills: skills,
        details: {
            occupation:
                actor.occupation?.name ?? system.infos?.occupation ?? '',
            age: system.infos?.age ?? '',
            archetype: actor.archetype?.name ?? system.infos?.archetype ?? ''
        },
        weapons: weapons
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
    if (!(actor.occupation?.name ?? actor.system.infos?.occupation)) {
        return [false, ['oronder.No-Occupation']]
    }
    return [true, []]
}

// noinspection JSValidateJSDoc
/**
 * Skip updates that only change hp/san/mp values.
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

    for (const attrib of ['hp', 'san', 'mp']) {
        if (data.system?.attribs?.[attrib]?.value !== undefined) changes -= 1
    }

    return changes === 0
}

async function post_chat_message(actor, content) {
    try {
        await ChatMessage.create({
            content: content,
            speaker: ChatMessage.getSpeaker({actor})
        })
    } catch (e) {
        console.warn('Oronder | failed to post CoC7 roll to chat', e)
    }
}

async function check(actor, label, value, advantage) {
    const {total} = d100_roll(advantage)
    const res = `${label}: ${format_check(value, total)}`
    await post_chat_message(actor, res)
    return {res}
}

async function incoming_attack(actor, data) {
    const weapon = actor.items.find(
        i => i.id === data.item_id && i.type === 'weapon'
    )
    if (!weapon) {
        return {
            res: game.i18n.localize('oronder.Item-Not-Found'),
            ephemeral: true
        }
    }

    const main_skill = weapon.system.skill?.main
    const skill =
        (main_skill?.id ? actor.items.get(main_skill.id) : null) ??
        (main_skill?.name ? find_skill(actor, main_skill.name) : null)
    const value = skill?.system?.value ?? 0

    const {total} = d100_roll(data.advantage)
    const level = success_level(total, value)
    let res = `${weapon.name} (${skill?.name ?? main_skill?.name ?? '?'}): ${format_check(value, total)}`

    if (!['Failure', 'Fumble'].includes(level)) {
        const formula = weapon.system.range?.normal?.damage
        if (formula) {
            try {
                const dmg = await new Roll(
                    formula,
                    actor.getRollData?.() ?? {}
                ).evaluate()
                res += `\nDamage: ${formula} = \`${dmg.total}\``
            } catch (e) {
                res += `\nDamage: ${formula}`
            }
        }
    }

    await post_chat_message(actor, res)
    return {res}
}

// noinspection JSValidateJSDoc
/**
 @param {Actor} actor
 @param {Object} data
 @return {Promise<Object>}
 */
async function handle_roll(actor, data) {
    switch (data['type']) {
        case 'characteristic': {
            const abrv = String(data.stat).toLowerCase()
            const characteristic = actor.system.characteristics?.[abrv]
            if (!characteristic) {
                return {
                    res: `Characteristic "${data.stat}" not found.`,
                    ephemeral: true
                }
            }
            return check(
                actor,
                abrv.toUpperCase(),
                characteristic.value ?? 0,
                data.advantage
            )
        }
        case 'attribute': {
            const abrv = String(data.stat).toLowerCase()
            const attribute = actor.system.attribs?.[abrv]
            if (!attribute || attribute.value === undefined) {
                return {
                    res: `Attribute "${data.stat}" not found.`,
                    ephemeral: true
                }
            }
            return check(
                actor,
                abrv.toUpperCase(),
                attribute.value ?? 0,
                data.advantage
            )
        }
        case 'skill': {
            const skill = find_skill(actor, data.stat)
            if (!skill) {
                return {
                    res: `Skill "${data.stat}" not found.`,
                    ephemeral: true
                }
            }
            return check(
                actor,
                skill.name,
                skill.system.value ?? 0,
                data.advantage
            )
        }
        case 'attack':
            return incoming_attack(actor, data)
        default:
            return {
                res: `Unsupported roll type "${data['type']}" for CoC7.`,
                ephemeral: true
            }
    }
}

// noinspection JSValidateJSDoc
/**
 * CoC7 has no XP model — session XP is a no-op.
 @param {Actor} actor
 @param {number} xp
 */
async function xp_write(actor, xp) {
    Logger.debug(`Ignoring xp update for ${actor.name}: CoC7 has no XP.`)
}

// noinspection JSValidateJSDoc
/**
 @param {Actor} actor
 @param {TokenDocument} token_doc
 */
function hp(actor, token_doc) {
    const merged = {
        ...actor.system.attribs.hp,
        ...token_doc?.delta?.system?.attribs?.hp
    }
    merged.effectiveMax ??= merged.max
    return merged
}

// noinspection JSValidateJSDoc
/**
 * CoC7 has no AC — combat embeds omit it.
 @param {Actor} actor
 @return {number|null}
 */
function ac(actor) {
    return null
}

export default {
    id: 'CoC7',
    supports_xp: false,
    syncable,
    export_actor,
    skippable,
    handle_roll,
    xp_write,
    hp,
    ac
}
