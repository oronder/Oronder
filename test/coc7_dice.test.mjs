import './helpers.mjs'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {d100_roll, format_check, success_level} from '../src/systems/coc7.mjs'

/** Deterministic d10 (0..9) fed from a fixed sequence. Units die first. */
const die_seq = values => () => values.shift()

test('d100_roll: straight roll combines tens and units', () => {
    // units 3, tens 40 -> 43
    assert.deepEqual(d100_roll(null, die_seq([3, 4])), {
        total: 43,
        tens: [4],
        units: 3
    })
    // 0 + 0 -> 100
    assert.equal(d100_roll(null, die_seq([0, 0])).total, 100)
    // 0 units with non-zero tens -> tens value
    assert.equal(d100_roll(null, die_seq([0, 7])).total, 70)
    // non-zero units with 0 tens -> units value
    assert.equal(d100_roll(null, die_seq([6, 0])).total, 6)
})

test('d100_roll: bonus die takes lower total, penalty die higher', () => {
    // units 5, tens dice 70 and 20 -> totals 75/25
    assert.equal(d100_roll('Advantage', die_seq([5, 7, 2])).total, 25)
    assert.equal(d100_roll('Disadvantage', die_seq([5, 7, 2])).total, 75)

    // 00 tens with 0 units reads as 100, so a bonus die avoids it
    assert.equal(d100_roll('Advantage', die_seq([0, 0, 4])).total, 40)
    assert.equal(d100_roll('Disadvantage', die_seq([0, 0, 4])).total, 100)
})

test('success levels', () => {
    // critical: a roll of 01 always crits
    assert.equal(success_level(1, 65), 'Critical success')
    assert.equal(success_level(1, 10), 'Critical success')

    // value 65: extreme <= 13, hard <= 32, regular <= 65
    assert.equal(success_level(13, 65), 'Extreme success')
    assert.equal(success_level(14, 65), 'Hard success')
    assert.equal(success_level(32, 65), 'Hard success')
    assert.equal(success_level(33, 65), 'Regular success')
    assert.equal(success_level(65, 65), 'Regular success')
    assert.equal(success_level(66, 65), 'Failure')

    // fumble: 96-100 when value < 50, only 100 otherwise
    assert.equal(success_level(96, 40), 'Fumble')
    assert.equal(success_level(100, 40), 'Fumble')
    assert.equal(success_level(95, 40), 'Failure')
    assert.equal(success_level(96, 50), 'Failure')
    assert.equal(success_level(99, 65), 'Failure')
    assert.equal(success_level(100, 65), 'Fumble')
})

test('format matches SYSTEMS.md ack example', () => {
    assert.equal(format_check(65, 43), '65 / rolled 43: Regular success')
    assert.equal(format_check(40, 8), '40 / rolled 8: Extreme success')
    assert.equal(format_check(40, 97), '40 / rolled 97: Fumble')
})
