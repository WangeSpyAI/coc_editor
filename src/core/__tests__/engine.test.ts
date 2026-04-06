/**
 * エンジン層テスト
 *
 * ペトリネット意味論のstabilize（不動点計算）が正しく動くことを検証する。
 * テストシナリオは「悪霊の家」を簡略化したもの。
 */
import { describe, it, expect } from 'vitest'
import type { Entity, Scenario, WorldState } from '../types'
import {
  initializeWorldState,
  stabilize,
  fireAction,
  getAvailableActions,
  getPendingTriggers,
  evaluateCondition,
  buildChildrenMap,
  getAncestors,
  getDescendants,
  getSiblings,
  applyEffect,
} from '../engine'

// ===== テスト用ヘルパー =====

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

// ===== ツリー操作テスト =====

describe('ツリー操作', () => {
  const entities: Entity[] = [
    { id: 'house', name: '館', parentId: null, description: '', labels: [], categories: [], actions: [], triggers: [] },
    { id: 'entrance', name: '玄関', parentId: 'house', description: '', labels: [], categories: [], actions: [], triggers: [] },
    { id: 'study', name: '書斎', parentId: 'house', description: '', labels: [], categories: [], actions: [], triggers: [] },
    { id: 'desk', name: '机', parentId: 'study', description: '', labels: [], categories: [], actions: [], triggers: [] },
    { id: 'npc-misaki', name: '美咲', parentId: 'entrance', description: '', labels: [], categories: [], actions: [], triggers: [] },
  ]
  const scenario = makeScenario(entities)
  const ws = initializeWorldState(scenario)

  it('buildChildrenMapが正しいマップを返す', () => {
    const map = buildChildrenMap(ws.entityStates)
    expect(map['__root__']).toEqual(['house'])
    expect(map['house']?.sort()).toEqual(['entrance', 'study'])
    expect(map['study']).toEqual(['desk'])
    expect(map['entrance']).toEqual(['npc-misaki'])
  })

  it('getAncestorsが祖先を返す', () => {
    expect(getAncestors('desk', ws.entityStates)).toEqual(['study', 'house'])
    expect(getAncestors('house', ws.entityStates)).toEqual([])
  })

  it('getDescendantsが子孫を返す', () => {
    const map = buildChildrenMap(ws.entityStates)
    const desc = getDescendants('house', map)
    expect(desc).toContain('entrance')
    expect(desc).toContain('study')
    expect(desc).toContain('desk')
    expect(desc).toContain('npc-misaki')
    expect(desc.length).toBe(4)
  })

  it('getSiblingsが同位を返す', () => {
    const map = buildChildrenMap(ws.entityStates)
    expect(getSiblings('entrance', ws.entityStates, map)).toEqual(['study'])
    expect(getSiblings('study', ws.entityStates, map)).toEqual(['entrance'])
  })
})

// ===== 条件評価テスト =====

describe('条件評価', () => {
  const entities: Entity[] = [
    {
      id: 'room', name: '部屋', parentId: null, description: '', labels: [],
      categories: [
        { id: 'light', name: '照明', exclusive: true, options: ['明るい', '暗い'] },
      ],
      actions: [], triggers: [],
    },
    {
      id: 'npc', name: 'NPC', parentId: 'room', description: '', labels: [],
      categories: [
        { id: 'mood', name: '気分', exclusive: true, options: ['普通', '警戒', '敵対'] },
        { id: 'knowledge', name: '知識', exclusive: false, options: ['噂', '日記', '儀式'] },
      ],
      actions: [], triggers: [],
    },
  ]
  const scenario = makeScenario(entities)
  const ws = initializeWorldState(scenario)
  // 初期状態: room.light=明るい, npc.mood=普通, npc.knowledge=[]

  it('排他カテゴリの一致を判定', () => {
    const map = buildChildrenMap(ws.entityStates)
    expect(evaluateCondition(
      { clauses: [{ reference: { type: 'self' }, categoryId: 'mood', value: '普通' }] },
      'npc', ws.entityStates, entities, map,
    )).toBe(true)

    expect(evaluateCondition(
      { clauses: [{ reference: { type: 'self' }, categoryId: 'mood', value: '警戒' }] },
      'npc', ws.entityStates, entities, map,
    )).toBe(false)
  })

  it('祖先参照で親の状態を確認', () => {
    const map = buildChildrenMap(ws.entityStates)
    expect(evaluateCondition(
      { clauses: [{ reference: { type: 'ancestor' }, categoryId: 'light', value: '明るい' }] },
      'npc', ws.entityStates, entities, map,
    )).toBe(true)
  })

  it('negateで否定条件', () => {
    const map = buildChildrenMap(ws.entityStates)
    expect(evaluateCondition(
      { clauses: [{ reference: { type: 'self' }, categoryId: 'mood', value: '敵対', negate: true }] },
      'npc', ws.entityStates, entities, map,
    )).toBe(true)
  })

  it('AND結合: 全条件成立で真', () => {
    const map = buildChildrenMap(ws.entityStates)
    expect(evaluateCondition(
      {
        clauses: [
          { reference: { type: 'self' }, categoryId: 'mood', value: '普通' },
          { reference: { type: 'ancestor' }, categoryId: 'light', value: '明るい' },
        ],
      },
      'npc', ws.entityStates, entities, map,
    )).toBe(true)

    expect(evaluateCondition(
      {
        clauses: [
          { reference: { type: 'self' }, categoryId: 'mood', value: '普通' },
          { reference: { type: 'ancestor' }, categoryId: 'light', value: '暗い' },
        ],
      },
      'npc', ws.entityStates, entities, map,
    )).toBe(false)
  })
})

