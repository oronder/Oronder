import {
    fix_relative_url,
    get_user,
    item_roll,
    Logger,
    ownership_to_discord_ids,
    rolls_to_str,
    value_count
} from '../util.mjs'

/**
 * dnd5e adapter. All logic in this file is moved unchanged from sync.mjs,
 * incoming.mjs and module.mjs — it must keep behaving exactly as before.
 */

function prune_roll_data({
    spells,
    resources,
    flags,
    effects,
    srd5e,
    prof,
    scale,
    actorId,
    actorUuid,
    tokenId,
    tokenUuid,
    ...pc
} = {}) {
    for (let key in pc.skills) {
        pc.skills[key] = (({prof, bonuses, ...o}) => o)(pc.skills[key])
    }

    for (let key in pc.tools) {
        pc.tools[key] = (({prof, bonuses, ...o}) => o)(pc.tools[key])
    }

    for (let key in pc.abilities) {
        pc.abilities[key] = (({checkProf, saveProf, bonuses, ...o}) => o)(
            pc.abilities[key]
        )

        //TODO This is a hack to avoid changing the backend.
        // dnd5e 4.3.3 adds a toJSON method that converts it to a string.
        // dnd5e 4.3.0 changes save from an int to an object.
        if (typeof pc.abilities[key].save === 'string') {
            pc.abilities[key].save = parseInt(
                pc.abilities[key].save.replaceAll('!', '')
            )
        } else if (typeof pc.abilities[key].save === 'object') {
            pc.abilities[key].save = pc.abilities[key].save.value
        }
    }

    pc.details = (({originalClass, ...o}) => o)(pc.details)
    pc.details.xp = (({pct, ...o}) => o)(pc.details.xp)
    pc.attributes = (({death, encumbrance, hd, ...o}) => o)(pc.attributes)
    pc.attributes.ac = (({equippedArmor, equippedShield, ...o}) => o)(
        pc.attributes.ac
    )
    pc.attributes.hp = (({value, temp, tempmax, bonuses, ...o}) => o)(
        pc.attributes.hp
    )

    //TODO This is a hack to avoid changing the backend.
    // dnd5e 4.3.0 changes moves spell info under spell.
    if ('spell' in pc.attributes) {
        pc.attributes.spelldc = pc.attributes.spell.dc
        pc.attributes.spellmod = pc.attributes.spell.mod
    }

    for (let class_name in pc.classes) {
        pc.classes[class_name] = (({
            advancement,
            description,
            hitDiceUsed,
            identifier,
            isOriginalClass,
            prof,
            saves,
            skills,
            spellcasting,
            source,
            ...o
        }) => o)(pc.classes[class_name])

        if ('subclass' in pc.classes[class_name]) {
            pc.classes[class_name].subclass = (({
                advancement,
                classIdentifier,
                description,
                modelProvider,
                parent,
                prof,
                spellcasting,
                ...o
            }) => o)(pc.classes[class_name].subclass)
        }
    }
    return Object.keys(pc).length ? pc : null
}

// noinspection JSValidateJSDoc
/**
 * @param {Item5e} item
 */
function export_item(item) {
    const attack = item_roll(item)

    const out = {
        name: item.name,
        id: item.id,
        attack: attack.formula,
        type: item.type,
        img: fix_relative_url(item.img),
        ability: item.system.abilityMod
    }

    if (item.type === 'spell') {
        out.level = item.system.level
    }

    if (item.type === 'weapon') {
        out.attack_modes =
            item.system.attackModes
                ?.filter(a => 'value' in a)
                .map(a => a.value) ?? []
    }

    return out
}

// noinspection JSValidateJSDoc
/**
 @param {Actor} actor
 @param {Object} id_map
 @param {Object} world
 */
