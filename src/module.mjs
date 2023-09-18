import {Logger} from "./util.mjs";
import {registerSettings} from "./settings.mjs";
import {ID_MAP, MODULE_ID} from "./constants.mjs";
import {sync_actor} from "./sync.mjs"

let socket;


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
    await sync_actor(actor)
})
Hooks.on("updateActor", async (actor, data, options, userId) => {
    await sync_actor(actor)
    //todo handle incremental updates
})
Hooks.on("deleteActor", async (actor, data, options, userId) => {
    //handle actor deletion
})


Hooks.on("createItem", async (item, data, options, userId) => {
    //handle actor updates
    let asdf = 'g'
})
Hooks.on("updateItem", async (item, data, options, userId) => {
    //handle item updates
    let asdf = 'g'
})
Hooks.on("deleteItem", async (item, data, options, userId) => {
    //handle item deletion
    let asdf = 'g'
})


Hooks.on("createActiveEffect", async (effect, data, options, userId) => {
    //handle effect creation
    let asdf = 'g'
})
Hooks.on("updateActiveEffect", async (effect, data, options, userId) => {
    //handle effect updates
    let asdf = 'g'
})
Hooks.on("deleteActiveEffect", async (effect, data, options, userId) => {
    //handle effect deletion
    let asdf = 'g'
})


function showHelloMessage(userName) {
    Logger.log(`${userName} says hello!`);
}

function add(a, b) {
    console.log("The addition is performed on a GM client.");
    return a + b;
}