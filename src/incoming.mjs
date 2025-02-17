import {get_user, Logger} from './util.mjs'
import {socket} from './module.mjs'

/**
 *
 * @param {D20Roll[]|D20Roll|null} rolls
 */
function rolls_to_str(rolls) {
    if (rolls == null) {
        Logger.debug('null passed to rolls_to_str()')
        return null
    }

    return (Array.isArray(rolls) ? rolls : Array(rolls))
        .map(roll => {
            const formula = roll.terms
                .map(t => {
                    if ('results' in t) {
                        const f = t.results.some(_ => _.discarded)
                            ? r =>
                                r.discarded
                                    ? `~~${r.result}~~`
                                    : `**${r.result}**`
                            : r => r.result

                        const rolls = t.results.map(f).join(', ')
                        return `${t.expression} (${rolls})`
                    } else {
                        return t.expression
                    }
                })
                .join('')

            return `${formula} = \`${roll.total}\``
        })
        .join('\n')
}

/**
 @param {Actor} actor
 @param {Object} data
 @param {Object} event
 @param {string} foundry_user_id
 @return Object
 */
async function incoming_attack(actor, data, event, foundry_user_id) {
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
            {attackMode: data.attack_mode, event: event},
            {configure: false},
            {data: {user: foundry_user_id}}
        )
    )[0]

    const dmg = (
        await activity.rollDamage(
            {
                attackMode: data.attack_mode,
                event: {
                    altKey: atk.isCritical,
                    target: {closest: _ => null}
                }
            },
            {configure: false},
            {data: {user: foundry_user_id}}
        )
    ).map(d => [rolls_to_str(d), d.options.type])

    return {
        atk: rolls_to_str(atk),
        dmg: dmg
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
        createCombatants: true,
        rerollInitiative: true
    })

    const initiative = combat.combatants.find(
        a => a.actorId === actor.id
    ).initiative

    return {
        res: `${rolls_to_str(rolls).replace('()', '(?)').slice(0, -2)}${initiative}\``
    }
}

export function set_incoming_hooks() {
    socket.on('roll', async (data, callback) => {
        const actor = game.actors.find(a => a.id === data.actor_id)
        if (actor === undefined) {
            Logger.error(game.i18n.localize('oronder.Actor-Not-Found'))
            callback({})
            return
        }
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
                out = await incoming_attack(actor, data, event, foundry_user_id)
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
        Logger.debug(`ROLL OUT: ${out}`)
        callback(out)
    })
}
