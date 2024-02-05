import {Logger} from "./util.mjs";
import {session_id, session_ts, socket} from "./module.mjs";

export function monks_token_bar_hooks() {
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