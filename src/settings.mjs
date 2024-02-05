import {AUTH, GUILD_NAME, ID_MAP, MODULE_ID, ORONDER_CONFIGURATION_FORM, VALID_CONFIG} from "./constants.mjs"
import {Logger} from "./util.mjs"
import {OronderSettingsFormApplication} from "./settings-form-application.mjs"

export const registerSettings = async () => {
    game.settings.register(MODULE_ID, GUILD_NAME, {
        scope: "world",
        type: String,
        config: false,
        default:''
    })

    game.settings.register(MODULE_ID, AUTH, {
        scope: "world",
        type: String,
        config: false,
        default:''
    })

    game.settings.register(MODULE_ID, ID_MAP, {
        scope: "world",
        type: Object,
        config: false,
        default: {}
    })

    game.settings.registerMenu(MODULE_ID, ORONDER_CONFIGURATION_FORM, {
        name: `${MODULE_ID}.Oronder-Configuration`,
        label: `${MODULE_ID}.Configure-Oronder`,
        icon: "fa-brands fa-discord",
        hint: `${MODULE_ID}.Configure-Hint`,
        scope: "client",
        config: true,
        type: OronderSettingsFormApplication,
        restricted: true
    })

    game.settings.register(MODULE_ID, VALID_CONFIG, {
        scope: "world",
        type: Boolean,
        config: false,
        default: false
    })

    Logger.info('Registered Settings')
}