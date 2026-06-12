# v6 データモデル・アーキテクチャ設計 (2026-06-14)

## 0. 前提

本書は `docs/spec/2026-06-13-v6-requirements.md` v6.2 と、3ケースの検証結果を前提にしたデータモデル設計である。v5実装は製品判断として失敗しているため、概念は引き継がない。再利用するのは、v6.2の要件に合う構造的安全性・純粋関数・永続化の継ぎ目だけである。

設計の基準は次の一点に置く。

> KPが決める項目だけを入力させ、所在・開示状態・イベント発生状態などの定型はツールが生成する。

UIは本フェーズの対象外。まず、JSONデータと純粋関数のクエリだけで「悪霊の家」モデルを無理なく表現し、現在値投影・条件通知・undo履歴・検索が検証できる形を作る。

---

## 1. データモデル

### 1.1 設計単位

v6は「実体」と「ビュー」を分離する。Scene は保存場所ではなく、NPC・モノ・手がかり・事実・真相・イベントの投影面である。

実体は次の2層に分ける。

| 層 | 内容 | セッション中に変わるか |
|---|---|---|
| `ScenarioData` | シーン、NPC、Item/Clue、Fact定義、Revelation、ConditionalEvent、PC定義 | 執筆として変わる |
| `SessionState` | 事実成立値、排他スロット現在値、イベント発生状態、真相理解済み、パーティ/PC差分、ログ、履歴 | 運用として変わる |

ただし v6.2 では執筆と運用をモード分割しない。実装上は `ScenarioData` と `SessionState` を分けるが、操作は同じ mutation 経路を通し、undo対象も同じ `ScenarioSession` とする。

### 1.2 共通型

```typescript
export type ID<T extends string> = `${T}-${string}`

export type EntityId =
  | SceneId
  | NpcId
  | ItemId
  | ClueId
  | FactId
  | RevelationId
  | EventId
  | PcId
  | PartyId

export type SceneId = ID<'sc'>
export type NpcId = ID<'npc'>
export type ItemId = ID<'obj'>
export type ClueId = ID<'cl'>
export type FactId = ID<'f'>
export type RevelationId = ID<'rev'>
export type EventId = ID<'ev'>
export type PcId = ID<'pc'>
export type PartyId = ID<'party'>
export type SlotId = ID<'slot'>
export type LogEntryId = ID<'log'>
export type ChangeId = ID<'chg'>

export interface PublicText {
  visibility: 'public'
  text: string
}

export interface KeeperText {
  visibility: 'keeper'
  text: string
}

export type TextBlock = PublicText | KeeperText

export interface LinkedRef {
  type: 'scene' | 'npc' | 'item' | 'clue' | 'fact' | 'revelation' | 'event' | 'pc' | 'party'
  id: EntityId
}

export interface ConditionLink {
  factId: FactId
  negate?: boolean
}
```

`PublicText` と `KeeperText` は同じ `string` を持つだけだが、型が分かれていることが重要である。読み上げ・コピー・PL出力系の関数は `PublicText` だけを受け取る。KP秘密を混ぜた `TextBlock[]` をそのまま渡せない形にする。

### 1.3 Scene

Scene は運用の基本ビューであり、状態を所有しない。

```typescript
export type SceneKind =
  | 'location'
  | 'situation'
  | 'dream'
  | 'investigation'
  | 'conversation'
  | 'resolution'
  | 'lightweight'

export interface Scene {
  id: SceneId
  name: string
  kind: SceneKind
  publicDescription: PublicText
  descriptionVariants?: SceneDescriptionVariant[]
  keeperNotes: KeeperText[]
  exits: SceneExit[]
  projectionLinks: ProjectionLink[]
  childScenes?: LightweightSceneEntry[]
}

export interface SceneDescriptionVariant {
  id: string
  when: ConditionLink[]
  text: PublicText
}

export interface SceneExit {
  toSceneId: SceneId
  label?: string
  keeperNote?: KeeperText
  condition?: ConditionLink[]
}

export type ProjectionLink =
  | { type: 'npc'; id: NpcId }
  | { type: 'item'; id: ItemId }
  | { type: 'clue'; id: ClueId }
  | { type: 'event'; id: EventId }
  | { type: 'fact'; id: FactId }
  | { type: 'revelation'; id: RevelationId }

export interface LightweightSceneEntry {
  id: SceneId
  name: string
  publicDescription?: PublicText
  keeperNote?: KeeperText
  projectionLinks?: ProjectionLink[]
}
```

