import {Logger} from "./util.mjs"
import {registerSettings} from "./settings.mjs"
import {AUTH, GUILD_ID, MODULE_ID, ORONDER_WS_URL} from "./constants.mjs"
import {del_actor, sync_actor} from "./sync.mjs"

let socket
let session_name
let session_id
let session_ts
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

Hooks.once("ready", async () => {
    if (game.user.isGM) {
        await registerSettings()
        open_socket_with_oronder()

        const monks_tokenbar = game.modules.get('monks-tokenbar')
        if (monks_tokenbar?.active) {
            Logger.info("Monk's Tokenbar found.")
            let last_xp_ts = new Date().getTime()
            Hooks.on("renderChatMessage", async (message, html, messageData) => {
                const mtb = message.flags['monks-tokenbar']
                if (
                    mtb &&
                    messageData.author.id === game.userId &&
                    game.user.role >= CONST.USER_ROLES.ASSISTANT &&
                    message['timestamp'] > last_xp_ts
                ) {
                    if (!mtb.actors.map(a => a.xp).every(xp => xp === mtb.actors[0].xp)) {
                        Logger.warn('Oronder does not currently support unequal XP distribution :(')
                    } else if (!mtb.actors.length) {
                        Logger.warn('No actors to reward xp to')
                    } else if (session_id === undefined) {
                        Logger.warn('No Session Found')
                    } else if (message['timestamp'] < session_ts) {
                        Logger.warn('XP reward predates session start')
                    } else {
                        last_xp_ts = message['timestamp']
                        socket.emit('xp', {session_id: session_id, id_to_xp: mtb.actors.map(a => ([a['id'], a['xp']]))})
                    }
                }
            })
        }
    }

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

    const guild_id = game.settings.get(MODULE_ID, GUILD_ID)
    const authorization = game.settings.get(MODULE_ID, AUTH)
    if (!guild_id || !authorization) return

    socket = io(ORONDER_WS_URL, {
        transports: ["websocket"],
        auth: {'Guild-Id': guild_id, 'Authorization': authorization}
    })

    socket.on('connect', () => {
        Logger.info('Oronder Websocket connection established.')
    })
    socket.on('xp', data => {
        for (const [actor_id, xp] of Object.entries(data)) {
            const actor = game.actors.get(actor_id)
            if (actor === undefined) {
                Logger.warn(`Failed to update XP. No Actor with ID ${actor_id} found!`)
            } else {
                Logger.info(`${actor.name} xp: ${actor.system.details.xp.value} -> ${xp}`)
                actor.update({"system.details.xp.value": xp})
            }
        }
    })
    socket.on('session', session => {
        set_session(session)
        game.socket.emit(SOCKET_NAME, {action: 'session', session: session})
    })
}

game.socket.on(SOCKET_NAME, data => {
    switch (data.action) {
        case 'session': {
            set_session(data.session)
        }
            break;
    }
})

Hooks.on("updateActor", async (actor, data, options, userId) => {
    if (game.user.id === userId && !data?.system?.details?.xp?.value) {
        await sync_actor(actor)
    }
})
Hooks.on("deleteActor", async (actor, data, options, userId) => {
    if (game.user.id === userId) {
        await del_actor(actor.id)
    }
})
// Hooks.on("createItem", async (item, data, options, userId) => {
//     if (game.user.id === userId) {
//         //handle actor updates
//     }
// })
// Hooks.on("updateItem", async (item, data, options, userId) => {
//     if (game.user.id === userId) {
//         //handle item updates
//     }
// })
// Hooks.on("deleteItem", async (item, data, options, userId) => {
//     if (game.user.id === userId) {
//         //handle item deletion
//     }
// })
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