import {Logger} from './util.mjs'
import {socket} from './module.mjs'
import {get_adapter} from './systems/index.mjs'

export function set_incoming_hooks() {
    socket.on('roll', async (data, callback) => {
        if (game.version < 12) {
            Logger.info(
                `rolling ${data['type']} requires Foundry v12 or later.`
            )
            callback({})
            return
        }
        const actor = game.actors.find(a => a.id === data.actor_id)
        if (actor === undefined) {
            Logger.error(game.i18n.localize('oronder.Actor-Not-Found'))
            callback({})
            return
        }

        let out
        try {
            out = await get_adapter().handle_roll(actor, data)
        } catch (err) {
            Logger.error(`Roll failed: ${err}`)
            out = {}
        }
        Logger.debug(`ROLL OUT: ${out}`)
        callback(out)
    })
}
