import {coc7_actor, dnd5e_actor, pf2e_actor} from './helpers.mjs'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import dnd5e from '../src/systems/dnd5e.mjs'
import pf2e from '../src/systems/pf2e.mjs'
import coc7 from '../src/systems/coc7.mjs'

test('dnd5e skippable (existing behavior)', () => {
    const actor = dnd5e_actor()
    const s = data => dnd5e.skippable(actor, data, {})

    assert.equal(s({_id: 'x', _stats: {}}), true)
    assert.equal(s({system: {attributes: {hp: {value: 10}}}}), true)
    assert.equal(s({system: {details: {xp: {value: 100}}}}), true)
    assert.equal(s({system: {spells: {spell1: {value: 2}}}}), true)
    assert.equal(
        s({
            system: {
                attributes: {hp: {value: 10}},
                details: {xp: {value: 100}}
            }
        }),
        true
    )
    assert.equal(s({name: 'Renamed', system: {}}), false)
    assert.equal(s({system: {details: {level: 6}}}), false)
    assert.equal(
        s({system: {attributes: {hp: {value: 10}}, details: {level: 6}}}),
        false
    )
})

test('pf2e skippable: pure hp and xp-only updates skip', () => {
    const actor = pf2e_actor()
    const s = data => pf2e.skippable(actor, data, {})

    assert.equal(s({_id: 'x'}), true)
    assert.equal(s({system: {attributes: {hp: {value: 40}}}}), true)
    assert.equal(s({system: {attributes: {hp: {value: 40, temp: 3}}}}), true)
    assert.equal(s({system: {details: {xp: {value: 500}}}}), true)
    assert.equal(
        s({
            system: {
                attributes: {hp: {value: 40}},
                details: {xp: {value: 500}}
            }
        }),
        true
    )
    assert.equal(s({name: 'Renamed'}), false)
    assert.equal(s({system: {details: {level: {value: 6}}}}), false)
    assert.equal(
        s({
            system: {
                attributes: {hp: {value: 40}, ac: {value: 25}}
            }
        }),
        false
    )
})

test('CoC7 skippable: hp/san/mp value-only updates skip', () => {
    const actor = coc7_actor()
    const s = data => coc7.skippable(actor, data, {})

    assert.equal(s({_id: 'x'}), true)
    assert.equal(s({system: {attribs: {hp: {value: 9}}}}), true)
    assert.equal(s({system: {attribs: {san: {value: 50}}}}), true)
    assert.equal(s({system: {attribs: {mp: {value: 10}}}}), true)
    assert.equal(
        s({
            system: {
                attribs: {hp: {value: 9}, san: {value: 50}, mp: {value: 10}}
            }
        }),
        true
    )
    assert.equal(s({system: {attribs: {hp: {value: 9, max: 14}}}}), false)
    assert.equal(s({system: {attribs: {lck: {value: 40}}}}), false)
    assert.equal(s({name: 'Renamed'}), false)
    assert.equal(s({system: {characteristics: {str: {value: 70}}}}), false)
})
