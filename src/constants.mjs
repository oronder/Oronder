export const MODULE_ID = "oronder"
export const MODULE_NAME = "Oronder"
export const MODULE_DEBUG_TAG = [
    `%c${MODULE_NAME}`,
    `color: #66023c; font-weight: bold;`,
    `|`,
];

export const GUILD_ID = "guild_id"
export const AUTH = "auth"
export const ORONDER_CONFIGURATION_FORM = "oronder_options"
export const VALID_CONFIG = "valid_config"
export const ID_MAP = "id_map"

export const ACTORS = "actors"

const common  = window.location.host === 'localhost:65434' ? '://localhost:65435' : 's://api.oronder.com'
export const ORONDER_BASE_URL = `http${common}`
export const ORONDER_WS_URL = `ws${common}`