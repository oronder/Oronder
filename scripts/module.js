let socket;

Hooks.once("socketlib.ready", () => {
    socket = socketlib.registerModule("oronder-foundry");
    socket.register("hello", showHelloMessage);
    socket.register("add", add);
});


Hooks.once('init', async () => {

});

Hooks.once("ready", async () => {
    // Let's send a greeting to all other connected users.
    // Functions can either be called by their given name...
    socket.executeForEveryone("hello", game.user.name);
    // ...or by passing in the function that you'd like to call.
    socket.executeForEveryone(showHelloMessage, game.user.name);
    // The following function will be executed on a GM client.
    // The return value will be sent back to us.
    const result = await socket.executeAsGM("add", 5, 3);
    console.log(`The GM client calculated: ${result}`);
});

function showHelloMessage(userName) {
    console.log(`User ${userName} says hello!`);
}

function add(a, b) {
    console.log("The addition is performed on a GM client.");
    return a + b;
}