function export_actor(actor, id_map, world) {
    const weapons = actor.items
        .filter(item => item.hasAttack && item.type !== 'consumable')
        .map(item => export_item(item))

    const equipment = actor.items
        .filter(item => item.type === 'equipment' && item.system?.rarity)
        .map(item => item.name)

    const currency = actor.system['currency']
    for (const key in currency) {
        if (currency.hasOwnProperty(key) && !currency[key]) {
            currency[key] = 0
        }
    }

    const portrait_url = fix_relative_url(actor.img)

    const clone_actor = JSON.parse(
        JSON.stringify(actor.getRollData(), (k, v) =>
            v instanceof Set ? [...v] : v
        )
    )
    clone_actor.details.dead = Boolean(
        actor.effects.find(e => !e.disabled && e.name === 'Dead')
    )
    clone_actor.details.background =
        typeof actor.system.details.background === 'string'
            ? actor.system.details.background
            : actor.system.details.background
              ? actor.system.details.background.name
              : ''

    clone_actor.details.race =
        typeof actor.system.details.race === 'string'
            ? actor.system.details.race
            : actor.system.details.race
              ? actor.system.details.race.name
              : ''

    clone_actor.attributes.spellcaster = Math.max(
        -1,
        ...Object.values(actor.system.spells)
            .filter(s => s.max)
            .map(s => s.level)
    )

    clone_actor.currency.cp = clone_actor.currency?.cp ?? 0
    clone_actor.currency.sp = clone_actor.currency?.sp ?? 0
    clone_actor.currency.ep = clone_actor.currency?.ep ?? 0
    clone_actor.currency.gp = clone_actor.currency?.gp ?? 0
    clone_actor.currency.pp = clone_actor.currency?.pp ?? 0

    clone_actor.details.items = actor.items.map(i => ({
        name: i.name,
        img: fix_relative_url(i.img),
        id: i.id,
        type: i.type
    }))

    return {
        ...prune_roll_data(clone_actor),
        name: actor.name,
        id: actor.id,
        discord_ids: ownership_to_discord_ids(actor, id_map),
        weapons: weapons,
        equipment: equipment,
        portrait_url: portrait_url,
        world: world
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
    if (!actor.system.details.level) {
        return [false, ['oronder.No-Level']]
    }
    if (!actor.system.details.race) {
        return [false, ['oronder.No-Race']]
    }
    if (!actor.system.details.background) {
        return [false, ['oronder.No-Background']]
    }
    if (!Object.keys(actor.classes).length) {
        return [false, ['oronder.No-Class']]
    }

    return [true, []]
}

// noinspection JSValidateJSDoc
/**
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

    if (relevant_change_keys.length > 1 || (!'system') in data) return false

    let changes = value_count(data.system)

    if (data.system?.attributes?.hp?.value !== undefined) changes -= 1

    if (data.system?.details?.xp?.value !== undefined) changes -= 1

    if (
        typeof data.system?.spells === 'object' &&
        Object.values(data.system.spells).filter(s => s.value).length
    )
        changes -= 1

    return changes === 0
}

/**
 @param {Actor} actor
 @param {Object} data
 @param {string} foundry_user_id
 @return Object
 */
async function incoming_attack(actor, data, foundry_user_id) {
    const item = actor.items.find(i => i.id === data.item_id)

    if (item === undefined) {
        Logger.error(game.i18n.localize('oronder.Item-Not-Found'))
        return {}
    }

    let activity = item.system.activities.getByType('attack')[0]

    if ('spell_level' in data) {
        activity = item
            .clone(
                {
                    'flags.dnd5e.scaling': data.spell_level - item.system.level
                },
                {keepId: true}
            )
            .system.activities.get(activity.id)
    }

    const atk = (
        await activity.rollAttack(
            {
                attackMode: data.attack_mode,
                advantage: data.advantage === 'Advantage',
                disadvantage: data.advantage === 'Disadvantage'
            },
            {configure: false},
            {data: {user: foundry_user_id}}
        )
    )[0]

    const dmg = await activity.rollDamage(
        {
            attackMode: data.attack_mode,
            isCritical: atk.isCritical
        },
        {configure: false},
        {data: {user: foundry_user_id}}
    )

    return {
        atk: rolls_to_str(atk),
        dmg: dmg.map(d => [rolls_to_str(d), d.options.type])
    }
}

async function incoming_initiative(actor, event) {
    if (!game.combat) {
        return {res: 'No Combat Found', ephemeral: true}
    }

    const rolls = await CONFIG.Dice.D20Roll.build(
        {
            evaluate: false,
            event: event,
            rolls: [actor.getInitiativeRollConfig()]
        },
        {
            options: {title: game.i18n.localize('DND5E.InitiativeRoll')},
            configure: false
        },
        {rollMode: game.settings.get('core', 'rollMode')}
    )

    // Temporarily cache the configured roll and use it to roll initiative for the Actor
    actor._cachedInitiativeRoll = rolls[0]
    const combat = await actor.rollInitiative({
        createCombatants: !game.combat.combatants.some(
            a => a.actorId === actor.id
        ),
        rerollInitiative: true
    })

    const initiative = combat.combatants.find(
        a => a.actorId === actor.id
    ).initiative

    return {
        res: `${rolls_to_str(rolls).replace('()', '(?)').slice(0, -2)}${initiative}\``
    }
}

// noinspection JSValidateJSDoc
/**
 @param {Actor} actor
 @param {Object} data
 @return {Promise<Object>}
 */
async function handle_roll(actor, data) {
    const foundry_user_id = get_user(data.discord_id, actor)?.id

    const event = {
        altKey: data.advantage === 'Advantage',
        ctrlKey: data.advantage === 'Disadvantage',
        target: {closest: _ => null}
    }

    let out
    switch (data['type']) {
        case 'init':
            out = await incoming_initiative(actor, event)
            break
        case 'attack':
            out = await incoming_attack(actor, data, foundry_user_id)
            break
        case 'save':
            out = {
                res: rolls_to_str(
                    await actor.rollSavingThrow(
                        {ability: data.stat, event: event},
                        {configure: false},
                        {data: {user: foundry_user_id}}
                    )
                )
            }
            break
        case 'ability':
            out = {
                res: rolls_to_str(
                    await actor.rollAbilityCheck(
                        {ability: data.stat, event: event},
                        {configure: false},
                        {data: {user: foundry_user_id}}
                    )
                )
            }
            break
        case 'tool':
            out = {
                res: rolls_to_str(
                    await actor.rollToolCheck(
                        {tool: data.stat, event: event},
                        {configure: false},
                        {data: {user: foundry_user_id}}
                    )
                )
            }
            break
        case 'skill':
            out = {
                res: rolls_to_str(
                    await actor.rollSkill(
                        {skill: data.stat, event: event},
                        {configure: false},
                        {data: {user: foundry_user_id}}
                    )
                )
            }
            break
        case 'concentration':
            if (!actor.system.attributes?.concentration) {
                out = {
                    res: 'You may not make a Concentration Saving Throw with this Actor.',
                    ephemeral: true
                }
            } else {
                out = {
                    res: rolls_to_str(
                        await actor.rollConcentration(
                            {event: event},
                            {configure: false},
                            {data: {user: foundry_user_id}}
                        )
                    )
                }
            }
            break
        case 'death':
            if (
                actor.system.attributes.hp.value > 0 ||
                actor.system.attributes.death.failure >= 3 ||
                actor.system.attributes.death.success >= 3
            ) {
                out = {
                    res: game.i18n.localize('DND5E.DeathSaveUnnecessary'),
                    ephemeral: true
                }
            } else {
                out = {
                    res: rolls_to_str(
                        await actor.rollDeathSave(
                            {event: event},
                            {configure: false},
                            {data: {user: foundry_user_id}}
                        )
                    )
                }
            }
            break
    }
    return out
}

// noinspection JSValidateJSDoc
/**
 @param {Actor} actor
 @param {number} xp
 */
async function xp_write(actor, xp) {
    Logger.info(`${actor.name} xp: ${actor.system.details.xp.value} -> ${xp}`)
    await actor.update({'system.details.xp.value': xp})
}

// noinspection JSValidateJSDoc
/**
 @param {Actor} actor
 @param {TokenDocument} token_doc
 */
function hp(actor, token_doc) {
    return {
        ...actor.system.attributes.hp,
        ...token_doc?.delta?.system?.attributes?.hp
    }
}

// noinspection JSValidateJSDoc
/**
 @param {Actor} actor
 @return {number|null}
 */
function ac(actor) {
    return actor.system.attributes.ac.value
}

export default {
    id: 'dnd5e',
    supports_xp: true,
    syncable,
    export_actor,
    skippable,
    handle_roll,
    xp_write,
    hp,
    ac
}
