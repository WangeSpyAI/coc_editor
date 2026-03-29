import { describe, it, expect } from 'vitest'
import { applyEffects } from '../effects'
import type { WorldState } from '../../types/engine'
import type { Effect } from '../../types/scenario'

function makeState(): WorldState {
  return {
    currentTime: 'Day1 午後',
    facts: [],
    actorStates: {
      'npc-a': {
        alive: true,
        locationId: 'loc-1',
        knowledge: ['既存知識'],
        inventory: ['アイテムA'],
        role: 'neutral',
        custom: { hp: 10, mp: 5 },
      },
    },
    locationStates: {
      'loc-1': { visitedBy: ['npc-a'], custom: {} },
      'loc-2': { visitedBy: [], custom: {} },
    },
    clueStates: {
      'clue-1': { discovered: false, destroyed: false, locationId: 'loc-1', holderId: 'npc-a' },
    },
    eventStates: {
      'evt-1': { occurred: false, occurredCount: 0 },
    },
    flags: {},
  }
}

describe('applyEffects', () => {
  it('setFlag', () => {
    const state = makeState()
    applyEffects([{ type: 'setFlag', flag: 'test', value: true }], state, 'T1')
    expect(state.flags['test']).toBe(true)
  })

  it('setNpcState', () => {
    const state = makeState()
    applyEffects([{ type: 'setNpcState', npcId: 'npc-a', field: 'condition', value: '瀕死' }], state, 'T1')
    expect(state.actorStates['npc-a'].custom['condition']).toBe('瀕死')
  })

  it('addNpcKnowledge', () => {
    const state = makeState()
    applyEffects([{ type: 'addNpcKnowledge', npcId: 'npc-a', knowledge: '新知識' }], state, 'T1')
    expect(state.actorStates['npc-a'].knowledge).toContain('新知識')
  })

  it('addNpcKnowledge (重複なし)', () => {
    const state = makeState()
    applyEffects([{ type: 'addNpcKnowledge', npcId: 'npc-a', knowledge: '既存知識' }], state, 'T1')
    const count = state.actorStates['npc-a'].knowledge.filter((k) => k === '既存知識').length
    expect(count).toBe(1)
  })

  it('addActorKnowledge', () => {
    const state = makeState()
    applyEffects([{ type: 'addActorKnowledge', actorId: 'npc-a', knowledge: '新知識' }], state, 'T1')
    expect(state.actorStates['npc-a'].knowledge).toContain('新知識')
  })

  it('moveActor', () => {
    const state = makeState()
    applyEffects([{ type: 'moveActor', actorId: 'npc-a', locationId: 'loc-2' }], state, 'T1')
    expect(state.actorStates['npc-a'].locationId).toBe('loc-2')
  })

  it('destroyClue', () => {
    const state = makeState()
    applyEffects([{ type: 'destroyClue', clueId: 'clue-1' }], state, 'T1')
    expect(state.clueStates['clue-1'].destroyed).toBe(true)
  })

  it('transferClue', () => {
    const state = makeState()
    state.actorStates['pc-1'] = { alive: true, locationId: 'loc-1', knowledge: [], inventory: [], role: 'pc', custom: {} }
    applyEffects([{ type: 'transferClue', clueId: 'clue-1', fromId: 'npc-a', toId: 'pc-1' }], state, 'T1')
    expect(state.clueStates['clue-1'].holderId).toBe('pc-1')
    expect(state.clueStates['clue-1'].locationId).toBeUndefined()
  })

  it('addItem / removeItem', () => {
    const state = makeState()
    applyEffects([{ type: 'addItem', targetId: 'npc-a', item: 'アイテムB' }], state, 'T1')
    expect(state.actorStates['npc-a'].inventory).toContain('アイテムB')

    applyEffects([{ type: 'removeItem', targetId: 'npc-a', item: 'アイテムA' }], state, 'T1')
    expect(state.actorStates['npc-a'].inventory).not.toContain('アイテムA')
  })

  it('hpChange (numeric)', () => {
    const state = makeState()
    applyEffects([{ type: 'hpChange', targetId: 'npc-a', amount: '-3' }], state, 'T1')
    expect(state.actorStates['npc-a'].custom['hp']).toBe(7)
  })

  it('hpChange (下限0)', () => {
    const state = makeState()
    applyEffects([{ type: 'hpChange', targetId: 'npc-a', amount: '-999' }], state, 'T1')
    expect(state.actorStates['npc-a'].custom['hp']).toBe(0)
  })

  it('triggerEvent', () => {
    const state = makeState()
    applyEffects([{ type: 'triggerEvent', eventId: 'evt-1' }], state, 'T1')
    expect(state.eventStates['evt-1'].occurred).toBe(true)
    expect(state.eventStates['evt-1'].occurredCount).toBe(1)
  })

  it('setLocationState', () => {
    const state = makeState()
    applyEffects([{ type: 'setLocationState', locationId: 'loc-1', field: 'locked', value: true }], state, 'T1')
    expect(state.locationStates['loc-1'].custom['locked']).toBe(true)
  })

  it('複数エフェクトの順次適用', () => {
    const state = makeState()
    const effects: Effect[] = [
      { type: 'setFlag', flag: 'step1', value: true },
      { type: 'addActorKnowledge', actorId: 'npc-a', knowledge: '手順完了' },
      { type: 'moveActor', actorId: 'npc-a', locationId: 'loc-2' },
    ]
    const facts = applyEffects(effects, state, 'T1')
    expect(state.flags['step1']).toBe(true)
    expect(state.actorStates['npc-a'].knowledge).toContain('手順完了')
    expect(state.actorStates['npc-a'].locationId).toBe('loc-2')
    expect(facts).toHaveLength(3)
  })

  it('存在しないアクターにeffectを適用してもクラッシュしない', () => {
    const state = makeState()
    expect(() => {
      applyEffects([{ type: 'addActorKnowledge', actorId: 'nonexistent', knowledge: 'test' }], state, 'T1')
    }).not.toThrow()
    // ensureActorState should have created it
    expect(state.actorStates['nonexistent']).toBeDefined()
  })
})
