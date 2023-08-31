import {Logger, MODULE_NAME} from "./util.mjs";
import {registerSettings} from "./settings.mjs";

let socket;

Hooks.once("socketlib.ready", () => {
    socket = socketlib.registerModule(MODULE_NAME);
    socket.register("hello", showHelloMessage);
    socket.register("add", add);
});


Hooks.once('init', async () => {
    Logger.log('Initializing');
    registerSettings()
});

Hooks.once("ready", async () => {
    Logger.log('Ready');
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

Hooks.on("createActor", async (actor, data, options, userId) => {
    //handle actor creation
    console.log(actor)
    console.log(data)
    console.log(options)
    console.log(userId)
})
Hooks.on("updateActor", async () => {
    //handle actor updates
})
Hooks.on("deleteActor", async () => {
    //handle actor deletion
})


Hooks.on("createItem", async () => {
    //handle actor updates
})
Hooks.on("updateItem", async () => {
    //handle item updates
})
Hooks.on("deleteItem", async () => {
    //handle item deletion
})


Hooks.on("createActiveEffect", async () => {
    //handle effect creation
})
Hooks.on("updateActiveEffect", async () => {
    //handle effect updates
})
Hooks.on("deleteActiveEffect", async () => {
    //handle effect deletion
})


function showHelloMessage(userName) {
    Logger.log(`${userName} says hello!`);
}

function add(a, b) {
    console.log("The addition is performed on a GM client.");
    return a + b;
}