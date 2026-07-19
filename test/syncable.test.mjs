import {coc7_actor, dnd5e_actor, ID_MAP, pf2e_actor} from './helpers.mjs'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import dnd5e from '../src/systems/dnd5e.mjs'
import pf2e from '../src/systems/pf2e.mjs'
import coc7 from '../src/systems/coc7.mjs'
import {ADAPTERS, get_adapter} from '../src/systems/index.mjs'

test('adapter registry resolves ids and falls back to dnd5e', () => {
    assert.equal(get_adapter('dnd5e').id, 'dnd5e')
    assert.equal(get_adapter('pf2e').id, 'pf2e')
    assert.equal(get_adapter('CoC7').id, 'CoC7')
    assert.equal(get_adapter('unknown-system').id, 'dnd5e')
    assert.equal(get_adapter(undefined).id, 'dnd5e')
    assert.deepEqual(Object.keys(ADAPTERS).sort(), ['CoC7', 'dnd5e', 'pf2e'])
})

test('dnd5e syncable gates', () => {
    assert.deepEqual(dnd5e.syncable(dnd5e_actor(), ID_MAP), [true, []])

    assert.deepEqual(dnd5e.syncable(dnd5e_actor({type: 'npc'}), ID_MAP), [
        false,
        ['oronder.NPC']
    ])
    assert.deepEqual(
        dnd5e.syncable(dnd5e_actor({ownership: {user2: 3}}), ID_MAP),
        [false, ['oronder.No-Owner']]
    )

    const no_level = dnd5e_actor()
    no_level.system.details.level = 0
    assert.deepEqual(dnd5e.syncable(no_level, ID_MAP), [
        false,
        ['oronder.No-Level']
    ])

    const no_race = dnd5e_actor()
    no_race.system.details.race = null
    assert.deepEqual(dnd5e.syncable(no_race, ID_MAP), [
        false,
        ['oronder.No-Race']
    ])

    const no_background = dnd5e_actor()
    no_background.system.details.background = ''
    assert.deepEqual(dnd5e.syncable(no_background, ID_MAP), [
        false,
        ['oronder.No-Background']
    ])

    assert.deepEqual(dnd5e.syncable(dnd5e_actor({classes: {}}), ID_MAP), [
        false,
        ['oronder.No-Class']
    ])
})

test('pf2e syncable gates', () => {
    assert.deepEqual(pf2e.syncable(pf2e_actor(), ID_MAP), [true, []])

    assert.deepEqual(pf2e.syncable(pf2e_actor({type: 'npc'}), ID_MAP), [
        false,
        ['oronder.NPC']
    ])
    assert.deepEqual(pf2e.syncable(pf2e_actor({ownership: {}}), ID_MAP), [
        false,
        ['oronder.No-Owner']
    ])

    const no_ancestry = pf2e_actor({ancestry: null})
    no_ancestry.system.details.ancestry = null
    assert.deepEqual(pf2e.syncable(no_ancestry, ID_MAP), [
        false,
        ['oronder.No-Ancestry']
    ])

    const no_class = pf2e_actor({class: null})
    no_class.system.details.class = null
    assert.deepEqual(pf2e.syncable(no_class, ID_MAP), [
        false,
        ['oronder.No-Class']
    ])

    const no_level = pf2e_actor()
    no_level.system.details.level.value = 0
    assert.deepEqual(pf2e.syncable(no_level, ID_MAP), [
        false,
        ['oronder.No-Level']
    ])
})

test('CoC7 syncable gates', () => {
    assert.deepEqual(coc7.syncable(coc7_actor(), ID_MAP), [true, []])

    assert.deepEqual(coc7.syncable(coc7_actor({type: 'npc'}), ID_MAP), [
        false,
        ['oronder.NPC']
    ])
    assert.deepEqual(coc7.syncable(coc7_actor({ownership: {}}), ID_MAP), [
        false,
        ['oronder.No-Owner']
    ])

    const no_occupation = coc7_actor()
    no_occupation.system.infos.occupation = ''
    assert.deepEqual(coc7.syncable(no_occupation, ID_MAP), [
        false,
        ['oronder.No-Occupation']
    ])

    // an occupation item also satisfies the gate
    const item_occupation = coc7_actor({occupation: {name: 'Journalist'}})
    item_occupation.system.infos.occupation = ''
    assert.deepEqual(coc7.syncable(item_occupation, ID_MAP), [true, []])
})
