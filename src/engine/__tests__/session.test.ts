import { describe, it, expect } from 'vitest'
import { createSampleScenario } from '../../utils/sampleScenario'
import {
  createSession,
  addPlayerCharacter,
  removePlayerCharacter,
  moveActor,
  visitLocation,
  discoverClue,
  obtainClueFromActor,
  addActorKnowledge,
  advanceTime,
  killActor,
  saveSession,
  loadSession,
} from '../session'
import type { PCTemplate } from '../../types/scenario'

function makePc(overrides: Partial<PCTemplate> = {}): PCTemplate {
  return {
    id: 'pc-taro',
    name: '太郎',
    playerName: 'プレイヤーA',
    description: '',
    traits: [],
    relations: [],
    initialKnowledge: ['事前情報'],
    initialLocationId: 'loc-town',
    inventory: ['懐中電灯'],
    notes: '',
    ...overrides,
  }
}

function setup() {
  const scenario = createSampleScenario()
  const session = createSession(scenario, 'テストセッション')
  return { scenario, session }
}

describe('createSession', () => {
  it('scenarioSnapshotが元シナリオのコピーである', () => {
    const { scenario, session } = setup()
    expect(session.scenarioSnapshot.id).toBe(scenario.id)
    // Mutating the original should NOT affect the snapshot
    scenario.title = 'CHANGED'
    expect(session.scenarioSnapshot.title).not.toBe('CHANGED')
  })

  it('pcNamesが空で初期化される', () => {
    const { session } = setup()
    expect(session.pcNames).toEqual({})
  })

  it('NPC初期配置がactorStatesに反映される', () => {
    const { session } = setup()
    const misakiState = session.worldState.actorStates['npc-misaki']
    expect(misakiState).toBeDefined()
    expect(misakiState.role).toBe('hostile')
    expect(misakiState.locationId).toBe('loc-entrance')
    expect(misakiState.alive).toBe(true)
  })

  it('NPC初期配置がlocationStatesのvisitedByに反映される', () => {
    const { session } = setup()
    const entranceState = session.worldState.locationStates['loc-entrance']
    expect(entranceState.visitedBy).toContain('npc-misaki')

    const basementState = session.worldState.locationStates['loc-basement']
    expect(basementState.visitedBy).toContain('npc-sato')

    const townState = session.worldState.locationStates['loc-town']
    expect(townState.visitedBy).toContain('npc-tanaka')
  })

  it('手がかり状態が初期化される', () => {
    const { session } = setup()
    const clueState = session.worldState.clueStates['clue-rumors']
    expect(clueState).toBeDefined()
    expect(clueState.discovered).toBe(false)
    expect(clueState.holderId).toBe('npc-tanaka')
  })

  it('イベント状態が初期化される', () => {
    const { session } = setup()
    const evtState = session.worldState.eventStates['evt-welcome']
    expect(evtState).toBeDefined()
    expect(evtState.occurred).toBe(false)
    expect(evtState.occurredCount).toBe(0)
  })
})

describe('addPlayerCharacter', () => {
  it('PCがactorStatesに追加される', () => {
    const { session } = setup()
    const pc = makePc()
    addPlayerCharacter(session, pc)

    const state = session.worldState.actorStates['pc-taro']
    expect(state).toBeDefined()
    expect(state.role).toBe('pc')
    expect(state.locationId).toBe('loc-town')
    expect(state.alive).toBe(true)
    expect(state.knowledge).toEqual(['事前情報'])
    expect(state.inventory).toEqual(['懐中電灯'])
  })

  it('pcNamesに名前が記録される', () => {
    const { session } = setup()
    addPlayerCharacter(session, makePc())
    expect(session.pcNames['pc-taro']).toBe('太郎')
  })

  it('初期場所のvisitedByにPCが追加される', () => {
    const { session } = setup()
    addPlayerCharacter(session, makePc())
    expect(session.worldState.locationStates['loc-town'].visitedBy).toContain('pc-taro')
  })

  it('初期場所なしのPCでもエラーにならない', () => {
    const { session } = setup()
    const pc = makePc({ initialLocationId: undefined })
    expect(() => addPlayerCharacter(session, pc)).not.toThrow()
    expect(session.worldState.actorStates['pc-taro'].locationId).toBeUndefined()
  })

  it('inventoryの変更が元PCテンプレートに影響しない', () => {
    const { session } = setup()
    const pc = makePc()
    addPlayerCharacter(session, pc)
    session.worldState.actorStates['pc-taro'].inventory.push('新アイテム')
    expect(pc.inventory).toEqual(['懐中電灯'])
  })
})

