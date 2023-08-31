import {MODULE_NAME} from "./util.mjs";

export const registerSettings = () => {
    for (const user of game.users) {
        game.settings.register(MODULE_NAME, `discord_id.${user.id}`, {
            name: `${user.name}'s Discord User ID`,
            scope: "world",
            type: Number,
            config: true
        })
    }
}