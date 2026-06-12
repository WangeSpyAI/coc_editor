import type {
  Clue,
  ClueId,
  ClueRoute,
  ConditionalEvent,
  DisclosureValue,
  EntityId,
  EventId,
  Fact,
  FactId,
  Item,
  ItemId,
  KeeperText,
  LinkedRef,
  Npc,
  NpcId,
  ProjectionLink,
  PublicText,
  ReadonlyDeep,
  ReadonlyScenarioSession,
  Revelation,
  RevelationId,
  Scene,
  SceneExit,
  SceneId,
  SlotId,
  SlotValue,
  SlotValueTarget,
} from './types'
import { evaluateConditionLinks, listFireableEvents } from './engine'

type ReadonlyView<T> = ReadonlyDeep<T>

export interface ResolvedSlotTarget {
  target: SlotValueTarget
  label: string
  slotId: SlotId
  factId: FactId
}

export interface ResolvedSlotString {
  label: string
  slotId: SlotId
  factId: FactId
}

export interface ItemProjection {
  kind: 'item' | 'clue'
  entity: ReadonlyView<Item> | ReadonlyView<Clue>
  location: ResolvedSlotTarget | null
  disclosure: DisclosureValue | null
  truthLinks: readonly RevelationId[]
  clueFact?: ReadonlyView<Fact>
  route?: ReadonlyView<ClueRoute>
}

export interface NpcProjection {
  npc: ReadonlyView<Npc>
  location: ResolvedSlotTarget | null
  intent: ResolvedSlotString | null
  fear: ResolvedSlotString | null
  emotion: ResolvedSlotString | null
  knowledgeFacts: ReadonlyView<Fact>[]
}

export interface SceneExitProjection {
  exit: ReadonlyView<SceneExit>
  toScene: ReadonlyView<Scene> | null
  available: boolean
}

export interface SceneEventProjection {
  event: ReadonlyView<ConditionalEvent>
  fireable: boolean
  reason: ReadonlyView<ConditionalEvent>['condition']
}

export interface SceneProjection {
  scene: ReadonlyView<Scene>
  description: ReadonlyView<PublicText>[]
  activeDescriptionVariantIds: string[]
  keeperNotes: readonly ReadonlyView<KeeperText>[]
  npcs: NpcProjection[]
  items: ItemProjection[]
  clues: ItemProjection[]
  events: SceneEventProjection[]
  fireableEvents: SceneEventProjection[]
  exits: SceneExitProjection[]
  facts: ReadonlyView<Fact>[]
  revelations: ReadonlyView<Revelation>[]
  projectionLinks: readonly ReadonlyView<ProjectionLink>[]
}

export interface RevelationProjectionView {
  revelation: ReadonlyView<Revelation>
  understood: boolean
  discoveredClues: ClueId[]
  undiscoveredClues: ClueId[]
  availableRoutes: ReadonlyView<ClueRoute>[]
  missingFacts: FactId[]
}

export interface SearchResult {
  ref: LinkedRef
  title: string
  snippet: string
  matchKind: 'name' | 'public-text' | 'keeper-text' | 'fact' | 'current-value'
}

type SlotKind = ReadonlyScenarioSession['scenario']['slots'][SlotId]['kind']

const DISCLOSURE_VALUES: readonly DisclosureValue[] = [
  'hidden',
  'undiscovered',
  'discoverable',
  'discovered',
  'explained',
  'public',
]

const MATCH_SCORE: Record<SearchResult['matchKind'], number> = {
  'current-value': 5,
  name: 4,
  fact: 3,
  'public-text': 2,
  'keeper-text': 1,
}

function uniqueIds<T extends string>(ids: readonly T[]): T[] {
  return Array.from(new Set(ids))
}

function slotByOwner(
  session: ReadonlyScenarioSession,
  ownerId: EntityId,
  kind: SlotKind,
) {
  return Object.values(session.scenario.slots).find((slot) => (
    slot.owner.id === ownerId && slot.kind === kind
  ))
}

function currentSlotValue(
  session: ReadonlyScenarioSession,
  ownerId: EntityId,
  kind: SlotKind,
): { slotId: SlotId; value: SlotValue } | null {
  const slot = slotByOwner(session, ownerId, kind)
  if (!slot) {
    return null
  }
  const currentFactId = session.state.slotStates[slot.id]?.currentFactId ?? slot.currentFactId ?? null
  if (!currentFactId) {
    return null
  }
  const value = slot.values.find((candidate) => candidate.factId === currentFactId)
  if (!value) {
    return null
  }
  return { slotId: slot.id, value }
}

