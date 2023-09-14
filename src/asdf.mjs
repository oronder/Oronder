import {ID_MAP, MODULE_ID, ORONDER_BASE_URL} from "./constants.mjs";


function prune_roll_data(
    {
        spells,
        resources,
        flags,
        effects,
        srd5e,
        name,
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
    pc.attributes = (({init, ...o}) => o)(pc.attributes)
    pc.attributes['ac'] = (({equippedArmor, equippedShield, ...o}) => o)(pc.attributes['ac'])
    pc.attributes['hp'] = (({bonuses, ...o}) => o)(pc.attributes['hp'])


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
        if ('subclass' in pc.classes[class_name])
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
    return Object.keys(pc).length ? pc : null
}


function enrich_pc(pc) {
    const discord_feature = pc.items.find(i => i.name.toLowerCase().includes('discord')) || null
    const discord_id = discord_feature && discord_feature.system.source || null
    const alias = discord_feature && discord_feature.system.requirements || pc.name
    const weapons = pc.items
        .filter(item => item.hasAttack && item.type !== 'consumable')
        .map(item => {
            const attack_to_hit = item.getAttackToHit()
            const attack_parts = attack_to_hit.parts
                .map(p => attack_to_hit.rollData[p.slice(1)] || p)
                .map(s => s.toString().replaceAll('+', '').replaceAll(' ', ''))
                .filter(s => s !== '0')

            let attack = new Roll(
                ["1d20", ...attack_parts].join(" + "),
                item.getRollData()
            )


            function damage_calc(item) {
                return item.system.damage.parts.map(part => {
                    let damage = new Roll(part[0], item.getRollData()).formula
                    if (item?.system?.scaling?.mode === 'cantrip') {
                        if (pc.system.details.level >= 17)
                            damage = '4d' + damage.slice(2)
                        else if (pc.system.details.level >= 11)
                            damage = '3d' + damage.slice(2)
                        else if (pc.system.details.level >= 5)
                            damage = '2d' + damage.slice(2)
                    }
                    return [damage, part[1]]
                })
            }

            return {
                name: item.name,
                damage: damage_calc(item),
                attack: attack.formula,
                type: item.type
            }
        })

    let currency = pc.system['currency']
    for (const key in currency) {
        if (currency.hasOwnProperty(key) && !currency[key]) {
            currency[key] = 0;
        }
    }

    let portrait_url = pc.img.indexOf('http://') === 0 || pc.img.indexOf('https://') === 0 ?
        pc.img :
        new URL(pc.img, window.location.origin).href


    const clone_pc = JSON.parse(JSON.stringify(
        pc.getRollData(),
        (k, v) => v instanceof Set ? [...v] : v)
    )
    clone_pc.details['dead'] = Boolean(pc.effects.find(e => !e.disabled && e.name === 'Dead')) || !pc.system.attributes.hp.value


    return {
        ...prune_roll_data(clone_pc),
        name: alias,
        id: pc.id,
        discord_ids: [discord_id],
        weapons: weapons,
        portrait_url: portrait_url
    }
}


function download(content, fileName, contentType) {
    const a = document.createElement("a");
    const file = new Blob([content], {type: contentType});
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
}

async function upload(pc_json) {
    for (const pc of pc_json) {
        const body = JSON.stringify(pc)

        const requestOptions = {
            method: 'PUT',
            headers: new Headers({
                "Accept": "application/json",
                "Content-Type": "application/json",
                'Guild-Id': guild_id,
                'Authorization': authorization
            }),
            body: body,
            redirect: 'follow'
        };

        await fetch(`${ORONDER_BASE_URL}/actor`, requestOptions)
            .then(response => response.text())
            .then(result => console.log(result !== 'null' ? result : `${pc.name}: ${body.length}`))
            .catch(error => console.log('error', error));
    }
    ChatMessage.create({content: '<div class="dnd5e red-full chat-card"><div class="dnd5e chat-card item-card"><h1>Discord Synced</h1></div></div>'})
}


const pc_folder = game.folders.find(f => f.name === "Player Characters")


const actor_to_discord_ids = actor =>
    Object.entries(actor.ownership)
        .filter(([owner_id, perm_lvl]) => perm_lvl === 3)
        .map(([owner_id, _]) => game.settings.get(MODULE_ID, ID_MAP)[owner_id])
        .filter(discord_id => discord_id)


function full_sync() {
    game.actors.filter(_ => _.type === "character")
        .forEach(actor => {
            let discord_ids = actor_to_discord_ids(actor)
            if (discord_ids) {

            }
        })
}


const pcs = [pc_folder, ...pc_folder.getSubfolders()]
    .flatMap(f => f.contents)
    .filter(actor =>
        actor.type === "character" &&
        actor.system.details.level >= 5 &&
        actor.items.some(i => i.name.toLowerCase().includes('discord'))
    )

const pc_json = pcs.map(pc => enrich_pc(pc))
await upload(pc_json)

console.log("Discord update complete")