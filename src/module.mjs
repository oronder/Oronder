import {Logger} from "./util.mjs";
import {registerSettings} from "./settings.mjs";
import {ID_MAP, MODULE_ID} from "./constants.mjs";

let socket;
export let setting = key => game.settings.get(MODULE_ID, key)
export let discord_id = user_id => game.settings.get(MODULE_ID, `discord_id.${user_id}`)
Hooks.once("socketlib.ready", () => {
    socket = socketlib.registerModule(MODULE_ID);
    socket.register("hello", showHelloMessage);
    socket.register("add", add);
});


Hooks.once('init', async () => {
    Logger.log('Initializing');

});

Hooks.once("ready", async () => {
    Logger.log('Ready');
    await registerSettings()
    // Let's send a greeting to all other connected users.
    // Functions can either be called by their given name...
    socket.executeForEveryone("hello", game.user.name);
    // ...or by passing in the function that you'd like to call.
    socket.executeForEveryone(showHelloMessage, game.user.name);
    // The following function will be executed on a GM client.
    // The return value will be sent back to us.
    const result = await socket.executeAsGM("add", 5, 3);
    Logger.log(`The GM client calculated: ${result}`);
});


const actor_to_discord_ids = actor =>
    Object.entries(actor.ownership)
        .filter(([owner_id, perm_lvl]) => perm_lvl === 3)
        .map(([owner_id, _]) => game.settings.get(MODULE_ID, ID_MAP)[owner_id])
        .filter(discord_id => discord_id)

Hooks.on("createActor", async (actor, data, options, userId) => {
    //handle actor creation
})
Hooks.on("updateActor", async (actor, data, options, userId) => {
    //handle actor updates
    Logger.log(actor)
    Logger.log(data)
    Logger.log(options)
    Logger.log(userId)
})
Hooks.on("deleteActor", async (actor, data, options, userId) => {
    //handle actor deletion
})


Hooks.on("createItem", async (item, data, options, userId) => {
    //handle actor updates
})
Hooks.on("updateItem", async (item, data, options, userId) => {
    //handle item updates
})
Hooks.on("deleteItem", async (item, data, options, userId) => {
    //handle item deletion
})


Hooks.on("createActiveEffect", async (effect, data, options, userId) => {
    //handle effect creation
})
Hooks.on("updateActiveEffect", async (effect, data, options, userId) => {
    //handle effect updates
})
Hooks.on("deleteActiveEffect", async (effect, data, options, userId) => {
    //handle effect deletion
})


function showHelloMessage(userName) {
    Logger.log(`${userName} says hello!`);
}

function add(a, b) {
    console.log("The addition is performed on a GM client.");
    return a + b;
}