function isDisclosureValue(value: string): value is DisclosureValue {
  return DISCLOSURE_VALUES.includes(value as DisclosureValue)
}

function targetLabel(session: ReadonlyScenarioSession, target: SlotValueTarget): string {
  switch (target.type) {
    case 'scene':
      return session.scenario.scenes[target.id]?.name ?? target.id
    case 'npc':
      return session.scenario.npcs[target.id]?.name ?? target.id
    case 'pc':
      return session.scenario.pcs[target.id]?.name ?? target.id
    case 'party':
      return session.scenario.parties[target.id]?.name ?? target.id
    case 'abstract':
      return target.label
    default: {
      const exhaustive: never = target
      throw new Error(`Unknown slot target: ${JSON.stringify(exhaustive)}`)
    }
  }
}

function entityTitle(session: ReadonlyScenarioSession, ref: LinkedRef): string {
  switch (ref.type) {
    case 'scene':
      return session.scenario.scenes[ref.id as SceneId]?.name ?? ref.id
    case 'npc':
      return session.scenario.npcs[ref.id as NpcId]?.name ?? ref.id
    case 'item':
      return session.scenario.items[ref.id as ItemId]?.name ?? ref.id
    case 'clue':
      return session.scenario.clues[ref.id as ClueId]?.name ?? ref.id
    case 'fact':
      return session.scenario.facts[ref.id as FactId]?.statement ?? ref.id
    case 'revelation':
      return session.scenario.revelations[ref.id as RevelationId]?.title ?? ref.id
    case 'event':
      return session.scenario.events[ref.id as EventId]?.name ?? ref.id
    case 'pc':
      return session.scenario.pcs[ref.id as keyof typeof session.scenario.pcs]?.name ?? ref.id
    case 'party':
      return session.scenario.parties[ref.id as keyof typeof session.scenario.parties]?.name ?? ref.id
    default: {
      const exhaustive: never = ref.type
      throw new Error(`Unknown linked ref type: ${exhaustive}`)
    }
  }
}

function resolveLocation(
  session: ReadonlyScenarioSession,
  id: EntityId,
): ResolvedSlotTarget | null {
  const current = currentSlotValue(session, id, 'location')
  if (!current?.value.target) {
    return null
  }
  return {
    target: current.value.target,
    label: targetLabel(session, current.value.target),
    slotId: current.slotId,
    factId: current.value.factId,
  }
}

function resolveStringSlot(
  session: ReadonlyScenarioSession,
  id: EntityId,
  kind: SlotKind,
): ResolvedSlotString | null {
  const current = currentSlotValue(session, id, kind)
  if (!current) {
    return null
  }
  return {
    label: current.value.label,
    slotId: current.slotId,
    factId: current.value.factId,
  }
}

function factIsTrue(session: ReadonlyScenarioSession, factId: FactId): boolean {
  return session.state.factStates[factId]?.isTrue ?? session.scenario.facts[factId]?.initial ?? false
}

function linkedFactIds(session: ReadonlyScenarioSession, id: EntityId): FactId[] {
  return Object.values(session.scenario.facts)
    .filter((fact) => fact.links?.some((link) => link.id === id))
    .map((fact) => fact.id)
}

function isAtScene(
  session: ReadonlyScenarioSession,
  id: EntityId,
  sceneId: SceneId,
): boolean {
  const location = findCurrentLocation(session, id)
  return location?.type === 'scene' && location.id === sceneId
}

function explicitIds(
  links: readonly ReadonlyView<ProjectionLink>[],
  type: ProjectionLink['type'],
): EntityId[] {
  return links.filter((link) => link.type === type).map((link) => link.id)
}

