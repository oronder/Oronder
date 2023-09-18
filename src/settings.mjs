import {ACTORS, AUTH, GUILD_ID, ID_MAP, MODULE_ID, ORONDER_CONFIGURATION_FORM, VALID_CONFIG} from "./constants.mjs";
import {Logger} from "./util.mjs";
import {OronderSettingsFormApplication} from "./settings-form-application.mjs";

export const registerSettings = async () => {
    game.settings.register(MODULE_ID, GUILD_ID, {
        scope: "world",
        type: String,
        config: false
    })

    game.settings.register(MODULE_ID, AUTH, {
        scope: "world",
        type: String,
        config: false
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
        hint: 'This will fetch Discord Ids for Users whose Foundry User names match their Discord name. Support for Pomelo Nicknames pending.',
        scope: "client",
        config: true,
        type: OronderSettingsFormApplication,
        restricted: true
    });

    game.settings.register(MODULE_ID, VALID_CONFIG, {
        scope: "world",
        type: Boolean,
        config: false,
        default: false
    })

    Logger.log('registered settings')
}