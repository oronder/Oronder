import {
    AUTH,
    BACKEND_URL,
    COMBAT_ENABLED,
    COMBAT_HEALTH_ESTIMATE,
    COMBAT_HEALTH_ESTIMATE_TYPE,
    ID_MAP,
    MODULE_ID,
    ORONDER_CONFIGURATION_FORM
} from './constants.mjs'
import {Logger} from './util.mjs'
import {OronderSettingsFormApplication} from './settings-form-application.mjs'
import {open_socket_with_oronder} from './module.mjs'

export const registerSettings = async () => {
    game.settings.register(MODULE_ID, AUTH, {
        scope: 'world',
        type: String,
        config: false,
        default: ''
    })
    game.settings.register(MODULE_ID, BACKEND_URL, {
        name: 'oronder.Backend-Url',
        hint: 'oronder.Backend-Url-Label',
        scope: 'world',
        type: String,
        config: true,
        default: '',
        // Reconnect the socket to the new backend without a reload. This
        // mirrors how the module already reconnects after auth changes
        // (open_socket_with_oronder(true) in settings-form-application.mjs).
        onChange: () => open_socket_with_oronder(true)
    })
    game.settings.register(MODULE_ID, ID_MAP, {
        scope: 'world',
        type: Object,
        config: false,
        default: {}
    })
    game.settings.register(MODULE_ID, COMBAT_ENABLED, {
        scope: 'world',
        type: Boolean,
        config: false,
        default: false
    })
    game.settings.register(MODULE_ID, COMBAT_HEALTH_ESTIMATE, {
        scope: 'world',
        type: Number,
        config: false,
        default: COMBAT_HEALTH_ESTIMATE_TYPE.none
    })
    game.settings.registerMenu(MODULE_ID, ORONDER_CONFIGURATION_FORM, {
        name: 'oronder.Oronder-Configuration',
        label: 'oronder.Configure-Oronder',
        icon: 'fa-solid fa-link',
        // hint: 'oronder.Configure-Hint',
        scope: 'client',
        config: true,
        type: OronderSettingsFormApplication,
        restricted: true
    })
    Logger.info('Registered Settings')
}