function sceneEntityIds(session: ReadonlyScenarioSession, scene: ReadonlyView<Scene>) {
  const explicitNpcIds = explicitIds(scene.projectionLinks, 'npc') as NpcId[]
  const explicitItemIds = explicitIds(scene.projectionLinks, 'item') as ItemId[]
  const explicitClueIds = explicitIds(scene.projectionLinks, 'clue') as ClueId[]

  return {
    npcIds: uniqueIds([
      ...Object.keys(session.scenario.npcs).filter((id) => isAtScene(session, id as NpcId, scene.id)) as NpcId[],
      ...explicitNpcIds,
    ]),
    itemIds: uniqueIds([
      ...Object.keys(session.scenario.items).filter((id) => isAtScene(session, id as ItemId, scene.id)) as ItemId[],
      ...explicitItemIds,
    ]),
    clueIds: uniqueIds([
      ...Object.keys(session.scenario.clues).filter((id) => isAtScene(session, id as ClueId, scene.id)) as ClueId[],
      ...explicitClueIds,
    ]),
  }
}

function sortByScenarioOrder<T extends EntityId>(
  ids: readonly T[],
  order: readonly string[],
): T[] {
  const orderMap = new Map(order.map((id, index) => [id, index]))
  return [...ids].sort((a, b) => (orderMap.get(a) ?? Number.MAX_SAFE_INTEGER) - (
    orderMap.get(b) ?? Number.MAX_SAFE_INTEGER
  ))
}

export function findCurrentLocation(
  session: ReadonlyScenarioSession,
  id: EntityId,
): SlotValueTarget | null {
  return resolveLocation(session, id)?.target ?? null
}

export function findCurrentDisclosure(
  session: ReadonlyScenarioSession,
  id: ItemId | ClueId,
): DisclosureValue | null {
  const current = currentSlotValue(session, id, 'disclosure')
  if (!current || !isDisclosureValue(current.value.label)) {
    return null
  }
  return current.value.label
}

export function projectItemRow(
  session: ReadonlyScenarioSession,
  id: ItemId | ClueId,
): ItemProjection {
  const item = session.scenario.items[id as ItemId]
  if (item) {
    return {
      kind: 'item',
      entity: item,
      location: resolveLocation(session, id),
      disclosure: findCurrentDisclosure(session, id),
      truthLinks: item.truthLinks ?? [],
    }
  }

  const clue = session.scenario.clues[id as ClueId]
  if (!clue) {
    throw new Error(`Item or clue not found: ${id}`)
  }
  return {
    kind: 'clue',
    entity: clue,
    location: resolveLocation(session, id),
    disclosure: findCurrentDisclosure(session, id),
    truthLinks: clue.truthLinks,
    clueFact: session.scenario.facts[clue.factId],
    route: clue.route,
  }
}

export function projectNpcCard(
  session: ReadonlyScenarioSession,
  npcId: NpcId,
): NpcProjection {
  const npc = session.scenario.npcs[npcId]
  if (!npc) {
    throw new Error(`NPC not found: ${npcId}`)
  }
  const initialKnowledgeFactIds = npc.initialDynamicSlots?.knowledgeFactIds ?? []
  const linkedKnowledgeFactIds = linkedFactIds(session, npcId)
    .filter((factId) => !session.scenario.facts[factId]?.slot)
  const knowledgeFactIds = uniqueIds([...initialKnowledgeFactIds, ...linkedKnowledgeFactIds])

  return {
    npc,
    location: resolveLocation(session, npcId),
    intent: resolveStringSlot(session, npcId, 'npc-intent'),
    fear: resolveStringSlot(session, npcId, 'npc-fear'),
    emotion: resolveStringSlot(session, npcId, 'npc-emotion'),
    knowledgeFacts: knowledgeFactIds
      .map((factId) => session.scenario.facts[factId])
      .filter((fact): fact is ReadonlyView<Fact> => fact !== undefined),
  }
}

