import {MODULE_DEBUG_TAG} from "./constants.mjs";

/**
 * Utility class to handle logging to console with an attached debug tag to identify module logs.
 */
export class Logger {
    /**
     * Sends an info log to the console.
     * @param {String} logString The string to log as an info.
     */
    static log(logString) {
        console.log(..._processLog(logString));
    }

    /**
     * Sends an error log to the console and displays an error UI notification.
     * @param {String} logString The string to log as an error.
     * @param options
     */
    static logError(logString, options = {}) {
        if (options.ui ?? true) ui.notifications.error(logString, {console: false});
        if (options.console ?? true) console.error(..._processLog(logString));
    }

    /**
     * Sends a warning log to the console and displays a warning UI notification.
     * @param {String} logString The string to log as a warning.
     * @param options
     */
    static logWarning(logString, options = {}) {
        if (options.ui ?? true) ui.notifications.warn(logString, {console: false});
        if (options.console ?? true) console.warn(..._processLog(logString));
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

async function hash_json_object(obj) {
    if (typeof obj !== 'object' || obj === null) {
        // If the input is not an object, return its string representation
        return JSON.stringify(obj);
    }

    if (Array.isArray(obj)) {
        // If it's an array, recursively sort and hash its elements
        const sortedArray = await Promise.all(
            obj.map(async (item) => await hash_json_object(item))
        );
        return JSON.stringify(sortedArray);
    }

    // Sort the keys alphabetically for objects
    const sortedJsonObject = {};
    Object.keys(obj)
        .sort()
        .forEach((key) => {
            sortedJsonObject[key] = obj[key];
        });

    // Convert the sorted JSON object to a string and hash it
    const jsonString = JSON.stringify(sortedJsonObject);

    // Convert the string to a Uint8Array
    const encoder = new TextEncoder();
    const data = encoder.encode(jsonString);

    // Calculate the SHA-256 hash
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);

    // Convert the hash to a hexadecimal string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((byte) =>
        byte.toString(16).padStart(2, '0')
    ).join('');

    return hashHex;
}