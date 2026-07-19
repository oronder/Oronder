import {coc7_actor, dnd5e_actor, ID_MAP, pf2e_actor, WORLD} from './helpers.mjs'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import dnd5e from '../src/systems/dnd5e.mjs'
import pf2e from '../src/systems/pf2e.mjs'
import coc7 from '../src/systems/coc7.mjs'

test('dnd5e export payload matches SYSTEMS.md contract 1', () => {
    const actor = dnd5e_actor()
    const payload = dnd5e.export_actor(actor, ID_MAP, WORLD)

    // Envelope
    assert.equal(payload.id, actor.id)
    assert.equal(payload.name, 'Tester')
    assert.deepEqual(payload.discord_ids, ['111111111111111111'])
    assert.equal(payload.portrait_url, 'https://img.test/tester.png')
    assert.deepEqual(payload.equipment, ['Chain Mail'])
    assert.deepEqual(payload.world, WORLD)

    // System block (existing shape, unchanged)
    assert.deepEqual(payload.currency, {pp: 0, gp: 10, ep: 0, sp: 0, cp: 0})
    assert.equal(payload.details.level, 5)
    assert.equal(payload.details.race, 'Elf')
    assert.equal(payload.details.background, 'Sage')
    assert.equal(payload.details.dead, false)
    assert.deepEqual(payload.details.xp, {value: 6500, max: 14000}) // pct pruned
    assert.equal(payload.details.originalClass, undefined)

    // pruning
    assert.equal(payload.skills.acr.prof, undefined)
    assert.equal(payload.skills.acr.bonuses, undefined)
    assert.equal(payload.skills.acr.total, 5)
    assert.equal(payload.tools.thief.prof, undefined)
    assert.equal(payload.abilities.str.save, 5) // flattened from {value: 5}
    assert.equal(payload.abilities.str.checkProf, undefined)
    assert.equal(payload.attributes.death, undefined)
    assert.equal(payload.attributes.hp.value, undefined)
    assert.equal(payload.attributes.hp.max, 44)
    assert.equal(payload.attributes.ac.equippedArmor, undefined)
    assert.equal(payload.attributes.ac.value, 18)
    assert.equal(payload.attributes.spelldc, 13)
    assert.equal(payload.attributes.spellmod, 5)
    assert.equal(payload.attributes.spellcaster, 1)
    assert.equal(payload.spells, undefined)
    assert.equal(payload.flags, undefined)

    // classes pruned
    assert.equal(payload.classes.fighter.levels, 5)
    assert.equal(payload.classes.fighter.advancement, undefined)
    assert.equal(payload.classes.fighter.subclass.name, 'Champion')
    assert.equal(payload.classes.fighter.subclass.parent, undefined)

    // weapons
    assert.equal(payload.weapons.length, 1)
    const [weapon] = payload.weapons
    assert.equal(weapon.name, 'Longsword')
    assert.equal(weapon.type, 'weapon')
    assert.equal(weapon.ability, 'str')
    assert.deepEqual(weapon.attack_modes, ['oneHanded', 'twoHanded'])
    assert.match(weapon.attack, /^1d20 /)
})