// ===== 効果適用テスト =====

describe('効果適用', () => {
  const entities: Entity[] = [
    {
      id: 'room', name: '部屋', parentId: null, description: '', labels: [],
      categories: [
        { id: 'light', name: '照明', exclusive: true, options: ['明るい', '暗い'] },
      ],
      actions: [], triggers: [],
    },
    {
      id: 'npc', name: 'NPC', parentId: 'room', description: '', labels: [],
      categories: [
        { id: 'mood', name: '気分', exclusive: true, options: ['普通', '警戒', '敵対'] },
        { id: 'knowledge', name: '知識', exclusive: false, options: ['噂', '日記', '儀式'] },
      ],
      actions: [], triggers: [],
    },
  ]

  it('排他カテゴリの値を変更できる', () => {
    const scenario = makeScenario(entities)
    const ws = initializeWorldState(scenario)
    const map = buildChildrenMap(ws.entityStates)

    const changed = applyEffect(
      { type: 'setCategory', target: { type: 'self' }, categoryId: 'mood', value: '警戒' },
      'npc', ws.entityStates, entities, map,
    )

    expect(changed).toBe(true)
    expect(ws.entityStates['npc'].categoryValues['mood']).toBe('警戒')
  })

  it('非排他カテゴリに値を追加できる', () => {
    const scenario = makeScenario(entities)
    const ws = initializeWorldState(scenario)
    const map = buildChildrenMap(ws.entityStates)

    applyEffect(
      { type: 'setCategory', target: { type: 'self' }, categoryId: 'knowledge', value: '噂' },
      'npc', ws.entityStates, entities, map,
    )

    expect(ws.entityStates['npc'].categoryValues['knowledge']).toEqual(['噂'])

    // 重複追加しない
    const changed = applyEffect(
      { type: 'setCategory', target: { type: 'self' }, categoryId: 'knowledge', value: '噂' },
      'npc', ws.entityStates, entities, map,
    )
    expect(changed).toBe(false)
    expect(ws.entityStates['npc'].categoryValues['knowledge']).toEqual(['噂'])
  })

  it('moveでエンティティの親を変更できる', () => {
    const scenario = makeScenario(entities)
    const ws = initializeWorldState(scenario)
    const map = buildChildrenMap(ws.entityStates)

    expect(ws.entityStates['npc'].parentId).toBe('room')

    applyEffect(
      { type: 'move', target: { type: 'named', entityId: 'npc' }, newParentId: '__outside__' },
      'room', ws.entityStates, entities, map,
    )

    // 注: __outside__ は存在しないが親IDは設定される
    expect(ws.entityStates['npc'].parentId).toBe('__outside__')
  })
})

// ===== Stabilize テスト =====

