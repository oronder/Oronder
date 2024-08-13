import {ACTORS, AUTH, ID_MAP, MODULE_ID, ORONDER_BASE_URL} from "./constants.mjs"
import {hash, item_roll, Logger} from "./util.mjs"

function prune_roll_data(
    {
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
        pc.abilities[key] = (({checkProf, saveProf, bonuses, ...o}) => o)(pc.abilities[key])
    }

    pc.details = (({originalClass, ...o}) => o)(pc.details)
    pc.details.xp = (({pct, ...o}) => o)(pc.details.xp)
    pc.attributes = (({death, encumbrance, hd, ...o}) => o)(pc.attributes)
    pc.attributes.ac = (({equippedArmor, equippedShield, ...o}) => o)(pc.attributes.ac)
    pc.attributes.hp = (({value, temp, tempmax, bonuses, ...o}) => o)(pc.attributes.hp)


    for (let class_name in pc.classes) {
        pc.classes[class_name] =
            (({
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
            pc.classes[class_name].subclass =
                (({
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


function gen_item_deets(item, actor_lvl) {
    const attack = item_roll(item)
    let damage_type_pair = item.system.damage.parts.map(part => {
        let damage = new Roll(part[0], item.getRollData()).formula
        if (item?.system?.scaling?.mode === 'cantrip') {
            if (actor_lvl >= 17)
                damage = '4' + damage.slice(1)
            else if (actor_lvl >= 11)
                damage = '3' + damage.slice(1)
            else if (actor_lvl >= 5)
                damage = '2' + damage.slice(1)
        }
        return [damage, part[1]]
    })

    const out = {
        name: item.name,
        id: item.id,
        damage: damage_type_pair,
        attack: attack.formula,
        type: item.type,
        img: fix_relative_url(item.img),
        ability: item.system.abilityMod,
    }

    if (item.type === 'spell') {
        out.level = item.system.level
        out.level_scaling = item.system.scaling.mode === 'level'
    }

    return out
}

function fix_relative_url(url) {
    return url.indexOf('http://') === 0 || url.indexOf('https://') === 0 ?
        url : new URL(url, window.location.origin).href
}

export function enrich_actor(actor) {
    const weapons = actor.items
        .filter(item => item.hasAttack && item.type !== 'consumable')
        .map(item => gen_item_deets(item, actor.system.details.level))

    const equipment = actor.items
        .filter(item => item.type === "equipment" && item.system?.rarity)
        .map(item => item.name)


    let currency = actor.system['currency']
    for (const key in currency) {
        if (currency.hasOwnProperty(key) && !currency[key]) {
            currency[key] = 0
        }
    }

    let portrait_url = fix_relative_url(actor.img)

    const clone_pc = JSON.parse(JSON.stringify(
        actor.getRollData(),
        (k, v) => v instanceof Set ? [...v] : v)
    )
    clone_pc.details.dead = Boolean(actor.effects.find(e => !e.disabled && e.name === 'Dead'))
    clone_pc.details.background = typeof actor.system.details.background === "string" ?
        actor.system.details.background :
        actor.system.details.background ?
            actor.system.details.background.name :
            ''

    clone_pc.details.race = typeof actor.system.details.race === "string" ?
        actor.system.details.race :
        actor.system.details.race ?
            actor.system.details.race.name :
            ''

    clone_pc.attributes.spellcaster = Object.values(actor.system?.spells || {}).some(s => s?.max > 0)

    clone_pc.currency.cp = clone_pc.currency?.cp || 0
    clone_pc.currency.sp = clone_pc.currency?.sp || 0
    clone_pc.currency.ep = clone_pc.currency?.ep || 0
    clone_pc.currency.gp = clone_pc.currency?.gp || 0
    clone_pc.currency.pp = clone_pc.currency?.pp || 0

    return {
        ...prune_roll_data(clone_pc),
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
    return new Headers({
        "Accept": "application/json",
        "Content-Type": "application/json",
        'Authorization': authorization
    })
}

async function upload(pc) {
    const requestOptions = {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify(pc),
        redirect: 'follow'
    }

    return await fetch(`${ORONDER_BASE_URL}/actor`, requestOptions)
}

export async function del_actor(pc_id) {
    const requestOptions = {
        method: 'DELETE',
        headers: headers(),
        redirect: 'follow'
    }

    return await fetch(`${ORONDER_BASE_URL}/actor/${pc_id}`, requestOptions)
}


export const actor_to_discord_ids = actor =>
    Object.entries(actor.ownership)
        .filter(([_, perm_lvl]) => perm_lvl === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)
        .map(([owner_id, _]) => game.settings.get(MODULE_ID, ID_MAP)[owner_id])
        .filter(discord_id => discord_id)


export async function full_sync(clear_cache) {
    if (clear_cache) {
        game.actors
            .filter(_ => localStorage.getItem(`${ACTORS}.${_.id}`))
            .forEach(_ => localStorage.removeItem(`${ACTORS}.${_.id}`))
    }

    return Promise.all(game.actors.map(sync_actor)).then(res => {
        const counts = Object.fromEntries(Object.entries(
            Object.groupBy(res.map(i => Boolean(i)), b => b)
        ).map(([b, v]) => [b, v.length]))
        const sync_count = counts[true] || 0
        const skipped = counts[false] ? `, skipped ${counts[false] || 0}` : ''
        Logger.warn(`Synced ${sync_count} actor${sync_count > 1 ? 's' : ''}${skipped}. Press F12 for details.`)
    })
}

export async function sync_actor(actor) {
    if (actor.type !== "character") {
        Logger.info(
            `${game.i18n.localize("oronder.Skipping-Sync-For")} ${actor.name}. ${game.i18n.localize("oronder.NPC")}`
        )
        return Promise.resolve()
    }
    if (!actor_to_discord_ids(actor).length) {
        Logger.info(
            `${game.i18n.localize("oronder.Skipping-Sync-For")} ${actor.name}. ${game.i18n.localize("oronder.No-Owner")}`
        )
        return Promise.resolve()
    }

    const old_hash = localStorage.getItem(`${ACTORS}.${actor.id}`)
    const actor_obj = enrich_actor(actor)
    const new_hash = hash(actor_obj)

    if (old_hash && old_hash === new_hash) {
        Logger.info(`${game.i18n.localize("oronder.Skipping-Sync-For")} ${actor_obj.name}. ${game.i18n.localize("oronder.No-Change")}`)
        return Promise.resolve()
    }
    if (!actor_obj.details.level) {
        Logger.info(`${game.i18n.localize("oronder.Skipping-Sync-For")} ${actor_obj.name}. ${game.i18n.localize("oronder.No-Level")}`)
        return Promise.resolve()
    }
    if (!actor_obj.details.race) {
        Logger.info(`${game.i18n.localize("oronder.Skipping-Sync-For")} ${actor_obj.name}. ${game.i18n.localize("oronder.No-Race")}`)
        return Promise.resolve()
    }
    if (!actor_obj.details.background) {
        Logger.info(`${game.i18n.localize("oronder.Skipping-Sync-For")} ${actor_obj.name}. ${game.i18n.localize("oronder.No-Background")}`)
        return Promise.resolve()
    }
    if (!Object.keys(actor_obj.classes).length) {
        Logger.info(`${game.i18n.localize("oronder.Skipping-Sync-For")} ${actor_obj.name}. ${game.i18n.localize("oronder.No-Class")}`)
        return Promise.resolve()
    }

    return upload(actor_obj).then(response => {
        if (response.ok) {
            localStorage.setItem(`${ACTORS}.${actor.id}`, new_hash)
            Logger.info(`${game.i18n.localize("oronder.Synced")} ${actor_obj.name}`)
            return true
        } else if (response.status === 422) {
            response
                .json()
                .then(({detail}) => Logger.error(
                    `${actor_obj.name} ${game.i18n.localize("oronder.Failed-To-Sync")} ` +
                    detail.flat().map(({loc, input, msg}) =>
                        `❌ ${loc.filter(_ => _ !== 'body').join('.')}.${input} ${msg}`
                    ).join(' '),
                    {permanent: true}
                ))
        } else if (response.status === 401) {
            Logger.error(
                `${game.i18n.localize("oronder.Invalid-Auth")}: ${actor_obj.name} ${game.i18n.localize("oronder.Failed-To-Sync")}`
            )
        } else {
            Logger.error(
                `${actor_obj.name} ${game.i18n.localize("oronder.Failed-To-Sync")} ${response.statusText}`,
                {permanent: true}
            )
        }
    }).catch(Logger.error)
}