`projectionLinks` は「このシーンページに必ず出したいもの」の明示リンクである。これに加えて、所在スロットの現在値がこの Scene を指す NPC/Item/Clue は自動投影する。つまり `sc-kitchen` は `obj-kitchen-knife` を手でリンクしてもよいが、刃物の所在が `sc-kitchen` ならリンクなしでも「今ここにあるもの」に出る。

`kind: 'lightweight'` と `childScenes` は、検証ケース1の「空き部屋にフルのシーンページは過剰」を吸収するための軽量表現である。重要化した時点で通常 Scene に昇格できる。

### 1.4 NPC

NPC は独立実体。静的属性と読み上げ文/KP秘密だけを所有する。意図・恐れ・感情・知識・現在地は Fact/Slot 側で管理し、カードには投影する。

```typescript
export interface Npc {
  id: NpcId
  name: string
  publicProfile: PublicText
  keeperSecret?: KeeperText
  staticProfile: NpcStaticProfile
  initialDynamicSlots?: NpcInitialSlots
  projectionLinks?: ProjectionLink[]
}

export interface NpcStaticProfile {
  personality?: string
  motivation?: string
  voice?: string
  appearance?: string
  stats?: Record<string, number | string>
  tags?: string[]
}

export interface NpcInitialSlots {
  location?: SlotValueTarget
  intent?: string
  fear?: string
  emotion?: string
  knowledgeFactIds?: FactId[]
}
```

`initialDynamicSlots` は authoring補助であり、保存時には slot/fact へ展開される。人間に「npc-knott-location の成立事実」を書かせない。

例:

```typescript
createNpc({
  id: 'npc-knott',
  name: '家主',
  publicProfile: { visibility: 'public', text: '礼儀正しい不動産持ち...' },
  keeperSecret: { visibility: 'keeper', text: '怪異の核心は知らない...' },
  staticProfile: { personality: '実務的', voice: '一人称「私」' },
  initialDynamicSlots: {
    location: { type: 'scene', id: 'sc-briefing' },
    intent: '依頼を成立させ、鍵を渡す',
    fear: '事故・警察沙汰・物件価値の下落',
  },
})
```

この入力から、実装は location/intent/fear/emotion/knowledge の slot/fact を生成する。

### 1.5 Item / Clue

Item と Clue はほぼ同じ構造を持つ。Clue は Revelation との関係が強いので型上分けるが、所在スロット・開示スロット・真相リンクの機構は共有する。

```typescript
export interface Item {
  id: ItemId
  name: string
  publicDescription?: PublicText
  keeperNotes?: KeeperText[]
  truthLinks?: RevelationId[]
  initialLocation?: SlotValueTarget
  initialDisclosure?: DisclosureValue
  tags?: string[]
}

export interface Clue {
  id: ClueId
  name: string
  publicDescription?: PublicText
  keeperNotes?: KeeperText[]
  factId: FactId
  route: ClueRoute
  truthLinks: RevelationId[]
  initialLocation?: SlotValueTarget
  initialDisclosure?: DisclosureValue
  tags?: string[]
}

export interface ClueRoute {
  from: LinkedRef[]
  how: KeeperText
  fallback?: KeeperText
}

export type DisclosureValue =
  | 'hidden'
  | 'undiscovered'
  | 'discoverable'
  | 'discovered'
  | 'explained'
  | 'public'

export type SlotValueTarget =
  | { type: 'scene'; id: SceneId }
  | { type: 'npc'; id: NpcId }
  | { type: 'pc'; id: PcId }
  | { type: 'party'; id: PartyId }
  | { type: 'abstract'; label: string }
```

`initialLocation` と `initialDisclosure` は Fact文ではない。Item/Clue 作成時の入力欄であり、実装が次の slot を自動生成する。

- `slot-obj-house-key-location`
- `slot-obj-house-key-disclosure`
- `slot-cl-basement-irregularity-location`
- `slot-cl-basement-irregularity-disclosure`

### 1.6 Fact

Fact は「短い自由文 + 成立bool + 任意リンク」である。機械は `statement` を解釈しない。条件評価は Fact ID と `isTrue` だけを見る。

