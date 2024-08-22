import {autoResizeApplicationExisting, Logger} from './util.mjs'
import {combat_hooks, socket} from './module.mjs'
import {
    COMBAT_ENABLED,
    COMBAT_HEALTH_ESTIMATE,
    COMBAT_HEALTH_ESTIMATE_TYPE,
    MODULE_ID
} from './constants.mjs'
import {actor_to_discord_ids} from './sync.mjs'

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
    const roundRender = parse_combat_round(
        {...combat, ...updateData},
        updateOptions
    )
    const turnRender = parse_turn(combat, updateData)
    socket.emit('combat', roundRender + turnRender)
}

export function set_combat_hooks() {
    Logger.info('Setting Combat Hooks.')

    Logger.info(combat_hooks)
    const turn_off_hook = key => {
        if (combat_hooks[key]) {
            Hooks.off(key, combat_hooks[key])
            combat_hooks[key] = undefined
        }
    }

    // Turn off hooks
    ;['combatStart', 'combatTurn', 'combatRound'].forEach(turn_off_hook)

    // Turn them back on
    if (game.settings.get(MODULE_ID, COMBAT_ENABLED)) {
        combat_hooks.combatStart = Hooks.on('combatStart', on_combat_start)
        combat_hooks.combatTurn = Hooks.on('combatTurn', on_combat_turn)
        combat_hooks.combatRound = Hooks.on('combatRound', on_combat_round)
    }
}

