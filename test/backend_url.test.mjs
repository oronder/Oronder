import './helpers.mjs'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {resolve_backend_urls} from '../src/constants.mjs'

const PROD = {
    base_url: 'https://api.oronder.com',
    ws_url: 'wss://api.oronder.com'
}
const DEV = {base_url: 'http://localhost:65435', ws_url: 'ws://localhost:65435'}

test('empty setting on a production host resolves to api.oronder.com', () => {
    assert.deepEqual(resolve_backend_urls('foundry.example.com', ''), PROD)
    assert.deepEqual(
        resolve_backend_urls('foundry.example.com', undefined),
        PROD
    )
    assert.deepEqual(resolve_backend_urls('foundry.example.com', '   '), PROD)
})

test('empty setting on the dev host resolves via the localhost heuristic', () => {
    assert.deepEqual(resolve_backend_urls('localhost:65434', ''), DEV)
})

test('explicit setting wins over the dev heuristic', () => {
    assert.deepEqual(
        resolve_backend_urls('localhost:65434', 'https://oronder.example.com'),
        {
            base_url: 'https://oronder.example.com',
            ws_url: 'wss://oronder.example.com'
        }
    )
})

test('http setting yields ws, https yields wss', () => {
    assert.deepEqual(
        resolve_backend_urls('foundry.example.com', 'http://localhost:65435'),
        DEV
    )
    assert.deepEqual(
        resolve_backend_urls('foundry.example.com', 'https://api.oronder.com'),
        PROD
    )
})

test('trailing slashes and whitespace are trimmed', () => {
    assert.deepEqual(
        resolve_backend_urls(
            'foundry.example.com',
            ' https://oronder.example.com/// '
        ),
        {
            base_url: 'https://oronder.example.com',
            ws_url: 'wss://oronder.example.com'
        }
    )
})
