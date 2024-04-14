import {item_roll, Logger} from "./util.mjs";
import {combat_hooks, socket} from "./module.mjs";
import {COMBAT_ENABLED, COMBAT_HEALTH_ESTIMATE, COMBAT_HEALTH_ESTIMATE_TYPE, ID_MAP, MODULE_ID} from "./constants.mjs";
import {actor_to_discord_ids} from "./sync.mjs";

const on_combat_start = async (combat, updateData) => {
    const roundRender = parse_combat_round({...combat, ...updateData})
    const turnRender = parse_turn(combat, updateData)
    socket.emit('combat', roundRender + turnRender)
}
const on_combat_turn = async (combat, updateData, updateOptions) => {
    if (updateOptions.direction < 1) return
    const turnRender = parse_turn(combat, updateData)
    socket.emit('combat', turnRender)
}
const on_combat_round = async (combat, updateData, updateOptions) => {
    if (updateOptions.direction < 1) return
    const roundRender = parse_combat_round({...combat, ...updateData}, updateOptions)
    const turnRender = parse_turn(combat, updateData)
    socket.emit('combat', roundRender + turnRender)
}

export function set_combat_hooks() {
    Logger.info("Setting Combat Hooks.")

    Logger.info(combat_hooks)
    const turn_off_hook = (key) => {
        if (combat_hooks[key]) {
            Hooks.off(key, combat_hooks[key])
            combat_hooks[key] = undefined
        }
    }

    // Turn off hooks
    ["combatStart", "combatTurn", "combatRound"].forEach(turn_off_hook)

    // Turn them back on
    if (game.settings.get(MODULE_ID, COMBAT_ENABLED)) {
        combat_hooks.combatStart = Hooks.on("combatStart", on_combat_start)
        combat_hooks.combatTurn = Hooks.on("combatTurn", on_combat_turn)
        combat_hooks.combatRound = Hooks.on("combatRound", on_combat_round)
    }
}

function get_effects_in_markdown(actor, token) {
    let a = (token.document.actorLink) ? actor : token.actor

    let addedEffects = new Map()
    let markdown = ''
    for (const e of a.allApplicableEffects()) {
        if (e.disabled) continue
        // Ignore passive effects without attached statuses
        if (e.duration.type === 'none' && e.statuses.size === 0) continue
        if (!addedEffects.has(e._id)) {
            markdown += `${'-'.padStart(4)} ${e.name}\n`
            addedEffects.set(e._id, e.name)
        }
    }

    return markdown
}

function parse_turn(combat, updateData) {
    const c = Object.assign(combat, updateData)
    const turn = c.turns[c.turn]
    const actor = Object.assign(
        game.actors.find(a => a.id === turn.actorId),
        combat.combatants.find(cb => cb.tokenId === turn.tokenId))

    if (actor.hidden) return ''

    const token = canvas.tokens.placeables.find(p => p.id === turn.tokenId)
    const discordId = actor_to_discord_ids(actor)
    const healthSetting = game.settings.get(MODULE_ID, COMBAT_HEALTH_ESTIMATE)

    let output = ''
    if (discordId.length)
        output += `It's your turn <@${discordId[0]}>\n`
    output += '```md\n'
    output += `# Initiative ${actor.initiative} Round ${c.round}\n`

    if (turn.defeated) {
        output += `${actor.name} <Defeated>\n`
    } else if (token.document.hidden) {
        output += `${actor.name} <Hidden>\n`
    } else {
        const hp = get_health(
            {...actor.system.attributes.hp, ...token.document.delta?.system?.attributes?.hp},
            healthSetting,
            actor.type
        )
        output += `${actor.name} <${hp}>\n`
        output += get_effects_in_markdown(actor, token)
    }
    output += '```\n'
    return output
}

function parse_combat_round(combat) {
    // Get actors and token for each combatant by turn order
    const parsed = combat.turns.map((c) => {
        return {
            ...c,
            ix: c._id,
            actor: game.actors.find(a => a.id === c.actorId),
            token: canvas.tokens.placeables.find(p => p.id === c.tokenId)
        }
    })
    const healthSetting = game.settings.get(MODULE_ID, COMBAT_HEALTH_ESTIMATE)

    let output = "```md\n"
    output += `Current Round: ${combat.round}\n`
    output += "==================\n"

    // Parse each combatant
    output += parsed.reduce((acc, c) => {
        // Hidden from Initiative
        if (c.hidden) return acc

        const rawHp = {...c.actor.system.attributes.hp, ...c.token.document.delta?.system?.attributes?.hp}
        const init = `${c.initiative || "XX"}`.padStart(3)

        // Combatant is marked as defeated in initative
        if (c.defeated) {
            let line = `${init}: ${c.name} <Defeated>\n`
            return acc + line
            // Combatant is shown in initiative but the token is hidden
        } else if (c.token.document.hidden) {
            let line = `${init}: ${c.name} <Hidden>\n`
            return acc + line
        } else {
            const hp = get_health(rawHp, healthSetting, c.actor.type)
            const ac = `AC ${c.actor.system.attributes.ac.value}`

            let line = `${init}: ${c.name} <${hp}> (${ac})\n`
            line += get_effects_in_markdown(c.actor, c.token)

            return acc + line
        }
    }, '')
    output += "```\n"
    return output
}