```typescript
export interface Fact {
  id: FactId
  statement: string
  initial: boolean
  links?: LinkedRef[]
  slot?: SlotMembership
  source?: FactSource
  historyPolicy?: 'normal' | 'generated'
}

export interface SlotMembership {
  slotId: SlotId
  valueKey: string
}

export type FactSource =
  | { type: 'author' }
  | { type: 'generated-location'; ownerType: 'npc' | 'item' | 'clue'; ownerId: EntityId }
  | { type: 'generated-disclosure'; ownerType: 'item' | 'clue'; ownerId: EntityId }
  | { type: 'generated-npc-dynamic'; npcId: NpcId; field: 'intent' | 'fear' | 'emotion' | 'knowledge' }
  | { type: 'session-log'; logEntryId: LogEntryId }
```

Fact には `slot` を持たせる。Slot に所属する Fact は同時に1つだけ成立する。同じ Slot の新しい値を成立させる操作は、古い値を自動で取消する。

`historyPolicy: 'generated'` は「人間が書いた固有事実ではない」ことを示す。検索・投影では出すが、authoringコスト計測では数えない。

### 1.7 排他スロット

排他スロットは、所在・開示・NPCの現在感情など「今の値が1つ」の状態軸である。v5の Category に似ているが、v6では Entityのローカル状態ではなく Fact台帳の一部として扱う。

```typescript
export interface ExclusiveSlot {
  id: SlotId
  owner: LinkedRef
  kind:
    | 'location'
    | 'disclosure'
    | 'npc-intent'
    | 'npc-fear'
    | 'npc-emotion'
    | 'npc-knowledge-mode'
    | 'custom'
  values: SlotValue[]
  currentFactId?: FactId
  generated: boolean
}

export interface SlotValue {
  key: string
  label: string
  factId: FactId
  target?: SlotValueTarget
}
```

#### 自動生成ルール

実装は次の作成・配置操作で slot/fact を生成する。

| 操作 | 自動生成 |
|---|---|
| NPC作成 + 初期現在地 | `slot-<npcId>-location` と「<NPC> の現在地は <Scene>」Fact |
| Item/Clue作成 + 初期所在 | `slot-<id>-location` と「<Item> は <Scene/NPC/PC/Party> にある」Fact |
| Item/Clue作成 + 初期開示 | `slot-<id>-disclosure` と開示値Fact |
| NPCの意図/恐れ/感情入力 | 対応slotと値Fact |
| 新しい場所へ移動 | 同slotに新Factを追加し成立、旧Factを取消 |
| 新しい開示値へ変更 | 同slotに新Factを追加し成立、旧Factを取消 |

人間が宣言文を書くのは固有事実だけである。例えば「PCが地下室の存在を知った」は手書き Fact、「日記は書斎にある」は配置操作から生成される Fact である。

### 1.8 Fact状態・現在値投影

定義と状態を分ける。

```typescript
export interface FactState {
  factId: FactId
  isTrue: boolean
  changedAtChangeId?: ChangeId
}

export interface SlotState {
  slotId: SlotId
  currentFactId: FactId | null
}

export interface ProjectionIndex {
  locationByOwner: Record<EntityId, SlotValueTarget | null>
  disclosureByOwner: Record<EntityId, DisclosureValue | null>
  factsByLinkedEntity: Record<EntityId, FactId[]>
  entitiesByScene: Record<SceneId, { npcs: NpcId[]; items: ItemId[]; clues: ClueId[] }>
  eventsByScene: Record<SceneId, EventId[]>
  revelationsByMissingFact: Record<FactId, RevelationId[]>
}
```

現在値投影は query 層の責務であり、Scene や Item 自体にはコピーしない。

必須クエリ:

```typescript
export function projectScene(session: ScenarioSession, sceneId: SceneId): SceneProjection
export function projectNpcCard(session: ScenarioSession, npcId: NpcId): NpcProjection
export function projectItemRow(session: ScenarioSession, id: ItemId | ClueId): ItemProjection
export function findCurrentLocation(session: ScenarioSession, id: EntityId): SlotValueTarget | null
export function findCurrentDisclosure(session: ScenarioSession, id: ItemId | ClueId): DisclosureValue | null
export function searchScenario(session: ScenarioSession, query: string): SearchResult[]
```

