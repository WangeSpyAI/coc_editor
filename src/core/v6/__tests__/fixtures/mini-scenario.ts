import type { FactId, ScenarioSession } from '../../types'
import {
  createClue,
  createEmptySession,
  createEvent,
  createFact,
  createItem,
  createNpc,
  createRevelation,
  createScene,
  v6Text,
} from '../../engine'

export interface MiniScenarioIds {
  keyLocationHintFactId: FactId
  diaryFactId: FactId
  mudFactId: FactId
  studySearchedFactId: FactId
}

export interface MiniScenarioFixture {
  session: ScenarioSession
  ids: MiniScenarioIds
}

export function buildMiniScenario(): MiniScenarioFixture {
  let session = createEmptySession({
    id: 'scenario-fog-bell-manor',
    title: '霧鐘荘の消えた鍵',
    author: 'TRPG Scenario Editor tests',
    createdAt: '2026-06-14T00:00:00.000Z',
    updatedAt: '2026-06-14T00:00:00.000Z',
  })

  session = createScene(session, {
    id: 'sc-foyer',
    name: '玄関ホール',
    kind: 'location',
    publicDescription: v6Text.public('霧に濡れた玄関ホールには、古い呼び鈴の音だけが残っている。'),
    descriptionVariants: [{
      id: 'after-study-search',
      when: [],
      text: v6Text.public('ホールの時計は止まり、書斎へ向かう足跡だけが新しい。'),
    }],
    keeperNotes: [v6Text.keeper('鈴木は鍵の所在を隠しているが、問い詰められると動揺する。')],
    exits: [
      { toSceneId: 'sc-study', label: '書斎へ' },
      { toSceneId: 'sc-garden', label: '裏庭へ' },
    ],
  }).session
  session = createScene(session, {
    id: 'sc-study',
    name: '書斎',
    kind: 'location',
    publicDescription: v6Text.public('壁一面の本棚と重い机がある。引き出しの奥に、紙の擦れる音がする。'),
    keeperNotes: [v6Text.keeper('日記を見つけたら、地下通路の存在を真相へ接続する。')],
    exits: [
      { toSceneId: 'sc-foyer', label: '玄関へ戻る' },
      { toSceneId: 'sc-garden', label: '裏庭の温室へ' },
    ],
  }).session
  session = createScene(session, {
    id: 'sc-garden',
    name: '裏庭',
    kind: 'location',
    publicDescription: v6Text.public('湿った庭土に、温室へ続く細い足跡が残っている。'),
    keeperNotes: [v6Text.keeper('青木は鈴木の嘘を疑っているが、証拠は足跡だけである。')],
    exits: [{ toSceneId: 'sc-foyer', label: '屋敷へ戻る' }],
  }).session

  session = createRevelation(session, {
    id: 'rev-hidden-room',
    title: '屋敷には地下通路が隠されている',
    summary: v6Text.keeper('日記と鍵の情報が揃うと、書斎の隠し戸を開ける理由が立つ。'),
    order: 'core',
    clueIds: ['cl-diary-page'],
  }).session
  session = createRevelation(session, {
    id: 'rev-suzuki-lie',
    title: '鈴木は鍵の所在を知っている',
    summary: v6Text.keeper('鍵、足跡、鈴木の知識が結びつくと、管理人の隠し事が見える。'),
    order: 'intro',
    clueIds: ['cl-mud-print'],
    requiredFactIds: [],
  }).session

  const readyFact = createFact(session, {
    statement: '探索者は霧鐘荘の調査を依頼された',
    initial: true,
    links: [{ type: 'scene', id: 'sc-foyer' }],
  })
  session = readyFact.session
  const keyLocationHint = createFact(session, {
    statement: '鈴木は鉄の鍵が温室の鉢に隠されていると知っている',
    initial: true,
    links: [{ type: 'npc', id: 'npc-suzuki' }, { type: 'item', id: 'obj-iron-key' }],
  })
  session = keyLocationHint.session
  const studySearched = createFact(session, {
    statement: '探索者は書斎の机を詳しく調べた',
    initial: false,
    links: [{ type: 'scene', id: 'sc-study' }],
  })
  session = studySearched.session

  session = createNpc(session, {
    id: 'npc-suzuki',
    name: '鈴木',
    publicProfile: v6Text.public('霧鐘荘を管理する人物。穏やかだが、鍵の話題で目を逸らす。'),
    keeperSecret: v6Text.keeper('鍵を隠したのは鈴木で、温室の鉢に戻す機会をうかがっている。'),
    staticProfile: {
      personality: '丁寧だが保身が強い',
      motivation: '事件を表沙汰にせず、鍵の紛失も隠す',
      voice: '小声で言い訳が多い',
    },
    initialDynamicSlots: {
      location: { type: 'scene', id: 'sc-foyer' },
      intent: '鍵の所在を隠したまま探索者を帰す',
      fear: '鍵を持っていたことが露見する',
      emotion: '緊張',
      knowledgeFactIds: [keyLocationHint.factId],
    },
  }).session
  session = createNpc(session, {
    id: 'npc-aoki',
    name: '青木',
    publicProfile: v6Text.public('屋敷の噂を追っている地元記者。裏庭の足跡に興味を持っている。'),
    keeperSecret: v6Text.keeper('青木は鈴木を疑っているが、まだ決定的な証拠を持たない。'),
    staticProfile: {
      personality: '好奇心旺盛',
      motivation: '隠し通路の記事を取る',
      voice: '早口で質問が多い',
    },
    initialDynamicSlots: {
      location: { type: 'scene', id: 'sc-garden' },
      intent: '裏庭の足跡を調べる',
      fear: '証拠を鈴木に消される',
    },
  }).session

  session = createItem(session, {
    id: 'obj-iron-key',
    name: '鉄の鍵',
    publicDescription: v6Text.public('黒ずんだ鉄の鍵。柄に鐘の刻印がある。'),
    keeperNotes: [v6Text.keeper('書斎の隠し戸を開ける。初期状態では鈴木が所持している。')],
    truthLinks: ['rev-hidden-room', 'rev-suzuki-lie'],
    initialLocation: { type: 'npc', id: 'npc-suzuki' },
    initialDisclosure: 'public',
  }).session
  session = createItem(session, {
    id: 'obj-diary',
    name: '古い日記',
    publicDescription: v6Text.public('革表紙の日記。湿気で膨らみ、いくつかの頁が剥がれている。'),
    keeperNotes: [v6Text.keeper('地下通路を示す頁が残っている。')],
    truthLinks: ['rev-hidden-room'],
    initialLocation: { type: 'scene', id: 'sc-study' },
    initialDisclosure: 'discoverable',
  }).session

  const diary = createClue(session, {
    id: 'cl-diary-page',
    name: '日記の破れた頁',
    factStatement: '日記の頁には書斎から地下通路へ降りる手順が書かれている',
    route: {
      from: [{ type: 'scene', id: 'sc-study' }, { type: 'item', id: 'obj-diary' }],
      how: v6Text.keeper('書斎の机か日記を調べる。'),
      fallback: v6Text.keeper('見落とした場合は裏庭の温室に濡れた頁として再配置できる。'),
    },
    truthLinks: ['rev-hidden-room'],
    initialLocation: { type: 'scene', id: 'sc-study' },
    initialDisclosure: 'undiscovered',
  })
  session = diary.session
  const mud = createClue(session, {
    id: 'cl-mud-print',
    name: '温室へ続く泥の足跡',
    factStatement: '泥の足跡は裏庭から書斎の窓へ続いている',
    route: {
      from: [{ type: 'scene', id: 'sc-garden' }],
      how: v6Text.keeper('裏庭で足跡を追う。'),
    },
    truthLinks: ['rev-suzuki-lie'],
    initialLocation: { type: 'scene', id: 'sc-garden' },
    initialDisclosure: 'discoverable',
  })
  session = mud.session

  session = createEvent(session, {
    id: 'ev-study-search',
    name: '書斎の机を調べる',
    sceneIds: ['sc-study'],
    condition: [{ factId: readyFact.factId }],
    publicDescription: v6Text.public('机の奥で、古い紙片が音を立てる。'),
    keeperNotes: [v6Text.keeper('日記の頁を渡し、地下通路の真相へ進める。')],
    result: {
      publicText: v6Text.public('机の奥で紙束がほどけ、湿った古い日記の破れた頁が一枚、探索者たちの前に滑り出ます。'),
      setFacts: [studySearched.factId, diary.factId],
      setSlots: [{
        slotId: 'slot-cl-diary-page-disclosure',
        value: 'discovered',
      }],
    },
    occurrence: { mode: 'once' },
  }).session
  session = createEvent(session, {
    id: 'ev-garden-tracks',
    name: '裏庭の足跡を追う',
    sceneIds: ['sc-garden'],
    condition: [{ factId: readyFact.factId }],
    publicDescription: v6Text.public('足跡は温室と書斎の窓を往復している。'),
    keeperNotes: [v6Text.keeper('鈴木が鍵を隠した疑いを強める。')],
    result: {
      publicText: v6Text.public('ぬかるんだ足跡は温室から書斎の窓辺へ続き、同じ靴底の跡が往復していると分かります。'),
      setFacts: [mud.factId],
      setSlots: [{
        slotId: 'slot-cl-mud-print-disclosure',
        value: 'discovered',
      }],
    },
    occurrence: { mode: 'once' },
  }).session

  return {
    session,
    ids: {
      keyLocationHintFactId: keyLocationHint.factId,
      diaryFactId: diary.factId,
      mudFactId: mud.factId,
      studySearchedFactId: studySearched.factId,
    },
  }
}
