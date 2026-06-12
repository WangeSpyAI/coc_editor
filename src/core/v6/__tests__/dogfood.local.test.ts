import { describe, expect, it } from 'vitest'
import type { Fact, FactId, ScenarioSession } from '../types'
import { mutateAndEvaluate } from '../engine'
import { exportSessionToMarkdown } from '../markdown'
import { projectScene } from '../queries'

interface LocalHauntingFixture {
  session: ScenarioSession
  ids: {
    enteredHouseFactId: FactId
    kitchenTriggerFactId: FactId
  }
  authoringCalls: string[]
}

interface LocalHauntingModule {
  buildHauntingSession(): LocalHauntingFixture
}

const localModules = import.meta.glob<LocalHauntingModule>(
  '../../../../local/the-haunting-fixture.ts',
)
const loadLocalFixture = localModules['../../../../local/the-haunting-fixture.ts']
const localFixtureModule = loadLocalFixture ? await loadLocalFixture() : null

function factCounts(session: ScenarioSession) {
  const facts = Object.values(session.scenario.facts) as Fact[]
  const generated = facts.filter((fact) => fact.historyPolicy === 'generated').length
  return {
    author: facts.length - generated,
    generated,
    total: facts.length,
  }
}

describe.skipIf(localFixtureModule === null)('v6 Phase 3 local Haunting dogfood', () => {
  it('projects sc-kitchen with the knife and fireable knife event when the current facts allow it', () => {
    const fixture = localFixtureModule?.buildHauntingSession()
    if (!fixture) {
      throw new Error('local fixture unexpectedly missing')
    }

    const primed = mutateAndEvaluate(fixture.session, 'prime kitchen projection', (api) => {
      api.setFact(fixture.ids.enteredHouseFactId, true)
      api.setFact(fixture.ids.kitchenTriggerFactId, true)
    }).session

    const kitchen = projectScene(primed, 'sc-kitchen')

    expect(kitchen.scene.name).toBe('台所')
    expect(kitchen.items.map((item) => item.entity.id)).toContain('obj-kitchen-knife')
    expect(kitchen.fireableEvents.map((event) => event.event.id)).toContain('ev-knife-attack')
    expect(kitchen.keeperNotes.map((note) => note.text).join('\n')).toContain('刃物イベント')
  })

  it('exports the local Haunting session to Markdown and records authoring scale', async () => {
    const fixture = localFixtureModule?.buildHauntingSession()
    if (!fixture) {
      throw new Error('local fixture unexpectedly missing')
    }

    const markdown = exportSessionToMarkdown(fixture.session)
    const fsPromisesModule = 'node:fs/promises'
    const { writeFile } = await import(fsPromisesModule) as {
      writeFile(path: string, data: string, encoding: string): Promise<void>
    }
    const pathModule = 'node:path'
    const { join } = await import(pathModule) as {
      join(...parts: string[]): string
    }
    const processRef = globalThis as unknown as { process: { cwd(): string } }
    await writeFile(
      join(processRef.process.cwd(), 'local', 'the-haunting-export.md'),
      markdown,
      'utf8',
    )

    const counts = factCounts(fixture.session)
    expect(fixture.authoringCalls.length).toBeGreaterThan(40)
    expect(counts.author).toBeGreaterThan(10)
    expect(counts.generated).toBeGreaterThan(counts.author)
    expect(markdown).toContain('## シーン')
    expect(markdown).toContain('### 台所')
    expect(markdown).toContain('## 真相グリッド')
    expect(markdown).toContain('## Fact台帳')
  })
})
