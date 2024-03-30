import {item_roll, Logger} from "./util.mjs";
import {session_id, socket} from "./module.mjs";
import {ID_MAP, MODULE_ID} from "./constants.mjs";

export function combat_hooks() {
    Logger.info("Monk's Tokenbar found.")
    socket.emit('combat', {session_id: session_id, id_to_xp: mtb.actors.map(a => ([a['id'], a['xp']]))})

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