describe('stabilize（不動点計算）', () => {
  it('条件が成立するトリガーが発火する', () => {
    const entities: Entity[] = [
      {
        id: 'room', name: '部屋', parentId: null, description: '', labels: [],
        categories: [
          { id: 'light', name: '照明', exclusive: true, options: ['明るい', '暗い'] },
        ],
        actions: [],
        triggers: [
          {
            id: 'trg-dark', name: '暗くなったら警告',
            entityId: 'room',
            condition: { clauses: [{ reference: { type: 'self' }, categoryId: 'light', value: '暗い' }] },
            effects: [], // 状態変更なし（ログのみ）
          },
        ],
      },
    ]
    const scenario = makeScenario(entities)
    const ws = initializeWorldState(scenario)

    // 初期状態: light=明るい → トリガー不発火
    const result1 = stabilize(ws, scenario)
    expect(result1.firedTriggers.length).toBe(0)
    expect(result1.reachedFixedPoint).toBe(true)

    // 暗くする → 効果なしのトリガーは状態変更しないので発火記録されない
    ws.entityStates['room'].categoryValues['light'] = '暗い'
    const result2 = stabilize(ws, scenario)
    expect(result2.firedTriggers.length).toBe(0)
    expect(result2.reachedFixedPoint).toBe(true)
  })

  it('トリガーが連鎖する', () => {
    // A が暗い → B を警戒に → B が警戒 → C を赤に
    const entities: Entity[] = [
      {
        id: 'A', name: 'A', parentId: null, description: '', labels: [],
        categories: [{ id: 'light', name: '照明', exclusive: true, options: ['明るい', '暗い'] }],
        actions: [],
        triggers: [
          {
            id: 'trg-A',
            name: 'A暗い→B警戒',
            entityId: 'A',
            condition: { clauses: [{ reference: { type: 'self' }, categoryId: 'light', value: '暗い' }] },
            effects: [{ type: 'setCategory', target: { type: 'named', entityId: 'B' }, categoryId: 'mood', value: '警戒' }],
          },
        ],
      },
      {
        id: 'B', name: 'B', parentId: null, description: '', labels: [],
        categories: [{ id: 'mood', name: '気分', exclusive: true, options: ['普通', '警戒'] }],
        actions: [],
        triggers: [
          {
            id: 'trg-B',
            name: 'B警戒→C赤',
            entityId: 'B',
            condition: { clauses: [{ reference: { type: 'self' }, categoryId: 'mood', value: '警戒' }] },
            effects: [{ type: 'setCategory', target: { type: 'named', entityId: 'C' }, categoryId: 'color', value: '赤' }],
          },
        ],
      },
      {
        id: 'C', name: 'C', parentId: null, description: '', labels: [],
        categories: [{ id: 'color', name: '色', exclusive: true, options: ['青', '赤'] }],
        actions: [], triggers: [],
      },
    ]

    const scenario = makeScenario(entities)
    const ws = initializeWorldState(scenario)

    // A を暗くする
    ws.entityStates['A'].categoryValues['light'] = '暗い'
    const result = stabilize(ws, scenario)

    expect(result.reachedFixedPoint).toBe(true)
    expect(result.firedTriggers.length).toBe(2)
    expect(ws.entityStates['B'].categoryValues['mood']).toBe('警戒')
    expect(ws.entityStates['C'].categoryValues['color']).toBe('赤')
  })

  it('firedOnce トリガーは一度だけ発火する', () => {
    const entities: Entity[] = [
      {
        id: 'X', name: 'X', parentId: null, description: '', labels: [],
        categories: [{ id: 'state', name: '状態', exclusive: true, options: ['off', 'on'] }],
        actions: [],
        triggers: [
          {
            id: 'trg-once',
            name: '一度だけ',
            entityId: 'X',
            condition: { clauses: [{ reference: { type: 'self' }, categoryId: 'state', value: 'on' }] },
            effects: [],
            firedOnce: true,
          },
        ],
      },
    ]

    const scenario = makeScenario(entities)
    const ws = initializeWorldState(scenario)

    ws.entityStates['X'].categoryValues['state'] = 'on'
    const r1 = stabilize(ws, scenario)
    expect(r1.firedTriggers.length).toBe(1)

    // もう一度stabilizeしても発火しない
    const r2 = stabilize(ws, scenario)
    expect(r2.firedTriggers.length).toBe(0)
  })

  it('振動を検出して上限で停止する', () => {
    // A=on → A=off, A=off → A=on の無限ループ
    const entities: Entity[] = [
      {
        id: 'X', name: 'X', parentId: null, description: '', labels: [],
        categories: [{ id: 's', name: 's', exclusive: true, options: ['on', 'off'] }],
        actions: [],
        triggers: [
          {
            id: 'trg-on',
            name: 'on→off',
            entityId: 'X',
            condition: { clauses: [{ reference: { type: 'self' }, categoryId: 's', value: 'on' }] },
            effects: [{ type: 'setCategory', target: { type: 'self' }, categoryId: 's', value: 'off' }],
          },
          {
            id: 'trg-off',
            name: 'off→on',
            entityId: 'X',
            condition: { clauses: [{ reference: { type: 'self' }, categoryId: 's', value: 'off' }] },
            effects: [{ type: 'setCategory', target: { type: 'self' }, categoryId: 's', value: 'on' }],
          },
        ],
      },
    ]

    const scenario = makeScenario(entities)
    const ws = initializeWorldState(scenario)

    const result = stabilize(ws, scenario)
    expect(result.reachedFixedPoint).toBe(false) // 振動検出
  })
})

