import type { Scenario } from './types'

/**
 * サンプルシナリオ: 館の殺人事件
 *
 * エンティティツリー:
 *   館 (場所)
 *     ├─ 玄関ホール
 *     ├─ 書斎
 *     │   ├─ 日記 (アイテム)
 *     │   └─ 書斎のドア (物体)
 *     ├─ 地下室
 *     │   └─ 祭壇 (アイテム)
 *     └─ 庭
 *   探索者A (PC)
 *   山田 (NPC)
 *   鈴木 (NPC)
 *
 * PC・NPC・ドア・アイテムは全て同じEntity。
 * ラベルで区別するだけ。ルール上の扱いは同一。
 *
 * 「〜を調べる」のようなボイラープレートアクションは定義しない。
 * 単純な状態変更はKPがバッジをクリックすれば済む。
 * アクションは「因果を持つ操作」だけ。
 */
export const sampleScenario: Scenario = {
  id: 'sample-mansion',
  title: '館の殺人事件',
  author: 'サンプル',
  description: '古い洋館で起きた連続殺人事件を調査するシナリオ',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  entities: [
    // === 場所 ===
    {
      id: 'mansion',
      name: '館',
      parentId: null,
      description: '古びた洋館。不気味な雰囲気が漂う。',
      labels: ['場所'],
      categories: [
        { id: 'mansion-state', name: '状態', exclusive: true, options: ['平穏', '不穏', '危険'] },
      ],
      actions: [],
      triggers: [],
    },
    {
      id: 'entrance',
      name: '玄関ホール',
      parentId: 'mansion',
      description: '広々とした玄関ホール。大きな階段がある。古い肖像画が並ぶ。',
      labels: ['場所'],
      categories: [
        { id: 'entrance-explored', name: '探索', exclusive: true, options: ['未探索', '探索済'] },
      ],
      actions: [],
      triggers: [],
    },
    {
      id: 'study',
      name: '書斎',
      parentId: 'mansion',
      description: '本棚に囲まれた書斎。机の上に何かがある。',
      labels: ['場所'],
      categories: [
        { id: 'study-explored', name: '探索', exclusive: true, options: ['未探索', '探索済'] },
      ],
      actions: [],
      triggers: [],
    },
    {
      id: 'diary',
      name: '日記',
      parentId: 'study',
      description: '館の主人の日記。不穏な記述がある。',
      labels: ['アイテム', '手がかり'],
      categories: [
        { id: 'diary-read', name: '状態', exclusive: true, options: ['未読', '既読'] },
      ],
      actions: [
        {
          id: 'read-diary',
          name: '日記を読む',
          entityId: 'diary',
          description: '$actorが日記を読んだ。地下室で秘密の儀式が行われていたことが書かれている。',
          isPlayerAction: true,
          displayCondition: {
            clauses: [
              { reference: { type: 'ancestor' }, categoryId: 'study-explored', value: '探索済' },
            ],
          },
          effects: [
            { type: 'setCategory', target: { type: 'self' }, categoryId: 'diary-read', value: '既読' },
          ],
        },
      ],
      triggers: [],
    },
    {
      id: 'study-door',
      name: '書斎のドア',
      parentId: 'study',
      description: '重厚な木製の扉。鍵がかかっているようだ。',
      labels: ['物体', 'ドア'],
      categories: [
        { id: 'study-door-state', name: '状態', exclusive: true, options: ['施錠', '解錠', '破壊'] },
      ],
      actions: [
        {
          id: 'break-study-door',
          name: 'ドアを蹴破る',
          entityId: 'study-door',
          description: '$actorが書斎のドアに体当たりした。',
          isPlayerAction: true,
          rollRequirement: {
            skill: 'STR',
            opposed: true,
            successEffects: [
              { type: 'setCategory', target: { type: 'self' }, categoryId: 'study-door-state', value: '破壊' },
              { type: 'setCategory', target: { type: 'named', entityId: 'yamada' }, categoryId: 'yamada-attitude', value: '警戒' },
            ],
            failureEffects: [],
          },
          effects: [],
        },
      ],
      triggers: [],
    },
    {
      id: 'basement',
      name: '地下室',
      parentId: 'mansion',
      description: '暗く湿った地下室。何かの儀式の跡がある。',
      labels: ['場所', '危険'],
      categories: [
        { id: 'basement-state', name: '状態', exclusive: true, options: ['封鎖', '開放', '儀式中'] },
      ],
      actions: [],
      triggers: [
        {
          id: 'trigger-basement-open',
          name: '日記を読むと地下室が開放',
          entityId: 'basement',
          condition: {
            clauses: [
              { reference: { type: 'named', entityId: 'diary' }, categoryId: 'diary-read', value: '既読' },
            ],
          },
          effects: [
            { type: 'setCategory', target: { type: 'self' }, categoryId: 'basement-state', value: '開放' },
          ],
          firedOnce: true,
        },
      ],
    },
    {
      id: 'altar',
      name: '祭壇',
      parentId: 'basement',
      description: '不気味な祭壇。黒い染みがついている。奇妙な文字が刻まれている。',
      labels: ['アイテム', '危険'],
      categories: [
        { id: 'altar-state', name: '状態', exclusive: true, options: ['休眠', '活性化'] },
      ],
      actions: [
        {
          id: 'activate-altar',
          name: '祭壇に触れる',
          entityId: 'altar',
          description: '$actorが祭壇に手を触れた。文字が赤く光り始め、正気度を失う。',
          isPlayerAction: true,
          effects: [
            { type: 'setCategory', target: { type: 'self' }, categoryId: 'altar-state', value: '活性化' },
            { type: 'setCategory', target: { type: 'named', entityId: 'mansion' }, categoryId: 'mansion-state', value: '危険' },
          ],
        },
      ],
      triggers: [],
    },
    {
      id: 'garden',
      name: '庭',
      parentId: 'mansion',
      description: '荒れ果てた庭。月明かりに照らされている。花壇の下に何かが埋まっている形跡。',
      labels: ['場所'],
      categories: [
        { id: 'garden-explored', name: '探索', exclusive: true, options: ['未探索', '探索済'] },
      ],
      actions: [],
      triggers: [],
    },
    // === PC ===
    {
      id: 'pc-a',
      name: '探索者A',
      parentId: null,
      description: 'プレイヤーキャラクター。',
      labels: ['PC'],
      categories: [
        { id: 'pc-a-sanity', name: 'SAN状態', exclusive: true, options: ['正常', '不安', '狂気'] },
      ],
      actions: [],
      triggers: [
        {
          id: 'trigger-pc-a-insanity',
          name: '館が危険になるとSAN低下',
          entityId: 'pc-a',
          condition: {
            clauses: [
              { reference: { type: 'named', entityId: 'mansion' }, categoryId: 'mansion-state', value: '危険' },
            ],
          },
          effects: [
            { type: 'setCategory', target: { type: 'self' }, categoryId: 'pc-a-sanity', value: '不安' },
          ],
          firedOnce: true,
        },
      ],
    },
    // === NPC ===
    {
      id: 'yamada',
      name: '山田',
      parentId: null,
      description: '館の管理人。60代の男性。何かを隠している様子。',
      labels: ['NPC', '味方'],
      categories: [
        { id: 'yamada-attitude', name: '態度', exclusive: true, options: ['友好', '警戒', '敵対'] },
        { id: 'yamada-knowledge', name: '知識', exclusive: false, options: ['地下室の存在', '儀式の内容', '鈴木の正体'] },
      ],
      actions: [
        {
          id: 'pressure-yamada',
          name: '山田を問い詰める',
          entityId: 'yamada',
          description: '$actorが山田を問い詰めた。山田は渋々口を開いた。',
          isPlayerAction: true,
          displayCondition: {
            clauses: [
              { reference: { type: 'named', entityId: 'diary' }, categoryId: 'diary-read', value: '既読' },
            ],
          },
          effects: [
            { type: 'setCategory', target: { type: 'self' }, categoryId: 'yamada-attitude', value: '警戒' },
          ],
        },
      ],
      triggers: [
        {
          id: 'trigger-yamada-hostile',
          name: '祭壇活性化で山田が敵対',
          entityId: 'yamada',
          condition: {
            clauses: [
              { reference: { type: 'named', entityId: 'altar' }, categoryId: 'altar-state', value: '活性化' },
            ],
          },
          effects: [
            { type: 'setCategory', target: { type: 'self' }, categoryId: 'yamada-attitude', value: '敵対' },
          ],
          firedOnce: true,
        },
      ],
    },
    {
      id: 'suzuki',
      name: '鈴木',
      parentId: null,
      description: '館を訪れた研究者。30代の女性。知的で冷静。',
      labels: ['NPC', '不明'],
      categories: [
        { id: 'suzuki-attitude', name: '態度', exclusive: true, options: ['友好', '中立', '正体露見'] },
        { id: 'suzuki-revealed', name: '正体', exclusive: true, options: ['隠匿', '露見'] },
      ],
      actions: [],
      triggers: [
        {
          id: 'trigger-suzuki-reveal',
          name: '館が危険になると鈴木の正体露見',
          entityId: 'suzuki',
          condition: {
            clauses: [
              { reference: { type: 'named', entityId: 'mansion' }, categoryId: 'mansion-state', value: '危険' },
            ],
          },
          effects: [
            { type: 'setCategory', target: { type: 'self' }, categoryId: 'suzuki-revealed', value: '露見' },
            { type: 'setCategory', target: { type: 'self' }, categoryId: 'suzuki-attitude', value: '正体露見' },
          ],
          firedOnce: true,
        },
      ],
    },
  ],
}
