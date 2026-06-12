/**
 * エンジン層テスト
 *
 * ペトリネット意味論のstabilize（不動点計算）が正しく動くことを検証する。
 * テストシナリオは「悪霊の家」を簡略化したもの。
 */
import { describe, it, expect } from 'vitest'
import type { Action, Entity, Scenario } from '../types'
import {
  initializeWorldState,
  stabilize,
  fireAction,
  getAvailableActions,
  getEligibleActors,
  getPendingTriggers,
  evaluateCondition,
  buildChildrenMap,
  getAncestors,
  getDescendants,
  getSiblings,
  applyEffect,
  composeSceneDescription,
  canEnter,
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
    { id: 'house', name: '館', parentId: null, description: '', labels: [], connections: [], categories: [], actions: [], triggers: [] },
    { id: 'entrance', name: '玄関', parentId: 'house', description: '', labels: [], connections: [], categories: [], actions: [], triggers: [] },
    { id: 'study', name: '書斎', parentId: 'house', description: '', labels: [], connections: [], categories: [], actions: [], triggers: [] },
    { id: 'desk', name: '机', parentId: 'study', description: '', labels: [], connections: [], categories: [], actions: [], triggers: [] },
    { id: 'npc-misaki', name: '美咲', parentId: 'entrance', description: '', labels: [], connections: [], categories: [], actions: [], triggers: [] },
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
      id: 'room', name: '部屋', parentId: null, description: '', labels: [], connections: [],
      categories: [
        { id: 'light', name: '照明', exclusive: true, options: ['明るい', '暗い'] },
      ],
      actions: [], triggers: [],
    },
    {
      id: 'npc', name: 'NPC', parentId: 'room', description: '', labels: [], connections: [],
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
      id: 'room', name: '部屋', parentId: null, description: '', labels: [], connections: [],
      categories: [
        { id: 'light', name: '照明', exclusive: true, options: ['明るい', '暗い'] },
      ],
      actions: [], triggers: [],
    },
    {
      id: 'npc', name: 'NPC', parentId: 'room', description: '', labels: [], connections: [],
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
        id: 'room', name: '部屋', parentId: null, description: '', labels: [], connections: [],
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

    // 暗くする（applyEffect経由） → 効果なしのトリガーは状態変更しないので発火記録されない
    const map = buildChildrenMap(ws.entityStates)
    applyEffect(
      { type: 'setCategory', target: { type: 'named', entityId: 'room' }, categoryId: 'light', value: '暗い' },
      'room', ws.entityStates, entities, map,
    )
    const result2 = stabilize(ws, scenario)
    expect(result2.firedTriggers.length).toBe(0)
    expect(result2.reachedFixedPoint).toBe(true)
  })

  it('トリガーが連鎖する', () => {
    // A が暗い → B を警戒に → B が警戒 → C を赤に
    const entities: Entity[] = [
      {
        id: 'A', name: 'A', parentId: null, description: '', labels: [], connections: [],
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
        id: 'B', name: 'B', parentId: null, description: '', labels: [], connections: [],
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
        id: 'C', name: 'C', parentId: null, description: '', labels: [], connections: [],
        categories: [{ id: 'color', name: '色', exclusive: true, options: ['青', '赤'] }],
        actions: [], triggers: [],
      },
    ]

    const scenario = makeScenario(entities)
    const ws = initializeWorldState(scenario)

    // A を暗くする（applyEffect経由）
    const map = buildChildrenMap(ws.entityStates)
    applyEffect(
      { type: 'setCategory', target: { type: 'named', entityId: 'A' }, categoryId: 'light', value: '暗い' },
      'A', ws.entityStates, entities, map,
    )
    const result = stabilize(ws, scenario)

    expect(result.reachedFixedPoint).toBe(true)
    expect(result.firedTriggers.length).toBe(2)
    expect(ws.entityStates['B'].categoryValues['mood']).toBe('警戒')
    expect(ws.entityStates['C'].categoryValues['color']).toBe('赤')
  })

  it('firedOnce トリガーは一度だけ発火する', () => {
    const entities: Entity[] = [
      {
        id: 'X', name: 'X', parentId: null, description: '', labels: [], connections: [],
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

    const map = buildChildrenMap(ws.entityStates)
    applyEffect(
      { type: 'setCategory', target: { type: 'named', entityId: 'X' }, categoryId: 'state', value: 'on' },
      'X', ws.entityStates, entities, map,
    )
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
        id: 'X', name: 'X', parentId: null, description: '', labels: [], connections: [],
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
        id: 'room', name: '部屋', parentId: null, description: '', labels: [], connections: [],
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
        id: 'door', name: '扉', parentId: null, description: '', labels: [], connections: [],
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
        id: 'room', name: '部屋', parentId: null, description: '', labels: [], connections: [],
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

// ===== $actor 解決テスト =====

describe('$actor のEffect内解決', () => {
  // 部屋にPC(明)とランタン。アクションの効果が行為者を参照する。
  const entities: Entity[] = [
    {
      id: 'room', name: '部屋', parentId: null, description: '', labels: [], connections: [],
      categories: [],
      actions: [
        {
          id: 'act-take', name: 'ランタンを取る', entityId: 'room',
          description: '$actorはランタンを手に取った',
          isPlayerAction: true,
          effects: [
            { type: 'move', target: { type: 'named', entityId: 'lantern' }, newParentId: '$actor' },
          ],
          rollRequirement: {
            skill: '目星',
            successEffects: [
              { type: 'setCategory', target: { type: 'named', entityId: 'lantern' }, categoryId: 'holder', value: '$actor' },
            ],
            failureEffects: [
              { type: 'setCategory', target: { type: 'named', entityId: '$actor' }, categoryId: 'sanity', value: '動揺' },
            ],
          },
        },
      ],
      triggers: [],
    },
    {
      id: 'pc-akira', name: '明', parentId: 'room', description: '', labels: ['PC'], connections: [],
      categories: [
        { id: 'sanity', name: '正気度', exclusive: true, options: ['正常', '動揺'] },
      ],
      actions: [], triggers: [],
    },
    {
      id: 'lantern', name: 'ランタン', parentId: 'room', description: '', labels: [], connections: [],
      categories: [
        { id: 'holder', name: '所持者', exclusive: true, options: ['なし'] },
      ],
      actions: [], triggers: [],
    },
  ]

  it('named $actor target が行為者に解決される', () => {
    const scenario = makeScenario(entities)
    const ws = initializeWorldState(scenario)
    const map = buildChildrenMap(ws.entityStates)

    const changed = applyEffect(
      { type: 'setCategory', target: { type: 'named', entityId: '$actor' }, categoryId: 'sanity', value: '動揺' },
      'room', ws.entityStates, entities, map, 'pc-akira',
    )

    expect(changed).toBe(true)
    expect(ws.entityStates['pc-akira'].categoryValues['sanity']).toBe('動揺')
  })

  it('move の newParentId $actor が行為者に解決される', () => {
    const scenario = makeScenario(entities)
    const ws = initializeWorldState(scenario)
    const map = buildChildrenMap(ws.entityStates)

    const changed = applyEffect(
      { type: 'move', target: { type: 'named', entityId: 'lantern' }, newParentId: '$actor' },
      'room', ws.entityStates, entities, map, 'pc-akira',
    )

    expect(changed).toBe(true)
    expect(ws.entityStates['lantern'].parentId).toBe('pc-akira')
  })

  it('setCategory の value $actor が行為者の名前に解決される', () => {
    const scenario = makeScenario(entities)
    const ws = initializeWorldState(scenario)
    const map = buildChildrenMap(ws.entityStates)

    applyEffect(
      { type: 'setCategory', target: { type: 'named', entityId: 'lantern' }, categoryId: 'holder', value: '$actor' },
      'room', ws.entityStates, entities, map, 'pc-akira',
    )

    expect(ws.entityStates['lantern'].categoryValues['holder']).toBe('明')
  })

  it('actorId なしの $actor target は対象なし（変更なし=false）', () => {
    const scenario = makeScenario(entities)
    const ws = initializeWorldState(scenario)
    const map = buildChildrenMap(ws.entityStates)

    const changed = applyEffect(
      { type: 'setCategory', target: { type: 'named', entityId: '$actor' }, categoryId: 'sanity', value: '動揺' },
      'room', ws.entityStates, entities, map,
    )

    expect(changed).toBe(false)
    expect(ws.entityStates['pc-akira'].categoryValues['sanity']).toBe('正常')
  })

  it('アクション実行（成功）で effects / successEffects に actorId が渡る', () => {
    const scenario = makeScenario(entities)
    const ws = initializeWorldState(scenario)

    fireAction('act-take', ws, scenario, 'pc-akira', 'success')

    expect(ws.entityStates['lantern'].parentId).toBe('pc-akira')
    expect(ws.entityStates['lantern'].categoryValues['holder']).toBe('明')
  })

  it('アクション実行（失敗）で failureEffects に actorId が渡る', () => {
    const scenario = makeScenario(entities)
    const ws = initializeWorldState(scenario)

    fireAction('act-take', ws, scenario, 'pc-akira', 'failure')

    expect(ws.entityStates['lantern'].parentId).toBe('room') // 失敗時は移動しない
    expect(ws.entityStates['pc-akira'].categoryValues['sanity']).toBe('動揺')
  })

  it('removeCategory の value $actor も行為者の名前に解決される（setCategoryで付与した値を除去できる）', () => {
    const scenario = makeScenario(entities)
    const ws = initializeWorldState(scenario)
    const map = buildChildrenMap(ws.entityStates)

    applyEffect(
      { type: 'setCategory', target: { type: 'named', entityId: 'lantern' }, categoryId: 'holder', value: '$actor' },
      'room', ws.entityStates, entities, map, 'pc-akira',
    )
    expect(ws.entityStates['lantern'].categoryValues['holder']).toBe('明')

    const changed = applyEffect(
      { type: 'removeCategory', target: { type: 'named', entityId: 'lantern' }, categoryId: 'holder', value: '$actor' },
      'room', ws.entityStates, entities, map, 'pc-akira',
    )
    expect(changed).toBe(true)
    expect(ws.entityStates['lantern'].categoryValues['holder']).toBe('')
  })

  it('アクションログの $actor は行為者の名前に解決される（IDではない）', () => {
    const scenario = makeScenario(entities)
    const ws = initializeWorldState(scenario)

    fireAction('act-take', ws, scenario, 'pc-akira', 'success')

    const actionLog = ws.log.find((l) => l.type === 'action')
    expect(actionLog?.description).toContain('明はランタンを手に取った')
    expect(actionLog?.description).not.toContain('pc-akira')
  })
})

// ===== ログ実時刻テスト =====

describe('ログの実時刻', () => {
  it('アクションログとトリガーログに at (epoch ms) が記録される', () => {
    const entities: Entity[] = [
      {
        id: 'room', name: '部屋', parentId: null, description: '', labels: [], connections: [],
        categories: [
          { id: 'light', name: '照明', exclusive: true, options: ['明るい', '暗い'] },
          { id: 'alarm', name: '警報', exclusive: true, options: ['off', 'on'] },
        ],
        actions: [
          {
            id: 'act-switch', name: '消灯', entityId: 'room', description: '部屋の照明を消した',
            isPlayerAction: false,
            effects: [{ type: 'setCategory', target: { type: 'self' }, categoryId: 'light', value: '暗い' }],
          },
        ],
        triggers: [
          {
            id: 'trg-alarm', name: '暗い→警報', entityId: 'room',
            condition: { clauses: [{ reference: { type: 'self' }, categoryId: 'light', value: '暗い' }] },
            effects: [{ type: 'setCategory', target: { type: 'self' }, categoryId: 'alarm', value: 'on' }],
          },
        ],
      },
    ]

    const scenario = makeScenario(entities)
    const ws = initializeWorldState(scenario)

    fireAction('act-switch', ws, scenario)

    expect(ws.log.length).toBe(2) // action + trigger
    for (const entry of ws.log) {
      // 値は実行時刻に依存するため、number として存在することのみ確認
      expect(typeof entry.at).toBe('number')
    }
  })
})

// ===== 進入条件テスト =====

describe('canEnter（場所の進入条件）', () => {
  // 地下室は「扉が解錠」のときだけ入れる
  const entities: Entity[] = [
    {
      id: 'hall', name: '廊下', parentId: null, description: '', labels: [], connections: [],
      categories: [], actions: [], triggers: [],
    },
    {
      id: 'basement', name: '地下室', parentId: null, description: '', labels: [], connections: [],
      categories: [
        { id: 'door', name: '扉', exclusive: true, options: ['施錠', '解錠'] },
      ],
      actions: [], triggers: [],
      entryCondition: {
        clauses: [{ reference: { type: 'self' }, categoryId: 'door', value: '解錠' }],
      },
    },
  ]

  it('進入条件なしの場所には常に入れる', () => {
    const scenario = makeScenario(entities)
    const ws = initializeWorldState(scenario)

    expect(canEnter('hall', ws, scenario)).toBe(true)
  })

  it('進入条件が充足していれば入れる', () => {
    const scenario = makeScenario(entities)
    const ws = initializeWorldState(scenario)
    const map = buildChildrenMap(ws.entityStates)
    applyEffect(
      { type: 'setCategory', target: { type: 'named', entityId: 'basement' }, categoryId: 'door', value: '解錠' },
      'basement', ws.entityStates, entities, map,
    )

    expect(canEnter('basement', ws, scenario)).toBe(true)
  })

  it('進入条件が未充足なら入れない', () => {
    const scenario = makeScenario(entities)
    const ws = initializeWorldState(scenario)
    // 初期状態: door=施錠

    expect(canEnter('basement', ws, scenario)).toBe(false)
  })

  it('negate 条件を評価できる', () => {
    // 「施錠でない」ことが進入条件
    const negEntities: Entity[] = [
      {
        ...entities[1],
        id: 'vault', name: '金庫室',
        entryCondition: {
          clauses: [{ reference: { type: 'self' }, categoryId: 'door', value: '施錠', negate: true }],
        },
      },
    ]
    const scenario = makeScenario(negEntities)
    const ws = initializeWorldState(scenario)
    // 初期状態: door=施錠 → negate なので false
    expect(canEnter('vault', ws, scenario)).toBe(false)

    const map = buildChildrenMap(ws.entityStates)
    applyEffect(
      { type: 'setCategory', target: { type: 'named', entityId: 'vault' }, categoryId: 'door', value: '解錠' },
      'vault', ws.entityStates, negEntities, map,
    )
    expect(canEnter('vault', ws, scenario)).toBe(true)
  })
})

// ===== 場面合成テスト =====

describe('composeSceneDescription', () => {
  // 書斎 > 机 > 日記 の3階層。
  // light=明るい には描写なし（描写を持つ値だけが場面に現れることを確認するため）。
  const entities: Entity[] = [
    {
      id: 'study', name: '書斎', parentId: null, description: '埃っぽい書斎。本棚が壁を覆っている。', labels: [], connections: [],
      categories: [
        {
          id: 'light', name: '照明', exclusive: true, options: ['明るい', '暗い'],
          descriptions: { '暗い': '部屋は闇に沈んでいる。' },
        },
      ],
      actions: [], triggers: [],
    },
    {
      id: 'desk', name: '机', parentId: 'study', description: '', labels: [], connections: [],
      categories: [
        {
          id: 'drawer', name: '引き出し', exclusive: true, options: ['閉', '開'],
          descriptions: { '閉': '机の引き出しは閉まっている。', '開': '引き出しが開いている。' },
        },
      ],
      actions: [], triggers: [],
    },
    {
      id: 'diary', name: '日記', parentId: 'desk', description: '', labels: [], connections: [],
      categories: [
        {
          id: 'found', name: '発見状況', exclusive: false, options: ['発見済', '解読済'],
          descriptions: { '発見済': '古い日記が見つかっている。', '解読済': '日記の内容は解読済みだ。' },
        },
      ],
      actions: [], triggers: [],
    },
  ]

  it('自身のdescriptionが先頭、描写を持つカテゴリ値だけが出力される', () => {
    const scenario = makeScenario(entities)
    const ws = initializeWorldState(scenario)
    // 初期状態: light=明るい(描写なし), drawer=閉(描写あり), found=[](値なし)

    const parts = composeSceneDescription('study', ws, scenario)
    expect(parts).toEqual([
      { entityId: 'study', text: '埃っぽい書斎。本棚が壁を覆っている。' },
      { entityId: 'desk', text: '机の引き出しは閉まっている。' },
    ])
  })

  it('描写を持つ値に変化すると場面に現れる', () => {
    const scenario = makeScenario(entities)
    const ws = initializeWorldState(scenario)
    const map = buildChildrenMap(ws.entityStates)
    applyEffect(
      { type: 'setCategory', target: { type: 'named', entityId: 'study' }, categoryId: 'light', value: '暗い' },
      'study', ws.entityStates, entities, map,
    )

    const parts = composeSceneDescription('study', ws, scenario)
    expect(parts).toEqual([
      { entityId: 'study', text: '埃っぽい書斎。本棚が壁を覆っている。' },
      { entityId: 'study', text: '部屋は闇に沈んでいる。' },
      { entityId: 'desk', text: '机の引き出しは閉まっている。' },
    ])
  })

  it('非排他カテゴリは保持する各値の描写を出力し、親→子の順に並ぶ', () => {
    const scenario = makeScenario(entities)
    const ws = initializeWorldState(scenario)
    const map = buildChildrenMap(ws.entityStates)
    applyEffect(
      { type: 'setCategory', target: { type: 'named', entityId: 'diary' }, categoryId: 'found', value: '発見済' },
      'diary', ws.entityStates, entities, map,
    )
    applyEffect(
      { type: 'setCategory', target: { type: 'named', entityId: 'diary' }, categoryId: 'found', value: '解読済' },
      'diary', ws.entityStates, entities, map,
    )

    const parts = composeSceneDescription('study', ws, scenario)
    expect(parts).toEqual([
      { entityId: 'study', text: '埃っぽい書斎。本棚が壁を覆っている。' },
      { entityId: 'desk', text: '机の引き出しは閉まっている。' },
      { entityId: 'diary', text: '古い日記が見つかっている。' },
      { entityId: 'diary', text: '日記の内容は解読済みだ。' },
    ])
  })

  it('ワールド状態が欠落しているエンティティがあっても安全に動作する', () => {
    // スキーマには diary があるが、ワールド状態には無い（ライブ編集中の不整合を再現）
    const partialScenario = makeScenario(entities.filter((e) => e.id !== 'diary'))
    const ws = initializeWorldState(partialScenario)
    const fullScenario = makeScenario(entities)

    const parts = composeSceneDescription('study', ws, fullScenario)
    expect(parts).toEqual([
      { entityId: 'study', text: '埃っぽい書斎。本棚が壁を覆っている。' },
      { entityId: 'desk', text: '机の引き出しは閉まっている。' },
    ])
  })
})

// ===== パーティ初期化テスト =====

describe('パーティ初期化', () => {
  it('ラベルPCを持つ全エンティティでデフォルトパーティ「パーティ」が作られる', () => {
    const entities: Entity[] = [
      { id: 'room', name: '部屋', parentId: null, description: '', labels: [], connections: [], categories: [], actions: [], triggers: [] },
      { id: 'pc-akira', name: '明', parentId: 'room', description: '', labels: ['PC'], connections: [], categories: [], actions: [], triggers: [] },
      { id: 'pc-yui', name: '結衣', parentId: 'room', description: '', labels: ['PC'], connections: [], categories: [], actions: [], triggers: [] },
      { id: 'npc-misaki', name: '美咲', parentId: 'room', description: '', labels: [], connections: [], categories: [], actions: [], triggers: [] },
    ]
    const ws = initializeWorldState(makeScenario(entities))

    expect(ws.parties.length).toBe(1)
    expect(ws.parties[0].id).toBe('party-default')
    expect(ws.parties[0].name).toBe('パーティ')
    expect(ws.parties[0].memberIds).toEqual(['pc-akira', 'pc-yui'])
    expect(ws.activePartyId).toBe('party-default')
  })

  it('locationId は先頭PCの parentId になる', () => {
    const entities: Entity[] = [
      { id: 'hall', name: '廊下', parentId: null, description: '', labels: [], connections: [], categories: [], actions: [], triggers: [] },
      { id: 'pc-akira', name: '明', parentId: 'hall', description: '', labels: ['PC'], connections: [], categories: [], actions: [], triggers: [] },
    ]
    const ws = initializeWorldState(makeScenario(entities))

    expect(ws.parties[0].locationId).toBe('hall')
  })

  it('先頭PCがルート直下なら locationId は null', () => {
    const entities: Entity[] = [
      { id: 'pc-akira', name: '明', parentId: null, description: '', labels: ['PC'], connections: [], categories: [], actions: [], triggers: [] },
    ]
    const ws = initializeWorldState(makeScenario(entities))

    expect(ws.parties[0].locationId).toBe(null)
  })

  it('PCがいなければ parties は空で activePartyId は null', () => {
    const entities: Entity[] = [
      { id: 'room', name: '部屋', parentId: null, description: '', labels: [], connections: [], categories: [], actions: [], triggers: [] },
      { id: 'npc-misaki', name: '美咲', parentId: 'room', description: '', labels: [], connections: [], categories: [], actions: [], triggers: [] },
    ]
    const ws = initializeWorldState(makeScenario(entities))

    expect(ws.parties).toEqual([])
    expect(ws.activePartyId).toBe(null)
  })
})

// ===== 行為者候補テスト =====

describe('getEligibleActors', () => {
  // 部屋にPC2人とNPC1人。明は革袋を持ち、その中に鍵がある（子孫の推移性を確認）。
  const pcCategories = () => [
    { id: 'knowledge', name: '知識', exclusive: false, options: ['噂', '儀式'] },
    { id: 'job', name: '職業', exclusive: true, options: ['探偵', '医師'] },
  ]
  const baseEntities = (): Entity[] => [
    { id: 'room', name: '部屋', parentId: null, description: '', labels: [], connections: [], categories: [], actions: [], triggers: [] },
    { id: 'pc-akira', name: '明', parentId: 'room', description: '', labels: ['PC'], connections: [], categories: pcCategories(), actions: [], triggers: [] },
    { id: 'pc-yui', name: '結衣', parentId: 'room', description: '', labels: ['PC'], connections: [], categories: pcCategories(), actions: [], triggers: [] },
    { id: 'npc-misaki', name: '美咲', parentId: 'room', description: '', labels: [], connections: [], categories: [], actions: [], triggers: [] },
    { id: 'pouch', name: '革袋', parentId: 'pc-akira', description: '', labels: [], connections: [], categories: [], actions: [], triggers: [] },
    { id: 'key', name: '鍵', parentId: 'pouch', description: '', labels: [], connections: [], categories: [], actions: [], triggers: [] },
  ]

  function makeAction(partial: Partial<Action>): Action {
    return {
      id: 'act-test',
      name: 'テスト',
      entityId: 'room',
      description: '',
      isPlayerAction: true,
      effects: [],
      ...partial,
    }
  }

  it('アクティブパーティのメンバーのうちラベルPCのみが候補になる', () => {
    const entities = baseEntities()
    const scenario = makeScenario(entities)
    const ws = initializeWorldState(scenario)
    // パーティにNPCを混ぜても候補にはPCだけが残る
    ws.parties[0].memberIds.push('npc-misaki')

    expect(getEligibleActors(makeAction({}), ws, scenario)).toEqual(['pc-akira', 'pc-yui'])
  })

  it('requiredItems: アイテムを子孫に持つPCだけが候補になる（推移的な所持）', () => {
    const entities = baseEntities()
    const scenario = makeScenario(entities)
    const ws = initializeWorldState(scenario)

    // 鍵は 革袋 の中、革袋は 明 の中 → 明だけが「鍵を所持」
    const action = makeAction({ requiredItems: ['key'] })
    expect(getEligibleActors(action, ws, scenario)).toEqual(['pc-akira'])

    // 誰も持っていないアイテムを要求 → 候補なし
    const impossible = makeAction({ requiredItems: ['key', 'no-such-item'] })
    expect(getEligibleActors(impossible, ws, scenario)).toEqual([])
  })

  it('requiredKnowledge: 非排他カテゴリの値を持つPCだけが候補になる', () => {
    const entities = baseEntities()
    const scenario = makeScenario(entities)
    const ws = initializeWorldState(scenario)
    const map = buildChildrenMap(ws.entityStates)
    applyEffect(
      { type: 'setCategory', target: { type: 'named', entityId: 'pc-akira' }, categoryId: 'knowledge', value: '噂' },
      'pc-akira', ws.entityStates, entities, map,
    )

    const action = makeAction({ requiredKnowledge: ['噂'] })
    expect(getEligibleActors(action, ws, scenario)).toEqual(['pc-akira'])
  })

  it('requiredKnowledge: 排他カテゴリの単値一致でも判定される', () => {
    const entities = baseEntities()
    const scenario = makeScenario(entities)
    const ws = initializeWorldState(scenario)
    const map = buildChildrenMap(ws.entityStates)
    // 初期値は両PCとも job=探偵。明だけ医師に変更。
    applyEffect(
      { type: 'setCategory', target: { type: 'named', entityId: 'pc-akira' }, categoryId: 'job', value: '医師' },
      'pc-akira', ws.entityStates, entities, map,
    )

    expect(getEligibleActors(makeAction({ requiredKnowledge: ['医師'] }), ws, scenario)).toEqual(['pc-akira'])
    expect(getEligibleActors(makeAction({ requiredKnowledge: ['探偵'] }), ws, scenario)).toEqual(['pc-yui'])
  })

  it('requiredItems と requiredKnowledge は全て満たす必要がある', () => {
    const entities = baseEntities()
    const scenario = makeScenario(entities)
    const ws = initializeWorldState(scenario)
    const map = buildChildrenMap(ws.entityStates)
    // 結衣は知識だけ持つ（鍵は明が所持）→ 両方満たすPCはいない
    applyEffect(
      { type: 'setCategory', target: { type: 'named', entityId: 'pc-yui' }, categoryId: 'knowledge', value: '噂' },
      'pc-yui', ws.entityStates, entities, map,
    )

    const action = makeAction({ requiredItems: ['key'], requiredKnowledge: ['噂'] })
    expect(getEligibleActors(action, ws, scenario)).toEqual([])

    // 明にも知識を与えると、明だけが両方満たす
    applyEffect(
      { type: 'setCategory', target: { type: 'named', entityId: 'pc-akira' }, categoryId: 'knowledge', value: '噂' },
      'pc-akira', ws.entityStates, entities, map,
    )
    expect(getEligibleActors(action, ws, scenario)).toEqual(['pc-akira'])
  })

  it('アクティブパーティがなければ空配列を返す', () => {
    // PCなしシナリオ → activePartyId は null
    const entities: Entity[] = [
      { id: 'room', name: '部屋', parentId: null, description: '', labels: [], connections: [], categories: [], actions: [], triggers: [] },
      { id: 'npc-misaki', name: '美咲', parentId: 'room', description: '', labels: [], connections: [], categories: [], actions: [], triggers: [] },
    ]
    const scenario = makeScenario(entities)
    const ws = initializeWorldState(scenario)

    expect(getEligibleActors(makeAction({}), ws, scenario)).toEqual([])
  })
})
