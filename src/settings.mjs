import {Logger, MODULE_NAME} from "./util.mjs";

export const registerSettings = () => {
    Logger.log('registering settings')
    for (const user of game.users) {
        Logger.log(`${user.name}`)
        game.settings.register(MODULE_NAME, `discord_id.${user.id}`, {
            name: `${user.name}'s Discord User ID`,
            scope: "world",
            type: Number,
            config: true
        })
    }
    Logger.log('registered settings')
}