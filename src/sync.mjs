import {
    ACTORS,
    AUTH,
    ID_MAP,
    MODULE_ID,
    ORONDER_BASE_URL
} from './constants.mjs'
import {hash, item_roll, Logger} from './util.mjs'

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
            pc.abilities[key].save = parseInt(pc.abilities[key].save.replaceAll('!', ''))
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

/**
 * @param {string} url
 */
function fix_relative_url(url) {
    return url.indexOf('http://') === 0 || url.indexOf('https://') === 0
        ? url
        : new URL(url, window.location.origin).href
}

/**
 @param {Actor} actor
 */
export function export_actor(actor) {
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
        discord_ids: actor_to_discord_ids(actor),
        weapons: weapons,
        equipment: equipment,
        portrait_url: portrait_url
    }
}

function headers() {
    const authorization = game.settings.get(MODULE_ID, AUTH)
    if (!authorization) {
        Logger.error(game.i18n.localize('oronder.Auth-Unset-Error'))
    }
    return new Headers({
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: authorization
    })
}

/**
 @param {Object} pc
 */
async function upload(pc) {
    const requestOptions = {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify(pc),
        redirect: 'follow'
    }

    return await fetch(`${ORONDER_BASE_URL}/actor`, requestOptions)
}

/**
 @param {string} pc_id
 */
export async function del_actor(pc_id) {
    const requestOptions = {
        method: 'DELETE',
        headers: headers(),
        redirect: 'follow'
    }

    return await fetch(`${ORONDER_BASE_URL}/actor/${pc_id}`, requestOptions)
}

/**
 @param {Actor} actor
 @return {string[]}
 */
export const actor_to_discord_ids = actor =>
    Object.entries(actor.ownership)
        .filter(
            ([_, perm_lvl]) =>
                perm_lvl === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
        )
        .map(([owner_id, _]) => game.settings.get(MODULE_ID, ID_MAP)[owner_id])
        .filter(discord_id => discord_id)

/**
 @param {boolean} clear_cache
 */
export async function full_sync(clear_cache) {
    if (clear_cache) {
        game.actors
            .filter(_ => localStorage.getItem(`${ACTORS}.${_.id}`))
            .forEach(_ => localStorage.removeItem(`${ACTORS}.${_.id}`))
    }

    return Promise.all(game.actors.map(sync_actor)).then(res => {
        const counts = Object.fromEntries(
            Object.entries(
                Object.groupBy(
                    res.map(i => Boolean(i)),
                    b => b
                )
            ).map(([b, v]) => [b, v.length])
        )
        const sync_count = counts[true] ?? 0
        const skipped = counts[false] ? `, skipped ${counts[false] ?? 0}` : ''
        Logger.warn(
            `Synced ${sync_count} actor${sync_count > 1 ? 's' : ''}${skipped}. Press F12 for details.`
        )
    })
}

/**
 @param {Actor} actor
 */
export function syncable(actor) {
    if (actor.type !== 'character') {
        Logger.info(
            `${game.i18n.localize('oronder.Skipping-Sync-For')} ${actor.name}. ${game.i18n.localize('oronder.NPC')}`
        )
        return false
    }
    if (!actor_to_discord_ids(actor).length) {
        Logger.info(
            `${game.i18n.localize('oronder.Skipping-Sync-For')} ${actor.name}. ${game.i18n.localize('oronder.No-Owner')}`
        )
        return false
    }
    if (!actor.system.details.level) {
        Logger.info(
            `${game.i18n.localize('oronder.Skipping-Sync-For')} ${actor_obj.name}. ${game.i18n.localize('oronder.No-Level')}`
        )
        return false
    }
    if (!actor.system.details.race) {
        Logger.info(
            `${game.i18n.localize('oronder.Skipping-Sync-For')} ${actor_obj.name}. ${game.i18n.localize('oronder.No-Race')}`
        )
        return false
    }
    if (!actor.system.details.background) {
        Logger.info(
            `${game.i18n.localize('oronder.Skipping-Sync-For')} ${actor_obj.name}. ${game.i18n.localize('oronder.No-Background')}`
        )
        return false
    }
    if (!Object.keys(actor.classes).length) {
        Logger.info(
            `${game.i18n.localize('oronder.Skipping-Sync-For')} ${actor_obj.name}. ${game.i18n.localize('oronder.No-Class')}`
        )
        return false
    }

    return true
}

/**
 @param {Actor} actor
 */
export async function sync_actor(actor) {
    if (!syncable(actor)) {
        return Promise.resolve()
    }

    const old_hash = localStorage.getItem(`${ACTORS}.${actor.id}`)
    const actor_obj = export_actor(actor)
    const new_hash = hash(actor_obj)

    if (old_hash && old_hash === new_hash) {
        Logger.info(
            `${game.i18n.localize('oronder.Skipping-Sync-For')} ${actor_obj.name}. ${game.i18n.localize('oronder.No-Change')}`
        )
        return Promise.resolve()
    }

    return upload(actor_obj)
        .then(response => {
            if (response.ok) {
                localStorage.setItem(`${ACTORS}.${actor.id}`, new_hash)
                Logger.info(
                    `${game.i18n.localize('oronder.Synced')} ${actor_obj.name}`
                )
                return true
            } else if (response.status === 422) {
                response.json().then(({detail}) =>
                    Logger.error(
                        `${actor_obj.name} ${game.i18n.localize('oronder.Failed-To-Sync')} ` +
                            detail
                                .flat()
                                .map(
                                    ({loc, input, msg}) =>
                                        `❌ ${loc.filter(_ => _ !== 'body').join('.')}.${input} ${msg}`
                                )
                                .join(' '),
                        {permanent: true}
                    )
                )
            } else if (response.status === 401) {
                Logger.error(
                    `${game.i18n.localize('oronder.Invalid-Auth')}: ${actor_obj.name} ${game.i18n.localize('oronder.Failed-To-Sync')}`
                )
            } else {
                Logger.error(
                    `${actor_obj.name} ${game.i18n.localize('oronder.Failed-To-Sync')} ${response.statusText}`,
                    {permanent: true}
                )
            }
        })
        .catch(Logger.error)
}
