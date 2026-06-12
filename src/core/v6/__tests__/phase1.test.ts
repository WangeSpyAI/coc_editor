import { describe, expect, it } from 'vitest'
import type {
  ChangeId,
  FactId,
  PcId,
  PersistedScenarioSession,
  SlotId,
} from '../types'
import {
  assignKnowledge,
  assignSlot,
  createClue,
  createEmptySession,
  createEvent,
  createFact,
  createItem,
  createNpc,
  createParty,
  createPc,
  createRevelation,
  createScene,
  evaluateConditionLinks,
  listNearlyFireableEvents,
  listFireableEvents,
  moveKnowledgeScope,
  mutateAndEvaluate,
  applyEvent,
  reconcileSession,
  redo,
  setFact,
  undo,
} from '../engine'
import type { ScenarioSession } from '../types'
import { reviveSession, serializeSession } from '../persistence'

const NOW = 1_765_584_000_000

function publicText(text: string) {
  return { visibility: 'public' as const, text }
}

function keeperText(text: string) {
  return { visibility: 'keeper' as const, text }
}

function emptySession() {
  return createEmptySession({
    id: 'scenario-v6-phase1',
    title: 'v6 phase1',
    createdAt: '2026-06-14T00:00:00.000Z',
    updatedAt: '2026-06-14T00:00:00.000Z',
  })
}

function withTwoScenes() {
  let session = emptySession()
  session = createScene(session, {
    id: 'sc-study',
    name: '書斎',
    kind: 'location',
    publicDescription: publicText('古い書斎。'),
  }).session
  session = createScene(session, {
    id: 'sc-library',
    name: '図書室',
    kind: 'location',
    publicDescription: publicText('静かな図書室。'),
  }).session
  return session
}

