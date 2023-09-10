import {Logger} from "../util.mjs";
import {AUTH_TOKEN, GUILD_ID, MODULE_ID} from "../constants.mjs";

export class PullDiscordIds extends FormApplication {
    static get defaultOptions() {
        Logger.log('PullDiscordIds.defaultOptions()')
        const options = super.defaultOptions;
        options.id = "Fetch-Discord-Ids";
        options.template = `modules/${MODULE_ID}/templates/fetch_discord_ids.hbs`;
        return options;
    }

    get title() {
        Logger.log('PullDiscordIds.title()')
        return game.i18n.localize("oronder.Fetch-Discord-Ids");
    }

    /** @override */
    async getData() {
        Logger.log('PullDiscordIds.getData()')
        return {};
    }

    /** @override */
    async _updateObject() {
        Logger.log('PullDiscordIds._updateObject()')
        const guild_id = game.settings.get(MODULE_ID, GUILD_ID)
        const auth_token = game.settings.get(MODULE_ID, AUTH_TOKEN)
        if (!guild_id || !auth_token)
            return "MAL"

        const queryParams = new URLSearchParams({
            foundry_names: JSON.stringify(player_users.map(u => u.name))
        });
        const url = 'https://api.oronder.com/discord_id' + queryParams
        const requestOptions = {
            method: 'GET',
            headers: new Headers({
                "Accept": "application/json",
                'Guild-Id': guild_id,
                'Authorization': auth_token
            }),
            redirect: 'follow'
        };

        await fetch(`${url}/actor`, requestOptions)
            .then(response => response.text())
            .then(result => {
                Logger.log(result !== 'null' ? result : `${pc.name}: ${body.length}`)
            })
            .catch(error => Logger.log('error', error))

    }
}