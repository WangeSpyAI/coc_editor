import type {
  ChangeId,
  ChangeRecord,
  Clue,
  ClueId,
  ConditionLink,
  ConditionalEvent,
  DisclosureValue,
  EntityId,
  EventId,
  EventOccurrenceState,
  EvaluationReport,
  ExclusiveSlot,
  Fact,
  FactId,
  FactSource,
  FireableEvent,
  KeeperText,
  KnowledgeAssignment,
  LinkedRef,
  LogEntry,
  LogEntryInput,
  LogEntryId,
  MutationAPI,
  NearlyFireableEvent,
  Item,
  ItemId,
  Npc,
  NpcInitialSlots,
  NpcId,
  Party,
  PartyId,
  PC,
  PcId,
  ProjectionLink,
  PublicText,
  ReadonlyScenarioSession,
  Revelation,
  RevelationId,
  ScenarioData,
  ScenarioSession,
  ScenarioSessionSnapshot,
  Scene,
  SceneId,
  SlotId,
  SlotState,
  SlotValue,
  SlotValueTarget,
} from './types'

export interface MutationOptions {
  now?: number
  changeId?: ChangeId
}

export interface MutationResult {
  session: ScenarioSession
  change: ChangeRecord
  report: EvaluationReport
}

export interface CreateEmptySessionInput {
  id: string
  title: string
  author?: string
  createdAt?: string
  updatedAt?: string
}

export type CreateSceneInput = Omit<Scene, 'id' | 'keeperNotes' | 'exits' | 'projectionLinks'> & {
  id?: SceneId
  keeperNotes?: KeeperText[]
  exits?: Scene['exits']
  projectionLinks?: ProjectionLink[]
}

export type CreateNpcInput = Omit<Npc, 'id'> & { id?: NpcId }
export type CreateItemInput = Omit<Item, 'id'> & { id?: ItemId }

export type CreateClueInput =
  Omit<Clue, 'id' | 'factId'> & {
    id?: ClueId
    factId?: FactId
    factStatement?: string
    factInitial?: boolean
  }

export type CreateFactInput = Omit<Fact, 'id' | 'source' | 'historyPolicy'> & {
  links?: LinkedRef[]
  source?: FactSource
  historyPolicy?: Fact['historyPolicy']
}

export type CreateEventInput = ConditionalEvent
export type CreateRevelationInput = Revelation
export type CreatePcInput = PC
export type CreatePartyInput = Party

interface DraftContext {
  changeId: ChangeId
  at: number
  nextLogNumber: number
}

type SlotAssignableValue = SlotValueTarget | DisclosureValue | string

const DEFAULT_NOW = 0

function emptyPublicText(text: string): PublicText {
  return { visibility: 'public', text }
}

function emptyKeeperText(text: string): KeeperText {
  return { visibility: 'keeper', text }
}

function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function cloneSession(session: ReadonlyScenarioSession): ScenarioSession {
  return clonePlain(session) as ScenarioSession
}

function snapshot(session: ReadonlyScenarioSession): ScenarioSessionSnapshot {
  return clonePlain({
    scenario: session.scenario,
    state: session.state,
  }) as ScenarioSessionSnapshot
}

