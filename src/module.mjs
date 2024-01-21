import {Logger} from "./util.mjs"
import {registerSettings} from "./settings.mjs"
import {AUTH, GUILD_ID, MODULE_ID, ORONDER_WS_URL} from "./constants.mjs"
import {del_actor, sync_actor} from "./sync.mjs"

// let socket
let oronder_socket

// Hooks.once("socketlib.ready", () => {
//     socket = socketlib.registerModule(MODULE_ID)
// })

Hooks.once("ready", async () => {
    if (game.user.isGM) {
        await registerSettings()
        open_socket_with_oronder()
    }
    Logger.log('Ready')
})

function open_socket_with_oronder() {
    if (oronder_socket !== undefined) return

    const guild_id = game.settings.get(MODULE_ID, GUILD_ID)
    const authorization = game.settings.get(MODULE_ID, AUTH)
    oronder_socket = io(ORONDER_WS_URL, {
        transports: ["websocket"],
        auth: {'Guild-Id': guild_id, 'Authorization': authorization}
    })

    oronder_socket.on('xp', data => {
        for (const [id, xp] of Object.entries(data)) {
            const actor = game.actors.get(id)
            if (actor === undefined) {
                Logger.warn(`Failed to update XP. No Actor with ID ${id} found!`)
            } else {
                Logger.info(`${actor.name} xp: ${actor.system.details.xp.value} -> ${xp}`)
                actor.update({"system.details.xp.value": xp})
            }
        }
    })
    Logger.log('Oronder Websocket connection established.')
}

Hooks.on("updateActor", async (actor, data, options, userId) => {
    // let currency = data?.system?.currency
    // if (currency !== undefined) {
    //     //todo handle currency
    // }
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