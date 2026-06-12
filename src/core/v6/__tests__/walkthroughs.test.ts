import { describe, expect, it } from 'vitest'
import type { Fact, FactId, ScenarioSession } from '../types'
import {
  assignKnowledge,
  assignSlot,
  createFact,
  createParty,
  createPc,
  mutateAndEvaluate,
  moveKnowledgeScope,
  redo,
  undo,
} from '../engine'
import { projectItemRow, projectNpcCard, projectScene } from '../queries'
import { buildMiniScenario } from './fixtures/mini-scenario'

function snapshot(session: ScenarioSession) {
  return JSON.parse(JSON.stringify({
    scenario: session.scenario,
    state: session.state,
  }))
}

function authorFacts(session: ScenarioSession): Fact[] {
  return Object.values(session.scenario.facts).filter((fact) => fact.historyPolicy !== 'generated')
}

function withInvestigatorParty(session: ScenarioSession): ScenarioSession {
  let next = createPc(session, { id: 'pc-mika', name: '美香' }).session
  next = createPc(next, { id: 'pc-ren', name: '蓮' }).session
  return createParty(next, {
    id: 'party-investigators',
    name: '探索者たち',
    memberIds: ['pc-mika', 'pc-ren'],
  }).session
}

describe('v6 Phase 4 operation walkthroughs', () => {
  it('skips the request and steals the key by changing only the location slot', () => {
    const session = withInvestigatorParty(buildMiniScenario().session)
    const beforeAuthorFacts = authorFacts(session).map((fact) => [fact.id, session.state.factStates[fact.id]?.isTrue])

    const stolen = assignSlot(
      session,
      'slot-obj-iron-key-location',
      { type: 'party', id: 'party-investigators' },
    )

    const key = projectItemRow(stolen.session, 'obj-iron-key')
    expect(key.location?.target).toEqual({ type: 'party', id: 'party-investigators' })
    expect(key.location?.label).toBe('探索者たち')
    expect(stolen.session.state.slotStates['slot-obj-iron-key-location'].currentFactId).toBe(stolen.factId)
    expect(authorFacts(stolen.session).map((fact) => [
      fact.id,
      stolen.session.state.factStates[fact.id]?.isTrue,
    ])).toEqual(beforeAuthorFacts)
  })

  it('moves a missed clue to another scene via its location slot and leaves the clue definition intact', () => {
    const { session } = buildMiniScenario()
    const beforeClue = JSON.parse(JSON.stringify(session.scenario.clues['cl-diary-page']))

    const moved = assignSlot(
      session,
      'slot-cl-diary-page-location',
      { type: 'scene', id: 'sc-garden' },
    ).session

    expect(projectScene(moved, 'sc-study').clues.map((clue) => clue.entity.id)).not.toContain('cl-diary-page')
    expect(projectScene(moved, 'sc-garden').clues.map((clue) => clue.entity.id)).toContain('cl-diary-page')
    expect(moved.scenario.clues['cl-diary-page']).toEqual(beforeClue)
    expect(authorFacts(moved).map((fact) => fact.id)).toEqual(authorFacts(session).map((fact) => fact.id))
  })

  it('moves an NPC to an abstract death or exit slot value so scene projections drop the NPC', () => {
    const { session } = buildMiniScenario()

    expect(projectScene(session, 'sc-garden').npcs.map((npc) => npc.npc.id)).toContain('npc-aoki')

    const removed = assignSlot(
      session,
      'slot-npc-aoki-location',
      { type: 'abstract', label: '死亡/退場' },
    ).session

    expect(projectScene(removed, 'sc-garden').npcs.map((npc) => npc.npc.id)).not.toContain('npc-aoki')
    expect(projectNpcCard(removed, 'npc-aoki').location?.label).toBe('死亡/退場')
  })

  it('splits Party knowledge to one PC and promotes it back without duplicating the Fact', () => {
    let session = withInvestigatorParty(buildMiniScenario().session)
    const knowledge = createFact(session, {
      statement: '探索者は書斎の隠し戸の存在を知った',
      initial: false,
    })
    session = assignKnowledge(knowledge.session, {
      scope: 'party',
      targetId: 'party-investigators',
      factId: knowledge.factId,
    }).session

    session = moveKnowledgeScope(session, {
      factId: knowledge.factId,
      from: { scope: 'party', targetId: 'party-investigators' },
      to: { scope: 'pc', targetId: 'pc-mika' },
    }).session
    expect(session.state.partyStates['party-investigators'].knowledgeFactIds).toEqual([])
    expect(session.state.pcStates['pc-mika'].knowledgeFactIds).toEqual([knowledge.factId])
    expect(session.state.pcStates['pc-ren'].knowledgeFactIds).toEqual([])

    session = moveKnowledgeScope(session, {
      factId: knowledge.factId,
      from: { scope: 'pc', targetId: 'pc-mika' },
      to: { scope: 'party', targetId: 'party-investigators' },
    }).session

    expect(session.state.partyStates['party-investigators'].knowledgeFactIds).toEqual([knowledge.factId])
    expect(session.state.pcStates['pc-mika'].knowledgeFactIds).toEqual([])
    expect(Object.values(session.scenario.facts).filter((fact) => (
      fact.statement === '探索者は書斎の隠し戸の存在を知った'
    ))).toHaveLength(1)
  })

  it('undoes and redoes a mistaken transaction across Fact, Slot, Event, and Log state', () => {
    const fixture = buildMiniScenario()
    const session = withInvestigatorParty(fixture.session)
    const { ids } = fixture
    const before = snapshot(session)

    const changed = mutateAndEvaluate(session, '誤って書斎イベントと鍵移動を適用', (api) => {
      api.applyEvent('ev-study-search')
      api.assignSlot('slot-obj-iron-key-location', { type: 'party', id: 'party-investigators' })
    }).session
    const after = snapshot(changed)
    const newKeyFactId = changed.state.slotStates['slot-obj-iron-key-location'].currentFactId as FactId

    expect(changed.state.factStates[ids.diaryFactId].isTrue).toBe(true)
    expect(changed.state.factStates[newKeyFactId].isTrue).toBe(true)
    expect(changed.state.eventStates['ev-study-search'].occurrence).toBe('fired')
    expect(changed.state.log.length).toBeGreaterThan(session.state.log.length)

    const undone = undo(changed).session
    expect(snapshot(undone)).toEqual(before)

    const redone = redo(undone).session
    expect(snapshot(redone)).toEqual(after)
  })
})
