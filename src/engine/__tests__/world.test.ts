import { describe, it, expect } from 'vitest'
import { createSampleScenario } from '../../utils/sampleScenario'
import { createSession, addPlayerCharacter, moveActor, discoverClue } from '../session'
import {
  getActorsAtLocation,
  getAvailableEvents,
  getManualEvents,
  getCluesHeldBy,
  getPcIds,
  getAlliedNpcIds,
  getUndiscoveredCluesAtLocation,
  queryActorKnowledge,
} from '../world'
import type { PCTemplate } from '../../types/scenario'

function setup() {
  const scenario = createSampleScenario()
  const session = createSession(scenario, 'テスト')
  return { scenario, session }
}

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

describe('getActorsAtLocation', () => {
  it('初期配置のNPCが正しく返される', () => {
    const { scenario, session } = setup()
    const atEntrance = getActorsAtLocation('loc-entrance', scenario, session.worldState)
    expect(atEntrance).toContain('npc-misaki')
  })

  it('追加したPCが正しい場所に表示される', () => {
    const { scenario, session } = setup()
    addPlayerCharacter(session, makePc('pc-a', 'loc-town'))
    const atTown = getActorsAtLocation('loc-town', scenario, session.worldState)
    expect(atTown).toContain('pc-a')
    expect(atTown).toContain('npc-tanaka')
  })

  it('移動後に新しい場所に表示される', () => {
    const { scenario, session } = setup()
    addPlayerCharacter(session, makePc('pc-a', 'loc-town'))
    moveActor(session, 'pc-a', 'loc-entrance')
    const atEntrance = getActorsAtLocation('loc-entrance', scenario, session.worldState)
    expect(atEntrance).toContain('pc-a')
    const atTown = getActorsAtLocation('loc-town', scenario, session.worldState)
    expect(atTown).not.toContain('pc-a')
  })

  it('死亡したアクターは表示されない', () => {
    const { scenario, session } = setup()
    session.worldState.actorStates['npc-misaki'].alive = false
    const atEntrance = getActorsAtLocation('loc-entrance', scenario, session.worldState)
    expect(atEntrance).not.toContain('npc-misaki')
  })

  it('複数PCが別の場所にいる（別行動）', () => {
    const { scenario, session } = setup()
    addPlayerCharacter(session, makePc('pc-a', 'loc-town'))
    addPlayerCharacter(session, makePc('pc-b', 'loc-entrance'))
    const atTown = getActorsAtLocation('loc-town', scenario, session.worldState)
    const atEntrance = getActorsAtLocation('loc-entrance', scenario, session.worldState)
    expect(atTown).toContain('pc-a')
    expect(atTown).not.toContain('pc-b')
    expect(atEntrance).toContain('pc-b')
    expect(atEntrance).not.toContain('pc-a')
  })
})

describe('getManualEvents', () => {
  it('手動イベントのみ返される', () => {
    const { scenario, session } = setup()
    const manual = getManualEvents(scenario, session.worldState)
    expect(manual.every((e) => e.triggerType === 'manual')).toBe(true)
    expect(manual.map((e) => e.id)).toContain('evt-sato-rescued')
  })
})

describe('getAvailableEvents', () => {
  it('条件未達のイベントは返されない', () => {
    const { scenario, session } = setup()
    const avail = getAvailableEvents(scenario, session.worldState)
    // evt-welcome needs locationVisited for loc-entrance by someone
    // entrance already has npc-misaki in visitedBy, so it should be available
    expect(avail.map((e) => e.id)).toContain('evt-welcome')
  })

  it('発生済みの非繰り返しイベントは返されない', () => {
    const { scenario, session } = setup()
    session.worldState.eventStates['evt-welcome'].occurred = true
    const avail = getAvailableEvents(scenario, session.worldState)
    expect(avail.map((e) => e.id)).not.toContain('evt-welcome')
  })
})

describe('getCluesHeldBy', () => {
  it('NPCが持つ手がかりが返される', () => {
    const { session } = setup()
    const held = getCluesHeldBy('npc-tanaka', session.worldState)
    expect(held).toContain('clue-rumors')
  })

  it('所持していないNPCには空配列', () => {
    const { session } = setup()
    const held = getCluesHeldBy('npc-misaki', session.worldState)
    expect(held).toEqual([])
  })
})

describe('getPcIds', () => {
  it('PCが登録されていなければ空', () => {
    const { session } = setup()
    expect(getPcIds(session.worldState)).toEqual([])
  })

  it('登録したPCのIDが返される', () => {
    const { session } = setup()
    addPlayerCharacter(session, makePc('pc-a', 'loc-town'))
    addPlayerCharacter(session, makePc('pc-b', 'loc-entrance'))
    const ids = getPcIds(session.worldState)
    expect(ids).toContain('pc-a')
    expect(ids).toContain('pc-b')
    expect(ids).toHaveLength(2)
  })
})

describe('getAlliedNpcIds', () => {
  it('味方NPCが返される', () => {
    const { scenario, session } = setup()
    const allied = getAlliedNpcIds(scenario, session.worldState)
    expect(allied).toContain('npc-sato')
    expect(allied).not.toContain('npc-misaki')
  })
})

describe('queryActorKnowledge', () => {
  it('アクターの知識が返される', () => {
    const { session } = setup()
    const knowledge = queryActorKnowledge('npc-misaki', session.worldState)
    expect(knowledge).toContain('地下祭壇の存在')
  })

  it('存在しないアクターは空配列', () => {
    const { session } = setup()
    expect(queryActorKnowledge('nonexistent', session.worldState)).toEqual([])
  })
})

describe('getUndiscoveredCluesAtLocation', () => {
  it('未発見の手がかりが返される', () => {
    const { session } = setup()
    const clues = getUndiscoveredCluesAtLocation('loc-living', session.worldState)
    expect(clues).toContain('clue-newspaper')
  })

  it('発見済みの手がかりは返されない', () => {
    const { session } = setup()
    discoverClue(session, 'clue-newspaper')
    const clues = getUndiscoveredCluesAtLocation('loc-living', session.worldState)
    expect(clues).not.toContain('clue-newspaper')
  })
})
