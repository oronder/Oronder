/**
 * Foundry global stubs + actor fixtures for node --test runs.
 *
 * This module must be the FIRST import of every test file so the globals
 * exist before src/constants.mjs (imported transitively via util.mjs)
 * evaluates its module scope.
 */

globalThis.window ??= {
    location: {host: 'test.local', origin: 'https://test.local'}
}

globalThis.CONST ??= {
    DOCUMENT_OWNERSHIP_LEVELS: {NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3},
    USER_ROLES: {NONE: 0, PLAYER: 1, TRUSTED: 2, ASSISTANT: 3, GAMEMASTER: 4}
}

// Minimal Roll used by item_roll() when exporting dnd5e attack items.
globalThis.Roll ??= class {
    constructor(formula, data) {
        this.formula = formula
        this.data = data
    }
}

export const WORLD = {
    id: 'test-world',
    coreVersion: '13.348',
    system: 'dnd5e',
    systemVersion: '5.2.2'
}

export const ID_MAP = {user1: '111111111111111111'}

/** Array with a Foundry-Collection-style get(). */
export const collection = arr =>
    Object.assign(arr, {get: id => arr.find(i => i.id === id)})

export function dnd5e_actor(overrides = {}) {
    const weapon = {
        id: 'weapon0000000000',
        name: 'Longsword',
        type: 'weapon',
        img: 'https://img.test/longsword.png',
        hasAttack: true,
        system: {
            abilityMod: 'str',
            attackModes: [{value: 'oneHanded'}, {value: 'twoHanded'}],
            activities: {
                getByType: () => [
                    {getAttackData: () => ({parts: ['@mod', '@prof']})}
                ]
            }
        },
        getRollData: () => ({})
    }
    const armor = {
        id: 'armor00000000000',
        name: 'Chain Mail',
        type: 'equipment',
        img: 'https://img.test/chain.png',
        hasAttack: false,
        system: {rarity: 'common'}
    }

    const roll_data = {
        skills: {
            acr: {total: 5, mod: 3, prof: 2, bonuses: {check: ''}}
        },
        tools: {
            thief: {total: 5, prof: 2, bonuses: {check: ''}}
        },
        abilities: {
            str: {
                value: 16,
                mod: 3,
                save: {value: 5},
                checkProf: {},
                saveProf: {},
                bonuses: {}
            }
        },
        details: {
            level: 5,
            originalClass: 'fighter',
            xp: {value: 6500, max: 14000, pct: 50},
            background: {},
            race: {}
        },
        attributes: {
            death: {success: 0, failure: 0},
            encumbrance: {value: 10},
            hd: {value: 5},
            prof: 3,
            ac: {value: 18, equippedArmor: 'x', equippedShield: 'y'},
            hp: {value: 30, max: 44, temp: 5, tempmax: 0, bonuses: {}},
            spell: {dc: 13, mod: 5}
        },
        classes: {
            fighter: {
                levels: 5,
                advancement: {},
                description: '',
                hitDiceUsed: 0,
                identifier: 'fighter',
                isOriginalClass: true,
                prof: {},
                saves: [],
                skills: [],
                spellcasting: {},
                source: {},
                subclass: {
                    name: 'Champion',
                    advancement: {},
                    classIdentifier: 'fighter',
                    description: '',
                    modelProvider: {},
                    parent: {},
                    prof: {},
                    spellcasting: {}
                }
            }
        },
        currency: {pp: 0, gp: 10, ep: 0, sp: 0, cp: 0},
        spells: {},
        resources: {},
        flags: {},
        effects: [],
        prof: 3
    }

    return {
        id: 'dnd5eactor000001',
        name: 'Tester',
        type: 'character',
        img: 'https://img.test/tester.png',
        ownership: {user1: 3, user2: 1},
        effects: [],
        classes: {fighter: {}},
        items: collection([weapon, armor]),
        system: {
            currency: {pp: 0, gp: 10, ep: null, sp: 0, cp: 0},
            details: {
                level: 5,
                race: {name: 'Elf'},
                background: {name: 'Sage'}
            },
            spells: {
                spell1: {max: 4, level: 1},
                spell2: {max: 0, level: 2}
            },
            attributes: {
                hp: {value: 30, max: 44, temp: 5, effectiveMax: 44},
                ac: {value: 18}
            }
        },
        getRollData: () => structuredClone(roll_data),
        ...overrides
    }
}

