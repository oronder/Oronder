import {get_guild, Logger} from "./util.mjs"
import {AUTH, DAYS_OF_WEEK, DISCORD_INIT_LINK, ID_MAP, MODULE_ID, ORONDER_BASE_URL, TIMEZONES} from "./constants.mjs"
import {full_sync} from "./sync.mjs"
import {open_socket_with_oronder} from "./module.mjs"

export class OronderSettingsFormApplication extends FormApplication {

    constructor(object = {}, options = {}) {
        const id_map = game.settings.get(MODULE_ID, ID_MAP)
        foundry.utils.mergeObject(object, {
            guild: undefined,
            timezones: TIMEZONES,
            days_of_week: DAYS_OF_WEEK,
            // auth: game.settings.get(MODULE_ID, AUTH),
            auth: undefined,
            buttons_disabled: false,
            show_advanced: false,
            init_button_icon: "fa-brands fa-discord",
            init_button_msg: game.i18n.localize("oronder.Init"),
            re_init_button_msg: game.i18n.localize("oronder.Re-Init"),
            full_sync_button_icon: "fa-solid fa-rotate",
            // full_sync_button_icon: "fa-solid fa-users",
            full_sync_button_msg: game.i18n.localize("oronder.Full-Sync"),
            players: game.users.filter(user => user.role < 3).map(user => ({
                foundry_name: user.name,
                foundry_id: user.id,
                discord_id: id_map[user.id] ?? ''
            }))
        })

        foundry.utils.mergeObject(options, {height: "auto"})

        super(object, options)
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "oronder-options",
            template: `modules/${MODULE_ID}/templates/settings-form-application.hbs`,
            width: 580,
            resizable: true
        })
    }


    /** @override */
    get title() {
        return game.i18n.localize("oronder.Oronder-Bot-Config")
    }

    /** @override */
    async getData(options = {}) {
        if (this.object.auth && !this.object.guild) {
            this.object.guild = await get_guild(this.object.auth)
            if (!this.object.guild) {
                this.object.auth = ''
                game.settings.set(MODULE_ID, AUTH, this.object.auth)
            }
        }
        return this.object
    }

    /** @override */
    activateListeners(html) {
        super.activateListeners(html)
        html.find(".control").on("click", this._onClickControl.bind(this))
    }

    _onClickControl(event) {
        switch (event.currentTarget.dataset.action) {
            case "sync-all":
                return this._full_sync(true)
            case "init":
                return this._init()
            case "rollcall-enabled":
                this.object.guild.rollcall_enabled = this.form.elements['rollcall-enabled'].checked
                this.render()
                return Promise.resolve()
            case "show-advanced":
                this.object.show_advanced = this.form.elements['show-advanced'].checked
                this.render()
                return Promise.resolve()
        }

    }

    /** @override */
    //Save Changes
    async _updateObject(event, formData) {
        if (game.settings.get(MODULE_ID, AUTH) !== this.object.auth) {
            game.settings.set(MODULE_ID, AUTH, this.object.auth)
            open_socket_with_oronder(true)
        }
        // open_socket_with_oronder(false)


        const id_map = Object.fromEntries(
            this.object.players.map(p => [
                p.foundry_id,
                Array.from(this.form.elements[p.foundry_id].options).find(o => o.selected).value
            ])
        )
        game.settings.set(MODULE_ID, ID_MAP, id_map)

        this.object.guild.gm_role_id = Array.from(this.form.elements['gm-role']).find(o => o.selected).value
        this.object.guild.gm_xp = this.form.elements['gm-xp'].value
        this.object.guild.session_channel_id = Array.from(this.form.elements['session-channel']).find(c => c.selected).value
        this.object.guild.downtime_channel_id = Array.from(this.form.elements['downtime-channel']).find(c => c.selected).value
        this.object.guild.downtime_gm_channel_id = Array.from(this.form.elements['downtime-gm-channel']).find(c => c.selected).value
        this.object.guild.voice_channel_id = Array.from(this.form.elements['voice-channel']).find(c => c.selected).value
        this.object.guild.scheduling_channel_id = Array.from(this.form.elements['scheduling-channel']).find(c => c.selected).value
        this.object.guild.timezone = Array.from(this.form.elements['timezone']).find(c => c.selected).value
        this.object.guild.starting_level = this.form.elements['starting-level'].value
        this.object.guild.rollcall_enabled = this.form.elements['rollcall-enabled'].checked
        if (this.object.guild.rollcall_enabled) {
            this.object.guild.rollcall_channel_id = Array.from(this.form.elements['rollcall-channel']).find(c => c.selected)?.value
            this.object.guild.rollcall_role_id = Array.from(this.form.elements['rollcall-role']).find(c => c.selected)?.value
            this.object.guild.rollcall_day = this.form.elements['rollcall-day'].value
            this.object.guild.rollcall_time = this.form.elements['rollcall-time'].value
        }


        await fetch(
            `${ORONDER_BASE_URL}/guild`, {
                method: 'POST',
                headers: new Headers({
                    "Content-Type": "application/json", 'Authorization': this.object.auth
                }),
                redirect: 'follow',
                body: JSON.stringify(this.object.guild)
            }).catch(Logger.error)


        // this.render()

        //     const queryParams = new URLSearchParams()
        //     players_without_discord_ids.forEach(p =>
        //         queryParams.append('p', p.foundry_name)
        //     )
        //     const requestOptions = getRequestOptions(this.object.auth)
        //
        //     await fetch(`${ORONDER_BASE_URL}/discord_id?${queryParams}`, requestOptions)
        //         .then(response => {
        //             this.throw_on_401(response);
        //             return handle_json_response(response)
        //         })
        //         .then(result => {
        //             for (const [foundry_name, discord_user_id] of Object.entries(result)) {
        //                 this.object.players.find(p => p.foundry_name === foundry_name).discord_id = discord_user_id
        //             }
        //         })
        //         .catch(Logger.error)
        //
        //     this.object.fetch_button_icon = "fa-solid fa-rotate"
        //     this.object.buttons_disabled = false
        //     this.render()
    }

    throw_on_401(response) {
        if (response.status === 401) {
            this.object.guild = undefined
            this.object.auth = ''
            throw new Error(game.i18n.localize("oronder.Invalid-Auth"))
        }
    }

    async _full_sync(clear_cache = false) {
        this.object.full_sync_button_icon = 'fa-solid fa-spinner fa-spin'
        this.object.buttons_disabled = true
        this.render()

        await full_sync(clear_cache).catch(Logger.error)

        this.object.full_sync_button_icon = 'fa-solid fa-rotate'
        this.object.buttons_disabled = false
        this.render()
    }


    async _init() {
        this.object.init_button_icon = 'fa-solid fa-spinner fa-spin'
        this.object.buttons_disabled = true
        this.render()
        this.init_waiting = true

        const params = Object.entries({
            scrollbars: 'no', resizable: 'no', status: 'no', location: 'no', toolbar: 'no', menubar: 'no',
            width: 400, height: 1280, left: '50%', top: '50%'
        }).map(([k, v]) => `${k}=${v}`).join(',')

        const popup = window.open(DISCORD_INIT_LINK, 'Discord Auth', params)
        if (popup && !popup.closed && popup.focus) {
            popup.focus()
        }

        const message_interval = setInterval(() => {
            popup.postMessage('', ORONDER_BASE_URL)
        }, 500)
        const event_listener = event => {
            if (event.data.auth && event.data.guild) {
                clearInterval(message_interval)
                this.init_waiting = undefined
                popup.close()

                this.object.auth = event.data.auth
                this.object.guild = event.data.guild
                this.object.players
                    .filter(p => !p.discord_id)
                    .forEach(p =>
                        p.discord_id = this.object.guild.members.find(m =>
                            m.name.toLowerCase() === p.foundry_name.toLowerCase()
                        )?.id ?? ''
                    )
                this.object.init_button_icon = 'fa-brands fa-discord'
                this.object.buttons_disabled = false
                this.render()
                this._full_sync(false)
            }
        }

        window.addEventListener('message', event_listener)

        // In case of error or if closed prematurely
        const close_interval = setInterval(() => {
            if (popup.closed) {
                clearInterval(close_interval)
                if (this.init_waiting) { //if init_waiting is false we have don't need to do anything
                    this.init_waiting = undefined
                    window.removeEventListener('message', event_listener)
                    this.object.init_button_icon = 'fa-brands fa-discord'
                    this.object.buttons_disabled = false
                    this.render()
                }
            }
        }, 501)
    }
}