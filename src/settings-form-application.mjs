import {Logger} from './util.mjs'
import {
    AUTH,
    COMBAT_ENABLED,
    COMBAT_HEALTH_ESTIMATE,
    COMBAT_HEALTH_ESTIMATE_TYPE,
    DAYS_OF_WEEK,
    get_base_url,
    get_discord_init_link,
    ID_MAP,
    MODULE_ID,
    TIMEZONES
} from './constants.mjs'
import {full_sync, sync_actor} from './sync.mjs'
import {open_socket_with_oronder} from './module.mjs'
import {set_combat_hooks} from './combat.mjs'

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api

export class OronderSettingsFormApplication extends HandlebarsApplicationMixin(
    ApplicationV2
) {
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
            show_advanced: false,
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

    static DEFAULT_OPTIONS = {
        id: 'oronder-options',
        tag: 'form',
        window: {
            title: 'oronder.Oronder-Bot-Config',
            icon: 'fa-solid fa-link',
            resizable: true
        },
        position: {
            width: 580,
            height: 'auto'
        },
        form: {
            handler: OronderSettingsFormApplication.#on_submit,
            submitOnChange: false,
            closeOnSubmit: true
        },
        actions: {
            'sync-all': OronderSettingsFormApplication.#on_sync_all,
            init: OronderSettingsFormApplication.#on_init,
            checkbox: OronderSettingsFormApplication.#on_checkbox
        }
    }

    static PARTS = {
        form: {
            template: `modules/${MODULE_ID}/templates/settings-form-application.hbs`,
            scrollable: ['']
        }
    }

    /** @override */
    async _prepareContext(_options) {
        // Persist any in-progress edits before a re-render replaces the DOM.
        this.bind()
        if (!this.object.guild) {
            this.object.guild = await this.get_guild()
        }
        return this.object
    }

    /**
     * Read the current form state back into this.object so that re-renders
     * (checkbox toggles, init / full-sync spinners) keep user edits.
     */
    bind() {
        const form = this.form
        if (form?.elements && this.object.guild && !form.elements.init) {
            this.object.guild.gm_role_id = Array.from(
                form.elements.gm_role
            ).find(o => o.selected).value
            this.object.guild.gm_xp = form.elements.gm_xp.value

            this.object.guild.session_channel_id = Array.from(
                form.elements.session_channel
            ).find(c => c.selected).value
            this.object.guild.downtime_channel_id = Array.from(
                form.elements.downtime_channel
            ).find(c => c.selected).value
            this.object.guild.downtime_gm_channel_id =
                Array.from(form.elements.downtime_gm_channel).find(
                    c => c.selected
                )?.value || undefined
            this.object.guild.voice_channel_id = Array.from(
                form.elements.voice_channel
            ).find(c => c.selected).value
            this.object.guild.scheduling_channel_id = Array.from(
                form.elements.scheduling_channel
            ).find(c => c.selected).value

            this.object.guild.timezone = Array.from(
                form.elements.timezone
            ).find(c => c.selected).value
            this.object.guild.starting_level =
                form.elements.starting_level.value

            //we don't want to set these if rollcall_enabled is actively being checked, or is not currently checked
            if (
                this.object.guild.rollcall_enabled &&
                form.elements.rollcall_enabled.checked
            ) {
                this.object.guild.rollcall_channel_id =
                    Array.from(form.elements.rollcall_channel).find(
                        c => c.selected
                    ).value || undefined
                this.object.guild.rollcall_role_id =
                    Array.from(form.elements.rollcall_role).find(
                        c => c.selected
                    ).value || undefined
                this.object.guild.rollcall_day =
                    form.elements.rollcall_day?.value
                this.object.guild.rollcall_time =
                    form.elements.rollcall_time?.value
            }
            this.object.guild.rollcall_enabled =
                form.elements.rollcall_enabled.checked

            //we don't want to set these if show_advanced is actively being checked, or is not currently checked
            if (
                this.object.show_advanced &&
                form.elements.show_advanced.checked
            ) {
                this.object.guild.combat_channel_id = Array.from(
                    form.elements.combat_channel
                ).find(c => c.selected)?.value
                this.object.guild.roll_discord_to_foundry =
                    form.elements.roll_discord_to_foundry.checked
                this.object.combat_health_estimate = parseInt(
                    form.elements.combat_health_estimate.value
                )
                this.object.combat_tracking_enabled =
                    form.elements.combat_tracking_enabled.checked
            }
            this.object.show_advanced = form.elements.show_advanced.checked

            this.object.players.forEach(
                p =>
                    (p.discord_id =
                        Array.from(form.elements[p.foundry_id].options).find(
                            o => o.selected
                        )?.value ?? '')
            )
        }
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
                const guild = await fetch(`${get_base_url()}/guild`, {
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

    //Save Changes
    static async #on_submit(_event, _form, _formData) {
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

        await fetch(`${get_base_url()}/guild`, {
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

    static #on_sync_all(_event, _target) {
        return this._full_sync(true)
    }

    static #on_init(_event, _target) {
        return this._init()
    }

    static #on_checkbox(_event, _target) {
        return this.render()
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

        const popup = window.open(
            get_discord_init_link(),
            'Discord Auth',
            params
        )
        if (popup && !popup.closed && popup.focus) {
            popup.focus()
        } else {
            Logger.error(game.i18n.localize('oronder.Discord-Popup-Blocked'))
        }

        const message_interval = setInterval(() => {
            popup.postMessage('', get_base_url())
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
                this.render()
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
