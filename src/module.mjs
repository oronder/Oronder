import {Logger} from './util.mjs'
import {registerSettings} from './settings.mjs'
import {ACTORS, AUTH, ID_MAP, MODULE_ID, ORONDER_WS_URL} from './constants.mjs'
import {del_actor, sync_actor} from './sync.mjs'
import {set_monks_token_bar_hooks} from './monks_token_bar.mjs'
import {register_combat_settings_toggle, set_combat_hooks} from './combat.mjs'
import {set_incoming_hooks} from './incoming.mjs'

export let socket
export let session_id
export let session_ts
export let combat_hooks = {
    combatStart: undefined,
    combatRound: undefined,
    combatTurn: undefined
}
let session_name
let default_title

const SOCKET_NAME = `module.${MODULE_ID}`

function set_session(session) {
    if (session.status === 'start') {
        session_name = session.name
        session_id = session.id
        session_ts = session.start_ts
        if (default_title === undefined) default_title = document.title
        document.title = session_name
    } else if (session.status === 'stop') {
        if (default_title !== undefined) document.title = default_title
    }
}

/**
 @param {Actor} actor
 @returns {string}
 */
function get_one_owner_id(actor) {
    const owner_ids = Object.entries(actor.ownership)
        .filter(
            ([_, ownership_level]) =>
                ownership_level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
        )
        .map(([user_id, _]) => user_id)

    return game.users
        .filter(u => u.active)
        .filter(
            u =>
                owner_ids.includes(u.id) || u.role >= CONST.USER_ROLES.ASSISTANT
        )
        .map(u => u.id)
        .reduce((prev, cur) => (prev > cur ? prev : cur))
}

/**
 *
 * @returns number
 * @param i
 */
function value_count(i) {
    if (typeof i === 'object') {
        return Object.values(i).map(value_count).reduce((acc, cur) => acc + cur)
    } else if (Array.isArray(i)) {
        return i.map(value_count).reduce((acc, cur) => acc + cur)
    } else {
        return 1
    }
}

/**
 * @param {{}} data
 */
function skippable(data) {

    const relevant_change_keys = Object.keys(data).filter(k => !['_id', '_stats'].includes(k))
    if (!relevant_change_keys.length)
        return true

    if (relevant_change_keys.length > 1 || !'system' in data)
        return false

    let changes = value_count(data.system)

    if (data.system?.attributes?.hp?.value !== undefined)
        changes -= 1

    if (data.system?.details?.xp?.value !== undefined)
        changes -= 1

    if (typeof data.system?.spells === 'object' && Object.values(data.system.spells).filter(s => s.value).length)
        changes -= 1

    return changes === 0
}

Hooks.once('ready', async () => {
    if (!game.modules.get('lib-wrapper')?.active) {
        Logger.error(game.i18n.localize('oronder.LibWrapper-Error'))
    }
    await registerSettings()
    open_socket_with_oronder()

    if (game.user.isGM) {
        register_combat_settings_toggle()
    }

    game.socket.on(SOCKET_NAME, data => {
        switch (data.action) {
            case 'session':
                {
                    set_session(data.session)
                }
                break
        }
    })

    Hooks.on('updateActor', async (actor, data, options, userId) => {
        if (game.user.id === userId && !skippable(data)) {
            Logger.info(`Sync ${actor.name} on update.`)


            if ('==ownership' in data) {
                const valid_ids = ['default', ...Object.keys(game.settings.get(MODULE_ID, ID_MAP))]
                if (Object.entries(data['==ownership'])
                    .filter(([id]) => valid_ids.includes(id) && (game.users.find(u => u.id === id)?.role || 0) < CONST.USER_ROLES.GAMEMASTER)
                    .map(([, ownership]) => ownership).includes(CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) {

                    await sync_actor(actor)
                } else {
                    const response = await del_actor(actor.id)
                    if (response.status === 404) { //We don't have an easy sure fire method of determining if this is really necessary, but the cost of calling this is low so w/e.
                        Logger.debug(`Attempted to remove ${actor.name} from Oronder, but they do not exist.`)
                    }
                }
            } else {
                await sync_actor(actor)
            }
        }
    })

    Hooks.on('deleteActor', async (actor, options, userId) => {
        if (game.user.id === userId) {
            Logger.info(`Sync ${actor.name} on delete.`)
            await del_actor(actor.id)
        }
    })

    Hooks.on('updateItem', async item => {
        if (game.user.id === get_one_owner_id(item.actor)) {
            Logger.info(`Sync ${item.actor.name} on ${item.name} update.`)
            await sync_actor(item.actor)
        }
    })
    Hooks.on('deleteItem', async item => {
        if (game.user.id === get_one_owner_id(item.actor)) {
            Logger.info(`Sync ${item.actor.name} on ${item.name} delete.`)
            await sync_actor(item.actor)
        }
    })

    Logger.info('Ready')
})

export function open_socket_with_oronder(update = false) {
    if (socket !== undefined) {
        if (update) {
            socket.disconnect()
        } else {
            return
        }
    }

    const authorization = game.settings.get(MODULE_ID, AUTH)
    if (!authorization) return

    socket = io(ORONDER_WS_URL, {
        transports: ['websocket'],
        auth: {Authorization: authorization}
    })

    socket.on('connect_error', error => {
        Logger.warn(
            `${game.i18n.localize('oronder.Connection-Failed')}: ${error.message}`
        )
    })

    socket.on('connect', () => {
        Logger.info('Oronder connection established.')
    })
    socket.on('xp', async data => {
        for (const [actor_id, xp] of Object.entries(data)) {
            const actor = game.actors.get(actor_id)
            if (actor === undefined) {
                Logger.warn(
                    `${game.i18n.localize('oronder.Failed-To-Update-Actor')} ${actor_id} ${game.i18n.localize('oronder.Found')}`
                )
            } else {
                Logger.info(
                    `${actor.name} xp: ${actor.system.details.xp.value} -> ${xp}`
                )
                await actor.update({'system.details.xp.value': xp})
            }
        }
    })
    socket.on('session', session => {
        set_session(session)
        game.socket.emit(SOCKET_NAME, {action: 'session', session: session})
    })

    socket.on('item_desc', async (data, callback) => {
        const actor = game.actors.find(a => a.id === data.actor_id)
        if (actor === undefined) {
            Logger.error(game.i18n.localize('oronder.Actor-Not-Found'))
            return
        }
        const item = actor.items.find(i => i.id === data.item_id)
        if (item === undefined) {
            Logger.error(game.i18n.localize('oronder.Item-Not-Found'))
            return
        }
        callback(item.system.description.value)
    })

    set_monks_token_bar_hooks()
    set_incoming_hooks()
    set_combat_hooks()
}

// Hooks.on("createActiveEffect", async (effect, data, options, userId) => {
//     if (game.user.id === userId) {
//         //handle effect creation
//     }
// })
// Hooks.on("updateActiveEffect", async (effect, data, options, userId) => {
//     if (game.user.id === userId) {
//         //handle effect updates
//     }
// })
// Hooks.on("deleteActiveEffect", async (effect, data, options, userId) => {
//     if (game.user.id === userId) {
//         //handle effect deletion
//     }
// })
