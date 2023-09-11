import {Logger} from "../util.mjs";
import {AUTH, DISCORD_ID, GUILD_ID, MODULE_ID, ORONDER_BASE_URL, VALID_CONFIG} from "../constants.mjs";

export class OronderSettingsFormApplication extends FormApplication {

    constructor(object = {}, options = {}) {
        foundry.utils.mergeObject(object, {
            guild_id: game.settings.get(MODULE_ID, GUILD_ID),
            auth: game.settings.get(MODULE_ID, AUTH),
            valid_config: game.settings.get(MODULE_ID, VALID_CONFIG),
            fetch_button_icon: "fa-solid fa-rotate",
            fetch_button_msg: game.i18n.localize("oronder.Fetch-Discord-User-Ids"),
            players: game.users.filter(user => user.role < 3).map(user => ({
                foundry_name: user.name,
                foundry_id: user.id,
                discord_id: game.settings.get(MODULE_ID, `${DISCORD_ID}.${user.id}`)
            }))
        });
        super(object, options);
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: "oronder-options",
            template: `modules/${MODULE_ID}/templates/settings-form-application.hbs`,
            width: 580,
            resizable: true
        });
    }


    /** @override */
    get title() {
        return game.i18n.localize("oronder.Oronder-Bot-Config");
    }

    /** @override */
    async getData(options = {}) {
        return this.object
    }

    /** @override */
    activateListeners(html) {
        super.activateListeners(html);
        html.find(".control").on("click", this._onClickControl.bind(this));
    }

    _onClickControl(event) {
        switch (event.currentTarget.dataset.action) {
            case "fetch":
                return this._fetch_discord_ids();
        }
    }

    _requestOptions(guild_id, auth) {
        return {
            method: 'GET',
            headers: new Headers({
                "Accept": "application/json",
                'Guild-Id': guild_id,
                'Authorization': auth
            }),
            redirect: 'follow'
        }
    };

    /** @override */
    async _updateObject(event, formData) {
        this.object.guild_id = this.form.elements.guild_id.value
        this.object.auth = this.form.elements.auth.value

        const queryParams = new URLSearchParams()
        this.object.players.forEach(p => {
            p.discord_id = this.form.elements[p.foundry_id].value
            if (p.discord_id) {
                queryParams.append('i', p.discord_id)
            }
        })
        const requestOptions = this._requestOptions(this.object.guild_id, this.object.auth)

        await fetch(`${ORONDER_BASE_URL}/validate_discord_ids?${queryParams}`, requestOptions)
            .then(response => {
                if (!response.ok) {
                    if (response.status === 401) {
                        Logger.logError(game.i18n.localize("oronder.Invalid-Auth"));
                    } else if (response.status === 400) {
                        Logger.logError(game.i18n.localize("oronder.Server-Id-NaN"));
                    } else {
                        Logger.logError(game.i18n.localize("oronder.Unexpected-Error"));
                    }
                }
                return response.json()
            })
            .then(result => {
                const invalid_player_names = result.map(invalid_discord_id => {
                    return this.object.players.find(p => p.discord_id === invalid_discord_id).foundry_name
                })
                if (invalid_player_names.length) {
                    Logger.logError(
                        `${game.i18n.localize("oronder.Invalid-Discord-Ids")}: ${invalid_player_names.join(', ')}`
                    )
                } else {
                    game.settings.set(MODULE_ID, VALID_CONFIG, true)
                }
            })
            .catch(error => {
                game.settings.set(MODULE_ID, VALID_CONFIG, false)
                Logger.logError(error)
            })

        game.settings.set(MODULE_ID, GUILD_ID, this.object.guild_id)
        game.settings.set(MODULE_ID, AUTH, this.object.auth)
        this.object.players.forEach(p =>
            game.settings.set(MODULE_ID, `${DISCORD_ID}.${p.foundry_id}`, p.discord_id)
        )
        this.render()
    }

    async _fetch_discord_ids() {
        this.object.guild_id = this.form.elements.guild_id.value
        this.object.auth = this.form.elements.auth.value
        this.object.players.forEach(p =>
            p.discord_id = this.form.elements[p.foundry_id].value
        )

        const players_without_discord_ids = this.object.players.filter(p =>
            !this.form.elements[p.foundry_id].value
        )
        let err = false

        if (!Number.fromString(this.object.guild_id)) {
            err = true
            Logger.logError(game.i18n.localize("oronder.Server-Id-NaN"))
        }
        if (!this.object.auth) {
            err = true
            Logger.logError(game.i18n.localize("oronder.Auth-Token-Empty"))
        }
        if (!players_without_discord_ids.length) {
            err = true
            Logger.logWarning(game.i18n.localize("oronder.No-Players-To-Sync"))
        }

        if (err) {
            this.render()
            return
        }


        this.object.fetch_button_icon = 'fa-solid fa-spinner fa-spin'
        this.render()

        const queryParams = new URLSearchParams()
        players_without_discord_ids.forEach(p =>
            queryParams.append('p', p.foundry_name)
        )
        const requestOptions = this._requestOptions(this.object.guild_id, this.object.auth)

        await fetch(`${ORONDER_BASE_URL}/discord_id?${queryParams}`, requestOptions)
            .then(response => {
                if (!response.ok) {
                    if (response.status === 401) {
                        Logger.logError(game.i18n.localize("oronder.Invalid-Auth"))
                    } else if (response.status === 400) {
                        Logger.logError(game.i18n.localize("oronder.Server-Id-NaN"))
                    } else {
                        Logger.logError(game.i18n.localize("oronder.Unexpected-Error"))
                    }
                }
                return response.json()
            })
            .then(result => {
                for (const [foundry_name, discord_user_id] of Object.entries(result)) {
                    this.object.players.find(p => p.foundry_name === foundry_name).discord_id = discord_user_id
                }
            })
            .catch(error => {
                Logger.logError(error)
            })

        this.object.fetch_button_icon = "fa-solid fa-rotate"
        this.render()
    }
}