function get_effects_in_markdown(actor, token) {
    let a = token.document.actorLink ? actor : token.actor

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
    const c = Object.assign({},combat, updateData)
    const combatant = c.turns[c.turn]
    const actor = game.actors.find(a => a.id === combatant.actorId)

    if (actor.hidden) return ''

    const token = canvas.tokens.placeables.find(p => p.id === combatant.tokenId)
    const discordId = actor_to_discord_ids(actor)
    const healthSetting = game.settings.get(MODULE_ID, COMBAT_HEALTH_ESTIMATE)

    let output = ''
    if (discordId.length)
        output += `${game.i18n.localize('oronder.Its-Your-Turn')} <@${discordId[0]}>\n`
    output += '```md\n'
    output += `# ${game.i18n.localize('oronder.Initiative')} ${combatant.initiative} ${game.i18n.localize('oronder.Round')} ${c.round}\n`

    if (combatant.defeated) {
        output += `${actor.name} <Defeated>\n`
    } else if (token.document.hidden) {
        output += `${actor.name} <Hidden>\n`
    } else {
        const hp = get_health(
            {
                ...actor.system.attributes.hp,
                ...token.document.delta?.system?.attributes?.hp
            },
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
    const parsed = combat.turns.map(c => {
        return {
            ...c,
            ix: c._id,
            actor: game.actors.find(a => a.id === c.actorId),
            token: canvas.tokens.placeables.find(p => p.id === c.tokenId)
        }
    })
    const healthSetting = game.settings.get(MODULE_ID, COMBAT_HEALTH_ESTIMATE)

    let output = '```md\n'
    output += `${game.i18n.localize('oronder.Current-Round')}: ${combat.round}\n`
    output += '==================\n'

    // Parse each combatant
    output += parsed.reduce((acc, c) => {
        // Hidden from Initiative
        if (c.hidden) return acc

        const rawHp = {
            ...c.actor.system.attributes.hp,
            ...c.token.document.delta?.system?.attributes?.hp
        }
        const init = `${c.initiative || 'XX'}`.padStart(3)

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
            const ac =
                c.actor.type === 'character'
                    ? ` (AC ${c.actor.system.attributes.ac.value})`
                    : ''
            return `${acc}${init}: ${c.name} <${hp}>${ac}\n${get_effects_in_markdown(c.actor, c.token)}`
        }
    }, '')
    output += '```\n'
    return output
}

function get_health(hp, combatHealthSetting, actorType) {
    const format_health = hpObj => {
        return `${hpObj.value}/${hpObj.max}${hpObj.temp ? `(${hpObj.temp})` : ''}`
    }

    const get_health_estimate = hp => {
        const pct = Math.round(
            hp.effectiveMax ? (hp.value / hp.effectiveMax) * 100 : 0,
            0,
            100
        )
        switch (true) {
            case pct > 99:
                return game.i18n.localize('oronder.Unharmed')
            case pct > 75:
                return game.i18n.localize('oronder.Healthy')
            case pct > 50:
                return game.i18n.localize('oronder.Injured')
            case pct > 25:
                return game.i18n.localize('oronder.Bloodied')
            case pct > 10:
                return game.i18n.localize('oronder.Severe')
            case pct > 0:
                return game.i18n.localize('oronder.Critical')
            default:
                return game.i18n.localize('oronder.Dead')
        }
    }

    switch (combatHealthSetting) {
        case COMBAT_HEALTH_ESTIMATE_TYPE.Monsters:
            return actorType === 'character'
                ? format_health(hp)
                : get_health_estimate(hp)
        case COMBAT_HEALTH_ESTIMATE_TYPE.All:
            return get_health_estimate(hp)
        case COMBAT_HEALTH_ESTIMATE_TYPE.None:
            return format_health(hp)
        default:
            console.error(
                `Combat Health Setting(${combatHealthSetting}) is not supported.`
            )
    }
}

export function register_combat_settings_toggle() {
    libWrapper.register(
        'oronder',
        'CombatTrackerConfig.prototype._updateObject',
        async function (wrapped, ...args) {
            await game.settings.set(
                MODULE_ID,
                COMBAT_ENABLED,
                this.form.elements.oronder_combat_tracker_toggle.checked
            )
            set_combat_hooks()
            return wrapped(...args)
        },
        'WRAPPER'
    )

    Hooks.on('renderCombatTrackerConfig', async (application, $html, _) => {
        $('<div/>', {class: 'form-group'})
            .append(
                $('<label/>', {
                    text: game.i18n.localize(
                        'oronder.Publish-Combat-Tracker-To-Discord'
                    ),
                    for: 'oronder_combat_tracker_toggle'
                }),
                $('<input/>', {
                    type: 'checkbox',
                    id: 'oronder_combat_tracker_toggle',
                    checked: game.settings.get(MODULE_ID, COMBAT_ENABLED)
                })
            )
            .insertBefore($html.find('form button').last())

        autoResizeApplicationExisting(application)
    })
}

export function handle_incoming_rolls() {
    socket.on('roll', async (data, callback) => {
        const actor = game.actors.find(a => a.id === data.actor_id)
        if (actor === undefined) {
            Logger.error(game.i18n.localize('oronder.Actor-Not-Found'))
            return
        }

        // const foundry_user_ids = Object.entries(game.settings.get(MODULE_ID, ID_MAP))
        //     .filter(([_, v]) => v === data.discord_id)
        //     .map(([k, _]) => k)
        //
        // const actor_owners = Object.entries(actor.ownership)
        //     .filter(([_, ownership_level]) => ownership_level === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)
        //     .map(([user_id, _]) => user_id)
        //
        // const user_id = foundry_user_ids.find(
        //     user_id => actor_owners.includes(user_id)
        // ) || game.userId
        //
        // const user_name = game.users.players.find(p => p.id === user_id).name
        // const flavor = `Sent via Oronder from ${user_name}.`

        switch (data['type']) {
            case 'stat':
                Logger.info(`Stat Roll`)
                Logger.info(data)
                break
            case 'attack':
                Logger.info(`Attack Roll`)
                const item = actor.items.find(i => i.id === data.item_id)

                if (item === undefined) {
                    Logger.error(game.i18n.localize('oronder.Item-Not-Found'))
                    return
                }

                const atk = await item.rollAttack({
                    fastForward: true,
                    advantage: data.advantage || false,
                    disadvantage: data.disadvantage || false
                })

                const spell_level =
                    item.type === 'spell'
                        ? Math.max(data.spell_level, item.system.level)
                        : null
                const versatile = item.type === 'weapon' ? data.versatile : null

                const dmg = await item.rollDamage({
                    options: {
                        fastForward: true
                    },
                    critical: atk.isCritical,
                    spellLevel: spell_level,
                    versatile: versatile
                })

                callback({
                    atk: `${atk.formula} = \`${atk.total}\``,
                    dmg: `${dmg.formula} = \`${dmg.total}\``
                })
                break
        }
    })
}