test('pf2e export payload matches SYSTEMS.md contract 1', () => {
    const actor = pf2e_actor()
    const payload = pf2e.export_actor(actor, ID_MAP, WORLD)

    assert.equal(payload.id, actor.id)
    assert.equal(payload.name, 'Valeros')
    assert.deepEqual(payload.discord_ids, ['111111111111111111'])
    assert.deepEqual(payload.equipment, ['Backpack'])
    assert.deepEqual(payload.world, WORLD)

    assert.deepEqual(payload.abilities.str, {mod: 4})
    assert.deepEqual(payload.abilities.cha, {mod: 1})

    assert.deepEqual(payload.skills.acrobatics, {mod: 5, rank: 1})
    assert.deepEqual(payload.skills.athletics, {mod: 9, rank: 2})
    // lore skills keyed lore-* with label
    assert.deepEqual(payload.skills['lore-warfare'], {
        mod: 3,
        rank: 1,
        label: 'Warfare Lore'
    })
    assert.equal(payload.skills['warfare-lore'], undefined)

    assert.deepEqual(payload.attributes.hp, {max: 58})
    assert.deepEqual(payload.attributes.ac, {value: 24})
    assert.equal(payload.attributes.speed, 25)
    assert.equal(payload.attributes.class_dc, 19)
    assert.deepEqual(payload.attributes.saves, {
        fortitude: {mod: 9},
        reflex: {mod: 7},
        will: {mod: 6}
    })
    assert.deepEqual(payload.attributes.perception, {mod: 8})

    assert.deepEqual(payload.details, {
        level: 5,
        class: 'Fighter',
        ancestry: 'Dwarf',
        heritage: 'Rock Dwarf',
        background: 'Soldier',
        xp: {value: 400, max: 1000}
    })

    assert.deepEqual(payload.currency, {pp: 0, gp: 10, sp: 0, cp: 0})

    assert.deepEqual(payload.weapons, [
        {
            id: 'warhammer0000001',
            name: 'Warhammer',
            type: 'weapon',
            attack: '1d20 + 11',
            img: 'https://img.test/warhammer.png'
        }
    ])
})

test('CoC7 export payload matches SYSTEMS.md contract 1', () => {
    const actor = coc7_actor()
    const payload = coc7.export_actor(actor, ID_MAP, WORLD)

    assert.equal(payload.id, actor.id)
    assert.equal(payload.name, 'Harvey Walters')
    assert.deepEqual(payload.discord_ids, ['111111111111111111'])
    assert.deepEqual(payload.equipment, ['Flashlight'])
    assert.deepEqual(payload.world, WORLD)

    assert.deepEqual(payload.characteristics, {
        str: {value: 60},
        con: {value: 55},
        siz: {value: 65},
        dex: {value: 70},
        app: {value: 50},
        int: {value: 75},
        pow: {value: 60},
        edu: {value: 80}
    })

    assert.deepEqual(payload.attribs, {
        hp: {value: 12, max: 12},
        san: {value: 55, max: 99},
        mp: {value: 12, max: 12},
        lck: {value: 45},
        db: '+1d4',
        mov: 8,
        build: 1
    })

    assert.deepEqual(payload.skills, [
        {id: 'spothidden000001', name: 'Spot Hidden', value: 65},
        {id: 'firearms00000001', name: 'Firearms (Handgun)', value: 50}
    ])

    assert.deepEqual(payload.details, {
        occupation: 'Private Investigator',
        age: '42',
        archetype: ''
    })

    assert.deepEqual(payload.weapons, [
        {
            id: 'revolver00000001',
            name: '.38 Revolver',
            type: 'weapon',
            skill: 'Firearms (Handgun)',
            value: 50,
            damage: '1d10',
            img: 'https://img.test/revolver.png'
        }
    ])
})

test('combat accessors: hp and ac per system', () => {
    const d = dnd5e_actor()
    assert.deepEqual(dnd5e.hp(d, undefined), {
        value: 30,
        max: 44,
        temp: 5,
        effectiveMax: 44
    })
    assert.equal(dnd5e.ac(d), 18)
    // unlinked token delta wins
    const delta = {delta: {system: {attributes: {hp: {value: 7}}}}}
    assert.equal(dnd5e.hp(d, delta).value, 7)

    const p = pf2e_actor()
    const p_hp = pf2e.hp(p, undefined)
    assert.equal(p_hp.value, 58)
    assert.equal(p_hp.effectiveMax, 58) // filled in for health estimates
    assert.equal(pf2e.ac(p), 24)

    const c = coc7_actor()
    const c_hp = coc7.hp(c, undefined)
    assert.equal(c_hp.value, 12)
    assert.equal(c_hp.max, 12)
    assert.equal(c_hp.effectiveMax, 12)
    assert.equal(coc7.ac(c), null) // CoC7 has no AC: omitted from embeds
})