function get_health(hp, combatHealthSetting, actorType) {
    const format_health = (hpObj) => {
        return `${hpObj.value}/${hpObj.max}${hpObj.temp ? `(${hpObj.temp})` : ''}`
    }

    const get_health_estimate = (hp) => {
        const pct = Math.round(hp.effectiveMax ? (hp.value / hp.effectiveMax) * 100 : 0, 0, 100);
        switch (true) {
            case pct > 99:
                return "Unharmed";
            case pct > 75:
                return "Healthy";
            case pct > 50:
                return "Injured";
            case pct > 25:
                return "Bloodied";
            case pct > 10:
                return "Severe";
            case pct > 0:
                return "Critical";
            default:
                return "Dead";
        }
    }

    switch (combatHealthSetting) {
        case COMBAT_HEALTH_ESTIMATE_TYPE.Monsters:
            return (actorType === "character")
                ? format_health(hp)
                : get_health_estimate(hp)
        case COMBAT_HEALTH_ESTIMATE_TYPE.All:
            return get_health_estimate(hp)
        case COMBAT_HEALTH_ESTIMATE_TYPE.None:
            return format_health(hp)
        default:
            console.error(`Combat Health Setting(${combatHealthSetting}) is not supported.`)
    }
}


export function handle_incoming_rolls() {
    socket.on('roll', async data => {
        const actor = game.actors.find(a => a.id === data.actor_id)
        if (actor === undefined) {
            Logger.error('actor not found')
            return
        }

        const foundry_user_ids = Object.entries(game.settings.get(MODULE_ID, ID_MAP))
            .filter(([_, v]) => v === data.discord_id)
            .map(([k, _]) => k)

        const actor_owners = Object.entries(actor.ownership)
            .filter(([_, ownership_level]) => ownership_level === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)
            .map(([user_id, _]) => user_id)

        const user_id = foundry_user_ids.filter(
            user_id => actor_owners.includes(user_id)
        )[0] || game.userId

        switch (data['type']) {
            case 'stat':
                Logger.info(`stat roll`)
                Logger.info(data)
                break
            case 'attack':
                Logger.info(`attack roll`)
                //Actors who haven't been synced after 3/27/24 may only have reference to item name and not id
                const item_match_fun = data?.item_id ?
                    i => i.id === data.item_id :
                    i => i.name === data.item_name

                const item = actor.items.find(item_match_fun)

                if (item === undefined) {
                    Logger.error('item not found')
                    return
                }

                //TODO: we want to use the roll from discord, but for now just focusing on formatting
                const roll = item_roll(item)

                await roll.toMessage({
                    user: game.user.id,
                    rollMode: 'roll',
                    speaker: ChatMessage.getSpeaker({actor}),
                    content: await renderTemplate('systems/dnd5e/templates/chat/item-card.hbs', {
                        user: game.user,
                        actor,
                        item,
                        data: item.getRollData(),
                        hasAttack: item.hasAttack,
                        hasDamage: item.hasDamage,
                        isHealing: item.isHealing,
                        rollType: item.system.actionType || 'Attack',
                        fullContext: true
                    })
                })
                let template = await renderTemplate('systems/dnd5e/templates/chat/item-card.hbs', {
                    actor,
                    item
                })
                await roll.toMessage({
                    user: game.user.id,
                    rollMode: 'roll',
                    speaker: ChatMessage.getSpeaker({actor}),
                })


                const item_html = await renderTemplate(
                    'systems/dnd5e/templates/chat/item-card.hbs',
                    {actor, item}
                )
                const roll_html = await roll.render()

                await roll.toMessage({
                    speaker: ChatMessage.getSpeaker({actor}),
                    user: user_id,
                    content: [item_html, roll_html].join('\n')
                })

                await ChatMessage.create({
                    user: game.user.id,

                    // flavor: `${actor.name} attacks with ${itemName}!`,
                    rolls: [(await roll.roll()).toJSON()],
                    type: CONST.CHAT_MESSAGE_TYPES.ROLL
                })

                break
        }
    })
}