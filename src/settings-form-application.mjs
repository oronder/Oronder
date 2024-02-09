import {get_guild, handle_json_response, Logger} from "./util.mjs"
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
            auth: game.settings.get(MODULE_ID, AUTH),
            buttons_disabled: false,
            full_sync_active: false,
            init_active: false,
            show_advanced: false,
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
            case "checkbox":
                this.render()
                return Promise.resolve()
        }

    }

    render(force = false, options = {}) {
        if (this.object.guild) {
            this.object.guild.gm_role_id = Array.from(this.form.elements.gm_role).find(o => o.selected).value
            this.object.guild.gm_xp = this.form.elements.gm_xp.value
            this.object.guild.session_channel_id = Array.from(this.form.elements.session_channel).find(c => c.selected).value
            this.object.guild.downtime_channel_id = Array.from(this.form.elements.downtime_channel).find(c => c.selected).value
            this.object.guild.downtime_gm_channel_id = Array.from(this.form.elements.downtime_gm_channel).find(c => c.selected).value
            this.object.guild.voice_channel_id = Array.from(this.form.elements.voice_channel).find(c => c.selected).value
            this.object.guild.scheduling_channel_id = Array.from(this.form.elements.scheduling_channel).find(c => c.selected).value
            this.object.guild.timezone = Array.from(this.form.elements.timezone).find(c => c.selected).value
            this.object.guild.starting_level = this.form.elements.starting_level.value
            this.object.guild.rollcall_enabled = this.form.elements.rollcall_enabled.checked
            if (this.object.guild.rollcall_enabled) {
                if (this.form.elements.rollcall_channel)
                    this.object.guild.rollcall_channel_id = Array.from(this.form.elements.rollcall_channel).find(c => c.selected)?.value
                if (this.form.elements.rollcall_role)
                    this.object.guild.rollcall_role_id = Array.from(this.form.elements.rollcall_role).find(c => c.selected)?.value
                if (this.form.elements.rollcall_day)
                    this.object.guild.rollcall_day = this.form.elements.rollcall_day.value
                if (this.form.elements.rollcall_time)
                    this.object.guild.rollcall_time = this.form.elements.rollcall_time.value
            }
            this.object.show_advanced = this.form.elements.show_advanced.checked
        }


        return super.render(force, options);
    }

    /** @override */
    //Save Changes
    async _updateObject(event, formData) {
        game.settings.set(MODULE_ID, ID_MAP, Object.fromEntries(
            this.object.players.map(p => [
                p.foundry_id,
                Array.from(this.form.elements[p.foundry_id].options).find(o => o.selected).value
            ])
        ))

        this.render()

        await fetch(
            `${ORONDER_BASE_URL}/guild`, {
                method: 'POST',
                headers: new Headers({
                    "Content-Type": "application/json", 'Authorization': this.object.auth
                }),
                redirect: 'follow',
                body: JSON.stringify(this.object.guild)
            })
            .then(handle_json_response)
            .then(({errs}) => errs.forEach(e => Logger.error(e, {permanent: true})))
            .catch(Logger.error)
    }

    async _full_sync(clear_cache = false) {
        this.object.full_sync_active = true
        this.object.buttons_disabled = true
        this.render()

        await full_sync(clear_cache).catch(Logger.error)

        this.object.full_sync_active = false
        this.object.buttons_disabled = false
        this.render()
    }


    async _init() {
        this.object.init_active = true
        this.object.buttons_disabled = true
        this.render()

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
        const event_listener = async event => {
            if (event.data.status_code) {
                clearInterval(message_interval)
                this.init_active = false
                popup.close()
                event.data.errs.forEach(e => Logger.error(e, {permanent: true}))
                if (event.data.auth && event.data.guild) {
                    this.object.auth = event.data.auth
                    await game.settings.set(MODULE_ID, AUTH, this.object.auth)
                    open_socket_with_oronder(true)
                    this.object.guild = event.data.guild
                    this.object.players
                        .filter(p => !p.discord_id)
                        .forEach(p =>
                            p.discord_id = this.object.guild.members.find(m =>
                                m.name.toLowerCase() === p.foundry_name.toLowerCase()
                            )?.id ?? ''
                        )
                    await this._full_sync(false) // enabling buttons and rendering is handled here
                } else {
                    this.object.buttons_disabled = false
                    this.render()
                }
            }
        }

        window.addEventListener('message', event_listener)

        // In case of error or if closed prematurely
        const close_interval = setInterval(() => {
            if (popup.closed) {
                clearInterval(close_interval)
                window.removeEventListener('message', event_listener)
                if (this.init_active) { //if init_waiting is false we have don't need to do anything
                    this.init_active = false
                    this.object.buttons_disabled = false
                    this.render()
                }
            }
        }, 501)
    }
}