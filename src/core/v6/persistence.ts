import type {
  EventId,
  FactId,
  PartyId,
  PcId,
  PersistedScenarioSession,
  ReadonlyScenarioSession,
  RevelationId,
  ScenarioSession,
  SlotId,
} from './types'
import { evaluateSession } from './engine'

export const SESSION_FORMAT = 'trpg-scenario-editor-v6-session'
export const SESSION_FORMAT_VERSION = 1
export const SCENARIO_FORMAT = 'trpg-scenario-editor-v6'
export const SCENARIO_FORMAT_VERSION = 1

function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function requirePlainRecord(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (!isPlainRecord(value)) {
    throw new Error(`${path} is required as a plain record`)
  }
}

function requireArray(value: unknown, path: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} is required as an array`)
  }
}

function requirePropertyRecord(parent: Record<string, unknown>, key: string, path: string): void {
  requirePlainRecord(parent[key], `${path}.${key}`)
}

function slotIdFor(ownerId: string, suffix: string): SlotId {
  return `slot-${ownerId}-${suffix}` as SlotId
}

function assertEnvelope(data: unknown): asserts data is PersistedScenarioSession {
  requirePlainRecord(data, 'session')
  if (data.format !== SESSION_FORMAT) {
    throw new Error(`Unsupported session format: ${String(data.format)}`)
  }
  if (data.formatVersion !== SESSION_FORMAT_VERSION) {
    throw new Error(`Unsupported session formatVersion: ${String(data.formatVersion)}`)
  }

  requirePlainRecord(data.scenario, 'scenario')
  requirePlainRecord(data.state, 'state')
  requireArray(data.history, 'history')

  if (data.scenario.format !== SCENARIO_FORMAT) {
    throw new Error(`Unsupported scenario format: ${String(data.scenario.format)}`)
  }
  if (data.scenario.formatVersion !== SCENARIO_FORMAT_VERSION) {
    throw new Error(`Unsupported scenario formatVersion: ${String(data.scenario.formatVersion)}`)
  }

  for (const key of [
    'scenes',
    'npcs',
    'items',
    'clues',
    'facts',
    'slots',
    'revelations',
    'events',
    'pcs',
    'parties',
  ]) {
    requirePropertyRecord(data.scenario, key, 'scenario')
  }

  for (const key of [
    'factStates',
    'slotStates',
    'revelationStates',
    'eventStates',
    'pcStates',
    'partyStates',
  ]) {
    requirePropertyRecord(data.state, key, 'state')
  }
  requireArray(data.state.log, 'state.log')
}

function requireGeneratedSlot(session: ScenarioSession, slotId: SlotId): void {
  const slot = session.scenario.slots[slotId]
  if (!slot) {
    throw new Error(`missing generated slot: ${slotId}`)
  }
  if (!slot.generated) {
    throw new Error(`expected generated slot: ${slotId}`)
  }
  const slotState = session.state.slotStates[slotId]
  if (!slotState) {
    throw new Error(`missing generated slot state: ${slotId}`)
  }
  if (!slotState.currentFactId) {
    throw new Error(`missing generated slot current fact: ${slotId}`)
  }
  const fact = session.scenario.facts[slotState.currentFactId]
  if (!fact) {
    throw new Error(`missing generated fact: ${slotState.currentFactId}`)
  }
  if (!session.state.factStates[slotState.currentFactId]) {
    throw new Error(`missing generated fact state: ${slotState.currentFactId}`)
  }
  if (fact.historyPolicy !== 'generated') {
    throw new Error(`expected generated fact historyPolicy: ${slotState.currentFactId}`)
  }
  if (!slot.values.some((value) => value.factId === slotState.currentFactId)) {
    throw new Error(`generated slot current fact is not registered as a value: ${slotId}`)
  }
}

function validateRecordEntries(session: ScenarioSession): void {
  for (const factId of Object.keys(session.scenario.facts) as FactId[]) {
    if (!session.state.factStates[factId]) {
      throw new Error(`missing FactState for fact: ${factId}`)
    }
  }
  for (const slotId of Object.keys(session.scenario.slots) as SlotId[]) {
    const slot = session.scenario.slots[slotId]
    if (!session.state.slotStates[slotId]) {
      throw new Error(`missing SlotState for slot: ${slotId}`)
    }
    for (const value of slot.values) {
      if (!session.scenario.facts[value.factId]) {
        throw new Error(`missing generated fact: ${value.factId}`)
      }
      if (!session.state.factStates[value.factId]) {
        throw new Error(`missing generated fact state: ${value.factId}`)
      }
    }
  }
  for (const eventId of Object.keys(session.scenario.events) as EventId[]) {
    if (!session.state.eventStates[eventId]) {
      throw new Error(`missing EventState for event: ${eventId}`)
    }
  }
  for (const revelationId of Object.keys(session.scenario.revelations) as RevelationId[]) {
    if (!session.state.revelationStates[revelationId]) {
      throw new Error(`missing RevelationState for revelation: ${revelationId}`)
    }
  }
  for (const pcId of Object.keys(session.scenario.pcs) as PcId[]) {
    if (!session.state.pcStates[pcId]) {
      throw new Error(`missing PcState for pc: ${pcId}`)
    }
  }
  for (const partyId of Object.keys(session.scenario.parties) as PartyId[]) {
    if (!session.state.partyStates[partyId]) {
      throw new Error(`missing PartyState for party: ${partyId}`)
    }
  }
}

function validateGeneratedAuthoringData(session: ScenarioSession): void {
  for (const item of Object.values(session.scenario.items)) {
    if (item.initialLocation) {
      requireGeneratedSlot(session, slotIdFor(item.id, 'location'))
    }
    if (item.initialDisclosure) {
      requireGeneratedSlot(session, slotIdFor(item.id, 'disclosure'))
    }
  }
  for (const clue of Object.values(session.scenario.clues)) {
    if (!session.scenario.facts[clue.factId]) {
      throw new Error(`missing clue fact: ${clue.factId}`)
    }
    if (clue.initialLocation) {
      requireGeneratedSlot(session, slotIdFor(clue.id, 'location'))
    }
    if (clue.initialDisclosure) {
      requireGeneratedSlot(session, slotIdFor(clue.id, 'disclosure'))
    }
  }
  for (const npc of Object.values(session.scenario.npcs)) {
    const initial = npc.initialDynamicSlots
    if (initial?.location) {
      requireGeneratedSlot(session, slotIdFor(npc.id, 'location'))
    }
    if (initial?.intent) {
      requireGeneratedSlot(session, slotIdFor(npc.id, 'intent'))
    }
    if (initial?.fear) {
      requireGeneratedSlot(session, slotIdFor(npc.id, 'fear'))
    }
    if (initial?.emotion) {
      requireGeneratedSlot(session, slotIdFor(npc.id, 'emotion'))
    }
  }
}

export function serializeSession(session: ReadonlyScenarioSession): PersistedScenarioSession {
  return clonePlain({
    format: SESSION_FORMAT,
    formatVersion: SESSION_FORMAT_VERSION,
    scenario: session.scenario,
    state: session.state,
    history: session.history,
  }) as PersistedScenarioSession
}

export function reviveSession(data: unknown): ScenarioSession {
  assertEnvelope(data)
  const session: ScenarioSession = {
    scenario: clonePlain(data.scenario) as ScenarioSession['scenario'],
    state: clonePlain(data.state) as ScenarioSession['state'],
    history: clonePlain(data.history) as ScenarioSession['history'],
    redoHistory: [],
    lastReport: {
      fireableEvents: [],
      nearlyFireableEvents: [],
      changedRevelationProjections: [],
    },
  }
  validateRecordEntries(session)
  validateGeneratedAuthoringData(session)
  session.lastReport = evaluateSession(session)
  return session
}
