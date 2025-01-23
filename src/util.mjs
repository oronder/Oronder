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
