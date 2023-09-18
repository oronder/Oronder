import {ACTORS, AUTH, GUILD_ID, ID_MAP, MODULE_ID, ORONDER_BASE_URL} from "./constants.mjs";
import {hash} from "./util.mjs";

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
    pc.attributes = (({init, death, encumbrance, ...o}) => o)(pc.attributes)
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
    const attack_to_hit = item.getAttackToHit()
    const attack_parts = attack_to_hit.parts
        .map(p => attack_to_hit.rollData[p.slice(1)] || p)
        .map(s => s.toString().replaceAll('+', '').replaceAll(' ', ''))
        .filter(s => s !== '0')

    let attack = new Roll(
        ["1d20", ...attack_parts].join(" + "),
        item.getRollData()
    )

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

    return {
        name: item.name,
        damage: damage_type_pair,
        attack: attack.formula,
        type: item.type
    }
}

export function enrich_actor(actor) {
    const weapons = actor.items
        .filter(item => item.hasAttack && item.type !== 'consumable')
        .map(item => gen_item_deets(item, actor.system.details.level))

    let currency = actor.system['currency']
    for (const key in currency) {
        if (currency.hasOwnProperty(key) && !currency[key]) {
            currency[key] = 0;
        }
    }

    let portrait_url = actor.img.indexOf('http://') === 0 || actor.img.indexOf('https://') === 0 ?
        actor.img : new URL(actor.img, window.location.origin).href


    const clone_pc = JSON.parse(JSON.stringify(
        actor.getRollData(),
        (k, v) => v instanceof Set ? [...v] : v)
    )
    clone_pc.details['dead'] = Boolean(actor.effects.find(e => !e.disabled && e.name === 'Dead'))

    const out = {
        ...prune_roll_data(clone_pc),
        name: actor.name,
        id: actor.id,
        discord_ids: actor_to_discord_ids(actor),
        weapons: weapons,
        portrait_url: portrait_url
    }

    return out
}

async function upload(pc) {
    const guild_id = game.settings.get(MODULE_ID, GUILD_ID)
    const authorization = game.settings.get(MODULE_ID, AUTH)
    const requestOptions = {
        method: 'PUT',
        headers: new Headers({
            "Accept": "application/json",
            "Content-Type": "application/json",
            'Guild-Id': guild_id,
            'Authorization': authorization
        }),
        body: JSON.stringify(pc),
        redirect: 'follow'
    };

    return await fetch(`${ORONDER_BASE_URL}/actor`, requestOptions)
}


const actor_to_discord_ids = actor =>
    Object.entries(actor.ownership)
        .filter(([owner_id, perm_lvl]) => perm_lvl === 3)
        .map(([owner_id, _]) => game.settings.get(MODULE_ID, ID_MAP)[owner_id])
        .filter(discord_id => discord_id)


export async function full_sync() {
    game.actors.map(sync_actor)
}

export async function sync_actor(actor) {
    if (actor.type !== "character")
        return

    let discord_ids = actor_to_discord_ids(actor)
    if (!discord_ids.length)
        return

    const old_hash = localStorage.getItem(`${ACTORS}.actor.id`)
    const actor_obj = enrich_actor(actor)
    const new_hash = hash(actor_obj)
    // const new_hash = hash(actor_obj)
    if (!old_hash || old_hash !== new_hash) {
        const response = await upload(actor_obj)
        if (response.ok) {
            localStorage.setItem(`${ACTORS}.actor.id`, new_hash)
        }
    }
}