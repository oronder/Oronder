import {
    AUTH,
    COMBAT_HEALTH_ESTIMATE,
    COMBAT_HEALTH_ESTIMATE_TYPE,
    ID_MAP,
    MODULE_ID,
    ORONDER_CONFIGURATION_FORM
} from './constants.mjs'
import {Logger} from './util.mjs'
import {OronderSettingsFormApplication} from './settings-form-application.mjs'

export const registerSettings = async () => {
    game.settings.register(MODULE_ID, AUTH, {
        scope: 'world',
        type: String,
        config: false,
        default: ''
    })
    game.settings.register(MODULE_ID, ID_MAP, {
        scope: 'world',
        type: Object,
        config: false,
        default: {}
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