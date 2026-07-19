import {ACTORS, AUTH, get_base_url, ID_MAP, MODULE_ID} from './constants.mjs'
import {hash, Logger, ownership_to_discord_ids} from './util.mjs'
import {world_data} from './module.mjs'
import {get_adapter} from './systems/index.mjs'

// noinspection JSValidateJSDoc
/**
 @param {Actor} actor
 */
export function export_actor(actor) {
    return get_adapter().export_actor(
        actor,
        game.settings.get(MODULE_ID, ID_MAP),
        world_data
    )
}

function headers() {
    const authorization = game.settings.get(MODULE_ID, AUTH)
    if (!authorization) {
        Logger.error(game.i18n.localize('oronder.Auth-Unset-Error'))
    }
    return new Headers({
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: authorization
    })
}

/**
 @param {Object} pc
 */
async function upload(pc) {
    const requestOptions = {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify(pc),
        redirect: 'follow'
    }

    return await fetch(`${get_base_url()}/actor`, requestOptions)
}

/**
 @param {string} pc_id
 */
export async function del_actor(pc_id) {
    const requestOptions = {
        method: 'DELETE',
        headers: headers(),
        redirect: 'follow'
    }

    return await fetch(`${get_base_url()}/actor/${pc_id}`, requestOptions)
}

// noinspection JSValidateJSDoc
/**
 @param {Actor} actor
 @return {string[]}
 */
export const actor_to_discord_ids = actor =>
    ownership_to_discord_ids(actor, game.settings.get(MODULE_ID, ID_MAP))

/**
 @param {boolean} clear_cache
 */
export async function full_sync(clear_cache) {
    if (clear_cache) {
        game.actors
            .filter(_ => localStorage.getItem(`${ACTORS}.${_.id}`))
            .forEach(_ => localStorage.removeItem(`${ACTORS}.${_.id}`))
    }

    return Promise.all(game.actors.map(sync_actor)).then(res => {
        const counts = Object.fromEntries(
            Object.entries(
                Object.groupBy(
                    res.map(i => Boolean(i)),
                    b => b
                )
            ).map(([b, v]) => [b, v.length])
        )
        const sync_count = counts[true] ?? 0
        const skipped = counts[false] ? `, skipped ${counts[false] ?? 0}` : ''
        Logger.warn(
            `Synced ${sync_count} actor${sync_count > 1 ? 's' : ''}${skipped}. Press F12 for details.`
        )
    })
}

// noinspection JSValidateJSDoc
/**
 @param {Actor} actor
 */
export function syncable(actor) {
    const [ok, reasons] = get_adapter().syncable(
        actor,
        game.settings.get(MODULE_ID, ID_MAP)
    )
    if (!ok) {
        for (const reason of reasons) {
            Logger.info(
                `${game.i18n.localize('oronder.Skipping-Sync-For')} ${actor.name}. ${game.i18n.localize(reason)}`
            )
        }
    }
    return ok
}

// noinspection JSValidateJSDoc
/**
 @param {Actor} actor
 */
export async function sync_actor(actor) {
    if (!syncable(actor)) {
        return Promise.resolve()
    }

    const old_hash = localStorage.getItem(`${ACTORS}.${actor.id}`)
    const actor_obj = export_actor(actor)
    const new_hash = hash(actor_obj)

    if (old_hash && old_hash === new_hash) {
        Logger.info(
            `${game.i18n.localize('oronder.Skipping-Sync-For')} ${actor_obj.name}. ${game.i18n.localize('oronder.No-Change')}`
        )
        return Promise.resolve()
    }

    return upload(actor_obj)
        .then(response => {
            if (response.ok) {
                localStorage.setItem(`${ACTORS}.${actor.id}`, new_hash)
                Logger.info(
                    `${game.i18n.localize('oronder.Synced')} ${actor_obj.name}`
                )
                return true
            } else if (response.status === 422) {
                response.json().then(({detail}) =>
                    Logger.error(
                        `${actor_obj.name} ${game.i18n.localize('oronder.Failed-To-Sync')} ` +
                            detail
                                .flat()
                                .map(
                                    ({loc, input, msg}) =>
                                        `❌ ${loc.filter(_ => _ !== 'body').join('.')}.${input} ${msg}`
                                )
                                .join(' '),
                        {permanent: true}
                    )
                )
            } else if (response.status === 401) {
                Logger.error(
                    `${game.i18n.localize('oronder.Invalid-Auth')}: ${actor_obj.name} ${game.i18n.localize('oronder.Failed-To-Sync')}`
                )
            } else {
                Logger.error(
                    `${actor_obj.name} ${game.i18n.localize('oronder.Failed-To-Sync')} ${response.statusText}`,
                    {permanent: true}
                )
            }
        })
        .catch(Logger.error)
}