`projectItemRow` は「日記はどこ?」に1ホップで答える。内部で slot をたどってよいが、呼び出し側が「モノ表 → 所在スロット → Fact」の2ホップを意識しない形にする。

### 1.9 Revelation

Revelation は物語の収束管理層である。発見済みと理解済みを分ける。

```typescript
export type RevelationOrder = 'intro' | 'core' | 'resolution' | 'optional'

export interface Revelation {
  id: RevelationId
  title: string
  summary: KeeperText
  order: RevelationOrder
  clueIds: ClueId[]
  requiredFactIds?: FactId[]
  understoodInitially?: boolean
  understandingGuide?: KeeperText
  looseBefore?: RevelationId[]
}

export interface RevelationState {
  revelationId: RevelationId
  understood: boolean
  understoodAtChangeId?: ChangeId
}

export interface RevelationProjection {
  revelation: Revelation
  understood: boolean
  discoveredClues: ClueId[]
  undiscoveredClues: ClueId[]
  availableRoutes: ClueRoute[]
  missingFacts: FactId[]
}
```

`understood` はKPが判断して付ける。Clue の fact が成立しても自動理解にはしない。機械は「足りない手がかり」「渡せる導線」「未理解の真相」を出すだけである。

### 1.10 ConditionalEvent

ConditionalEvent は条件を満たしたときに「発生可能」と通知されるイベントである。自動発火はしない。KPが採用した時だけ結果を適用する。

```typescript
export type EventOccurrenceState = 'unfired' | 'fired' | 'suppressed'

export interface ConditionalEvent {
  id: EventId
  name: string
  sceneIds: SceneId[]
  condition: ConditionLink[]
  publicDescription?: PublicText
  keeperNotes?: KeeperText[]
  result: EventResult
  occurrence: EventOccurrenceConfig
  tags?: string[]
}

export interface EventOccurrenceConfig {
  mode: 'once' | 'repeatable'
  initialState?: EventOccurrenceState
}

export interface EventResult {
  publicText?: PublicText
  keeperText?: KeeperText
  setFacts?: FactId[]
  unsetFacts?: FactId[]
  setSlots?: SlotAssignment[]
}

export interface SlotAssignment {
  slotId: SlotId
  value: SlotValueTarget | DisclosureValue | string
  createFactIfMissing?: boolean
}

export interface EventState {
  eventId: EventId
  occurrence: EventOccurrenceState
  lastNotifiedAtChangeId?: ChangeId
  firedAtChangeId?: ChangeId
}

export interface FireableEvent {
  eventId: EventId
  sceneIds: SceneId[]
  reason: ConditionLink[]
}
```

条件は Fact ID の連言で、各リンクに `negate` を持てる。

```typescript
const evBedAttack: ConditionalEvent = {
  id: 'ev-bed-attack',
  name: '寝台の怪異',
  sceneIds: ['sc-spare-bedroom'],
  condition: [
    { factId: 'f11' },
    { factId: 'f13' },
    { factId: 'f22', negate: true },
  ],
  result: {
    publicText: { visibility: 'public', text: '寝台が不自然に動く。' },
    setFacts: ['f12'],
  },
  occurrence: { mode: 'once', initialState: 'unfired' },
}
```

発生状態は EventState が持つ。`ev-bed-attack は未発生` / `発生済み` という Fact ペアは作らない。これが検証ケース1で確認された最大の定型削減である。

通知クエリ:

```typescript
export function evaluateConditionLinks(
  facts: Readonly<Record<FactId, FactState>>,
  condition: readonly ConditionLink[],
): boolean

export function listFireableEvents(session: ScenarioSession): FireableEvent[]
```

`listFireableEvents` は `occurrence === 'unfired'` か `mode === 'repeatable'` のイベントだけを返す。返しただけでは状態を変えない。KPが `applyEvent(eventId)` を実行した時に、描写ログ・Fact変更・Slot変更・occurrence更新を同一changeとして記録する。

### 1.11 PC / Party

知識の既定は Party 単位。別行動や秘匿情報が必要なときだけ PC 単位へ分割し、合流時に Party 知識へ戻せる。