// ===== アクション発火テスト =====

describe('fireAction', () => {
  it('アクション発火後にstabilizeが走る', () => {
    const entities: Entity[] = [
      {
        id: 'room', name: '部屋', parentId: null, description: '', labels: [],
        categories: [
          { id: 'light', name: '照明', exclusive: true, options: ['明るい', '暗い'] },
          { id: 'alarm', name: '警報', exclusive: true, options: ['off', 'on'] },
        ],
        actions: [
          {
            id: 'act-switch',
            name: '消灯',
            entityId: 'room',
            description: '部屋の照明を消した',
            isPlayerAction: false,
            effects: [{ type: 'setCategory', target: { type: 'self' }, categoryId: 'light', value: '暗い' }],
          },
        ],
        triggers: [
          {
            id: 'trg-alarm',
            name: '暗い→警報',
            entityId: 'room',
            condition: { clauses: [{ reference: { type: 'self' }, categoryId: 'light', value: '暗い' }] },
            effects: [{ type: 'setCategory', target: { type: 'self' }, categoryId: 'alarm', value: 'on' }],
          },
        ],
      },
    ]

    const scenario = makeScenario(entities)
    const ws = initializeWorldState(scenario)

    const result = fireAction('act-switch', ws, scenario)

    expect(ws.entityStates['room'].categoryValues['light']).toBe('暗い')
    expect(ws.entityStates['room'].categoryValues['alarm']).toBe('on')
    expect(result.firedTriggers.length).toBe(1)
    expect(result.reachedFixedPoint).toBe(true)
    expect(ws.log.length).toBe(2) // action + trigger
  })
})

// ===== getAvailableActions テスト =====

describe('getAvailableActions', () => {
  it('表示条件が成立するアクションのみ返す', () => {
    const entities: Entity[] = [
      {
        id: 'door', name: '扉', parentId: null, description: '', labels: [],
        categories: [
          { id: 'state', name: '状態', exclusive: true, options: ['閉', '開'] },
        ],
        actions: [
          {
            id: 'act-open', name: '開ける', entityId: 'door', description: '扉を開けた',
            isPlayerAction: true,
            displayCondition: { clauses: [{ reference: { type: 'self' }, categoryId: 'state', value: '閉' }] },
            effects: [{ type: 'setCategory', target: { type: 'self' }, categoryId: 'state', value: '開' }],
          },
          {
            id: 'act-close', name: '閉める', entityId: 'door', description: '扉を閉めた',
            isPlayerAction: true,
            displayCondition: { clauses: [{ reference: { type: 'self' }, categoryId: 'state', value: '開' }] },
            effects: [{ type: 'setCategory', target: { type: 'self' }, categoryId: 'state', value: '閉' }],
          },
        ],
        triggers: [],
      },
    ]

    const scenario = makeScenario(entities)
    const ws = initializeWorldState(scenario)

    // 初期: 閉 → 「開ける」だけ利用可能
    let actions = getAvailableActions('door', ws, scenario)
    expect(actions.map((a) => a.id)).toEqual(['act-open'])

    // 開ける
    fireAction('act-open', ws, scenario)

    // 開 → 「閉める」だけ利用可能
    actions = getAvailableActions('door', ws, scenario)
    expect(actions.map((a) => a.id)).toEqual(['act-close'])
  })
})

// ===== 待機中トリガー テスト =====

describe('getPendingTriggers', () => {
  it('残り1条件のトリガーを検出する', () => {
    const entities: Entity[] = [
      {
        id: 'room', name: '部屋', parentId: null, description: '', labels: [],
        categories: [
          { id: 'light', name: '照明', exclusive: true, options: ['明るい', '暗い'] },
          { id: 'locked', name: '施錠', exclusive: true, options: ['施錠', '解錠'] },
        ],
        actions: [],
        triggers: [
          {
            id: 'trg-escape',
            name: '脱出可能',
            entityId: 'room',
            condition: {
              clauses: [
                { reference: { type: 'self' }, categoryId: 'light', value: '明るい' },
                { reference: { type: 'self' }, categoryId: 'locked', value: '解錠' },
              ],
            },
            effects: [],
          },
        ],
      },
    ]

    const scenario = makeScenario(entities)
    const ws = initializeWorldState(scenario)
    // 初期: light=明るい, locked=施錠 → 残り1条件(解錠)

    const pending = getPendingTriggers(ws, scenario)
    expect(pending.length).toBe(1)
    expect(pending[0].trigger.id).toBe('trg-escape')
    expect(pending[0].unmetClauses[0].value).toBe('解錠')
  })
})
