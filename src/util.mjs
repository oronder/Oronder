import {MODULE_DEBUG_TAG} from "./constants.mjs";
import objectHash from 'object-hash';

/**
 * Utility class to handle logging to console with an attached debug tag to identify module logs.
 */
export class Logger {

    static debug(logString) {
        console.debug(..._processLog(logString));
    }

    static info(logString) {
        console.info(..._processLog(logString));
    }

    static log(logString) {
        console.log(..._processLog(logString));
    }

    static warn(logString, options = {}) {
        if (options.ui ?? true) ui.notifications.warn(logString, {console: false});
        if (options.console ?? true) console.warn(..._processLog(logString));
    }

    static error(logString, options = {}) {
        if (options.ui ?? true) ui.notifications.error(logString, {console: false});
        if (options.console ?? true) console.error(..._processLog(logString));
    }
}

/**
 * Attaches a debug tag to a string to prep it for console logging.
 * @param {String} logString The string to attach as a debug tag to.
 * @returns String[] formatted log string with the module debug tag attached.
 * @private
 */
function _processLog(logString) {
    return [...MODULE_DEBUG_TAG, logString];
}

const hash_options = {unorderedArrays: true, respectType: false}

export function hash(obj) {
    return objectHash(obj, hash_options)
}