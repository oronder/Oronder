import {item_roll, Logger} from "./util.mjs";
import {socket} from "./module.mjs";
import {COMBAT_HEALTH_ESTIMATE, ID_MAP, MODULE_ID} from "./constants.mjs";
import { actor_to_discord_ids } from "./sync.mjs";


export function set_combat_hooks() {
    Logger.info("Setting Combat Hooks.")

    Hooks.on("combatStart", async (combat, updateData) => {
        const roundRender = parseCombatRound({ ...combat, ...updateData })
        const turnRender = parseTurn(combat, updateData) 
        socket.emit('combat', roundRender+turnRender)
    })
    Hooks.on("combatTurn", async (combat, updateData, updateOptions) => {
        if (updateOptions.direction < 1) return
        const turnRender = parseTurn(combat, updateData) 
        socket.emit('combat', turnRender)
    })
    Hooks.on("combatRound", async (combat, updateData, updateOptions) => {
        if (updateOptions.direction < 1) return
        const roundRender = parseCombatRound({ ...combat, ...updateData }, updateOptions)
        const turnRender = parseTurn(combat, updateData) 
        socket.emit('combat', roundRender+turnRender)
    })
}

function getEffectsInMarkdown(actor, token) {
    let effects = new Map()
    if (token.document.actorLink) {
        for(const e of actor.allApplicableEffects()) {
            if (e.disabled) continue
            // Ignore passive effects without attached statuses
            if (e.duration.type === 'none' && e.statuses.size === 0) continue
            if (!effects.has(e._id)) effects.set(e._id,e.name)
        }
    }
    else {
        token.document.delta.effects.forEach((v) => {
            if (!effects.has(v._id)) effects.set(v._id,v.name)
        })
    }

    let markdown = ''
    effects.forEach(val => {
        markdown += `${'-'.padStart(4)} ${val}\n`
    })
    return markdown
}

function parseTurn(combat, updateData) {
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
    if(discordId.length)
        output += `It's your turn <@${discordId[0]}>\n`
    output += '```md\n'
    output += `# Initiative ${actor.initiative} Round ${c.round}\n`

    if(turn.defeated) {
        output += `${actor.name} <Defeated>\n`
    } else if (token.document.hidden) {
        output += `${actor.name} <Hidden>\n`
    } else {
        const hp = getHealth(
            { ...actor.system.attributes.hp, ...token.document.delta?.system?.attributes?.hp },
            healthSetting, 
            actor.type
        )
        output += `${actor.name} <${hp}>\n`
        output += getEffectsInMarkdown(actor, token)
    }
    output += '```\n'
    return output
}

function parseCombatRound(combat) {
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
    output += parsed.reduce((acc,c) => {
        // Hidden from Initiative
        if (c.hidden) return acc

        const rawHp = { ...c.actor.system.attributes.hp, ...c.token.document.delta?.system?.attributes?.hp }
        const init = `${c.initiative || "XX"}`.padStart(3)

        // Combatant is marked as defeated in initative
        if(c.defeated) {
            let line = `${init}: ${c.name} <Defeated>\n`
            return acc + line
        // Combatant is shown in initiative but the token is hidden
        } else if (c.token.document.hidden) {
            let line = `${init}: ${c.name} <Hidden>\n`
            return acc + line
        } else {
            const hp = getHealth(rawHp, healthSetting, c.actor.type)
            const ac = `AC ${c.actor.system.attributes.ac.value}`

            let line = `${init}: ${c.name} <${hp}> (${ac})\n`
            line += getEffectsInMarkdown(c.actor, c.token)

            return acc + line
        }
    }, '')
    output += "```\n"
    return output
}

function getHealth(hp, combatHealthSetting, actorType) {
    const formatHealth = (hpObj) => {
        return `${hpObj.value}/${hpObj.max}${hpObj.temp ? `(${hpObj.temp})`:''}` 
    }

    const getHealthEstimate = (hp) => {
        const pct = Math.round(hp.effectiveMax ? (hp.value / hp.effectiveMax) * 100 : 0, 0, 100);
        switch (true) {
            case pct > 99: return "Unharmed";
            case pct > 75: return "Healthy";
            case pct > 50: return "Injured";
            case pct > 25: return "Bloodied";
            case pct > 10: return "Severe";
            case pct > 0: return "Critical";
            default: return "Dead";
        }
    }

    switch (combatHealthSetting) {
        case 0: // Monsters Only
            return (actorType === "character") 
                ? formatHealth(hp)
                : getHealthEstimate(hp)
        case 1: // All
            return getHealthEstimate(hp)
        case 2: // None
            return formatHealth(hp)
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