describe('v6 Phase 1 core model', () => {
  it('evaluates Fact condition links as AND and supports negate', () => {
    const factStates = {
      'f-open': { factId: 'f-open', isTrue: true },
      'f-dead': { factId: 'f-dead', isTrue: false },
    } satisfies Record<FactId, { factId: FactId; isTrue: boolean }>

    expect(evaluateConditionLinks(factStates, [
      { factId: 'f-open' },
      { factId: 'f-dead', negate: true },
    ])).toBe(true)

    expect(evaluateConditionLinks(factStates, [
      { factId: 'f-open' },
      { factId: 'f-dead' },
    ])).toBe(false)
  })

  it('lists fireable events by occurrence state: once fired and suppressed are excluded, repeatable fired is included', () => {
    let session = emptySession()
    const ready = createFact(session, { statement: '条件が成立している', initial: true })
    session = ready.session
    session = createEvent(session, {
      id: 'ev-once-ready',
      name: '一度だけ未発生',
      sceneIds: [],
      condition: [{ factId: ready.factId }],
      result: {},
      occurrence: { mode: 'once' },
    }).session
    session = createEvent(session, {
      id: 'ev-once-fired',
      name: '一度だけ発生済み',
      sceneIds: [],
      condition: [{ factId: ready.factId }],
      result: {},
      occurrence: { mode: 'once', initialState: 'fired' },
    }).session
    session = createEvent(session, {
      id: 'ev-suppressed',
      name: '抑止済み',
      sceneIds: [],
      condition: [{ factId: ready.factId }],
      result: {},
      occurrence: { mode: 'once', initialState: 'suppressed' },
    }).session
    session = createEvent(session, {
      id: 'ev-repeatable-fired',
      name: '反復可能発生済み',
      sceneIds: [],
      condition: [{ factId: ready.factId }],
      result: {},
      occurrence: { mode: 'repeatable', initialState: 'fired' },
    }).session

    expect(listFireableEvents(session).map((event) => event.eventId)).toEqual([
      'ev-once-ready',
      'ev-repeatable-fired',
    ])
  })

  it('lists nearly fireable events only when exactly one condition link is unmet', () => {
    let session = emptySession()
    const ready = createFact(session, { statement: '準備はできている', initial: true })
    session = ready.session
    const missing = createFact(session, { statement: '鍵を持っている', initial: false })
    session = missing.session
    const alsoMissing = createFact(session, { statement: '合言葉を知っている', initial: false })
    session = alsoMissing.session

    session = createEvent(session, {
      id: 'ev-one-short',
      name: 'あと一歩',
      sceneIds: [],
      condition: [{ factId: ready.factId }, { factId: missing.factId }],
      result: {},
      occurrence: { mode: 'once' },
    }).session
    session = createEvent(session, {
      id: 'ev-two-short',
      name: 'まだ遠い',
      sceneIds: [],
      condition: [
        { factId: ready.factId },
        { factId: missing.factId },
        { factId: alsoMissing.factId },
      ],
      result: {},
      occurrence: { mode: 'once' },
    }).session

    expect(listNearlyFireableEvents(session).map((event) => ({
      eventId: event.eventId,
      unmetFactId: event.unmetLink.factId,
    }))).toEqual([{ eventId: 'ev-one-short', unmetFactId: missing.factId }])
  })

  it('auto-generates location/disclosure slots and generated facts for Item, Clue, and NPC creation', () => {
    let session = withTwoScenes()
    session = createItem(session, {
      id: 'obj-house-key',
      name: '屋敷の鍵',
      initialLocation: { type: 'scene', id: 'sc-study' },
      initialDisclosure: 'hidden',
    }).session

    const clue = createClue(session, {
      id: 'cl-basement-smell',
      name: '地下室の臭い',
      factStatement: '地下室から腐臭がする',
      route: { from: [{ type: 'scene', id: 'sc-study' }], how: keeperText('床下を調べる。') },
      truthLinks: [],
      initialLocation: { type: 'scene', id: 'sc-library' },
      initialDisclosure: 'discoverable',
    })
    session = clue.session

    session = createNpc(session, {
      id: 'npc-knott',
      name: 'ノット',
      publicProfile: publicText('礼儀正しい家主。'),
      staticProfile: { personality: '実務的' },
      initialDynamicSlots: {
        location: { type: 'scene', id: 'sc-study' },
        intent: '鍵を渡して依頼を成立させる',
      },
    }).session

    const expectedSlots: SlotId[] = [
      'slot-obj-house-key-location',
      'slot-obj-house-key-disclosure',
      'slot-cl-basement-smell-location',
      'slot-cl-basement-smell-disclosure',
      'slot-npc-knott-location',
      'slot-npc-knott-intent',
    ]
    expect(Object.keys(session.scenario.slots).sort()).toEqual(expectedSlots.sort())

    for (const slotId of expectedSlots) {
      const factId = session.state.slotStates[slotId]?.currentFactId
      expect(factId).toBeTruthy()
      const fact = session.scenario.facts[factId as FactId]
      expect(fact.historyPolicy).toBe('generated')
      expect(fact.source?.type.startsWith('generated-')).toBe(true)
      expect(session.state.factStates[fact.id]?.isTrue).toBe(true)
    }

    expect(session.scenario.clues['cl-basement-smell'].factId).toBe(clue.factId)
    expect(session.scenario.facts[clue.factId].statement).toBe('地下室から腐臭がする')
  })

  it('assignSlot is the exclusive entrance: it retires the old fact, updates SlotState, and conditions follow the new fact', () => {
    let session = withTwoScenes()
    session = createItem(session, {
      id: 'obj-diary',
      name: '日記',
      initialLocation: { type: 'scene', id: 'sc-study' },
    }).session

    const slotId = 'slot-obj-diary-location' satisfies SlotId
    const oldFactId = session.state.slotStates[slotId].currentFactId
    expect(oldFactId).not.toBeNull()
    const previousFactId = oldFactId as FactId
    const moved = assignSlot(session, slotId, { type: 'scene', id: 'sc-library' }, { now: NOW })
    session = moved.session

    expect(session.state.factStates[previousFactId].isTrue).toBe(false)
    expect(session.state.factStates[moved.factId].isTrue).toBe(true)
    expect(session.state.slotStates[slotId].currentFactId).toBe(moved.factId)
    expect(evaluateConditionLinks(session.state.factStates, [{ factId: previousFactId }])).toBe(false)
    expect(evaluateConditionLinks(session.state.factStates, [{ factId: moved.factId }])).toBe(true)
  })

  it('records fact changes, slot changes, and event application under the same change/log changeId', () => {
    let session = withTwoScenes()
    const switchFact = createFact(session, { statement: '警報装置が解除された', initial: false })
    session = switchFact.session
    session = createItem(session, {
      id: 'obj-diary',
      name: '日記',
      initialLocation: { type: 'scene', id: 'sc-study' },
    }).session
    session = createEvent(session, {
      id: 'ev-reveal-diary',
      name: '日記が見つかる',
      sceneIds: ['sc-library'],
      condition: [{ factId: switchFact.factId }],
      publicDescription: publicText('棚の奥で日記が見つかる。'),
      result: {
        publicText: publicText('古い日記が床へ落ちる。'),
        setSlots: [{
          slotId: 'slot-obj-diary-location',
          value: { type: 'scene', id: 'sc-library' },
        }],
      },
      occurrence: { mode: 'once' },
    }).session

    const result = mutateAndEvaluate(
      session,
      '警報解除から日記イベントまで',
      (api) => {
        api.setFact(switchFact.factId, true)
        api.assignSlot('slot-obj-diary-location', { type: 'abstract', label: '移動中' })
        api.applyEvent('ev-reveal-diary')
      },
      { now: NOW },
    )

    const changeId = result.change.id
    const newLogs = result.session.state.log.filter((entry) => entry.changeId === changeId)
    expect(newLogs.map((entry) => entry.type)).toEqual(expect.arrayContaining([
      'fact-change',
      'slot-change',
      'event',
    ]))
    expect(new Set(newLogs.map((entry) => entry.changeId))).toEqual(new Set<ChangeId>([changeId]))
    expect(result.session.history.at(-1)?.id).toBe(changeId)
  })

  it('standalone setFact and applyEvent wrappers update state and logs through the transaction path', () => {
    let session = emptySession()
    const trigger = createFact(session, { statement: '地下室を開ける条件が揃った', initial: false })
    session = trigger.session
    const outcome = createFact(session, { statement: '地下室が開いた', initial: false })
    session = outcome.session
    session = createEvent(session, {
      id: 'ev-open-basement',
      name: '地下室が開く',
      sceneIds: [],
      condition: [{ factId: trigger.factId }],
      result: { setFacts: [outcome.factId] },
      occurrence: { mode: 'once' },
    }).session

    session = setFact(session, trigger.factId, true, { now: NOW }).session
    const applied = applyEvent(session, 'ev-open-basement', { now: NOW + 1 }).session

    expect(applied.state.eventStates['ev-open-basement'].occurrence).toBe('fired')
    expect(applied.state.factStates[outcome.factId].isTrue).toBe(true)
    expect(applied.state.log.map((entry) => entry.type)).toEqual(expect.arrayContaining([
      'fact-change',
      'event',
    ]))
  })

  it('MutationAPI covers revelation understanding and note promotion to a shared Fact', () => {
    let session = emptySession()
    session = createRevelation(session, {
      id: 'rev-core',
      title: '地下に何かがいる',
      summary: keeperText('探索者に理解させたい核心。'),
      order: 'core',
      clueIds: [],
    }).session

    const promotedFactIds: FactId[] = []
    const result = mutateAndEvaluate(session, 'メモを事実化して真相理解', (api) => {
      api.addLog({ type: 'note', text: keeperText('床下から音がする。') })
      const logEntryId = api.session.state.log.at(-1)?.id
      if (!logEntryId) {
        throw new Error('expected note log')
      }
      promotedFactIds.push(api.promoteLogToFact(logEntryId, '床下から音がする'))
      api.setRevelationUnderstood('rev-core', true)
    }, { now: NOW })

    const factId = promotedFactIds[0]
    expect(factId).toBeDefined()
    if (!factId) {
      throw new Error('expected promoted fact')
    }
    expect(result.session.scenario.facts[factId].source).toEqual({
      type: 'session-log',
      logEntryId: result.session.state.log[0].id,
    })
    expect(result.session.state.revelationStates['rev-core'].understood).toBe(true)
    expect(result.session.state.revelationStates['rev-core'].understoodAtChangeId).toBe(result.change.id)
  })

  it('undo restores scenario/state/log snapshots and redo reapplies them', () => {
    let session = withTwoScenes()
    session = createItem(session, {
      id: 'obj-diary',
      name: '日記',
      initialLocation: { type: 'scene', id: 'sc-study' },
    }).session
    const before = JSON.parse(JSON.stringify({ scenario: session.scenario, state: session.state }))

    const moved = assignSlot(
      session,
      'slot-obj-diary-location',
      { type: 'scene', id: 'sc-library' },
      { now: NOW },
    ).session

    const undone = undo(moved).session
    expect({ scenario: undone.scenario, state: undone.state }).toEqual(before)

    const redone = redo(undone).session
    expect({ scenario: redone.scenario, state: redone.state }).toEqual({
      scenario: moved.scenario,
      state: moved.state,
    })
  })

  it('reconcileSession is the deletion chokepoint for dangling fact references', () => {
    let session = withTwoScenes()
    const fact = createFact(session, {
      statement: '書斎の手がかりが残っている',
      initial: true,
      links: [{ type: 'scene', id: 'sc-study' }],
    })
    session = fact.session
    session.scenario.scenes['sc-study'].projectionLinks.push({ type: 'fact', id: fact.factId })

    const broken = JSON.parse(JSON.stringify(session)) as ScenarioSession
    delete broken.scenario.facts[fact.factId]

    const reconciled = reconcileSession(broken)

    expect(reconciled.state.factStates[fact.factId]).toBeUndefined()
    expect(reconciled.scenario.scenes['sc-study'].projectionLinks).toEqual([])
  })

  it('keeps Fact IDs generated by constructors and moves party/PC knowledge by shared reference without duplicating Facts', () => {
    let session = emptySession()
    session = createPc(session, { id: 'pc-akira', name: '明' }).session
    session = createParty(session, {
      id: 'party-default',
      name: '探索者たち',
      memberIds: ['pc-akira' satisfies PcId],
    }).session

    const knowledge = createFact(session, { statement: '探索者は地下室の存在を知った', initial: false })
    session = assignKnowledge(knowledge.session, {
      scope: 'party',
      targetId: 'party-default',
      factId: knowledge.factId,
    }).session

    expect(knowledge.factId).toMatch(/^f-/)
    expect(session.state.partyStates['party-default'].knowledgeFactIds).toEqual([knowledge.factId])

    session = moveKnowledgeScope(session, {
      factId: knowledge.factId,
      from: { scope: 'party', targetId: 'party-default' },
      to: { scope: 'pc', targetId: 'pc-akira' },
    }).session

    expect(session.state.partyStates['party-default'].knowledgeFactIds).toEqual([])
    expect(session.state.pcStates['pc-akira'].knowledgeFactIds).toEqual([knowledge.factId])
    expect(Object.values(session.scenario.facts).filter((fact) => (
      fact.statement === '探索者は地下室の存在を知った'
    ))).toHaveLength(1)
  })
})

