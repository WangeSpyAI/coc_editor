/**
 * 永続化層テスト
 *
 * serialize → JSON → revive のラウンドトリップと、
 * 旧形式データのマイグレーション・未来形式の拒否を検証する。
 * localStorage 保存とファイルエクスポートは同じ serialize/revive を通るため、
 * ここが通れば両方の経路が保証される。
 */
import { describe, it, expect } from 'vitest'
import type { Entity, Scenario } from '../types'
import { initializeWorldState, stabilize, applyEffect, buildChildrenMap } from '../engine'
import {
  serializeSession,
  reviveSession,
  type ScenarioSession,
  type PersistedSession,
} from '../persistence'

function makeScenario(entities: Entity[]): Scenario {
  return {
    id: 'test-scenario',
    title: 'テスト',
    author: 'test',
    description: '',
    entities,
    createdAt: '',
    updatedAt: '',
  }
}

// room-a / room-b（ルート直下）、PC明は room-a に居る。
// firedOnce トリガーは初期状態（state=off）で即発火する —
// stabilize 一発で firedTriggerIds・log・カテゴリ変更が揃う。
const baseEntities = (): Entity[] => [
  { id: 'room-a', name: '部屋A', parentId: null, description: '', labels: [], connections: [], categories: [], actions: [], triggers: [] },
  { id: 'room-b', name: '部屋B', parentId: null, description: '', labels: [], connections: [], categories: [], actions: [], triggers: [] },
  {
    id: 'pc-akira', name: '明', parentId: 'room-a', description: '', labels: ['PC'], connections: [],
    categories: [{ id: 'state', name: '状態', exclusive: true, options: ['off', 'on'] }],
    actions: [],
    triggers: [
      {
        id: 'trg-wake', name: '覚醒', entityId: 'pc-akira',
        condition: { clauses: [{ reference: { type: 'self' }, categoryId: 'state', value: 'off' }] },
        effects: [{ type: 'setCategory', target: { type: 'self' }, categoryId: 'state', value: 'on' }],
        firedOnce: true,
      },
    ],
  },
]

/** stabilize 済みのセッションを作る（firedTriggerIds / log / parties が全て非自明） */
function makeSession(): ScenarioSession {
  const scenario = makeScenario(baseEntities())
  const ws = initializeWorldState(scenario)
  const result = stabilize(ws, scenario)
  return { scenario, worldState: result.worldState, lastResult: result }
}

describe('セッション永続化（serialize / revive）', () => {
  it('ラウンドトリップで entityStates / log / parties / firedTriggerIds が保たれる（Set→配列→Set）', () => {
    const session = makeSession()
    expect(session.worldState.firedTriggerIds.size).toBe(1) // 前提: トリガーが発火済み
    expect(session.worldState.log.length).toBeGreaterThan(0)

    const json = JSON.stringify(serializeSession(session))
    const revived = reviveSession(JSON.parse(json) as PersistedSession)

    expect(revived.scenario).toEqual(session.scenario)
    expect(revived.worldState.entityStates).toEqual(session.worldState.entityStates)
    expect(revived.worldState.log).toEqual(session.worldState.log)
    expect(revived.worldState.parties).toEqual(session.worldState.parties)
    expect(revived.worldState.activePartyId).toBe(session.worldState.activePartyId)
    expect(revived.worldState.firedTriggerIds).toBeInstanceOf(Set)
    expect([...revived.worldState.firedTriggerIds]).toEqual([...session.worldState.firedTriggerIds])
  })

  it('parties を持たない旧データは entityStates の実位置から補完される', () => {
    const scenario = makeScenario(baseEntities())
    const ws = initializeWorldState(scenario)
    // プレイ中に room-b へ移動していた（シナリオ定義上の初期位置は room-a）
    applyEffect(
      { type: 'move', target: { type: 'named', entityId: 'pc-akira' }, newParentId: 'room-b' },
      'pc-akira', ws.entityStates, scenario.entities, buildChildrenMap(ws.entityStates),
    )

    // 旧形式: formatVersion / parties / activePartyId キーが無い
    const legacy: PersistedSession = {
      scenario,
      worldState: {
        scenarioId: ws.scenarioId,
        entityStates: ws.entityStates,
        log: ws.log,
        step: ws.step,
        firedTriggerIds: [...ws.firedTriggerIds],
      },
    }
    const revived = reviveSession(JSON.parse(JSON.stringify(legacy)) as PersistedSession)

    expect(revived.worldState.parties.length).toBe(1)
    expect(revived.worldState.parties[0].memberIds).toEqual(['pc-akira'])
    expect(revived.worldState.parties[0].locationId).toBe('room-b') // 初期位置に巻き戻らない
    expect(revived.worldState.activePartyId).toBe('party-default')
  })

  it('旧データに lastResult キーがあっても無視され、復元後は null になる', () => {
    const persisted = serializeSession(makeSession()) as PersistedSession & { lastResult?: unknown }
    persisted.lastResult = { firedTriggers: [], reachedFixedPoint: true } // 旧形式の残骸

    const revived = reviveSession(JSON.parse(JSON.stringify(persisted)) as PersistedSession)

    expect(revived.lastResult).toBe(null)
  })

  it('formatVersion が現行より新しい保存データは例外を投げる（読めた風に壊さない）', () => {
    const persisted = serializeSession(makeSession())
    persisted.formatVersion = 2

    expect(() => reviveSession(persisted)).toThrow(/保存形式/)
  })
})