```typescript
export interface PC {
  id: PcId
  name: string
  playerName?: string
  publicProfile?: PublicText
  keeperNotes?: KeeperText[]
}

export interface Party {
  id: PartyId
  name: string
  memberIds: PcId[]
}

export interface PartyState {
  partyId: PartyId
  location?: SlotValueTarget
  knowledgeFactIds: FactId[]
}

export interface PcState {
  pcId: PcId
  partyId: PartyId | null
  locationOverride?: SlotValueTarget
  knowledgeFactIds: FactId[]
}

export interface KnowledgeAssignment {
  scope: 'party' | 'pc'
  targetId: PartyId | PcId
  factId: FactId
}
```

`PCたちは地下室の存在を知った` は Party の knowledge Fact として始める。別行動でAだけ知った場合は同じ Fact を PC A に付けるか、必要なら `f地下室知識-A` として分割する。合流操作は PC knowledge を Party knowledge へ昇格できる。

### 1.12 SessionLog と履歴

セッションログは描写と事実変化の時系列であり、undo履歴の背骨でもある。

```typescript
export type LogEntry =
  | DescriptionLogEntry
  | FactChangeLogEntry
  | EventLogEntry
  | NoteLogEntry

export interface BaseLogEntry {
  id: LogEntryId
  at: number
  changeId: ChangeId
  sceneId?: SceneId
  partyId?: PartyId
  pcId?: PcId
}

export interface DescriptionLogEntry extends BaseLogEntry {
  type: 'description'
  text: PublicText
  source?: LinkedRef
}

export interface FactChangeLogEntry extends BaseLogEntry {
  type: 'fact-change'
  factId: FactId
  from: boolean
  to: boolean
}

export interface EventLogEntry extends BaseLogEntry {
  type: 'event'
  eventId: EventId
  occurrence: EventOccurrenceState
  publicText?: PublicText
  keeperText?: KeeperText
}

export interface NoteLogEntry extends BaseLogEntry {
  type: 'note'
  text: KeeperText
  promotedTo?: LinkedRef
}

export interface ChangeRecord {
  id: ChangeId
  at: number
  label: string
  before: ScenarioSessionSnapshot
  after: ScenarioSessionSnapshot
}

export interface ScenarioSessionSnapshot {
  scenario: ScenarioData
  state: SessionState
}
```

最初はスナップショット方式でよい。依存追加なしで実装でき、undoの正しさを優先できる。差分圧縮は非ゴール。ログ項目から事実化する場合は、`source: { type: 'session-log', logEntryId }` の Fact を作る。

### 1.13 ScenarioSession 全体

```typescript
export interface ScenarioData {
  format: 'trpg-scenario-editor-v6'
  formatVersion: 1
  id: string
  title: string
  author?: string
  createdAt: string
  updatedAt: string
  scenes: Record<SceneId, Scene>
  npcs: Record<NpcId, Npc>
  items: Record<ItemId, Item>
  clues: Record<ClueId, Clue>
  facts: Record<FactId, Fact>
  slots: Record<SlotId, ExclusiveSlot>
  revelations: Record<RevelationId, Revelation>
  events: Record<EventId, ConditionalEvent>
  pcs: Record<PcId, PC>
  parties: Record<PartyId, Party>
}

export interface SessionState {
  factStates: Record<FactId, FactState>
  slotStates: Record<SlotId, SlotState>
  revelationStates: Record<RevelationId, RevelationState>
  eventStates: Record<EventId, EventState>
  pcStates: Record<PcId, PcState>
  partyStates: Record<PartyId, PartyState>
  log: LogEntry[]
}

export interface ScenarioSession {
  scenario: ScenarioData
  state: SessionState
  history: ChangeRecord[]
  redoHistory?: ChangeRecord[]
}
```

Record 形式を基本にする。v5の `entities: Entity[]` より参照解決・検索・投影が単純になり、IDリンク中心のv6と相性が良い。表示順が必要な場所は `order: EntityId[]` を個別に足す。

---

## 2. エンジン設計

### 2.1 純粋関数の境界

コアは React 非依存の純粋関数にする。

```typescript
export interface MutationAPI {
  readonly session: ReadonlyScenarioSession
  setFact(factId: FactId, value: boolean): void
  assignSlot(slotId: SlotId, value: SlotValueTarget | DisclosureValue | string): FactId
  applyEvent(eventId: EventId): void
  setEventOccurrence(eventId: EventId, state: EventOccurrenceState): void
  setRevelationUnderstood(revelationId: RevelationId, understood: boolean): void
  addLog(entry: Omit<LogEntry, 'id' | 'at' | 'changeId'>): void
  promoteLogToFact(logEntryId: LogEntryId, statement: string, links?: LinkedRef[]): FactId
}
```

