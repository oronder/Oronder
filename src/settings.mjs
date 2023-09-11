import {AUTH, DISCORD_ID, GUILD_ID, MODULE_ID, ORONDER_CONFIGURATION_FORM, VALID_CONFIG} from "./constants.mjs";
import {Logger} from "./util.mjs";
import {OronderSettingsFormApplication} from "./views/settings-form-application.mjs";

export const registerSettings = async () => {
    game.settings.register(MODULE_ID, GUILD_ID, {
        name: `${MODULE_ID}.Discord-Server-Id`,
        hint: 'In Discord, right click on your server icon and select "Copy Server ID".',
        scope: "world",
        type: String,
        config: false
    })

    game.settings.register(MODULE_ID, AUTH, {
        name: `${MODULE_ID}.Auth-Token`,
        hint: 'Generated from Discord by calling "/admin init" or "/admin reset_token".',
        scope: "world",
        type: String,
        config: false
    })

    game.users.filter(user => user.role < 3).forEach(user =>
        game.settings.register(MODULE_ID, `${DISCORD_ID}.${user.id}`, {
            name: `${user.name}'s Discord User ID`,
            hint: 'In Discord, right click on the user\'s icon and select "Copy User ID".',
            scope: "world",
            type: String,
            config: false
        })
    )

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