export function projectRevelation(
  session: ReadonlyScenarioSession,
  revelationId: RevelationId,
): RevelationProjectionView {
  const revelation = session.scenario.revelations[revelationId]
  if (!revelation) {
    throw new Error(`Revelation not found: ${revelationId}`)
  }

  const discoveredClues: ClueId[] = []
  const undiscoveredClues: ClueId[] = []
  for (const clueId of revelation.clueIds) {
    const clue = session.scenario.clues[clueId]
    if (!clue) {
      continue
    }
    const disclosure = findCurrentDisclosure(session, clueId)
    const discovered = factIsTrue(session, clue.factId)
      || disclosure === 'discovered'
      || disclosure === 'explained'
      || disclosure === 'public'
    if (discovered) {
      discoveredClues.push(clueId)
    } else {
      undiscoveredClues.push(clueId)
    }
  }

  const requiredFactIds = revelation.requiredFactIds ?? []
  const clueFactIds = revelation.clueIds
    .map((clueId) => session.scenario.clues[clueId]?.factId)
    .filter((factId): factId is FactId => factId !== undefined)
  const missingFacts = uniqueIds([...requiredFactIds, ...clueFactIds])
    .filter((factId) => !factIsTrue(session, factId))

  return {
    revelation,
    understood: session.state.revelationStates[revelationId]?.understood
      ?? revelation.understoodInitially
      ?? false,
    discoveredClues,
    undiscoveredClues,
    availableRoutes: undiscoveredClues
      .map((clueId) => session.scenario.clues[clueId]?.route)
      .filter((route): route is ReadonlyView<ClueRoute> => route !== undefined),
    missingFacts,
  }
}

export function projectScene(
  session: ReadonlyScenarioSession,
  sceneId: SceneId,
): SceneProjection {
  const scene = session.scenario.scenes[sceneId]
  if (!scene) {
    throw new Error(`Scene not found: ${sceneId}`)
  }

  const activeVariants = (scene.descriptionVariants ?? [])
    .filter((variant) => evaluateConditionLinks(session.state.factStates, variant.when))
  const { npcIds, itemIds, clueIds } = sceneEntityIds(session, scene)
  const eventIds = uniqueIds([
    ...Object.values(session.scenario.events)
      .filter((event) => event.sceneIds.includes(sceneId))
      .map((event) => event.id),
    ...(explicitIds(scene.projectionLinks, 'event') as EventId[]),
  ])
  const fireableById = new Map(
    listFireableEvents(session)
      .filter((event) => event.sceneIds.includes(sceneId) || eventIds.includes(event.eventId))
      .map((event) => [event.eventId, event]),
  )

  const relatedRevelationIds = uniqueIds([
    ...(explicitIds(scene.projectionLinks, 'revelation') as RevelationId[]),
    ...itemIds.flatMap((id) => session.scenario.items[id]?.truthLinks ?? []),
    ...clueIds.flatMap((id) => session.scenario.clues[id]?.truthLinks ?? []),
    ...clueIds.flatMap((id) => (
      Object.values(session.scenario.revelations)
        .filter((revelation) => revelation.clueIds.includes(id))
        .map((revelation) => revelation.id)
    )),
    ...Object.values(session.scenario.facts)
      .filter((fact) => fact.links?.some((link) => link.id === sceneId))
      .flatMap((fact) => fact.links ?? [])
      .filter((link) => link.type === 'revelation')
      .map((link) => link.id as RevelationId),
  ])

  return {
    scene,
    description: [scene.publicDescription, ...activeVariants.map((variant) => variant.text)],
    activeDescriptionVariantIds: activeVariants.map((variant) => variant.id),
    keeperNotes: scene.keeperNotes,
    npcs: sortByScenarioOrder(npcIds, Object.keys(session.scenario.npcs))
      .map((id) => projectNpcCard(session, id)),
    items: sortByScenarioOrder(itemIds, Object.keys(session.scenario.items))
      .map((id) => projectItemRow(session, id)),
    clues: sortByScenarioOrder(clueIds, Object.keys(session.scenario.clues))
      .map((id) => projectItemRow(session, id)),
    events: eventIds
      .map((id) => session.scenario.events[id])
      .filter((event): event is ReadonlyView<ConditionalEvent> => event !== undefined)
      .map((event) => ({
        event,
        fireable: fireableById.has(event.id),
        reason: fireableById.get(event.id)?.reason ?? event.condition,
      })),
    fireableEvents: eventIds
      .filter((id) => fireableById.has(id))
      .flatMap((id): SceneEventProjection[] => {
        const event = session.scenario.events[id]
        const fireable = fireableById.get(id)
        if (!event || !fireable) {
          return []
        }
        return [{ event, fireable: true, reason: fireable.reason }]
      }),
    exits: scene.exits.map((exit) => ({
      exit,
      toScene: session.scenario.scenes[exit.toSceneId] ?? null,
      available: exit.condition ? evaluateConditionLinks(session.state.factStates, exit.condition) : true,
    })),
    facts: (explicitIds(scene.projectionLinks, 'fact') as FactId[])
      .map((id) => session.scenario.facts[id])
      .filter((fact): fact is ReadonlyView<Fact> => fact !== undefined),
    revelations: sortByScenarioOrder(relatedRevelationIds, Object.keys(session.scenario.revelations))
      .map((id) => session.scenario.revelations[id])
      .filter((revelation): revelation is ReadonlyView<Revelation> => revelation !== undefined),
    projectionLinks: scene.projectionLinks,
  }
}