`assignSlot` が排他性の唯一の入口である。同slot内の古い Fact 取消、新Fact生成、`SlotState.currentFactId` 更新、ログ記録はここで必ず起きる。Factを直接 true にする操作は固有Fact用で、slot所属Factには原則使わない。

### 2.2 条件評価と通知

v6の機械判断は次に限定する。

1. Fact IDリンクの真偽を評価する
2. 条件を満たしたイベントをKPに通知する
3. KPが選んだイベント結果を適用する

自動カスケードはしない。`applyEvent` によって成立した Fact が別イベントの条件を満たした場合は、次の `listFireableEvents` で通知されるだけである。

```typescript
export interface EvaluationReport {
  fireableEvents: FireableEvent[]
  changedRevelationProjections: RevelationId[]
}
```

v5の `stabilize` のような不動点計算は不要になる。必要なのは、mutation後に `EvaluationReport` を再計算して `lastReport` として持つ程度である。

### 2.3 検索

検索は最初は依存なしの素朴な全文検索で足りる。

対象:

- Scene名、PL向け描写、KPメモ
- NPC名、読み上げ文、KP秘密、人格/口調/技能
- Item/Clue名、描写、メモ
- Fact.statement
- Revelation.title/summary
- Event.name/description/keeperNotes
- 現在値投影文字列

検索結果は `LinkedRef` と一致理由を返す。

```typescript
export interface SearchResult {
  ref: LinkedRef
  title: string
  snippet: string
  matchKind: 'name' | 'public-text' | 'keeper-text' | 'fact' | 'current-value'
}
```

---

## 3. 既存エンジン再利用の判定

### 3.1 `src/core/types.ts`

判定: **捨てる。ただし設計思想の一部を再利用。**

理由:

- v5の中心は `Entity` ツリー、`Category`、`Action`、`Trigger`、`Effect` であり、v6の中心である Scene/NPC/Clue/Fact/Revelation/Event と一致しない。
- v5の `parentId` による所在表現は、v6の「所在もFact/Slotで投影する」要件と衝突する。PC/Partyの位置は参考になるが、モノ/NPC/手がかりの所在は slot が単一の真実源でなければならない。
- `ConditionClause.negate` は考え方として再利用できるが、参照対象は Category値ではなく Fact ID になる。
- `ReadonlyWorldState` の型分離、Effect unionから型を導出しswitchを網羅チェックする方針は良い資産。v6型で作り直す。

### 3.2 `src/core/engine.ts`

判定: **改造して再利用ではなく、薄い部品だけ移植。**

理由:

- `evaluateClause` / `evaluateCondition` は AND条件と `negate` の形が近い。ただし v6では `resolveReference`、Category、EntityState が不要で、`FactState` を見るだけになる。実装量は小さいため作り直した方が安全。
- `applyEffect` は Category/Move中心で、v6の `setFact` / `assignSlot` / `applyEvent` とは責務が違う。直接再利用しない。
- `stabilize` は v6では不要。v6.2は「機械は評価と通知のみ、判断はKP」と定義している。自動カスケードは「発生可能イベント一覧の再計算」に縮小する。上限付き不動点計算、firedOnce Set、トリガー自動ログは捨てる。
- `pushLog` の「timestamp/atを一箇所で付ける」発想は再利用する。v6では `changeId` も同じ場所で付与する。
- `getPendingTriggers` は「あと1条件」の支援として発想を再利用できる。v6では `listNearlyFireableEvents` として Fact条件の不足リンクを返す形にする。
- `reconcileWorldWithScenario` の「削除後の参照切れ掃除をチョークポイントに置く」発想は再利用する。ただし対象は entity tree ではなく Record群、slot/fact/revelation/event/log参照になる。

### 3.3 条件評価 + stabilize

判定: **条件評価だけ作り直して再利用。stabilize は捨てる。**

v6の条件は次の関数で十分である。

```typescript
export function evaluateConditionLinks(
  factStates: Readonly<Record<FactId, FactState>>,
  condition: readonly ConditionLink[],
): boolean {
  return condition.every((link) => {
    const value = factStates[link.factId]?.isTrue ?? false
    return link.negate ? !value : value
  })
}
```

