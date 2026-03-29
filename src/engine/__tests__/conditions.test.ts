import { describe, it, expect } from 'vitest'
import { evaluateCondition } from '../conditions'
import type { WorldState } from '../../types/engine'
import type { Condition } from '../../types/scenario'

function makeState(overrides: Partial<WorldState> = {}): WorldState {
  return {
    currentTime: 'Day1 午後',
    facts: [],
    actorStates: {
      'pc-taro': {
        alive: true,
        locationId: 'loc-town',
        knowledge: ['事前情報'],
        inventory: ['懐中電灯'],
        role: 'pc',
        custom: { hp: 10 },
      },
      'npc-misaki': {
        alive: true,
        locationId: 'loc-entrance',
        knowledge: ['地下祭壇の存在'],
        inventory: [],
        role: 'hostile',
        custom: {},
      },
    },
    locationStates: {
      'loc-town': { visitedBy: ['npc-tanaka', 'pc-taro'], custom: {} },
      'loc-entrance': { visitedBy: ['npc-misaki'], custom: {} },
      'loc-basement': { visitedBy: [], custom: {} },
    },
    clueStates: {
      'clue-rumors': { discovered: true, destroyed: false },
      'clue-diary': { discovered: false, destroyed: false },
    },
    eventStates: {
      'evt-welcome': { occurred: true, occurredCount: 1 },
      'evt-night': { occurred: false, occurredCount: 0 },
    },
    flags: { misaki_hostile: true, counter: 3 },
    ...overrides,
  }
}

describe('evaluateCondition', () => {
  it('always → true', () => {
    expect(evaluateCondition({ type: 'always' }, makeState())).toBe(true)
  })

  it('never → false', () => {
    expect(evaluateCondition({ type: 'never' }, makeState())).toBe(false)
  })

  it('flag == (match)', () => {
    expect(evaluateCondition({ type: 'flag', flag: 'misaki_hostile', operator: '==', value: true }, makeState())).toBe(true)
  })

  it('flag == (no match)', () => {
    expect(evaluateCondition({ type: 'flag', flag: 'misaki_hostile', operator: '==', value: false }, makeState())).toBe(false)
  })

  it('flag >= (numeric)', () => {
    expect(evaluateCondition({ type: 'flag', flag: 'counter', operator: '>=', value: 3 }, makeState())).toBe(true)
    expect(evaluateCondition({ type: 'flag', flag: 'counter', operator: '>=', value: 4 }, makeState())).toBe(false)
  })

  it('flag (undefined flag)', () => {
    expect(evaluateCondition({ type: 'flag', flag: 'nonexistent', operator: '==', value: true }, makeState())).toBe(false)
  })

  it('clueDiscovered (discovered)', () => {
    expect(evaluateCondition({ type: 'clueDiscovered', clueId: 'clue-rumors' }, makeState())).toBe(true)
  })

  it('clueDiscovered (not discovered)', () => {
    expect(evaluateCondition({ type: 'clueDiscovered', clueId: 'clue-diary' }, makeState())).toBe(false)
  })

  it('clueCountGte', () => {
    expect(evaluateCondition({ type: 'clueCountGte', count: 1 }, makeState())).toBe(true)
    expect(evaluateCondition({ type: 'clueCountGte', count: 2 }, makeState())).toBe(false)
  })

  it('npcAlive (alive)', () => {
    expect(evaluateCondition({ type: 'npcAlive', npcId: 'npc-misaki' }, makeState())).toBe(true)
  })

  it('npcAlive (dead)', () => {
    const state = makeState()
    state.actorStates['npc-misaki'].alive = false
    expect(evaluateCondition({ type: 'npcAlive', npcId: 'npc-misaki' }, state)).toBe(false)
  })

  it('actorAt (match)', () => {
    expect(evaluateCondition({ type: 'actorAt', actorId: 'pc-taro', locationId: 'loc-town' }, makeState())).toBe(true)
  })

  it('actorAt (no match)', () => {
    expect(evaluateCondition({ type: 'actorAt', actorId: 'pc-taro', locationId: 'loc-entrance' }, makeState())).toBe(false)
  })

  it('actorKnows', () => {
    expect(evaluateCondition({ type: 'actorKnows', actorId: 'npc-misaki', knowledge: '地下祭壇の存在' }, makeState())).toBe(true)
    expect(evaluateCondition({ type: 'actorKnows', actorId: 'npc-misaki', knowledge: '存在しない知識' }, makeState())).toBe(false)
  })

  it('actorHasItem', () => {
    expect(evaluateCondition({ type: 'actorHasItem', actorId: 'pc-taro', item: '懐中電灯' }, makeState())).toBe(true)
    expect(evaluateCondition({ type: 'actorHasItem', actorId: 'pc-taro', item: '存在しないアイテム' }, makeState())).toBe(false)
  })

  it('locationVisited (visited)', () => {
    expect(evaluateCondition({ type: 'locationVisited', locationId: 'loc-town' }, makeState())).toBe(true)
  })

  it('locationVisited (not visited)', () => {
    expect(evaluateCondition({ type: 'locationVisited', locationId: 'loc-basement' }, makeState())).toBe(false)
  })

  it('locationVisitedBy (match)', () => {
    expect(evaluateCondition({ type: 'locationVisitedBy', locationId: 'loc-town', actorId: 'pc-taro' }, makeState())).toBe(true)
  })

  it('locationVisitedBy (no match)', () => {
    expect(evaluateCondition({ type: 'locationVisitedBy', locationId: 'loc-entrance', actorId: 'pc-taro' }, makeState())).toBe(false)
  })

  it('eventOccurred', () => {
    expect(evaluateCondition({ type: 'eventOccurred', eventId: 'evt-welcome' }, makeState())).toBe(true)
    expect(evaluateCondition({ type: 'eventOccurred', eventId: 'evt-night' }, makeState())).toBe(false)
  })

  it('pcHasItem (any PC has it)', () => {
    expect(evaluateCondition({ type: 'pcHasItem', item: '懐中電灯' }, makeState())).toBe(true)
    expect(evaluateCondition({ type: 'pcHasItem', item: '存在しないアイテム' }, makeState())).toBe(false)
  })

  it('timeReached', () => {
    expect(evaluateCondition({ type: 'timeReached', time: 'Day1 午後' }, makeState())).toBe(true)
    expect(evaluateCondition({ type: 'timeReached', time: 'Day1 夜' }, makeState())).toBe(false)
  })

  it('and (all true)', () => {
    const cond: Condition = {
      type: 'and',
      conditions: [
        { type: 'always' },
        { type: 'clueDiscovered', clueId: 'clue-rumors' },
      ],
    }
    expect(evaluateCondition(cond, makeState())).toBe(true)
  })

  it('and (one false)', () => {
    const cond: Condition = {
      type: 'and',
      conditions: [
        { type: 'always' },
        { type: 'never' },
      ],
    }
    expect(evaluateCondition(cond, makeState())).toBe(false)
  })

  it('or', () => {
    const cond: Condition = {
      type: 'or',
      conditions: [
        { type: 'never' },
        { type: 'clueDiscovered', clueId: 'clue-rumors' },
      ],
    }
    expect(evaluateCondition(cond, makeState())).toBe(true)
  })

  it('not', () => {
    expect(evaluateCondition({ type: 'not', condition: { type: 'always' } }, makeState())).toBe(false)
    expect(evaluateCondition({ type: 'not', condition: { type: 'never' } }, makeState())).toBe(true)
  })
})