describe('removePlayerCharacter', () => {
  it('PCがactorStatesから削除される', () => {
    const { session } = setup()
    addPlayerCharacter(session, makePc())
    removePlayerCharacter(session, 'pc-taro')
    expect(session.worldState.actorStates['pc-taro']).toBeUndefined()
  })

  it('pcNamesから名前が削除される', () => {
    const { session } = setup()
    addPlayerCharacter(session, makePc())
    removePlayerCharacter(session, 'pc-taro')
    expect(session.pcNames['pc-taro']).toBeUndefined()
  })
})

describe('moveActor', () => {
  it('actorStatesのlocationIdが更新される', () => {
    const { session } = setup()
    addPlayerCharacter(session, makePc())
    moveActor(session, 'pc-taro', 'loc-entrance')
    expect(session.worldState.actorStates['pc-taro'].locationId).toBe('loc-entrance')
  })

  it('移動先のvisitedByにアクターが追加される', () => {
    const { session } = setup()
    addPlayerCharacter(session, makePc())
    moveActor(session, 'pc-taro', 'loc-entrance')
    expect(session.worldState.locationStates['loc-entrance'].visitedBy).toContain('pc-taro')
  })

  it('同じ場所に移動してもvisitedByが重複しない', () => {
    const { session } = setup()
    addPlayerCharacter(session, makePc())
    moveActor(session, 'pc-taro', 'loc-entrance')
    moveActor(session, 'pc-taro', 'loc-entrance')
    const count = session.worldState.locationStates['loc-entrance'].visitedBy
      .filter((id) => id === 'pc-taro').length
    expect(count).toBe(1)
  })

  it('ファクトが記録される', () => {
    const { session } = setup()
    addPlayerCharacter(session, makePc())
    const fact = moveActor(session, 'pc-taro', 'loc-entrance')
    expect(fact.factType).toBe('pc_action')
    expect(fact.relatedEntityIds).toContain('pc-taro')
    expect(fact.relatedEntityIds).toContain('loc-entrance')
  })

  it('NPCの移動はnpc_actionとして記録される', () => {
    const { session } = setup()
    const fact = moveActor(session, 'npc-misaki', 'loc-study')
    expect(fact.factType).toBe('npc_action')
  })
})

describe('visitLocation', () => {
  it('visitedByにアクターが追加される', () => {
    const { session } = setup()
    addPlayerCharacter(session, makePc())
    visitLocation(session, 'loc-entrance', 'pc-taro')
    expect(session.worldState.locationStates['loc-entrance'].visitedBy).toContain('pc-taro')
  })

  it('重複してvisitしても1回のみ記録される', () => {
    const { session } = setup()
    addPlayerCharacter(session, makePc())
    visitLocation(session, 'loc-entrance', 'pc-taro')
    visitLocation(session, 'loc-entrance', 'pc-taro')
    const count = session.worldState.locationStates['loc-entrance'].visitedBy
      .filter((id) => id === 'pc-taro').length
    expect(count).toBe(1)
  })
})

describe('discoverClue', () => {
  it('手がかりが発見済みになる', () => {
    const { session } = setup()
    discoverClue(session, 'clue-newspaper')
    expect(session.worldState.clueStates['clue-newspaper'].discovered).toBe(true)
  })

  it('発見者が記録される', () => {
    const { session } = setup()
    addPlayerCharacter(session, makePc())
    discoverClue(session, 'clue-newspaper', 'pc-taro')
    expect(session.worldState.clueStates['clue-newspaper'].discoveredBy).toBe('pc-taro')
  })
})