function normalizeSearchText(value: string): string {
  return value.toLocaleLowerCase()
}

function queryTerms(query: string): string[] {
  const normalized = normalizeSearchText(query)
    .replace(/[?？!！。、,.・:：;；()[\]「」『』"'`]/g, ' ')
  const terms = normalized
    .split(/[\sはをがにのでへと]+/u)
    .map((term) => term.trim())
    .filter((term) => term.length > 0)
    .filter((term) => ![
      'どこ',
      'どこか',
      '誰',
      'だれ',
      '何',
      'なに',
      'どれ',
      'どの',
      'どちら',
      'ある',
      'いる',
      'です',
      'ます',
      '持っている',
      '持つ',
      '知っている',
      '知る',
    ].includes(term))
  return terms.length > 0 ? uniqueIds(terms) : [normalized.trim()].filter(Boolean)
}

function matchedTerm(text: string, terms: readonly string[]): string | null {
  const normalized = normalizeSearchText(text)
  return terms.find((term) => normalized.includes(term)) ?? null
}

function snippet(text: string, term: string | null): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!term) {
    return clean.slice(0, 120)
  }
  const index = normalizeSearchText(clean).indexOf(term)
  if (index === -1 || clean.length <= 120) {
    return clean.slice(0, 120)
  }
  const start = Math.max(0, index - 30)
  const end = Math.min(clean.length, index + term.length + 90)
  return `${start > 0 ? '...' : ''}${clean.slice(start, end)}${end < clean.length ? '...' : ''}`
}

function addSearchCandidate(
  results: SearchResult[],
  terms: readonly string[],
  ref: LinkedRef,
  title: string,
  text: string | undefined,
  matchKind: SearchResult['matchKind'],
): void {
  if (!text) {
    return
  }
  const term = matchedTerm(text, terms)
  if (!term) {
    return
  }
  results.push({
    ref,
    title,
    snippet: snippet(text, term),
    matchKind,
  })
}

function addTextBlocks(
  results: SearchResult[],
  terms: readonly string[],
  ref: LinkedRef,
  title: string,
  blocks: readonly (PublicText | KeeperText | undefined)[],
): void {
  for (const block of blocks) {
    if (!block) {
      continue
    }
    addSearchCandidate(
      results,
      terms,
      ref,
      title,
      block.text,
      block.visibility === 'public' ? 'public-text' : 'keeper-text',
    )
  }
}

function currentValueSearchRows(session: ReadonlyScenarioSession): SearchResult[] {
  const rows: SearchResult[] = []
  for (const itemId of Object.keys(session.scenario.items) as ItemId[]) {
    const row = projectItemRow(session, itemId)
    rows.push({
      ref: { type: 'item', id: itemId },
      title: row.entity.name,
      snippet: `${row.entity.name} の所在: ${row.location?.label ?? '不明'}。開示状態: ${row.disclosure ?? '不明'}。`,
      matchKind: 'current-value',
    })
  }
  for (const clueId of Object.keys(session.scenario.clues) as ClueId[]) {
    const row = projectItemRow(session, clueId)
    rows.push({
      ref: { type: 'clue', id: clueId },
      title: row.entity.name,
      snippet: `${row.entity.name} の所在: ${row.location?.label ?? '不明'}。開示状態: ${row.disclosure ?? '不明'}。${row.clueFact?.statement ?? ''}`,
      matchKind: 'current-value',
    })
  }
  for (const npcId of Object.keys(session.scenario.npcs) as NpcId[]) {
    const card = projectNpcCard(session, npcId)
    rows.push({
      ref: { type: 'npc', id: npcId },
      title: card.npc.name,
      snippet: [
        `${card.npc.name} の現在地: ${card.location?.label ?? '不明'}`,
        `意図: ${card.intent?.label ?? '不明'}`,
        `恐れ: ${card.fear?.label ?? '不明'}`,
        `感情: ${card.emotion?.label ?? '不明'}`,
        `知っている: ${card.knowledgeFacts.map((fact) => fact.statement).join(' / ') || 'なし'}`,
      ].join('。'),
      matchKind: 'current-value',
    })
  }
  return rows
}

