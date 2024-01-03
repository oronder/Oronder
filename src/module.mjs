import {Logger} from "./util.mjs";
import {registerSettings} from "./settings.mjs";
import {MODULE_ID} from "./constants.mjs";
import {del_actor, sync_actor} from "./sync.mjs"

let socket;

Hooks.once("socketlib.ready", () => {
    socket = socketlib.registerModule(MODULE_ID);
});

Hooks.once("ready", async () => {
    Logger.log('Ready');
    await registerSettings()
});

Hooks.on("updateActor", async (actor, data, options, userId) => {
    let currency = data?.system?.currency
    if (currency !== undefined) {
        //todo handle currency
    }

    if (game.user.id === userId) {
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