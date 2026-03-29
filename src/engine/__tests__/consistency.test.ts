/**
 * 状態整合性テスト
 *
 * 「ある操作で複数の状態を同時に更新する必要があるのに一部が欠落している」
 * パターンを検出するためのテスト群。
 *
 * 全ての状態変更操作について、関連する全stateが正しく更新されることを検証する。
 */
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
  killActor,
  advanceTime,
} from '../session'
import { applyEffects } from '../effects'
import { initializeWorldState, placeActorAt } from '../world'
import type { PCTemplate } from '../../types/scenario'

function makePc(id: string, locationId: string): PCTemplate {
  return {
    id,
    name: `PC-${id}`,
    playerName: 'PL',
    description: '',
    traits: [],
    relations: [],
    initialKnowledge: [],
    initialLocationId: locationId,
    inventory: [],
    notes: '',
  }
}

function setup() {
  const scenario = createSampleScenario()
  const session = createSession(scenario, 'テスト')
  return { scenario, session }
}

// ===================================================================
// 不変条件: placeActorAt は唯一の場所変更プリミティブである
// ===================================================================
describe('不変条件: 場所移動は常にlocationIdとvisitedByを同時更新する', () => {
  it('placeActorAt: actorState.locationIdが更新される', () => {
    const { session } = setup()
    addPlayerCharacter(session, makePc('pc-a', 'loc-town'))
    placeActorAt(session.worldState, 'pc-a', 'loc-entrance')
    expect(session.worldState.actorStates['pc-a'].locationId).toBe('loc-entrance')
  })

  it('placeActorAt: locationStates.visitedByが更新される', () => {
    const { session } = setup()
    addPlayerCharacter(session, makePc('pc-a', 'loc-town'))
    placeActorAt(session.worldState, 'pc-a', 'loc-entrance')
    expect(session.worldState.locationStates['loc-entrance'].visitedBy).toContain('pc-a')
  })

  it('moveActor: 両方更新される', () => {
    const { session } = setup()
    addPlayerCharacter(session, makePc('pc-a', 'loc-town'))
    moveActor(session, 'pc-a', 'loc-entrance')
    expect(session.worldState.actorStates['pc-a'].locationId).toBe('loc-entrance')
    expect(session.worldState.locationStates['loc-entrance'].visitedBy).toContain('pc-a')
  })

  it('visitLocation: 両方更新される', () => {
    const { session } = setup()
    addPlayerCharacter(session, makePc('pc-a', 'loc-town'))
    visitLocation(session, 'loc-entrance', 'pc-a')
    expect(session.worldState.actorStates['pc-a'].locationId).toBe('loc-entrance')
    expect(session.worldState.locationStates['loc-entrance'].visitedBy).toContain('pc-a')
  })

  it('addPlayerCharacter: 初期場所で両方更新される', () => {
    const { session } = setup()
    addPlayerCharacter(session, makePc('pc-a', 'loc-entrance'))
    expect(session.worldState.actorStates['pc-a'].locationId).toBe('loc-entrance')
    expect(session.worldState.locationStates['loc-entrance'].visitedBy).toContain('pc-a')
  })

  it('initializeWorldState: NPC初期配置で両方設定される', () => {
    const scenario = createSampleScenario()
    const state = initializeWorldState(scenario)
    // npc-misaki is at loc-entrance
    expect(state.actorStates['npc-misaki'].locationId).toBe('loc-entrance')
    expect(state.locationStates['loc-entrance'].visitedBy).toContain('npc-misaki')
    // npc-sato is at loc-basement
    expect(state.actorStates['npc-sato'].locationId).toBe('loc-basement')
    expect(state.locationStates['loc-basement'].visitedBy).toContain('npc-sato')
  })

  it('moveActorエフェクト: 両方更新される', () => {
    const { session } = setup()
    applyEffects(
      [{ type: 'moveActor', actorId: 'npc-misaki', locationId: 'loc-study' }],
      session.worldState,
      'T1',
    )
    expect(session.worldState.actorStates['npc-misaki'].locationId).toBe('loc-study')
    expect(session.worldState.locationStates['loc-study'].visitedBy).toContain('npc-misaki')
  })

  it('setNpcState(locationId)エフェクト: 両方更新される', () => {
    const { session } = setup()
    applyEffects(
      [{ type: 'setNpcState', npcId: 'npc-misaki', field: 'locationId', value: 'loc-kitchen' }],
      session.worldState,
      'T1',
    )
    expect(session.worldState.actorStates['npc-misaki'].locationId).toBe('loc-kitchen')
    expect(session.worldState.locationStates['loc-kitchen'].visitedBy).toContain('npc-misaki')
  })
})