`applyEvent` 後に別イベントが条件成立しても、自動で発生させない。KPに「発生可能」と通知するだけである。したがって、不動点に達するまで世界を変化させる `stabilize` はv6の非ゴールに反する。

### 3.4 `ReadonlyWorldState` / 3プリミティブ / `MutationAPI`

判定: **改造して再利用。構造的安全性として強い資産。**

v5で価値があったのはペトリネットではなく、状態変更の入口を狭めたことだった。

再利用する不変条件:

- UI/将来の表示層は readonly session だけを見る
- 変更は `commitMutation` / `lifecycleReset` / UI選択の3種に分ける
- undo push は `commitMutation` に集約する
- 生の mutable state をコンポーネントに渡さない
- slot更新、Fact更新、ログ追加を個別サイトで直書きさせない

v6向けには `mutateAndStabilize` ではなく `mutateAndEvaluate` に置き換える。

```typescript
mutateAndEvaluate((api) => {
  api.assignSlot('slot-obj-house-key-location', { type: 'party', id: 'party-default' })
  api.setFact('f3', true)
})
```

内部処理:

1. sessionをclone
2. MutationAPIだけを公開
3. mutation実行
4. 参照整合・slot整合を検査/補正
5. `EvaluationReport` を再計算
6. change record と log を付けて commit

### 3.5 `src/core/persistence.ts`

判定: **改造して再利用。serialize/revive の継ぎ目は維持。**

理由:

- localStorage、ファイル export/import、将来のテスト fixture が同じ `serializeSession` / `reviveSession` を通る構造はv6でも必要。
- v6は後方互換不要なので migration は最小でよい。`format: 'trpg-scenario-editor-v6'` と `formatVersion: 1` を見て、違う形式なら読み込み失敗にする。
- v5の `lastResult` を永続化しない判断はv6にも合う。発生可能イベント一覧や投影indexは派生値なので保存しない。

保存するもの:

- `ScenarioData`
- `SessionState`
- `history` はファイルexportでは保存する。localStorageでも保存してよいが、サイズが問題になったら上限を設ける。

保存しないもの:

- `ProjectionIndex`
- `EvaluationReport`
- 検索index
- UI選択状態

### 3.6 `src/hooks/useScenario.ts`

判定: **既存UI/hooksは捨てる。パターンだけ再利用。**

理由:

- hookの公開関数は v5 Entity/Category/Action/Trigger UI に密結合している。
- `setCategoryValue`、`doAction`、`moveParty`、`shareKnowledge` は名前だけ似ていても、v6では Fact/Slot/Revelation/Event 操作に置き換わる。
- `commitMutation`、`lifecycleReset`、undo stack、localStorage保存、`MutationAPI` の形は再利用価値が高い。
- 現UIは凍結対象であり、v6概念検証の次段階ではUIを作らない。hookを延命するとv5概念が混入する。

---

## 4. 永続化形式

後方互換は不要。新フォーマットのみを受け付ける。

```json
{
  "format": "trpg-scenario-editor-v6-session",
  "formatVersion": 1,
  "scenario": {
    "format": "trpg-scenario-editor-v6",
    "formatVersion": 1,
    "id": "scenario-the-haunting",
    "title": "悪霊の家",
    "createdAt": "2026-06-14T00:00:00.000Z",
    "updatedAt": "2026-06-14T00:00:00.000Z",
    "scenes": {},
    "npcs": {},
    "items": {},
    "clues": {},
    "facts": {},
    "slots": {},
    "revelations": {},
    "events": {},
    "pcs": {},
    "parties": {}
  },
  "state": {
    "factStates": {},
    "slotStates": {},
    "revelationStates": {},
    "eventStates": {},
    "pcStates": {},
    "partyStates": {},
    "log": []
  },
  "history": []
}
```

JSON上は `Map` / `Set` を使わない。すべて plain object / array にする。`reviveSession` は次だけ行う。

1. `format` と `formatVersion` を検査
2. 必須Recordの欠落をエラーにする
3. 自動生成slot/factの不足を検出し、原則エラーにする
4. 派生indexは作らない。クエリ時に計算するか、メモ化する