function hasOwn(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

function nextRecordId<T extends string>(prefix: T, record: object): `${T}-${string}` {
  let n = Object.keys(record).length + 1
  let id = `${prefix}-${n}` as `${T}-${string}`
  while (hasOwn(record, id)) {
    n += 1
    id = `${prefix}-${n}` as `${T}-${string}`
  }
  return id
}

function nextChangeId(session: ReadonlyScenarioSession): ChangeId {
  return nextRecordId('chg', Object.fromEntries(session.history.map((change) => [change.id, true])))
}

function nextLogId(ctx: DraftContext): LogEntryId {
  const id = `log-${ctx.nextLogNumber}` as LogEntryId
  ctx.nextLogNumber += 1
  return id
}

function assertPresent<T>(value: T, message: string): asserts value is NonNullable<T> {
  if (value === undefined || value === null) {
    throw new Error(message)
  }
}

function assertFactExists(session: ScenarioSession, factId: FactId): Fact {
  const fact = session.scenario.facts[factId]
  assertPresent(fact, `Fact not found: ${factId}`)
  return fact
}

function assertSlotExists(session: ScenarioSession, slotId: SlotId): ExclusiveSlot {
  const slot = session.scenario.slots[slotId]
  assertPresent(slot, `Slot not found: ${slotId}`)
  return slot
}

function assertSlotTargetExists(session: ScenarioSession, value: SlotAssignableValue): void {
  if (typeof value === 'string' || value.type === 'abstract') {
    return
  }

  const exists = (() => {
    switch (value.type) {
      case 'scene':
        return session.scenario.scenes[value.id] !== undefined
      case 'npc':
        return session.scenario.npcs[value.id] !== undefined
      case 'pc':
        return session.scenario.pcs[value.id] !== undefined
      case 'party':
        return session.scenario.parties[value.id] !== undefined
      default: {
        const exhaustive: never = value
        throw new Error(`Unknown slot target: ${JSON.stringify(exhaustive)}`)
      }
    }
  })()

  if (!exists) {
    throw new Error(`Slot target not found: ${value.type} ${value.id}`)
  }
}

function assertEventExists(session: ScenarioSession, eventId: EventId): ConditionalEvent {
  const event = session.scenario.events[eventId]
  assertPresent(event, `Event not found: ${eventId}`)
  return event
}

function pushLog(
  session: ScenarioSession,
  ctx: DraftContext,
  entry: LogEntryInput,
): LogEntry {
  const logEntry = {
    ...entry,
    id: nextLogId(ctx),
    at: ctx.at,
    changeId: ctx.changeId,
  } as LogEntry
  session.state.log.push(logEntry)
  return logEntry
}

function setFactInternal(
  session: ScenarioSession,
  ctx: DraftContext,
  factId: FactId,
  value: boolean,
  allowSlotFact: boolean,
): void {
  const fact = assertFactExists(session, factId)
  if (fact.slot && !allowSlotFact) {
    throw new Error(`Slot fact must be changed via assignSlot: ${factId}`)
  }

  const current = session.state.factStates[factId] ?? { factId, isTrue: fact.initial }
  if (current.isTrue === value) {
    session.state.factStates[factId] = current
    return
  }

  session.state.factStates[factId] = {
    factId,
    isTrue: value,
    changedAtChangeId: ctx.changeId,
  }
  pushLog(session, ctx, {
    type: 'fact-change',
    factId,
    from: current.isTrue,
    to: value,
  })
}

function slotIdFor(ownerId: EntityId, suffix: string): SlotId {
  return `slot-${ownerId}-${suffix}` as SlotId
}

function slotSuffix(kind: ExclusiveSlot['kind']): string {
  switch (kind) {
    case 'location':
      return 'location'
    case 'disclosure':
      return 'disclosure'
    case 'npc-intent':
      return 'intent'
    case 'npc-fear':
      return 'fear'
    case 'npc-emotion':
      return 'emotion'
    case 'npc-knowledge-mode':
      return 'knowledge'
    case 'custom':
      return 'custom'
    default: {
      const exhaustive: never = kind
      throw new Error(`Unknown slot kind: ${exhaustive}`)
    }
  }
}

function ownerName(session: ScenarioSession, owner: LinkedRef): string {
  switch (owner.type) {
    case 'scene':
      return session.scenario.scenes[owner.id as SceneId]?.name ?? owner.id
    case 'npc':
      return session.scenario.npcs[owner.id as NpcId]?.name ?? owner.id
    case 'item':
      return session.scenario.items[owner.id as ItemId]?.name ?? owner.id
    case 'clue':
      return session.scenario.clues[owner.id as ClueId]?.name ?? owner.id
    case 'fact':
      return session.scenario.facts[owner.id as FactId]?.statement ?? owner.id
    case 'revelation':
      return session.scenario.revelations[owner.id as RevelationId]?.title ?? owner.id
    case 'event':
      return session.scenario.events[owner.id as EventId]?.name ?? owner.id
    case 'pc':
      return session.scenario.pcs[owner.id as PcId]?.name ?? owner.id
    case 'party':
      return session.scenario.parties[owner.id as PartyId]?.name ?? owner.id
    default: {
      const exhaustive: never = owner.type
      throw new Error(`Unknown linked ref type: ${exhaustive}`)
    }
  }
}

function slotValueKey(kind: ExclusiveSlot['kind'], value: SlotAssignableValue): string {
  if (typeof value === 'string') {
    return `${kind}:${value}`
  }
  if (value.type === 'abstract') {
    return `abstract:${value.label}`
  }
  return `${value.type}:${value.id}`
}

function slotValueLabel(value: SlotAssignableValue): string {
  if (typeof value === 'string') {
    return value
  }
  if (value.type === 'abstract') {
    return value.label
  }
  return value.id
}

function slotValueTarget(value: SlotAssignableValue): SlotValueTarget | undefined {
  return typeof value === 'string' ? undefined : value
}

function generatedSource(owner: LinkedRef, kind: ExclusiveSlot['kind']): FactSource {
  switch (kind) {
    case 'location': {
      if (owner.type === 'npc' || owner.type === 'item' || owner.type === 'clue') {
        return { type: 'generated-location', ownerType: owner.type, ownerId: owner.id }
      }
      return { type: 'author' }
    }
    case 'disclosure': {
      if (owner.type === 'item' || owner.type === 'clue') {
        return { type: 'generated-disclosure', ownerType: owner.type, ownerId: owner.id }
      }
      return { type: 'author' }
    }
    case 'npc-intent':
      return { type: 'generated-npc-dynamic', npcId: owner.id as NpcId, field: 'intent' }
    case 'npc-fear':
      return { type: 'generated-npc-dynamic', npcId: owner.id as NpcId, field: 'fear' }
    case 'npc-emotion':
      return { type: 'generated-npc-dynamic', npcId: owner.id as NpcId, field: 'emotion' }
    case 'npc-knowledge-mode':
      return { type: 'generated-npc-dynamic', npcId: owner.id as NpcId, field: 'knowledge' }
    case 'custom':
      return { type: 'author' }
    default: {
      const exhaustive: never = kind
      throw new Error(`Unknown slot kind: ${exhaustive}`)
    }
  }
}

function generatedFactStatement(
  session: ScenarioSession,
  owner: LinkedRef,
  kind: ExclusiveSlot['kind'],
  value: SlotAssignableValue,
): string {
  const name = ownerName(session, owner)
  const label = slotValueLabel(value)
  switch (kind) {
    case 'location':
      return `${name} の現在地は ${label}`
    case 'disclosure':
      return `${name} の開示状態は ${label}`
    case 'npc-intent':
      return `${name} の現在の意図は ${label}`
    case 'npc-fear':
      return `${name} の現在の恐れは ${label}`
    case 'npc-emotion':
      return `${name} の現在の感情は ${label}`
    case 'npc-knowledge-mode':
      return `${name} の知識状態は ${label}`
    case 'custom':
      return `${name} の状態は ${label}`
    default: {
      const exhaustive: never = kind
      throw new Error(`Unknown slot kind: ${exhaustive}`)
    }
  }
}

function createSlotValueFact(
  session: ScenarioSession,
  slot: ExclusiveSlot,
  value: SlotAssignableValue,
  initial: boolean,
  changeId?: ChangeId,
): FactId {
  const key = slotValueKey(slot.kind, value)
  const existing = slot.values.find((slotValue) => slotValue.key === key)
  if (existing) {
    return existing.factId
  }

  const factId = nextRecordId('f', session.scenario.facts) as FactId
  const fact: Fact = {
    id: factId,
    statement: generatedFactStatement(session, slot.owner, slot.kind, value),
    initial,
    links: [slot.owner],
    slot: { slotId: slot.id, valueKey: key },
    source: generatedSource(slot.owner, slot.kind),
    historyPolicy: 'generated',
  }
  session.scenario.facts[factId] = fact
  session.state.factStates[factId] = {
    factId,
    isTrue: initial,
    changedAtChangeId: changeId,
  }

  const slotValue: SlotValue = {
    key,
    label: slotValueLabel(value),
    factId,
    target: slotValueTarget(value),
  }
  slot.values.push(slotValue)
  return factId
}

function addGeneratedSlot(
  session: ScenarioSession,
  owner: LinkedRef,
  kind: ExclusiveSlot['kind'],
  value: SlotAssignableValue,
  changeId: ChangeId,
): SlotId {
  const slotId = slotIdFor(owner.id, slotSuffix(kind))
  if (session.scenario.slots[slotId]) {
    throw new Error(`Slot already exists: ${slotId}`)
  }
  const slot: ExclusiveSlot = {
    id: slotId,
    owner,
    kind,
    values: [],
    generated: true,
  }
  session.scenario.slots[slotId] = slot
  const factId = createSlotValueFact(session, slot, value, true, changeId)
  slot.currentFactId = factId
  session.state.slotStates[slotId] = { slotId, currentFactId: factId }
  return slotId
}

function assignSlotInternal(
  session: ScenarioSession,
  ctx: DraftContext,
  slotId: SlotId,
  value: SlotAssignableValue,
  createFactIfMissing: boolean,
): FactId {
  const slot = assertSlotExists(session, slotId)
  assertSlotTargetExists(session, value)
  const key = slotValueKey(slot.kind, value)
  let slotValue = slot.values.find((candidate) => candidate.key === key)
  if (!slotValue) {
    if (!createFactIfMissing) {
      throw new Error(`Slot value not found: ${slotId} ${key}`)
    }
    const factId = createSlotValueFact(session, slot, value, false, ctx.changeId)
    slotValue = slot.values.find((candidate) => candidate.factId === factId)
  }
  assertPresent(slotValue, `Slot value not found after creation: ${slotId} ${key}`)

  const currentState = session.state.slotStates[slotId] ?? { slotId, currentFactId: null }
  const previousFactId = currentState.currentFactId
  if (previousFactId === slotValue.factId) {
    return slotValue.factId
  }

  if (previousFactId) {
    setFactInternal(session, ctx, previousFactId, false, true)
  }
  setFactInternal(session, ctx, slotValue.factId, true, true)
  slot.currentFactId = slotValue.factId
  const nextState: SlotState = { slotId, currentFactId: slotValue.factId }
  session.state.slotStates[slotId] = nextState
  pushLog(session, ctx, {
    type: 'slot-change',
    slotId,
    fromFactId: previousFactId,
    toFactId: slotValue.factId,
  })
  return slotValue.factId
}

interface EventOccurrenceView {
  readonly id: EventId
  readonly occurrence: {
    readonly mode: 'once' | 'repeatable'
    readonly initialState?: EventOccurrenceState
  }
}

function initialEventState(event: EventOccurrenceView): EventOccurrenceState {
  return event.occurrence.initialState ?? 'unfired'
}

function canConsiderEvent(session: ReadonlyScenarioSession, event: EventOccurrenceView): boolean {
  const state = session.state.eventStates[event.id]
  const occurrence = state?.occurrence ?? initialEventState(event)
  if (occurrence === 'suppressed') {
    return false
  }
  if (event.occurrence.mode === 'once' && occurrence === 'fired') {
    return false
  }
  return true
}

function applyEventInternal(session: ScenarioSession, ctx: DraftContext, eventId: EventId): void {
  const event = assertEventExists(session, eventId)
  if (!canConsiderEvent(session, event)) {
    throw new Error(`Event is not fireable because of occurrence state: ${eventId}`)
  }
  if (!evaluateConditionLinks(session.state.factStates, event.condition)) {
    throw new Error(`Event condition is not satisfied: ${eventId}`)
  }

  const currentState = session.state.eventStates[eventId] ?? {
    eventId,
    occurrence: initialEventState(event),
  }
  session.state.eventStates[eventId] = {
    ...currentState,
    occurrence: 'fired',
    firedAtChangeId: ctx.changeId,
  }
  pushLog(session, ctx, {
    type: 'event',
    eventId,
    occurrence: 'fired',
    publicText: event.result.publicText ?? event.publicDescription,
    keeperText: event.result.keeperText,
  })

  for (const factId of event.result.setFacts ?? []) {
    setFactInternal(session, ctx, factId, true, false)
  }
  for (const factId of event.result.unsetFacts ?? []) {
    setFactInternal(session, ctx, factId, false, false)
  }
  for (const assignment of event.result.setSlots ?? []) {
    assignSlotInternal(
      session,
      ctx,
      assignment.slotId,
      assignment.value,
      assignment.createFactIfMissing ?? true,
    )
  }
}

function setEventOccurrenceInternal(
  session: ScenarioSession,
  ctx: DraftContext,
  eventId: EventId,
  occurrence: EventOccurrenceState,
): void {
  const event = assertEventExists(session, eventId)
  const currentState = session.state.eventStates[eventId] ?? {
    eventId,
    occurrence: initialEventState(event),
  }
  session.state.eventStates[eventId] = {
    ...currentState,
    occurrence,
    firedAtChangeId: occurrence === 'fired' ? ctx.changeId : currentState.firedAtChangeId,
  }
}

function setRevelationUnderstoodInternal(
  session: ScenarioSession,
  ctx: DraftContext,
  revelationId: RevelationId,
  understood: boolean,
): void {
  const revelation = session.scenario.revelations[revelationId]
  assertPresent(revelation, `Revelation not found: ${revelationId}`)
  const current = session.state.revelationStates[revelationId] ?? {
    revelationId,
    understood: revelation.understoodInitially ?? false,
  }
  session.state.revelationStates[revelationId] = {
    revelationId,
    understood,
    understoodAtChangeId: understood ? ctx.changeId : current.understoodAtChangeId,
  }
}

function promoteLogToFactInternal(
  session: ScenarioSession,
  ctx: DraftContext,
  logEntryId: LogEntryId,
  statement: string,
  links?: LinkedRef[],
): FactId {
  const logEntry = session.state.log.find((entry) => entry.id === logEntryId)
  assertPresent(logEntry, `Log entry not found: ${logEntryId}`)
  const factId = nextRecordId('f', session.scenario.facts) as FactId
  session.scenario.facts[factId] = {
    id: factId,
    statement,
    initial: true,
    links,
    source: { type: 'session-log', logEntryId },
    historyPolicy: 'normal',
  }
  session.state.factStates[factId] = {
    factId,
    isTrue: true,
    changedAtChangeId: ctx.changeId,
  }
  if (logEntry.type === 'note') {
    logEntry.promotedTo = { type: 'fact', id: factId }
  }
  return factId
}

function entityExists(session: ScenarioSession, ref: LinkedRef): boolean {
  switch (ref.type) {
    case 'scene':
      return session.scenario.scenes[ref.id as SceneId] !== undefined
    case 'npc':
      return session.scenario.npcs[ref.id as NpcId] !== undefined
    case 'item':
      return session.scenario.items[ref.id as ItemId] !== undefined
    case 'clue':
      return session.scenario.clues[ref.id as ClueId] !== undefined
    case 'fact':
      return session.scenario.facts[ref.id as FactId] !== undefined
    case 'revelation':
      return session.scenario.revelations[ref.id as RevelationId] !== undefined
    case 'event':
      return session.scenario.events[ref.id as EventId] !== undefined
    case 'pc':
      return session.scenario.pcs[ref.id as PcId] !== undefined
    case 'party':
      return session.scenario.parties[ref.id as PartyId] !== undefined
    default: {
      const exhaustive: never = ref.type
      throw new Error(`Unknown linked ref type: ${exhaustive}`)
    }
  }
}

function projectionExists(session: ScenarioSession, link: ProjectionLink): boolean {
  switch (link.type) {
    case 'npc':
      return session.scenario.npcs[link.id] !== undefined
    case 'item':
      return session.scenario.items[link.id] !== undefined
    case 'clue':
      return session.scenario.clues[link.id] !== undefined
    case 'event':
      return session.scenario.events[link.id] !== undefined
    case 'fact':
      return session.scenario.facts[link.id] !== undefined
    case 'revelation':
      return session.scenario.revelations[link.id] !== undefined
    default: {
      const exhaustive: never = link
      throw new Error(`Unknown projection link: ${JSON.stringify(exhaustive)}`)
    }
  }
}

function filterFactIds<T extends FactId>(ids: T[], session: ScenarioSession): T[] {
  return ids.filter((id) => session.scenario.facts[id] !== undefined)
}

function reconcileDraft(session: ScenarioSession): void {
  for (const factId of Object.keys(session.state.factStates) as FactId[]) {
    if (!session.scenario.facts[factId]) {
      delete session.state.factStates[factId]
    }
  }
  for (const slotId of Object.keys(session.state.slotStates) as SlotId[]) {
    if (!session.scenario.slots[slotId]) {
      delete session.state.slotStates[slotId]
    }
  }
  for (const eventId of Object.keys(session.state.eventStates) as EventId[]) {
    if (!session.scenario.events[eventId]) {
      delete session.state.eventStates[eventId]
    }
  }
  for (const revelationId of Object.keys(session.state.revelationStates) as RevelationId[]) {
    if (!session.scenario.revelations[revelationId]) {
      delete session.state.revelationStates[revelationId]
    }
  }
  for (const pcId of Object.keys(session.state.pcStates) as PcId[]) {
    if (!session.scenario.pcs[pcId]) {
      delete session.state.pcStates[pcId]
    }
  }
  for (const partyId of Object.keys(session.state.partyStates) as PartyId[]) {
    if (!session.scenario.parties[partyId]) {
      delete session.state.partyStates[partyId]
    }
  }

  for (const fact of Object.values(session.scenario.facts)) {
    if (fact.links) {
      fact.links = fact.links.filter((link) => entityExists(session, link))
    }
  }
  for (const slot of Object.values(session.scenario.slots)) {
    slot.values = slot.values.filter((value) => session.scenario.facts[value.factId] !== undefined)
    const slotState = session.state.slotStates[slot.id] ?? { slotId: slot.id, currentFactId: null }
    if (slotState.currentFactId && !session.scenario.facts[slotState.currentFactId]) {
      slotState.currentFactId = null
    }
    slot.currentFactId = slotState.currentFactId ?? undefined
    session.state.slotStates[slot.id] = slotState
  }
  for (const scene of Object.values(session.scenario.scenes)) {
    scene.projectionLinks = scene.projectionLinks.filter((link) => projectionExists(session, link))
    for (const exit of scene.exits) {
      if (exit.condition) {
        exit.condition = exit.condition.filter((link) => session.scenario.facts[link.factId])
      }
    }
  }
  for (const item of Object.values(session.scenario.items)) {
    if (item.truthLinks) {
      item.truthLinks = item.truthLinks.filter((id) => session.scenario.revelations[id])
    }
  }
  for (const clue of Object.values(session.scenario.clues)) {
    clue.truthLinks = clue.truthLinks.filter((id) => session.scenario.revelations[id])
    clue.route.from = clue.route.from.filter((ref) => entityExists(session, ref))
  }
  for (const event of Object.values(session.scenario.events)) {
    event.condition = event.condition.filter((link) => session.scenario.facts[link.factId])
    event.result.setFacts = filterFactIds(event.result.setFacts ?? [], session)
    event.result.unsetFacts = filterFactIds(event.result.unsetFacts ?? [], session)
    event.result.setSlots = (event.result.setSlots ?? []).filter(
      (assignment) => session.scenario.slots[assignment.slotId] !== undefined,
    )
  }
  for (const state of Object.values(session.state.partyStates)) {
    state.knowledgeFactIds = filterFactIds(state.knowledgeFactIds, session)
  }
  for (const state of Object.values(session.state.pcStates)) {
    state.knowledgeFactIds = filterFactIds(state.knowledgeFactIds, session)
    if (state.partyId && !session.scenario.parties[state.partyId]) {
      state.partyId = null
    }
  }
}

export function evaluateConditionLinks(
  facts: Readonly<Record<FactId, { readonly isTrue: boolean } | undefined>>,
  condition: readonly ConditionLink[],
): boolean {
  return condition.every((link) => {
    const value = facts[link.factId]?.isTrue ?? false
    return link.negate ? !value : value
  })
}

function evaluateConditionLink(
  facts: Readonly<Record<FactId, { readonly isTrue: boolean } | undefined>>,
  link: ConditionLink,
): boolean {
  return evaluateConditionLinks(facts, [link])
}

export function listFireableEvents(session: ReadonlyScenarioSession): FireableEvent[] {
  return Object.values(session.scenario.events).flatMap((event) => {
    if (!canConsiderEvent(session, event)) {
      return []
    }
    if (!evaluateConditionLinks(session.state.factStates, event.condition)) {
      return []
    }
    return [{ eventId: event.id, sceneIds: [...event.sceneIds], reason: [...event.condition] }]
  })
}

export function listNearlyFireableEvents(session: ReadonlyScenarioSession): NearlyFireableEvent[] {
  return Object.values(session.scenario.events).flatMap((event) => {
    if (!canConsiderEvent(session, event)) {
      return []
    }
    const unmet = event.condition.filter(
      (link) => !evaluateConditionLink(session.state.factStates, link),
    )
    if (unmet.length !== 1) {
      return []
    }
    return [{
      eventId: event.id,
      sceneIds: [...event.sceneIds],
      reason: [...event.condition],
      unmetLink: unmet[0],
    }]
  })
}

export function evaluateSession(session: ReadonlyScenarioSession): EvaluationReport {
  return {
    fireableEvents: listFireableEvents(session),
    nearlyFireableEvents: listNearlyFireableEvents(session),
    changedRevelationProjections: [],
  }
}

export function createEmptySession(input: CreateEmptySessionInput): ScenarioSession {
  const createdAt = input.createdAt ?? new Date(DEFAULT_NOW).toISOString()
  const scenario: ScenarioData = {
    format: 'trpg-scenario-editor-v6',
    formatVersion: 1,
    id: input.id,
    title: input.title,
    author: input.author,
    createdAt,
    updatedAt: input.updatedAt ?? createdAt,
    scenes: {},
    npcs: {},
    items: {},
    clues: {},
    facts: {},
    slots: {},
    revelations: {},
    events: {},
    pcs: {},
    parties: {},
  }
  const session: ScenarioSession = {
    scenario,
    state: {
      factStates: {},
      slotStates: {},
      revelationStates: {},
      eventStates: {},
      pcStates: {},
      partyStates: {},
      log: [],
    },
    history: [],
    redoHistory: [],
    lastReport: {
      fireableEvents: [],
      nearlyFireableEvents: [],
      changedRevelationProjections: [],
    },
  }
  session.lastReport = evaluateSession(session)
  return session
}

export function mutateAndEvaluate(
  session: ReadonlyScenarioSession,
  label: string,
  mutate: (api: MutationAPI) => void,
  options: MutationOptions = {},
): MutationResult {
  const before = snapshot(session)
  const draft = cloneSession(session)
  const ctx: DraftContext = {
    changeId: options.changeId ?? nextChangeId(session),
    at: options.now ?? Date.now(),
    nextLogNumber: draft.state.log.length + 1,
  }

  const api: MutationAPI = {
    get session() {
      return draft
    },
    setFact(factId, value) {
      setFactInternal(draft, ctx, factId, value, false)
    },
    assignSlot(slotId, value) {
      return assignSlotInternal(draft, ctx, slotId, value, true)
    },
    applyEvent(eventId) {
      applyEventInternal(draft, ctx, eventId)
    },
    setEventOccurrence(eventId, state) {
      setEventOccurrenceInternal(draft, ctx, eventId, state)
    },
    setRevelationUnderstood(revelationId, understood) {
      setRevelationUnderstoodInternal(draft, ctx, revelationId, understood)
    },
    addLog(entry) {
      pushLog(draft, ctx, entry)
    },
    promoteLogToFact(logEntryId, statement, links) {
      return promoteLogToFactInternal(draft, ctx, logEntryId, statement, links)
    },
  }

  mutate(api)
  reconcileDraft(draft)
  const report = evaluateSession(draft)
  draft.lastReport = report
  const after = snapshot(draft)
  const change = {
    id: ctx.changeId,
    at: ctx.at,
    label,
    before,
    after,
  }
  draft.history.push(change)
  draft.redoHistory = []
  return { session: draft, change, report }
}

export function reconcileSession(session: ReadonlyScenarioSession): ScenarioSession {
  const draft = cloneSession(session)
  reconcileDraft(draft)
  draft.lastReport = evaluateSession(draft)
  return draft
}

export function setFact(
  session: ReadonlyScenarioSession,
  factId: FactId,
  value: boolean,
  options: MutationOptions = {},
): MutationResult {
  return mutateAndEvaluate(session, `set fact ${factId}`, (api) => api.setFact(factId, value), options)
}

export function assignSlot(
  session: ReadonlyScenarioSession,
  slotId: SlotId,
  value: SlotAssignableValue,
  options: MutationOptions = {},
): MutationResult & { factId: FactId } {
  let factId: FactId | null = null
  const result = mutateAndEvaluate(
    session,
    `assign slot ${slotId}`,
    (api) => {
      factId = api.assignSlot(slotId, value)
    },
    options,
  )
  const assignedFactId = factId
  assertPresent(assignedFactId, `Slot assignment did not return a factId: ${slotId}`)
  return { ...result, factId: assignedFactId }
}

export function applyEvent(
  session: ReadonlyScenarioSession,
  eventId: EventId,
  options: MutationOptions = {},
): MutationResult {
  return mutateAndEvaluate(session, `apply event ${eventId}`, (api) => api.applyEvent(eventId), options)
}

export function createScene(
  session: ReadonlyScenarioSession,
  input: CreateSceneInput,
  options: MutationOptions = {},
): MutationResult & { sceneId: SceneId } {
  const sceneId = input.id ?? (nextRecordId('sc', session.scenario.scenes) as SceneId)
  const result = mutateAndEvaluate(
    session,
    `create scene ${sceneId}`,
    (api) => {
      const draft = api.session as ScenarioSession
      draft.scenario.scenes[sceneId] = {
        id: sceneId,
        name: input.name,
        kind: input.kind,
        publicDescription: input.publicDescription,
        descriptionVariants: input.descriptionVariants,
        keeperNotes: input.keeperNotes ?? [],
        exits: input.exits ?? [],
        projectionLinks: input.projectionLinks ?? [],
        childScenes: input.childScenes,
      }
    },
    options,
  )
  return { ...result, sceneId }
}

export function createFact(
  session: ReadonlyScenarioSession,
  input: CreateFactInput,
  options: MutationOptions = {},
): MutationResult & { factId: FactId } {
  const factId = nextRecordId('f', session.scenario.facts) as FactId
  const result = mutateAndEvaluate(
    session,
    `create fact ${factId}`,
    (api) => {
      const draft = api.session as ScenarioSession
      draft.scenario.facts[factId] = {
        id: factId,
        statement: input.statement,
        initial: input.initial,
        links: input.links,
        slot: input.slot,
        source: input.source ?? { type: 'author' },
        historyPolicy: input.historyPolicy ?? 'normal',
      }
      draft.state.factStates[factId] = {
        factId,
        isTrue: input.initial,
      }
    },
    options,
  )
  return { ...result, factId }
}

export function createItem(
  session: ReadonlyScenarioSession,
  input: CreateItemInput,
  options: MutationOptions = {},
): MutationResult & { itemId: ItemId } {
  const itemId = input.id ?? (nextRecordId('obj', session.scenario.items) as ItemId)
  const result = mutateAndEvaluate(
    session,
    `create item ${itemId}`,
    (api) => {
      const draft = api.session as ScenarioSession
      draft.scenario.items[itemId] = {
        id: itemId,
        name: input.name,
        publicDescription: input.publicDescription,
        keeperNotes: input.keeperNotes,
        truthLinks: input.truthLinks,
        initialLocation: input.initialLocation,
        initialDisclosure: input.initialDisclosure,
        tags: input.tags,
      }
      const owner: LinkedRef = { type: 'item', id: itemId }
      if (input.initialLocation) {
        addGeneratedSlot(draft, owner, 'location', input.initialLocation, options.changeId ?? nextChangeId(session))
      }
      if (input.initialDisclosure) {
        addGeneratedSlot(draft, owner, 'disclosure', input.initialDisclosure, options.changeId ?? nextChangeId(session))
      }
    },
    options,
  )
  return { ...result, itemId }
}

export function createClue(
  session: ReadonlyScenarioSession,
  input: CreateClueInput,
  options: MutationOptions = {},
): MutationResult & { clueId: ClueId; factId: FactId } {
  const clueId = input.id ?? (nextRecordId('cl', session.scenario.clues) as ClueId)
  const factId = input.factId ?? (nextRecordId('f', session.scenario.facts) as FactId)
  const result = mutateAndEvaluate(
    session,
    `create clue ${clueId}`,
    (api) => {
      const draft = api.session as ScenarioSession
      if (!draft.scenario.facts[factId]) {
        draft.scenario.facts[factId] = {
          id: factId,
          statement: input.factStatement ?? input.name,
          initial: input.factInitial ?? false,
          links: [{ type: 'clue', id: clueId }],
          source: { type: 'author' },
          historyPolicy: 'normal',
        }
        draft.state.factStates[factId] = {
          factId,
          isTrue: input.factInitial ?? false,
        }
      }
      draft.scenario.clues[clueId] = {
        id: clueId,
        name: input.name,
        publicDescription: input.publicDescription,
        keeperNotes: input.keeperNotes,
        factId,
        route: input.route,
        truthLinks: input.truthLinks,
        initialLocation: input.initialLocation,
        initialDisclosure: input.initialDisclosure,
        tags: input.tags,
      }
      const owner: LinkedRef = { type: 'clue', id: clueId }
      if (input.initialLocation) {
        addGeneratedSlot(draft, owner, 'location', input.initialLocation, options.changeId ?? nextChangeId(session))
      }
      if (input.initialDisclosure) {
        addGeneratedSlot(draft, owner, 'disclosure', input.initialDisclosure, options.changeId ?? nextChangeId(session))
      }
    },
    options,
  )
  return { ...result, clueId, factId }
}

function npcInitialSlotsForStorage(initial: NpcInitialSlots | undefined): NpcInitialSlots | undefined {
  if (!initial) {
    return undefined
  }
  const stored = { ...initial }
  delete stored.knowledgeFactIds
  return Object.keys(stored).length > 0 ? stored : undefined
}

function addNpcKnowledgeLink(session: ScenarioSession, npcId: NpcId, factId: FactId): void {
  const fact = assertFactExists(session, factId)
  const links = fact.links ?? []
  if (!links.some((link) => (
    link.type === 'npc' && link.id === npcId && link.relation === 'knowledge'
  ))) {
    links.push({ type: 'npc', id: npcId, relation: 'knowledge' })
  }
  fact.links = links
}

export function createNpc(
  session: ReadonlyScenarioSession,
  input: CreateNpcInput,
  options: MutationOptions = {},
): MutationResult & { npcId: NpcId } {
  const npcId = input.id ?? (nextRecordId('npc', session.scenario.npcs) as NpcId)
  const result = mutateAndEvaluate(
    session,
    `create npc ${npcId}`,
    (api) => {
      const draft = api.session as ScenarioSession
      draft.scenario.npcs[npcId] = {
        id: npcId,
        name: input.name,
        publicProfile: input.publicProfile,
        keeperSecret: input.keeperSecret,
        staticProfile: input.staticProfile,
        initialDynamicSlots: npcInitialSlotsForStorage(input.initialDynamicSlots),
        projectionLinks: input.projectionLinks,
      }
      const owner: LinkedRef = { type: 'npc', id: npcId }
      const initial = input.initialDynamicSlots
      if (initial?.location) {
        addGeneratedSlot(draft, owner, 'location', initial.location, options.changeId ?? nextChangeId(session))
      }
      if (initial?.intent) {
        addGeneratedSlot(draft, owner, 'npc-intent', initial.intent, options.changeId ?? nextChangeId(session))
      }
      if (initial?.fear) {
        addGeneratedSlot(draft, owner, 'npc-fear', initial.fear, options.changeId ?? nextChangeId(session))
      }
      if (initial?.emotion) {
        addGeneratedSlot(draft, owner, 'npc-emotion', initial.emotion, options.changeId ?? nextChangeId(session))
      }
      for (const factId of initial?.knowledgeFactIds ?? []) {
        addNpcKnowledgeLink(draft, npcId, factId)
      }
    },
    options,
  )
  return { ...result, npcId }
}

export function createEvent(
  session: ReadonlyScenarioSession,
  input: CreateEventInput,
  options: MutationOptions = {},
): MutationResult & { eventId: EventId } {
  const result = mutateAndEvaluate(
    session,
    `create event ${input.id}`,
    (api) => {
      const draft = api.session as ScenarioSession
      draft.scenario.events[input.id] = clonePlain(input)
      draft.state.eventStates[input.id] = {
        eventId: input.id,
        occurrence: initialEventState(input),
      }
    },
    options,
  )
  return { ...result, eventId: input.id }
}

export function createRevelation(
  session: ReadonlyScenarioSession,
  input: CreateRevelationInput,
  options: MutationOptions = {},
): MutationResult & { revelationId: RevelationId } {
  const result = mutateAndEvaluate(
    session,
    `create revelation ${input.id}`,
    (api) => {
      const draft = api.session as ScenarioSession
      draft.scenario.revelations[input.id] = clonePlain(input)
      draft.state.revelationStates[input.id] = {
        revelationId: input.id,
        understood: input.understoodInitially ?? false,
      }
    },
    options,
  )
  return { ...result, revelationId: input.id }
}

export function createPc(
  session: ReadonlyScenarioSession,
  input: CreatePcInput,
  options: MutationOptions = {},
): MutationResult & { pcId: PcId } {
  const result = mutateAndEvaluate(
    session,
    `create pc ${input.id}`,
    (api) => {
      const draft = api.session as ScenarioSession
      draft.scenario.pcs[input.id] = clonePlain(input)
      draft.state.pcStates[input.id] = {
        pcId: input.id,
        partyId: null,
        knowledgeFactIds: [],
      }
    },
    options,
  )
  return { ...result, pcId: input.id }
}

export function createParty(
  session: ReadonlyScenarioSession,
  input: CreatePartyInput,
  options: MutationOptions = {},
): MutationResult & { partyId: PartyId } {
  const result = mutateAndEvaluate(
    session,
    `create party ${input.id}`,
    (api) => {
      const draft = api.session as ScenarioSession
      draft.scenario.parties[input.id] = clonePlain(input)
      draft.state.partyStates[input.id] = {
        partyId: input.id,
        knowledgeFactIds: [],
      }
      for (const pcId of input.memberIds) {
        if (draft.state.pcStates[pcId]) {
          draft.state.pcStates[pcId].partyId = input.id
        }
      }
    },
    options,
  )
  return { ...result, partyId: input.id }
}

function knowledgeList(session: ScenarioSession, assignment: KnowledgeAssignment): FactId[] {
  if (assignment.scope === 'party') {
    const state = session.state.partyStates[assignment.targetId as PartyId]
    assertPresent(state, `Party state not found: ${assignment.targetId}`)
    return state.knowledgeFactIds
  }
  const state = session.state.pcStates[assignment.targetId as PcId]
  assertPresent(state, `PC state not found: ${assignment.targetId}`)
  return state.knowledgeFactIds
}

export function assignKnowledge(
  session: ReadonlyScenarioSession,
  assignment: KnowledgeAssignment,
  options: MutationOptions = {},
): MutationResult {
  return mutateAndEvaluate(
    session,
    `assign knowledge ${assignment.factId}`,
    (api) => {
      const draft = api.session as ScenarioSession
      assertFactExists(draft, assignment.factId)
      const facts = knowledgeList(draft, assignment)
      if (!facts.includes(assignment.factId)) {
        facts.push(assignment.factId)
      }
    },
    options,
  )
}

export interface MoveKnowledgeScopeInput {
  factId: FactId
  from: Omit<KnowledgeAssignment, 'factId'>
  to: Omit<KnowledgeAssignment, 'factId'>
}

export function moveKnowledgeScope(
  session: ReadonlyScenarioSession,
  input: MoveKnowledgeScopeInput,
  options: MutationOptions = {},
): MutationResult {
  return mutateAndEvaluate(
    session,
    `move knowledge ${input.factId}`,
    (api) => {
      const draft = api.session as ScenarioSession
      assertFactExists(draft, input.factId)
      const fromList = knowledgeList(draft, { ...input.from, factId: input.factId })
      const toList = knowledgeList(draft, { ...input.to, factId: input.factId })
      const index = fromList.indexOf(input.factId)
      if (index !== -1) {
        fromList.splice(index, 1)
      }
      if (!toList.includes(input.factId)) {
        toList.push(input.factId)
      }
    },
    options,
  )
}

export function undo(session: ReadonlyScenarioSession): { session: ScenarioSession; change: ChangeRecord | null } {
  const draft = cloneSession(session)
  const change = draft.history.pop() ?? null
  if (!change) {
    return { session: draft, change: null }
  }
  draft.scenario = clonePlain(change.before.scenario)
  draft.state = clonePlain(change.before.state)
  draft.redoHistory.push(change)
  draft.lastReport = evaluateSession(draft)
  return { session: draft, change }
}

export function redo(session: ReadonlyScenarioSession): { session: ScenarioSession; change: ChangeRecord | null } {
  const draft = cloneSession(session)
  const change = draft.redoHistory.pop() ?? null
  if (!change) {
    return { session: draft, change: null }
  }
  draft.scenario = clonePlain(change.after.scenario)
  draft.state = clonePlain(change.after.state)
  draft.history.push(change)
  draft.lastReport = evaluateSession(draft)
  return { session: draft, change }
}

export const v6Text = {
  public: emptyPublicText,
  keeper: emptyKeeperText,
}