// ===================================================================
// 不変条件: setNpcStateはトップレベルフィールドを正しく設定する
// ===================================================================
describe('不変条件: setNpcStateがトップレベルフィールドを正しく扱う', () => {
  it('alive=falseでactorState.aliveがfalseになる（custom["alive"]ではない）', () => {
    const { session } = setup()
    applyEffects(
      [{ type: 'setNpcState', npcId: 'npc-misaki', field: 'alive', value: false }],
      session.worldState,
      'T1',
    )
    expect(session.worldState.actorStates['npc-misaki'].alive).toBe(false)
    expect(session.worldState.actorStates['npc-misaki'].custom['alive']).toBeUndefined()
  })

  it('通常フィールドはcustomに入る', () => {
    const { session } = setup()
    applyEffects(
      [{ type: 'setNpcState', npcId: 'npc-sato', field: 'condition', value: '瀕死' }],
      session.worldState,
      'T1',
    )
    expect(session.worldState.actorStates['npc-sato'].custom['condition']).toBe('瀕死')
  })
})

// ===================================================================
// 不変条件: 手がかり移転は発見状態も更新する
// ===================================================================
describe('不変条件: 手がかり操作の状態整合性', () => {
  it('obtainClueFromActor: discovered + discoveredBy + holderId が全て更新される', () => {
    const { session } = setup()
    addPlayerCharacter(session, makePc('pc-a', 'loc-town'))
    obtainClueFromActor(session, 'clue-rumors', 'npc-tanaka', 'pc-a')
    const clue = session.worldState.clueStates['clue-rumors']
    expect(clue.discovered).toBe(true)
    expect(clue.discoveredBy).toBe('pc-a')
    expect(clue.holderId).toBe('pc-a')
  })

  it('transferClueエフェクト: discovered + discoveredBy + holderId が全て更新される', () => {
    const { session } = setup()
    addPlayerCharacter(session, makePc('pc-a', 'loc-town'))
    applyEffects(
      [{ type: 'transferClue', clueId: 'clue-rumors', fromId: 'npc-tanaka', toId: 'pc-a' }],
      session.worldState,
      'T1',
    )
    const clue = session.worldState.clueStates['clue-rumors']
    expect(clue.discovered).toBe(true)
    expect(clue.discoveredBy).toBe('pc-a')
    expect(clue.holderId).toBe('pc-a')
  })

  it('discoverClue: discovered + discoveredBy が更新される', () => {
    const { session } = setup()
    addPlayerCharacter(session, makePc('pc-a', 'loc-town'))
    discoverClue(session, 'clue-newspaper', 'pc-a')
    const clue = session.worldState.clueStates['clue-newspaper']
    expect(clue.discovered).toBe(true)
    expect(clue.discoveredBy).toBe('pc-a')
  })
})

// ===================================================================
// 不変条件: pcNamesがactorStatesと同期している
// ===================================================================
describe('不変条件: pcNamesとactorStatesの同期', () => {
  it('PC追加でpcNamesとactorStatesの両方にエントリがある', () => {
    const { session } = setup()
    addPlayerCharacter(session, makePc('pc-a', 'loc-town'))
    expect(session.pcNames['pc-a']).toBeDefined()
    expect(session.worldState.actorStates['pc-a']).toBeDefined()
  })

  it('PC削除でpcNamesとactorStatesの両方から削除される', () => {
    const { session } = setup()
    addPlayerCharacter(session, makePc('pc-a', 'loc-town'))
    removePlayerCharacter(session, 'pc-a')
    expect(session.pcNames['pc-a']).toBeUndefined()
    expect(session.worldState.actorStates['pc-a']).toBeUndefined()
  })
})

// ===================================================================
// 不変条件: advanceTimeのイベント発火が正しく状態を更新する
// ===================================================================
describe('不変条件: イベント発火の状態整合性', () => {
  it('advanceTimeで発火したイベントのeventStateが更新される', () => {
    const { session } = setup()
    advanceTime(session, 'Day1 午後')
    expect(session.worldState.eventStates['evt-tl-afternoon'].occurred).toBe(true)
    expect(session.worldState.eventStates['evt-tl-afternoon'].occurredCount).toBe(1)
  })

  it('サンプルシナリオのsetNpcState(alive=false)で佐藤が実際に死亡する', () => {
    const { session } = setup()
    // evt-tl-night-late has effect: setNpcState(npc-sato, alive, false)
    // But it requires: sato-rescued NOT occurred, basement-confrontation NOT occurred, and sato alive
    // Force the event state to allow it
    advanceTime(session, 'Day1 深夜')
    expect(session.worldState.actorStates['npc-sato'].alive).toBe(false)
  })
})
