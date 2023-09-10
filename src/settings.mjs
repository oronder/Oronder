import {AUTH_TOKEN, DISCORD_ID, GUILD_ID, MODULE_ID} from "./constants.mjs";
import {Logger} from "./util.mjs";
import {PullDiscordIds} from "./views/pull_discord_ids.mjs";

export const registerSettings = async () => {
    const player_users = game.users.filter(u => u.role < 3)

    game.settings.registerMenu(MODULE_ID, "fetch_discord_ids", {
        name: `${MODULE_ID}.Fetch-Discord-Ids`,
        icon: "fa-brands fa-discord",
        hint: 'This will fetch Discord Ids for Users whose Foundry User names match their Discord display_name.',
        scope: "client",
        config: true,
        type: PullDiscordIds,
        restricted: true
    });

    game.settings.register(MODULE_ID, GUILD_ID, {
        name: `${MODULE_ID}.Discord-Server-Id`,
        hint: 'In Discord, right click on your server icon and select "Copy Server ID".',
        scope: "world",
        type: String,
        config: true,
        onChange: value => Logger.log(`${value}`)
    })

    game.settings.register(MODULE_ID, AUTH_TOKEN, {
        name: `${MODULE_ID}.Auth-Token`,
        hint: 'Generated from Discord by calling "/admin init" or "/admin reset_token".',
        scope: "world",
        type: String,
        config: true,
        onChange: value => Logger.log(`${value}`)
    })

    player_users.forEach(user =>
        game.settings.register(MODULE_ID, `${DISCORD_ID}.${user.id}`, {
            name: `${user.name}'s Discord User ID`,
            hint: 'In Discord, right click on the user\'s icon and select "Copy User ID".',
            scope: "world",
            type: String,
            config: true,
            onChange: value => Logger.log(`${value}`)
        })
    )
    Logger.log('registered settings')
}