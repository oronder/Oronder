import dnd5e from './dnd5e.mjs'
import pf2e from './pf2e.mjs'
import coc7 from './coc7.mjs'

/**
 * Game system adapter registry.
 *
 * Every adapter implements the same interface (see SYSTEMS.md in the server
 * repo for the wire contracts):
 *
 * - id: string — the Foundry system id the adapter serves.
 * - supports_xp: boolean — whether the system has an XP model.
 * - syncable(actor, id_map) -> [boolean, string[]]
 *      Whether the actor meets the per-system requirements for syncing.
 *      The second element lists i18n keys explaining any failure; the
 *      caller localizes and logs them.
 * - export_actor(actor, id_map, world) -> Object
 *      Upload payload for PUT /actor: the common envelope (id, name,
 *      discord_ids, portrait_url, equipment, world) plus the per-system
 *      block described in SYSTEMS.md contract 1.
 * - skippable(actor, data, update_options) -> boolean
 *      True when an updateActor diff does not require a re-sync
 *      (e.g. pure hp changes).
 * - handle_roll(actor, data) -> Promise<{res: string, ephemeral?: boolean}>
 *      Executes a roll request from Discord (SYSTEMS.md contract 2),
 *      dispatching on data.type. Must never open a dialog. (The dnd5e
 *      attack roll keeps its historical {atk, dmg} ack shape.)
 * - xp_write(actor, xp) -> Promise<void>
 *      Persist a server-driven XP total. No-op for systems without XP.
 * - hp(actor, token_doc) -> {value, max, temp?, effectiveMax?}
 *      HP for combat embeds, merging any unlinked-token delta.
 * - ac(actor) -> number|null
 *      Armor class for combat embeds; null omits AC (e.g. CoC7).
 *
 * Adapters must not touch Foundry globals at import time so they stay
 * importable from plain Node unit tests.
 */
export const ADAPTERS = Object.freeze({
    dnd5e: dnd5e,
    pf2e: pf2e,
    CoC7: coc7
})

const warned = new Set()

/**
 * Look up the adapter for a system id, defaulting to the running world's
 * system. Unknown systems fall back to the dnd5e adapter with a console
 * warning — the module must stay load-safe everywhere.
 *
 * @param {string} [system_id]
 */
export function get_adapter(system_id = globalThis.game?.system?.id) {
    const adapter = ADAPTERS[system_id]
    if (adapter) return adapter

    if (!warned.has(system_id)) {
        warned.add(system_id)
        console.warn(
            `Oronder | Unsupported game system "${system_id}". ` +
                'Falling back to dnd5e behavior; expect reduced functionality.'
        )
    }
    return dnd5e
}