export function pf2e_actor(overrides = {}) {
    const strike_item = {
        id: 'warhammer0000001',
        name: 'Warhammer',
        img: 'https://img.test/warhammer.png'
    }
    return {
        id: 'pf2eactor0000001',
        name: 'Valeros',
        type: 'character',
        img: 'https://img.test/valeros.png',
        ownership: {user1: 3},
        abilities: {
            str: {mod: 4},
            dex: {mod: 2},
            con: {mod: 2},
            int: {mod: 0},
            wis: {mod: 1},
            cha: {mod: 1}
        },
        skills: {
            acrobatics: {mod: 5, rank: 1, lore: false, label: 'Acrobatics'},
            athletics: {mod: 9, rank: 2, lore: false, label: 'Athletics'},
            'warfare-lore': {mod: 3, rank: 1, lore: true, label: 'Warfare Lore'}
        },
        saves: {
            fortitude: {mod: 9},
            reflex: {mod: 7},
            will: {mod: 6}
        },
        perception: {mod: 8},
        inventory: {coins: {pp: 0, gp: 10, sp: 0, cp: 0}},
        ancestry: {name: 'Dwarf'},
        heritage: {name: 'Rock Dwarf'},
        background: {name: 'Soldier'},
        class: {name: 'Fighter'},
        items: collection([{id: 'pack', type: 'equipment', name: 'Backpack'}]),
        system: {
            attributes: {
                hp: {value: 58, max: 58},
                ac: {value: 24},
                classDC: {value: 19}
            },
            movement: {speeds: {land: {value: 25}}},
            details: {
                level: {value: 5},
                xp: {value: 400, min: 0, max: 1000},
                ancestry: {name: 'Dwarf'},
                heritage: {name: 'Rock Dwarf'},
                class: {name: 'Fighter'}
            },
            actions: [
                {
                    item: strike_item,
                    totalModifier: 11,
                    variants: [{roll: async () => null}]
                }
            ]
        },
        ...overrides
    }
}

export function coc7_actor(overrides = {}) {
    const spot_hidden = {
        id: 'spothidden000001',
        name: 'Spot Hidden',
        type: 'skill',
        system: {value: 65}
    }
    const firearms = {
        id: 'firearms00000001',
        name: 'Firearms (Handgun)',
        type: 'skill',
        system: {value: 50}
    }
    const revolver = {
        id: 'revolver00000001',
        name: '.38 Revolver',
        type: 'weapon',
        img: 'https://img.test/revolver.png',
        system: {
            skill: {main: {name: 'Firearms (Handgun)', id: firearms.id}},
            range: {normal: {damage: '1d10'}}
        }
    }
    const flashlight = {
        id: 'flashlight000001',
        name: 'Flashlight',
        type: 'item',
        system: {}
    }
    return {
        id: 'coc7actor0000001',
        name: 'Harvey Walters',
        type: 'character',
        img: 'https://img.test/harvey.png',
        ownership: {user1: 3},
        items: collection([spot_hidden, firearms, revolver, flashlight]),
        system: {
            characteristics: {
                str: {value: 60},
                con: {value: 55},
                siz: {value: 65},
                dex: {value: 70},
                app: {value: 50},
                int: {value: 75},
                pow: {value: 60},
                edu: {value: 80}
            },
            attribs: {
                hp: {value: 12, max: 12},
                san: {value: 55, max: 99},
                mp: {value: 12, max: 12},
                lck: {value: 45},
                db: {value: '+1d4'},
                mov: {value: 8},
                build: {value: 1}
            },
            infos: {
                occupation: 'Private Investigator',
                age: '42',
                archetype: ''
            }
        },
        ...overrides
    }
}