describe('v6 Phase 1 persistence', () => {
  it('round-trips a session and strictly rejects wrong format, missing records, and missing generated slots', () => {
    let session = withTwoScenes()
    session = createItem(session, {
      id: 'obj-house-key',
      name: '屋敷の鍵',
      initialLocation: { type: 'scene', id: 'sc-study' },
      initialDisclosure: 'hidden',
    }).session

    const persisted = serializeSession(session)
    const revived = reviveSession(JSON.parse(JSON.stringify(persisted)) as PersistedScenarioSession)

    expect(revived.scenario).toEqual(session.scenario)
    expect(revived.state).toEqual(session.state)
    expect(revived.history).toEqual(session.history)
    expect(revived.lastReport.fireableEvents).toEqual([])

    expect(() => reviveSession({
      ...persisted,
      format: 'trpg-scenario-editor-v5-session',
    } as unknown as PersistedScenarioSession)).toThrow(/format/)

    const missingFacts = JSON.parse(JSON.stringify(persisted)) as PersistedScenarioSession
    delete (missingFacts.scenario as Partial<typeof missingFacts.scenario>).facts
    expect(() => reviveSession(missingFacts)).toThrow(/scenario\.facts/)

    const missingGeneratedSlot = JSON.parse(JSON.stringify(persisted)) as PersistedScenarioSession
    delete missingGeneratedSlot.scenario.slots['slot-obj-house-key-location']
    expect(() => reviveSession(missingGeneratedSlot)).toThrow(/generated slot/)
  })
})