describe('obtainClueFromActor', () => {
  it('手がかりが発見済みになる', () => {
    const { session } = setup()
    obtainClueFromActor(session, 'clue-rumors', 'npc-tanaka', 'pc-taro')
    expect(session.worldState.clueStates['clue-rumors'].discovered).toBe(true)
  })

  it('所持者が移転される', () => {
    const { session } = setup()
    addPlayerCharacter(session, makePc())
    obtainClueFromActor(session, 'clue-rumors', 'npc-tanaka', 'pc-taro')
    expect(session.worldState.clueStates['clue-rumors'].holderId).toBe('pc-taro')
  })

  it('元の所持者でないactorからの場合、holderIdは変更されない', () => {
    const { session } = setup()
    // clue-rumors is held by npc-tanaka, try obtaining from npc-misaki
    obtainClueFromActor(session, 'clue-rumors', 'npc-misaki', 'pc-taro')
    expect(session.worldState.clueStates['clue-rumors'].holderId).toBe('npc-tanaka')
  })
})

describe('addActorKnowledge', () => {
  it('知識が追加される', () => {
    const { session } = setup()
    addActorKnowledge(session, 'npc-misaki', '新しい知識')
    expect(session.worldState.actorStates['npc-misaki'].knowledge).toContain('新しい知識')
  })

  it('重複する知識は追加されない', () => {
    const { session } = setup()
    addActorKnowledge(session, 'npc-misaki', '地下祭壇の存在')
    const count = session.worldState.actorStates['npc-misaki'].knowledge
      .filter((k) => k === '地下祭壇の存在').length
    expect(count).toBe(1)
  })
})

describe('killActor', () => {
  it('アクターが死亡状態になる', () => {
    const { session } = setup()
    killActor(session, 'npc-misaki')
    expect(session.worldState.actorStates['npc-misaki'].alive).toBe(false)
  })
})

describe('advanceTime', () => {
  it('currentTimeが更新される', () => {
    const { session } = setup()
    advanceTime(session, 'Day1 午後')
    expect(session.worldState.currentTime).toBe('Day1 午後')
  })

  it('該当時刻のイベントが発火する', () => {
    const { session } = setup()
    const result = advanceTime(session, 'Day1 午後')
    const firedIds = result.facts.map((f) => f.relatedEntityIds[0])
    expect(firedIds).toContain('evt-tl-afternoon')
  })

  it('preventedByで阻止されたイベントは発火しない', () => {
    const { session } = setup()
    // Set the flag that prevents the night ritual
    session.worldState.flags['misaki_hostile'] = true
    const result = advanceTime(session, 'Day1 夜')
    expect(result.prevented).toContain('evt-tl-night-ritual')
    const firedIds = result.facts.map((f) => f.relatedEntityIds[0])
    expect(firedIds).not.toContain('evt-tl-night-ritual')
  })

  it('同じイベントは2回発火しない（isRepeatable=false）', () => {
    const { session } = setup()
    advanceTime(session, 'Day1 午後')
    const result2 = advanceTime(session, 'Day1 午後')
    const firedIds = result2.facts.map((f) => f.relatedEntityIds[0])
    expect(firedIds).not.toContain('evt-tl-afternoon')
  })
})

describe('saveSession / loadSession', () => {
  it('セッションを保存・復元できる', () => {
    const { session } = setup()
    addPlayerCharacter(session, makePc())
    const json = saveSession(session)
    const loaded = loadSession(json)
    expect(loaded.id).toBe(session.id)
    expect(loaded.pcNames['pc-taro']).toBe('太郎')
    expect(loaded.worldState.actorStates['pc-taro'].role).toBe('pc')
  })

  it('pcNamesが無い古いセッションでもloadできる', () => {
    const { session } = setup()
    const json = saveSession(session)
    // Simulate old format without pcNames
    const parsed = JSON.parse(json)
    delete parsed.pcNames
    const loaded = loadSession(JSON.stringify(parsed))
    expect(loaded.pcNames).toEqual({})
  })
})
