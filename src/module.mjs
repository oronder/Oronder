import {LogUtility, MODULE_NAME, MODULE_TITLE} from "./util.mjs";

let socket;

Hooks.once("socketlib.ready", () => {
    socket = socketlib.registerModule(MODULE_NAME);
    socket.register("hello", showHelloMessage);
    socket.register("add", add);
});


Hooks.once('init', async () => {
    LogUtility.log('Initializing');
});

Hooks.once("ready", async () => {
    if (!game.modules.get('lib-wrapper')?.active && game.user.isGM)
        ui.notifications.error(`${MODULE_TITLE} requires the 'libWrapper' module. Please install and activate it.`);

    LogUtility.log('Ready');
    // Let's send a greeting to all other connected users.
    // Functions can either be called by their given name...
    socket.executeForEveryone("hello", game.user.name);
    // ...or by passing in the function that you'd like to call.
    socket.executeForEveryone(showHelloMessage, game.user.name);
    // The following function will be executed on a GM client.
    // The return value will be sent back to us.
    const result = await socket.executeAsGM("add", 5, 3);
    LogUtility.log(`The GM client calculated: ${result}`);
});

function showHelloMessage(userName) {
    LogUtility.log(`${userName} says hello!`);
}

function add(a, b) {
    console.log("The addition is performed on a GM client.");
    return a + b;
}