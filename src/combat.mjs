import {auto_resize, Logger} from './util.mjs'
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
    const c = Object.assign({}, combat, updateData)
    const combatant = c.turns[c.turn]
    const actor = game.actors.find(a => a.id === combatant.actorId)

    if (combatant.hidden) return ''

    const token = canvas.tokens.placeables.find(p => p.id === combatant.tokenId)
    const discord_id = actor_to_discord_ids(actor)
    const health_settings = game.settings.get(MODULE_ID, COMBAT_HEALTH_ESTIMATE)

    let output = ''
    if (discord_id.length)
        output += `${game.i18n.localize('oronder.Its-Your-Turn')} <@${discord_id[0]}>\n`
    output += '```md\n'
    output += `# ${game.i18n.localize('oronder.Initiative')} ${combatant.initiative} ${game.i18n.localize('oronder.Round')} ${c.round}\n`

    if (combatant.defeated) {
        output += `${combatant.name} <Defeated>\n`
    } else if (token.document.hidden) {
        output += `${combatant.name} <Hidden>\n`
    } else {
        const hp = get_health(
            {
                ...actor.system.attributes.hp,
                ...token.document.delta?.system?.attributes?.hp
            },
            health_settings,
            actor.type
        )
        output += `${combatant.name} <${hp}>\n`
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
    const hook_fun =
        game.version < 13
            ? 'prototype._updateObject'
            : 'DEFAULT_OPTIONS.form.handler'

    libWrapper.register(
        'oronder',
        `CombatTrackerConfig.${hook_fun}`,
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

    Hooks.on('renderCombatTrackerConfig', async (combatTrackerConfig, html) => {
        if (game.version < 13) {
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
                .insertBefore(html.find('form button').last())
        } else {
            const formGroup = document.createElement('div')
            formGroup.className = 'form-group'

            const label = document.createElement('label')
            label.textContent = game.i18n.localize(
                'oronder.Publish-Combat-Tracker-To-Discord'
            )
            label.htmlFor = 'oronder_combat_tracker_toggle'

            const formFields = document.createElement('div')
            formFields.className = 'form-fields'

            const input = document.createElement('input')
            input.type = 'checkbox'
            input.id = 'oronder_combat_tracker_toggle'
            input.checked = game.settings.get(MODULE_ID, COMBAT_ENABLED)

            const hint = document.createElement('p')
            hint.className = 'hint'
            hint.appendChild(
                document.createTextNode(
                    'On Turn and Round Changes, updates will be published to Discord.'
                )
            )

            formGroup.appendChild(label)
            formGroup.appendChild(formFields)
            formFields.appendChild(input)
            formGroup.appendChild(hint)

            const last_div = html.querySelector(
                'div.form-group[data-setting-id="core.combatTheme"]'
            )
            last_div.parentNode.insertBefore(formGroup, last_div)
        }
        auto_resize(combatTrackerConfig)
    })
}
