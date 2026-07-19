import {ID_MAP, MODULE_DEBUG_TAG, MODULE_ID} from './constants.mjs'
import objectHash from 'object-hash'

/**
 * Utility class to handle logging to console with an attached debug tag to identify module logs.
 */
export class Logger {
    static debug(logString) {
        console.debug(..._processLog(logString))
    }

    static info(logString) {
        console.info(..._processLog(logString))
    }

    static log(logString) {
        console.log(..._processLog(logString))
    }

    static warn(logString, options = {}) {
        if (options.ui ?? true)
            ui.notifications.warn(logString, {...options, console: false})
        if (options.console ?? true) console.warn(..._processLog(logString))
    }

    static error(logString, options = {}) {
        if (options.ui ?? true)
            ui.notifications.error(logString, {...options, console: false})
        if (options.console ?? true) console.error(..._processLog(logString))
    }
}

/**
 * Attaches a debug tag to a string to prep it for console logging.
 * @param {String} logString The string to attach as a debug tag to.
 * @returns String[] formatted log string with the module debug tag attached.
 * @private
 */
function _processLog(logString) {
    return [...MODULE_DEBUG_TAG, logString]
}

export function hash(obj) {
    return objectHash(obj, {unorderedArrays: true, respectType: false})
}

/**
 *
 * \s*\+?\s* matches 0 or more whitespace optionally followed by a plus signs followed by zero or more whitespace
 * (?:(?:-\s*)?(?<!\d)0)? optionally matches a zero optionally proceeded by a minus sign and/or white space
 * (?:<previous two lines>)* matches the above 0 or more times
 * ([+\-])\s* matches and captures a plus or minus sign in addition to matching zero or more whitespace
 *
 @param {Item5e} item
 @returns {Roll}
 */
export function item_roll(item) {
    const parts = (
        item.system.activities?.getByType('attack')[0].getAttackData() ??
        item.getAttackToHit()
    ).parts
    const formula = `1d20 + ${parts.join('+')}`.replace(
        /(?:\s*\+?\s*(?:(?:-\s*)?(?<!\d)0)?)*([+\-])\s*/g,
        ' $1 '
    )

    return new Roll(formula, item.getRollData())
}

/**
 @param {Application} app
 */
export function auto_resize(app) {
    const centerPrev = app.position.top + app.position.height / 2

    const pos = app.setPosition({
        width: app.position.width,
        height: 'auto'
    })

    const center = pos.top + pos.height / 2
    app.setPosition({
        width: app.position.width,
        height: app.position.height,
        top: app.position.top + (centerPrev - center)
    })
}

/**
 * Turns a D20Roll (or a list of them) into a Discord flavored markdown string.
 * Moved from incoming.mjs so every system adapter can share it.
 *
 * @param {Roll[]|Roll|null} rolls
 */
export function rolls_to_str(rolls) {
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
 * @param {string} url
 */
export function fix_relative_url(url) {
    return !url || url.indexOf('http://') === 0 || url.indexOf('https://') === 0
        ? url
        : new URL(url, window.location.origin).href
}

/**
 * Count of leaf values in a nested object. Moved from module.mjs.
 * @returns number
 * @param i
 */
export function value_count(i) {
    if (typeof i === 'object') {
        return Object.values(i)
            .map(value_count)
            .reduce((acc, cur) => acc + cur)
    } else if (Array.isArray(i)) {
        return i.map(value_count).reduce((acc, cur) => acc + cur)
    } else {
        return 1
    }
}

// noinspection JSValidateJSDoc
/**
 * Discord ids for every OWNER of an actor, resolved through the id_map
 * setting value. Extracted from sync.mjs so adapters can stay free of
 * game.settings access (id_map is passed in by the caller).
 *
 @param {Actor} actor
 @param {Object} id_map
 @return {string[]}
 */
export const ownership_to_discord_ids = (actor, id_map) =>
    Object.entries(actor.ownership)
        .filter(
            ([_, perm_lvl]) =>
                perm_lvl === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
        )
        .map(([owner_id, _]) => id_map[owner_id])
        .filter(discord_id => discord_id)

/**
 @param {string} discord_id
 @param {Actor} actor
 @returns {User}
 */
export function get_user(discord_id, actor) {
    const foundry_user_ids = Object.entries(
        game.settings.get(MODULE_ID, ID_MAP)
    )
        .filter(([_, v]) => v === discord_id)
        .map(([k, _]) => k)

    const actor_owners = Object.entries(actor.ownership)
        .filter(
            ([_, ownership_level]) =>
                ownership_level === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
        )
        .map(([user_id, _]) => user_id)

    const user_id = foundry_user_ids.find(user_id =>
        actor_owners.includes(user_id)
    )

    return game.users.players.find(p => p.id === user_id)
}
