import {get_user, Logger} from './util.mjs'
import {socket} from './module.mjs'

/**
 *
 * @param {D20Roll} roll
 */
function roll_to_str(roll) {
    const formula = roll.terms
        .map(t => {
            if ('results' in t) {
                const f = t.results.some(_ => _.discarded)
                    ? r => (r.discarded ? `~~${r.result}~~` : `**${r.result}**`)
                    : r => r.result

                const rolls = t.results.map(f).join(', ')
                return `${t.expression} (${rolls})`
            } else {
                return t.expression
            }
        })
        .join('')

    return `${formula} = \`${roll.total}\``
}

/**
 @param {Actor} actor
 @param {Object} data
 @param {function(Object)} callback
 */
async function incoming_roll(actor, data, callback) {

    // if ( ability === "concentration" ) this.actor.rollConcentration({ event, legacy: false });
    // else if ( isSavingThrow ) this.actor.rollSavingThrow({ ability, event });
    // else this.actor.rollAbilityCheck({ ability, event });
    switch (data['type']) {
        case 'ability':
            const a = actor.system.abilities[data.stat]
            break
        case 'tool':
            const b = actor.system.tools[data.stat]
            break
        case 'skill':
            const c = actor.system.skills[data.stat]
            break
    }
    callback({})
}

/**
 @param {Actor} actor
 @param {Object} data
 @param {function(Object)} callback
 */
async function incoming_attack(actor, data, callback) {
    const item = actor.items.find(i => i.id === data.item_id)

    if (item === undefined) {
        Logger.error(game.i18n.localize('oronder.Item-Not-Found'))
        callback({})
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
        atk: roll_to_str(atk),
        dmg: roll_to_str(dmg)
    })
}

export function set_incoming_hooks() {
    socket.on('roll', async (data, callback) => {
        const actor = game.actors.find(a => a.id === data.actor_id)
        if (actor === undefined) {
            Logger.error(game.i18n.localize('oronder.Actor-Not-Found'))
            callback({})
            return
        }

        switch (data['type']) {
            case 'initiative':
                if (!game.combat) {
                    callback({})
                    return
                }
                const combat = await actor.rollInitiative({
                    createCombatants: true,
                    rerollInitiative: true
                })

                const initiative = combat.combatants.find(
                    a => a.actorId === actor.id
                ).initiative

                callback({res: initiative})
                break
            case 'ability':
            case 'tool':
            case 'skill':
                await incoming_roll(actor, data, callback)
                break
            case 'attack':
                await incoming_attack(actor, data, callback)
                break
        }
    })
}
