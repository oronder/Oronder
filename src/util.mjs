import {MODULE_DEBUG_TAG, ORONDER_BASE_URL} from "./constants.mjs"
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
        if (options.ui ?? true) ui.notifications.warn(logString, {...options, console: false})
        if (options.console ?? true) console.warn(..._processLog(logString))
    }

    static error(logString, options = {}) {
        if (options.ui ?? true) ui.notifications.error(logString, {...options, console: false})
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

const hash_options = {unorderedArrays: true, respectType: false}

export function hash(obj) {
    return objectHash(obj, hash_options)
}

export function requestOptions(auth) {
    return {
        method: 'GET', headers: new Headers({
            "Accept": "application/json", 'Authorization': auth
        }), redirect: 'follow'
    }
}

export async function get_guild(auth) {
    try {
        Logger.info(`get_guild()`)
        const response = await fetch(`${ORONDER_BASE_URL}/guild`, requestOptions(auth))
        if (response.status !== 401) {
            return await handle_json_response(response)
        }
    } catch (error) {
        Logger.error(`Error getting Discord Guild: ${error.message}`)
    }
    return undefined
}


export async function handle_json_response(response) {
    if (!response.ok) {
        const errorMessage = await response.json()
        throw new Error(game.i18n.localize("oronder.Unexpected-Error") + ' ' + errorMessage.detail)
    }

    try {
        return await response.json()
    } catch (error) {
        throw new Error(`Failed to parse JSON response. Error: ${error.message}`)
    }
}