import type { Scenario } from './types'

/**
 * サンプルシナリオ: 館の殺人事件
 *
 * v5 の主要操作を一通り試すための小型サンプル。
 * 場面描写、PC知識、$actor 効果、進入条件、パーティ初期化を含む。
 */
export const sampleScenario: Scenario = {
  id: 'sample-mansion',
  title: '館の殺人事件',
  author: 'サンプル',
  description: '古い洋館で起きた連続殺人事件を調査するシナリオ',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  entities: [
    {
      id: 'mansion',
      name: '館',
      parentId: null,
      description: '古びた洋館。不気味な雰囲気が漂う。',
      labels: ['場所'], connections: [],
      categories: [
        {
          id: 'mansion-state',
          name: '状態',
          exclusive: true,
          options: ['平穏', '不穏', '危険'],
          descriptions: {
            不穏: '館全体に、誰かに見られているような気配がある。',
            危険: '館の空気は張り詰め、逃げ道を塞ぐような圧を帯びている。',
          },
        },
      ],
      actions: [],
      triggers: [],
    },
    {
      id: 'entrance',
      name: '玄関ホール',
      parentId: 'mansion',
      description: '広々とした玄関ホール。大きな階段があり、古い肖像画が並ぶ。',
      labels: ['場所'], connections: ['study', 'basement', 'garden'],
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
      description: '本棚に囲まれた書斎。机の上に、厚い埃だけが積もっている。',
      labels: ['場所'], connections: ['entrance'],
      categories: [
        { id: 'study-explored', name: '探索', exclusive: true, options: ['未探索', '探索済'] },
        {
          id: 'study-mood',
          name: '雰囲気',
          exclusive: true,
          options: ['静寂', '違和感'],
          descriptions: {
            静寂: '書斎はしんと静まり返っている。',
            違和感: '本棚の一角だけ、埃の積もり方が不自然に薄い。',
          },
        },
      ],
      actions: [
        {
          id: 'search-study',
          name: '書斎を調べる',
          entityId: 'study',
          description: '$actorが本棚を調べると、奥から古い日記が見つかった。',
          isPlayerAction: true,
          rollRequirement: { skill: '目星', difficulty: 50 },
          effects: [
            { type: 'setCategory', target: { type: 'self' }, categoryId: 'study-explored', value: '探索済' },
            { type: 'setCategory', target: { type: 'self' }, categoryId: 'study-mood', value: '違和感' },
            { type: 'setCategory', target: { type: 'named', entityId: 'diary' }, categoryId: 'diary-state', value: '発見済' },
          ],
        },
      ],
      triggers: [],
    },
    {
      id: 'diary',
      name: '日記',
      parentId: 'study',
      description: '館の主人の日記。不穏な記述がある。',
      labels: ['アイテム', '手がかり'], connections: [],
      categories: [
        {
          id: 'diary-state',
          name: '状態',
          exclusive: true,
          options: ['未発見', '発見済'],
          descriptions: {
            発見済: '古い革張りの日記が本棚の奥から覗いている。',
          },
        },
        { id: 'diary-read', name: '読了', exclusive: true, options: ['未読', '既読'] },
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
              { reference: { type: 'self' }, categoryId: 'diary-state', value: '発見済' },
            ],
          },
          effects: [
            { type: 'setCategory', target: { type: 'self' }, categoryId: 'diary-read', value: '既読' },
            { type: 'setCategory', target: { type: 'named', entityId: '$actor' }, categoryId: 'pc-knowledge', value: '日記の内容' },
            { type: 'move', target: { type: 'self' }, newParentId: '$actor' },
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
      labels: ['物体', 'ドア'], connections: [],
      categories: [
        {
          id: 'study-door-state',
          name: '施錠',
          exclusive: true,
          options: ['施錠', '解錠', '破壊'],
          descriptions: {
            施錠: '書斎の奥には、地下へ続く扉が固く閉ざされている。',
            解錠: '地下へ続く扉の鍵は外れている。',
            破壊: '地下へ続く扉は無理やり破られている。',
          },
        },
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
              { type: 'setCategory', target: { type: 'named', entityId: 'basement' }, categoryId: 'basement-state', value: '開放' },
              { type: 'setCategory', target: { type: 'named', entityId: 'yamada' }, categoryId: 'yamada-attitude', value: '警戒' },
            ],
            failureEffects: [
              { type: 'setCategory', target: { type: 'named', entityId: 'yamada' }, categoryId: 'yamada-attitude', value: '警戒' },
            ],
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
      labels: ['場所', '危険'], connections: ['entrance'],
      entryCondition: {
        clauses: [
          { reference: { type: 'self' }, categoryId: 'basement-state', value: '開放' },
        ],
      },
      categories: [
        {
          id: 'basement-state',
          name: '状態',
          exclusive: true,
          options: ['封鎖', '開放', '儀式中'],
          descriptions: {
            封鎖: '地下室へ続く通路は閉ざされている。',
            開放: '地下室へ続く扉が開き、冷たい空気が流れ込んでいる。',
            儀式中: '地下室の奥から低い詠唱のような音が響いている。',
          },
        },
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
      labels: ['アイテム', '危険'], connections: [],
      categories: [
        {
          id: 'altar-state',
          name: '状態',
          exclusive: true,
          options: ['休眠', '活性化'],
          descriptions: {
            休眠: '祭壇の文字は黒ずみ、長いあいだ沈黙していたように見える。',
            活性化: '祭壇の文字が赤く脈打ち、周囲の影が濃くなっている。',
          },
        },
      ],
      actions: [
        {
          id: 'activate-altar',
          name: '祭壇に触れる',
          entityId: 'altar',
          description: '$actorが祭壇に手を触れた。文字が赤く光り始め、正気度を失う。',
          isPlayerAction: true,
          requiredKnowledge: ['日記の内容'],
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
      labels: ['場所'], connections: ['entrance'],
      categories: [
        { id: 'garden-explored', name: '探索', exclusive: true, options: ['未探索', '探索済'] },
      ],
      actions: [],
      triggers: [],
    },
    {
      id: 'pc-a',
      name: '探索者A',
      parentId: 'entrance',
      description: 'プレイヤーキャラクター。慎重な調査役。',
      labels: ['PC'], connections: [],
      categories: [
        { id: 'pc-knowledge', name: '知識', exclusive: false, options: ['日記の内容', '地下室の噂'] },
        { id: 'pc-status', name: '状態異常', exclusive: false, options: ['不安', '負傷'] },
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
    {
      id: 'pc-b',
      name: '探索者B',
      parentId: 'entrance',
      description: 'プレイヤーキャラクター。身軽な交渉役。',
      labels: ['PC'], connections: [],
      categories: [
        { id: 'pc-knowledge', name: '知識', exclusive: false, options: ['日記の内容', '地下室の噂'] },
        { id: 'pc-status', name: '状態異常', exclusive: false, options: ['不安', '負傷'] },
        { id: 'pc-b-sanity', name: 'SAN状態', exclusive: true, options: ['正常', '不安', '狂気'] },
      ],
      actions: [],
      triggers: [],
    },
    {
      id: 'yamada',
      name: '山田',
      parentId: 'entrance',
      description: '館の管理人。60代の男性。何かを隠している様子。',
      labels: ['NPC', '味方'], connections: [],
      categories: [
        {
          id: 'yamada-attitude',
          name: '態度',
          exclusive: true,
          options: ['友好', '警戒', '敵対'],
          descriptions: {
            友好: '山田は不安げながらも、探索者に協力しようとしている。',
            警戒: '山田は言葉を選び、こちらの反応を窺っている。',
            敵対: '山田は明確な敵意を隠さず、探索者の前に立ちはだかる。',
          },
        },
        { id: 'yamada-knowledge', name: '知識', exclusive: false, options: ['地下室の存在', '儀式の内容', '鈴木の正体'] },
      ],
      actions: [
        {
          id: 'pressure-yamada',
          name: '山田を問い詰める',
          entityId: 'yamada',
          description: '$actorが山田を問い詰めた。山田は渋々口を開き、地下室の鍵の話を漏らした。',
          isPlayerAction: true,
          requiredKnowledge: ['日記の内容'],
          displayCondition: {
            clauses: [
              { reference: { type: 'named', entityId: 'diary' }, categoryId: 'diary-read', value: '既読' },
            ],
          },
          effects: [
            { type: 'setCategory', target: { type: 'self' }, categoryId: 'yamada-attitude', value: '警戒' },
            { type: 'setCategory', target: { type: 'named', entityId: '$actor' }, categoryId: 'pc-knowledge', value: '地下室の噂' },
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
      parentId: 'garden',
      description: '館を訪れた研究者。30代の女性。知的で冷静。',
      labels: ['NPC', '不明'], connections: [],
      categories: [
        {
          id: 'suzuki-attitude',
          name: '態度',
          exclusive: true,
          options: ['友好', '中立', '正体露見'],
          descriptions: {
            中立: '鈴木は落ち着いた態度で、探索者の様子を観察している。',
            正体露見: '鈴木の表情から人間らしい温度が消えている。',
          },
        },
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