自動生成が必要な authoring操作と、永続化されたJSONの復元は分ける。復元時に勝手に補完すると「保存されたつもりのデータ」と「読み込み後のデータ」がずれるため、v6初期は厳格に失敗させる。

---

## 5. 非ゴール

- UI実装。最小UIも最後に回す。
- タイマー機構。時間イベントは条件イベントとして扱う。
- 自動発火・自動カスケード。機械は評価と通知まで。
- ダイス判定・成否判断の自動化。KPが判断する。
- 著作物本文の取り込み。公開リポジトリには自前の言い換え・構造だけを置く。
- 後方互換。v5 JSONは読まない。
- 新 runtime dependency。TypeScript標準機能と既存テスト環境で進める。

---

## 6. 実装フェーズ案

### Phase 1: コアモデル + テスト

UIなしで `src/core/v6-types.ts`、`src/core/v6-engine.ts`、`src/core/v6-persistence.ts` を作る。

検証項目:

- Fact条件のAND評価と `negate`
- EventOccurrenceState による一度きり/抑止
- Item/Clue/NPC作成時の location/disclosure slot自動生成
- `assignSlot` による排他性
- Fact変更・Slot変更・Event適用が同一 change/log に残る
- undoで scenario/state/log が戻る

### Phase 2: 投影クエリ

UIを作らず、テストとJSON fixtureで次を確認する。

- `projectScene`: 今ここにいるNPC、今ここにあるItem/Clue、発生可能Event、出口、関連真相を返す
- `projectNpcCard`: 静的プロフィールと、意図/恐れ/感情/知識/現在地の現在値を返す
- `projectItemRow`: 所在と開示状態を1ホップで返す
- `projectRevelation`: 未理解真相、発見済み/未発見手がかり、投入可能導線を返す
- `searchScenario`: 「日記はどこ?」「鍵を誰が持っている?」「鈴木は何を知っている?」に答えられる

### Phase 3: Markdown/JSONエクスポートでドッグフーディング

`local/the-haunting-model.md` 相当を v6 JSON fixture に落とし、Markdown exporter で人間が読める形に戻す。

目的:

- authoring入力量が検証時の水準に収まるか確認する
- 自動生成slot/factが人間の手書き項目として増えていないか確認する
- Sceneページ投影が「1画面=1シーン」の情報量になるか確認する
- 市販シナリオの本文なしでも構造検証できるか確認する

### Phase 4: 最小CLI/テスト操作

UIの前に、テストまたは小さなスクリプトで次の操作列を回す。

- 依頼を飛ばして鍵を盗む: location slot変更だけで進む
- 手がかり見落とし: Clueのlocation slotを別Sceneへ移す
- NPC死亡/退場: NPC location slotを抽象値「死亡/退場」にする
- PC別行動: Party知識をPC知識に分割し、合流で戻す
- 誤操作undo: Fact/Slot/Event/Logが戻る

### Phase 5: 最小UI

ここまで通ってからUIに入る。最小UIの目的は見た目ではなく、投影クエリの使い勝手検証である。

最初に必要な画面:

- Scene投影ページ
- Fact台帳
- Revelation一覧
- Event通知一覧
- SessionLog
- 検索

既存v5 UIは流用しない。React/Vite基盤を使うかどうかは、コア検証後に判断する。

---

## 7. 未確定事項

### 決定済み (オーケストレーターレビューで確定)

1. **Fact ID は自動生成ID + statement を表示名とする。** 手動の意味名IDは衝突と改名コストを生む。発見性は検索 (statement全文) が担う。
2. **Party知識とPC知識は同一Factの共有参照で表す。** Factの複製は二重管理の再発であり禁止。分割 = 同じFactIdをPC scopeに付け替え、合流 = Party scopeへ昇格。
3. **Markdown exporter の主出力はシーン中心** (KPの運用単位)。真相網を第2セクション、Fact台帳は付録。

### 実装で確認する項目

1. `SlotValueTarget` の `abstract` 値の標準化範囲。例: `死亡`、`退場`、`PC付近へ移動中`、`不明`。
2. NPCの「知っていること」が Factリンク一覧で足りるか、主観情報タグを早めに入れるべきか。ケース2では後続候補に留まった。
3. Historyスナップショット保存の上限。初期は正しさ優先、localStorage保存時のサイズ制限は実測で確認。
