// =====================================================
// v6 core data model
//
// Deviations from the design sketch:
// - ScenarioSession carries lastReport so mutateAndEvaluate/revive can expose the
//   freshly recomputed report without UI-side caching. Persistence omits it.
// - LogEntry includes slot-change entries. The design only listed fact/event/note
//   logs, but Phase 1 requires slot changes to be visible in the same change/log.
// - Clue construction can accept factStatement and assign factId automatically,
//   matching the decided "Fact IDs are auto-generated" rule.
// =====================================================

export type ID<T extends string> = `${T}-${string}`

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

export interface PublicText {
  visibility: 'public'
  text: string
}

export interface KeeperText {
  visibility: 'keeper'
  text: string
}

export type TextBlock = PublicText | KeeperText

export type LinkedRefRelation = 'knowledge'

export interface LinkedRef {
  type: 'scene' | 'npc' | 'item' | 'clue' | 'fact' | 'revelation' | 'event' | 'pc' | 'party'
  id: EntityId
  relation?: LinkedRefRelation
}

export interface ConditionLink {
  factId: FactId
  negate?: boolean
}

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

export interface NearlyFireableEvent extends FireableEvent {
  unmetLink: ConditionLink
}

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

export type LogEntry =
  | DescriptionLogEntry
  | FactChangeLogEntry
  | SlotChangeLogEntry
  | EventLogEntry
  | NoteLogEntry

export type LogEntryInput =
  LogEntry extends infer Entry
    ? Entry extends LogEntry
      ? Omit<Entry, 'id' | 'at' | 'changeId'>
      : never
    : never

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

export interface SlotChangeLogEntry extends BaseLogEntry {
  type: 'slot-change'
  slotId: SlotId
  fromFactId: FactId | null
  toFactId: FactId
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

export interface EvaluationReport {
  fireableEvents: FireableEvent[]
  nearlyFireableEvents: NearlyFireableEvent[]
  changedRevelationProjections: RevelationId[]
}

export interface ScenarioSession {
  scenario: ScenarioData
  state: SessionState
  history: ChangeRecord[]
  redoHistory: ChangeRecord[]
  lastReport: EvaluationReport
}

export interface PersistedScenarioSession {
  format: 'trpg-scenario-editor-v6-session'
  formatVersion: 1
  scenario: ScenarioData
  state: SessionState
  history: ChangeRecord[]
}

export type ReadonlyDeep<T> =
  T extends (...args: never[]) => unknown
    ? T
    : T extends readonly (infer U)[]
      ? readonly ReadonlyDeep<U>[]
      : T extends object
        ? { readonly [K in keyof T]: ReadonlyDeep<T[K]> }
        : T

export type ReadonlyScenarioSession = ReadonlyDeep<ScenarioSession>

export interface MutationAPI {
  readonly session: ReadonlyScenarioSession
  setFact(factId: FactId, value: boolean): void
  assignSlot(slotId: SlotId, value: SlotValueTarget | DisclosureValue | string): FactId
  applyEvent(eventId: EventId): void
  setEventOccurrence(eventId: EventId, state: EventOccurrenceState): void
  setRevelationUnderstood(revelationId: RevelationId, understood: boolean): void
  addLog(entry: LogEntryInput): void
  promoteLogToFact(logEntryId: LogEntryId, statement: string, links?: LinkedRef[]): FactId
}
