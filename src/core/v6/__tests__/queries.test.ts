import { describe, expect, it } from 'vitest'
import type { ScenarioSession } from '../types'
import { assignSlot, createFact } from '../engine'
import {
  findCurrentDisclosure,
  findCurrentLocation,
  projectItemRow,
  projectNpcCard,
  projectRevelation,
  projectScene,
  searchScenario,
} from '../queries'
import { buildMiniScenario } from './fixtures/mini-scenario'

function cloneSession(session: ScenarioSession): ScenarioSession {
  return JSON.parse(JSON.stringify(session)) as ScenarioSession
}

describe('v6 Phase 2 projection queries', () => {
  it('projects the scene page from current slots, explicit links, fireable events, exits, truths, and active descriptions', () => {
    const { session } = buildMiniScenario()
    const before = cloneSession(session)

    const projection = projectScene(session, 'sc-study')

    expect(projection.scene.id).toBe('sc-study')
    expect(projection.description.map((block) => block.text)).toEqual([
      '壁一面の本棚と重い机がある。引き出しの奥に、紙の擦れる音がする。',
    ])
    expect(projection.items.map((item) => item.entity.id)).toEqual(['obj-diary'])
    expect(projection.clues.map((clue) => clue.entity.id)).toEqual(['cl-diary-page'])
    expect(projection.npcs).toEqual([])
    expect(projection.fireableEvents.map((event) => event.event.id)).toEqual(['ev-study-search'])
    expect(projection.exits.map((exit) => ({
      to: exit.exit.toSceneId,
      available: exit.available,
    }))).toEqual([
      { to: 'sc-foyer', available: true },
      { to: 'sc-garden', available: true },
    ])
    expect(projection.revelations.map((revelation) => revelation.id)).toContain('rev-hidden-room')
    expect(session).toEqual(before)
  })

  it('projects NPC dynamic current values including location, intent, fear, emotion, and knowledge facts', () => {
    const { session, ids } = buildMiniScenario()

    const withGenericNpcLink = createFact(session, {
      statement: '鈴木は玄関ホールにいると噂されている',
      initial: true,
      links: [{ type: 'npc', id: 'npc-suzuki' }],
    }).session

    const card = projectNpcCard(withGenericNpcLink, 'npc-suzuki')

    expect(card.npc.name).toBe('鈴木')
    expect(card.location?.label).toBe('玄関ホール')
    expect(card.intent?.label).toBe('鍵の所在を隠したまま探索者を帰す')
    expect(card.fear?.label).toBe('鍵を持っていたことが露見する')
    expect(card.emotion?.label).toBe('緊張')
    expect(card.knowledgeFacts.map((fact) => fact.id)).toEqual([ids.keyLocationHintFactId])
    expect(card.knowledgeFacts[0]?.statement).toContain('鉄の鍵')
  })

  it('projects item and clue rows with one-hop location and disclosure answers', () => {
    const { session } = buildMiniScenario()

    const key = projectItemRow(session, 'obj-iron-key')
    const diaryPage = projectItemRow(session, 'cl-diary-page')

    expect(key.kind).toBe('item')
    expect(key.entity.name).toBe('鉄の鍵')
    expect(key.location?.label).toBe('鈴木')
    expect(key.disclosure).toBe('public')
    expect(findCurrentLocation(session, 'obj-iron-key')).toEqual({ type: 'npc', id: 'npc-suzuki' })
    expect(findCurrentDisclosure(session, 'obj-iron-key')).toBe('public')

    expect(diaryPage.kind).toBe('clue')
    expect(diaryPage.entity.name).toBe('日記の破れた頁')
    expect(diaryPage.location?.label).toBe('書斎')
    expect(diaryPage.disclosure).toBe('undiscovered')
    expect(diaryPage.clueFact?.statement).toContain('地下通路')
  })

  it('projects revelation progress with discovered and missing clue facts and available routes', () => {
    const { session, ids } = buildMiniScenario()

    const beforeDiscovery = projectRevelation(session, 'rev-hidden-room')
    expect(beforeDiscovery.understood).toBe(false)
    expect(beforeDiscovery.discoveredClues).toEqual([])
    expect(beforeDiscovery.undiscoveredClues).toEqual(['cl-diary-page'])
    expect(beforeDiscovery.availableRoutes.map((route) => route.how.text)).toEqual([
      '書斎の机か日記を調べる。',
    ])
    expect(beforeDiscovery.missingFacts).toEqual([ids.diaryFactId])

    const discovered = assignSlot(
      session,
      'slot-cl-diary-page-disclosure',
      'discovered',
    ).session
    discovered.state.factStates[ids.diaryFactId].isTrue = true

    const afterDiscovery = projectRevelation(discovered, 'rev-hidden-room')
    expect(afterDiscovery.discoveredClues).toEqual(['cl-diary-page'])
    expect(afterDiscovery.undiscoveredClues).toEqual([])
    expect(afterDiscovery.missingFacts).toEqual([])
  })

  it('answers lookup-style searches through current-value projections', () => {
    const { session } = buildMiniScenario()

    const diary = projectItemRow(session, 'obj-diary')
    expect(diary.location?.label).toBe('書斎')

    const key = searchScenario(session, '鍵を誰が持っている?')
    expect(key[0]).toMatchObject({
      ref: { type: 'item', id: 'obj-iron-key' },
      matchKind: 'current-value',
    })
    expect(key[0]?.snippet).toContain('鈴木')
    expect(key[0]?.snippet).toContain('開示状態: 公開')

    const diarySearch = searchScenario(session, '日記はどこ?')
    expect(diarySearch[0]).toMatchObject({
      ref: { type: 'item', id: 'obj-diary' },
      matchKind: 'current-value',
    })
    expect(diarySearch[0]?.snippet).toContain('書斎')

    const suzuki = projectNpcCard(session, 'npc-suzuki')
    expect(suzuki.knowledgeFacts.map((fact) => fact.statement)).toEqual([
      '鈴木は鉄の鍵が温室の鉢に隠されていると知っている',
    ])

    const knowledge = searchScenario(session, '鈴木は何を知っている?')
    expect(knowledge[0]).toMatchObject({
      ref: { type: 'npc', id: 'npc-suzuki' },
      matchKind: 'current-value',
    })
    expect(knowledge[0]?.snippet).toContain('鉄の鍵')
  })
})