export function searchScenario(
  session: ReadonlyScenarioSession,
  query: string,
): SearchResult[] {
  const terms = queryTerms(query)
  const results: SearchResult[] = []

  for (const scene of Object.values(session.scenario.scenes)) {
    const ref: LinkedRef = { type: 'scene', id: scene.id }
    addSearchCandidate(results, terms, ref, scene.name, scene.name, 'name')
    addTextBlocks(results, terms, ref, scene.name, [
      scene.publicDescription,
      ...(scene.descriptionVariants ?? []).map((variant) => variant.text),
      ...scene.keeperNotes,
      ...scene.exits.map((exit) => exit.keeperNote),
    ])
  }
  for (const npc of Object.values(session.scenario.npcs)) {
    const ref: LinkedRef = { type: 'npc', id: npc.id }
    addSearchCandidate(results, terms, ref, npc.name, npc.name, 'name')
    addTextBlocks(results, terms, ref, npc.name, [npc.publicProfile, npc.keeperSecret])
    addSearchCandidate(
      results,
      terms,
      ref,
      npc.name,
      [
        npc.staticProfile.personality,
        npc.staticProfile.motivation,
        npc.staticProfile.voice,
        npc.staticProfile.appearance,
        ...(npc.staticProfile.tags ?? []),
        ...Object.values(npc.staticProfile.stats ?? {}).map(String),
      ].filter(Boolean).join(' '),
      'keeper-text',
    )
  }
  for (const item of Object.values(session.scenario.items)) {
    const ref: LinkedRef = { type: 'item', id: item.id }
    addSearchCandidate(results, terms, ref, item.name, item.name, 'name')
    addTextBlocks(results, terms, ref, item.name, [item.publicDescription, ...(item.keeperNotes ?? [])])
  }
  for (const clue of Object.values(session.scenario.clues)) {
    const ref: LinkedRef = { type: 'clue', id: clue.id }
    addSearchCandidate(results, terms, ref, clue.name, clue.name, 'name')
    addTextBlocks(results, terms, ref, clue.name, [
      clue.publicDescription,
      ...(clue.keeperNotes ?? []),
      clue.route.how,
      clue.route.fallback,
    ])
  }
  for (const fact of Object.values(session.scenario.facts)) {
    addSearchCandidate(
      results,
      terms,
      { type: 'fact', id: fact.id },
      fact.statement,
      fact.statement,
      'fact',
    )
  }
  for (const revelation of Object.values(session.scenario.revelations)) {
    const ref: LinkedRef = { type: 'revelation', id: revelation.id }
    addSearchCandidate(results, terms, ref, revelation.title, revelation.title, 'name')
    addTextBlocks(results, terms, ref, revelation.title, [
      revelation.summary,
      revelation.understandingGuide,
    ])
  }
  for (const event of Object.values(session.scenario.events)) {
    const ref: LinkedRef = { type: 'event', id: event.id }
    addSearchCandidate(results, terms, ref, event.name, event.name, 'name')
    addTextBlocks(results, terms, ref, event.name, [
      event.publicDescription,
      event.result.publicText,
      event.result.keeperText,
      ...(event.keeperNotes ?? []),
    ])
  }

  for (const row of currentValueSearchRows(session)) {
    addSearchCandidate(results, terms, row.ref, row.title, row.snippet, 'current-value')
  }

  const seen = new Set<string>()
  return results
    .filter((result) => {
      const key = `${result.ref.type}:${result.ref.id}:${result.matchKind}:${result.snippet}`
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
    .sort((a, b) => {
      const score = MATCH_SCORE[b.matchKind] - MATCH_SCORE[a.matchKind]
      if (score !== 0) {
        return score
      }
      const aTitleMatch = matchedTerm(a.title, terms) ? 1 : 0
      const bTitleMatch = matchedTerm(b.title, terms) ? 1 : 0
      if (aTitleMatch !== bTitleMatch) {
        return bTitleMatch - aTitleMatch
      }
      return entityTitle(session, a.ref).localeCompare(entityTitle(session, b.ref), 'ja')
    })
}
