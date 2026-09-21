import {Logger} from './util.mjs'
import {
    AUTH,
    COMBAT_ENABLED,
    COMBAT_HEALTH_ESTIMATE,
    COMBAT_HEALTH_ESTIMATE_TYPE,
    DAYS_OF_WEEK,
    DISCORD_INIT_LINK,
    ID_MAP,
    MODULE_ID,
    ORONDER_BASE_URL,
    TIMEZONES
} from './constants.mjs'
import {full_sync, sync_actor} from './sync.mjs'
import {open_socket_with_oronder} from './module.mjs'
import {set_combat_hooks} from './combat.mjs'

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api

export class OronderSettingsFormApplication extends HandlebarsApplicationMixin(
    ApplicationV2
) {
    static DEFAULT_OPTIONS = {
        id: 'oronder-options',
        tag: 'form',
        classes: ['oronder'],
        window: {
            contentClasses: ['standard-form'],
            title: 'oronder.Oronder-Bot-Config',
            icon: 'oronder-icon',
            resizable: true
        },
        position: {width: 580, height: 'auto'},
        form: {
            handler: OronderSettingsFormApplication.#onSubmit,
            closeOnSubmit: true
        },
        actions: {
            init: OronderSettingsFormApplication.#onInit,
            syncAll: OronderSettingsFormApplication.#onSyncAll,
            toggle: OronderSettingsFormApplication.#onToggle
        }
    }

    static PARTS = {
        form: {
            template: `modules/${MODULE_ID}/templates/settings-form-application.hbs`,
            // Keep the scroll position when a toggle re-renders the form.
            scrollable: ['']
        },
        // A separate part so Save stays pinned below the scrolling form.
        footer: {
            template: `modules/${MODULE_ID}/templates/settings-form-footer.hbs`
        }
    }

    constructor(options = {}) {
        super(options)
        const id_map = game.settings.get(MODULE_ID, ID_MAP)
        this.object = {
            guild: undefined,
            timezones: TIMEZONES,
            days_of_week: DAYS_OF_WEEK,
            buttons_disabled: false,
            full_sync_active: false,
            init_active: false,
            id_map: id_map,
            combat_health_estimate: game.settings.get(
                MODULE_ID,
                COMBAT_HEALTH_ESTIMATE
            ),
            combat_health_estimate_type: COMBAT_HEALTH_ESTIMATE_TYPE,
            combat_tracking_enabled: game.settings.get(
                MODULE_ID,
                COMBAT_ENABLED
            ),
            players: game.users
                .filter(user => user.role < 3)
                .map(user => ({
                    foundry_name: user.name,
                    foundry_id: user.id,
                    discord_id: id_map[user.id] ?? ''
                }))
        }
    }

    /** @override */
    async _prepareContext(options) {
        // Carry any unsaved edits across re-renders.
        this.bind()
        if (!this.object.guild) {
            this.object.guild = await this.get_guild()
        }
        return this.object
    }

    /**
     * Fold the current state of the rendered form back into this.object so that a
     * re-render does not discard edits which have not been submitted yet.
     */
    bind() {
        if (!this.object.guild || !this.element) {
            return
        }
        const data = new foundry.applications.ux.FormDataExtended(this.element)
            .object
        if (!('gm_role' in data)) {
            // The form is showing the un-initialized (Discord auth) state.
            return
        }

        this.object.guild.gm_role_id = data.gm_role
        this.object.guild.gm_xp = data.gm_xp

        this.object.guild.session_channel_id = data.session_channel
        this.object.guild.downtime_channel_id = data.downtime_channel
        this.object.guild.downtime_gm_channel_id =
            data.downtime_gm_channel || undefined
        this.object.guild.voice_channel_id = data.voice_channel
        this.object.guild.scheduling_channel_id = data.scheduling_channel

        this.object.guild.timezone = data.timezone
        this.object.guild.starting_level = data.starting_level

        // Rollcall fields are only present once rollcall_enabled has been rendered as checked.
        if ('rollcall_channel' in data) {
            this.object.guild.rollcall_channel_id =
                data.rollcall_channel || undefined
            this.object.guild.rollcall_role_id = data.rollcall_role || undefined
            this.object.guild.rollcall_day = data.rollcall_day
            this.object.guild.rollcall_time = data.rollcall_time
        }
        this.object.guild.rollcall_enabled = data.rollcall_enabled

        this.object.guild.roll_discord_to_foundry = data.roll_discord_to_foundry
        this.object.combat_tracking_enabled = data.combat_tracking_enabled
        // combat_channel and combat_health_estimate are disabled, and so omitted
        // from the form data, while combat tracking is off.
        if ('combat_channel' in data) {
            this.object.guild.combat_channel_id = data.combat_channel
        }
        if ('combat_health_estimate' in data) {
            this.object.combat_health_estimate = data.combat_health_estimate
        }

        this.object.players.forEach(
            p => (p.discord_id = data[p.foundry_id] ?? '')
        )
    }

    format_channels(guild) {
        guild.text_channels.sort((a, b) =>
            a.name === 'general'
                ? -1
                : b.name === 'general'
                  ? 1
                  : a.name.localeCompare(b.name)
        )

        guild.text_channels.forEach(c => (c.name = `# ${c.name}`))
        guild.voice_channels.forEach(c => (c.name = `🔈 ${c.name}`))
        guild.stage_channels.forEach(c => (c.name = `🎭 ${c.name}`))
        guild.forum_channels.forEach(c => (c.name = `💬 ${c.name}`))
        guild.forum_and_text_channels = guild.forum_channels.concat(
            guild.text_channels
        )
        guild.voice_and_stage_channels = guild.voice_channels.concat(
            guild.stage_channels
        )
        return guild
    }

    async get_guild() {
        const auth = game.settings.get(MODULE_ID, AUTH)
        if (auth) {
            try {
                const guild = await fetch(`${ORONDER_BASE_URL}/guild`, {
                    method: 'GET',
                    headers: new Headers({
                        Accept: 'application/json',
                        Authorization: auth
                    }),
                    redirect: 'follow'
                }).then(this.handle_json_response)
                return this.format_channels(guild)
            } catch (error) {
                Logger.error(error.message)
            }
        }
        return undefined
    }

    async handle_json_response(response) {
        const response_json = await response.json()
        if (response.ok) {
            return response_json
        }

        switch (response.status) {
            case 400:
                throw new Error(game.i18n.localize('oronder.Auth-Unset-Error'))
            case 401:
                await game.settings.set(MODULE_ID, AUTH, '')
                throw new Error(game.i18n.localize('oronder.Invalid-Auth'))
            case 422:
                throw new Error(
                    response_json.detail
                        .flat()
                        .map(
                            ({loc, input, msg}) =>
                                `${loc.filter(_ => _ !== 'body').join('.')}.${input || '<EMPTY>'}: ${msg}`
                        )
                        .join(' ')
                )
            default:
                throw new Error(response.statusText)
        }
    }

    /**
     * @this {OronderSettingsFormApplication}
     */
    static async #onToggle() {
        await this.render()
    }

    /**
     * @this {OronderSettingsFormApplication}
     */
    static async #onSyncAll() {
        await this._full_sync(true)
    }

    /**
     * @this {OronderSettingsFormApplication}
     */
    static async #onInit() {
        await this._init()
    }

    /**
     * Save Changes
     * @this {OronderSettingsFormApplication}
     */
    static async #onSubmit(_event, _form, _formData) {
        const auth = game.settings.get(MODULE_ID, AUTH)
        if (!auth) {
            return
        }

        this.bind()

        await game.settings.set(
            MODULE_ID,
            COMBAT_ENABLED,
            this.object.combat_tracking_enabled
        )
        await game.settings.set(
            MODULE_ID,
            COMBAT_HEALTH_ESTIMATE,
            this.object.combat_health_estimate
        )

        const updated_id_map = await game.settings.set(
            MODULE_ID,
            ID_MAP,
            Object.fromEntries(
                this.object.players.map(p => [p.foundry_id, p.discord_id])
            )
        )

        const changed_player_ids = Object.entries(updated_id_map)
            .filter(
                ([foundry_id, discord_id]) =>
                    discord_id && this.object.id_map[foundry_id] !== discord_id
            )
            .map(([foundry_id, _]) => foundry_id)

        const actors_to_sync = game.actors.filter(actor =>
            Object.entries(actor.ownership).some(
                ([user, perm_lvl]) =>
                    changed_player_ids.includes(user) &&
                    perm_lvl === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
            )
        )

        const guild = (({
            name,
            id,
            roles,
            members,
            text_channels,
            voice_channels,
            forum_channels,
            forum_and_text_channels,
            voice_and_stage_channels,
            subscription,
            ...o
        }) => o)(this.object.guild)
        if (!guild.rollcall_enabled) {
            delete guild.rollcall_day
            delete guild.rollcall_time
            delete guild.rollcall_channel_id
            delete guild.rollcall_role_id
        }

        if (!this.object.combat_tracking_enabled) {
            delete guild.combat_channel_id
        }

        await fetch(`${ORONDER_BASE_URL}/guild`, {
            method: 'POST',
            headers: new Headers({
                'Content-Type': 'application/json',
                Authorization: auth
            }),
            redirect: 'follow',
            body: JSON.stringify(guild)
        })
            .then(this.handle_json_response)
            .then(({errs}) =>
                errs.forEach(e => Logger.error(e, {permanent: true}))
            )
            .catch(Logger.error)

        await Promise.all(actors_to_sync.map(sync_actor)).catch(Logger.error)

        set_combat_hooks()
    }

    async _full_sync(clear_cache = false) {
        this.object.full_sync_active = true
        this.object.buttons_disabled = true
        await this.render()

        await full_sync(clear_cache).catch(Logger.error)

        this.object.full_sync_active = false
        this.object.buttons_disabled = false
        await this.render()
    }

    async _init() {
        this.object.init_active = true
        this.object.buttons_disabled = true
        await this.render()

        const params = Object.entries({
            scrollbars: 'no',
            resizable: 'no',
            status: 'no',
            location: 'no',
            toolbar: 'no',
            menubar: 'no',
            width: 512,
            height: 1280,
            left: '50%',
            top: '50%'
        })
            .map(([k, v]) => `${k}=${v}`)
            .join(',')

        const popup = window.open(DISCORD_INIT_LINK, 'Discord Auth', params)
        if (popup && !popup.closed && popup.focus) {
            popup.focus()
        } else {
            Logger.error(game.i18n.localize('oronder.Discord-Popup-Blocked'))
        }

        const message_interval = setInterval(() => {
            popup.postMessage('', ORONDER_BASE_URL)
        }, 500)
        const event_listener = async event => {
            if (event.data.status_code) {
                clearInterval(message_interval)
                popup.close()
                event.data.errs.forEach(e => Logger.error(e, {permanent: true}))
                if (event.data.auth && event.data.guild) {
                    await game.settings.set(MODULE_ID, AUTH, event.data.auth)
                    open_socket_with_oronder(true)
                    this.object.guild = this.format_channels(event.data.guild)
                    this.object.players
                        .filter(p => !p.discord_id)
                        .forEach(
                            p =>
                                (p.discord_id =
                                    this.object.guild.members.find(
                                        m =>
                                            m.name.toLowerCase() ===
                                            p.foundry_name.toLowerCase()
                                    )?.id ?? '')
                        )
                }
                this.object.init_active = false
                this.object.buttons_disabled = false
                await this.render()
            }
        }

        window.addEventListener('message', event_listener)

        // In case of error or if closed prematurely
        const close_interval = setInterval(() => {
            if (popup.closed) {
                clearInterval(close_interval)
                window.removeEventListener('message', event_listener)
                if (this.object.init_active) {
                    //if init_waiting is false we have don't need to do anything
                    this.object.init_active = false
                    this.object.buttons_disabled = false
                    this.render()
                }
            }
        }, 501)
    }
}
