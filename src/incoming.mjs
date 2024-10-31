import {get_user, Logger} from './util.mjs'
import {socket} from './module.mjs'

/**
 @param {Actor} actor
 @param {Object} data
 @param {function(Object)} callback
 */
async function incoming_roll(actor, data, callback) {}

/**
 @param {Actor} actor
 @param {Object} data
 @param {function(Object)} callback
 */
async function incoming_attack(actor, data, callback) {
    Logger.info(`Attack Roll`)
    const item = actor.items.find(i => i.id === data.item_id)

    if (item === undefined) {
        Logger.error(game.i18n.localize('oronder.Item-Not-Found'))
        return
    }

    let atk
    let dmg

    if ('activities' in item.system) {
        //dnd5e 4.0+
        let activity = item.system.activities.getByType('attack')[0]

        if ('spell_level' in data) {
            activity = item
                .clone(
                    {
                        'flags.dnd5e.scaling':
                            data.spell_level - item.system.level
                    },
                    {keepId: true}
                )
                .system.activities.get(activity.id)
        }
        const foundry_user = get_user(data.discord_id, actor)

        atk = (
            await activity.rollAttack(
                {
                    attackMode: data.attack_mode,
                    event: {
                        altKey: data.advantage === 'Advantage',
                        ctrlKey: data.advantage === 'Disadvantage',
                        target: {closest: _ => null}
                    }
                },
                {configure: false},
                {data: {user: foundry_user?.id}}
            )
        )[0]

        dmg = (
            await activity.rollDamage(
                {attackMode: data.attack_mode},
                {configure: false},
                {data: {user: foundry_user?.id}}
            )
        )[0]
    } else {
        atk = await item.rollAttack({
            fastForward: true,
            advantage: data.advantage === 'Advantage',
            disadvantage: data.advantage === 'Disadvantage'
        })

        dmg = await item.rollDamage({
            options: {
                fastForward: true
            },
            spellLevel: data.spell_level
        })
    }

    callback({
        atk: `${atk.formula} = \`${atk.total}\``,
        dmg: `${dmg.formula} = \`${dmg.total}\``
    })
}

export function set_incoming_hooks() {
    socket.on('roll', async (data, callback) => {
        const actor = game.actors.find(a => a.id === data.actor_id)
        if (actor === undefined) {
            Logger.error(game.i18n.localize('oronder.Actor-Not-Found'))
            return
        }

        switch (data['type']) {
            case 'stat':
                Logger.info(`Stat Roll\n${data}`)
                await incoming_roll(actor, data, callback)
                break
            case 'attack':
                Logger.info(`Attack Roll\n${data}`)
                await incoming_attack(actor, data, callback)
                break
        }
    })
}
