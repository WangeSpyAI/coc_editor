import type {
  ClueId,
  Fact,
  FactId,
  ReadonlyDeep,
  ReadonlyScenarioSession,
} from './types'
import { disclosureLabel } from './labels'
import {
  projectRevelation,
  projectScene,
  type ItemProjection,
  type NpcProjection,
  type SceneExitProjection,
  type SceneEventProjection,
} from './queries'

export interface MarkdownExportOptions {
  includeGeneratedFacts?: boolean
}

type ReadonlyView<T> = ReadonlyDeep<T>

function line(text = ''): string {
  return `${text}\n`
}

function keeperQuote(text: string): string {
  return `> 【KP】${text}`
}

function itemLabel(row: ItemProjection): string {
  return `${row.kind === 'item' ? 'Item' : 'Clue'}: ${row.entity.name} | 所在: ${row.location?.label ?? '不明'} | 開示: ${disclosureLabel(row.disclosure) ?? '不明'}`
}

function npcLabel(row: NpcProjection): string {
  const fields = [`NPC: ${row.npc.name}`]
  if (row.location) {
    fields.push(`現在地: ${row.location.label}`)
  }
  if (row.intent) {
    fields.push(`意図: ${row.intent.label}`)
  }
  if (row.fear) {
    fields.push(`恐れ: ${row.fear.label}`)
  }
  if (row.emotion) {
    fields.push(`感情: ${row.emotion.label}`)
  }
  return fields.join(' | ')
}

function eventLabel(row: SceneEventProjection): string {
  return `${row.fireable ? '発生可能' : '未発生'}: ${row.event.name}`
}

function exitLabel(row: SceneExitProjection): string {
  return [
    row.exit.label ?? row.toScene?.name ?? row.exit.toSceneId,
    row.available ? '通行可' : '条件未達',
  ].join(' | ')
}

function factStateLabel(session: ReadonlyScenarioSession, factId: FactId): string {
  return session.state.factStates[factId]?.isTrue ? '成立' : '未成立'
}

function factName(session: ReadonlyScenarioSession, factId: FactId): string {
  return session.scenario.facts[factId]?.statement ?? factId
}

function clueName(session: ReadonlyScenarioSession, clueId: ClueId): string {
  return session.scenario.clues[clueId]?.name ?? clueId
}

function renderSceneSections(session: ReadonlyScenarioSession): string {
  let markdown = line('## シーン')
  for (const scene of Object.values(session.scenario.scenes)) {
    const projection = projectScene(session, scene.id)
    markdown += line()
    markdown += line(`### ${scene.name}`)
    markdown += line()
    markdown += line('**PL描写**')
    markdown += line()
    for (const block of projection.description) {
      markdown += line(block.text)
    }
    if (projection.keeperNotes.length > 0) {
      markdown += line()
      for (const note of projection.keeperNotes) {
        markdown += line(keeperQuote(note.text))
      }
    }

    markdown += line()
    markdown += line('**現在投影**')
    if (
      projection.npcs.length === 0
      && projection.items.length === 0
      && projection.clues.length === 0
    ) {
      markdown += line('- なし')
    }
    for (const npc of projection.npcs) {
      markdown += line(`- ${npcLabel(npc)}`)
    }
    for (const item of projection.items) {
      markdown += line(`- ${itemLabel(item)}`)
    }
    for (const clue of projection.clues) {
      markdown += line(`- ${itemLabel(clue)}`)
    }

    markdown += line()
    markdown += line('**発生可能イベント**')
    if (projection.fireableEvents.length === 0) {
      markdown += line('- なし')
    } else {
      for (const event of projection.fireableEvents) {
        markdown += line(`- ${eventLabel(event)}`)
      }
    }

    markdown += line()
    markdown += line('**出口**')
    if (projection.exits.length === 0) {
      markdown += line('- なし')
    } else {
      for (const exit of projection.exits) {
        markdown += line(`- ${exitLabel(exit)}`)
      }
    }

    if (projection.revelations.length > 0) {
      markdown += line()
      markdown += line('**関連真相**')
      for (const revelation of projection.revelations) {
        markdown += line(`- ${revelation.title}`)
      }
    }
  }
  return markdown
}

function renderRevelationGrid(session: ReadonlyScenarioSession): string {
  let markdown = line('## 真相グリッド')
  markdown += line()
  markdown += line('| 真相 | 理解 | 発見済み手がかり | 未発見手がかり | missingFacts | 投入可能導線 |')
  markdown += line('|---|---|---|---|---|---|')

  for (const revelation of Object.values(session.scenario.revelations)) {
    const projection = projectRevelation(session, revelation.id)
    const discovered = projection.discoveredClues.map((id) => clueName(session, id)).join(' / ') || '-'
    const undiscovered = projection.undiscoveredClues.map((id) => clueName(session, id)).join(' / ') || '-'
    const missing = projection.missingFacts.map((id) => factName(session, id)).join(' / ') || '-'
    const routes = projection.availableRoutes.map((route) => route.how.text).join(' / ') || '-'
    markdown += line(`| ${revelation.title} | ${projection.understood ? '理解済み' : '未理解'} | ${discovered} | ${undiscovered} | ${missing} | ${routes} |`)
  }
  return markdown
}

function shouldIncludeFact(fact: ReadonlyView<Fact>, options: MarkdownExportOptions): boolean {
  if (options.includeGeneratedFacts) {
    return true
  }
  return fact.historyPolicy !== 'generated'
}

function renderFactLedger(
  session: ReadonlyScenarioSession,
  options: MarkdownExportOptions,
): string {
  let markdown = line('## Fact台帳')
  markdown += line()
  const facts = Object.values(session.scenario.facts).filter((fact) => shouldIncludeFact(fact, options))
  if (facts.length === 0) {
    return markdown + line('- なし')
  }
  for (const fact of facts) {
    markdown += line(`- ${fact.id}: ${fact.statement} (${factStateLabel(session, fact.id)})`)
  }
  return markdown
}

export function exportSessionToMarkdown(
  session: ReadonlyScenarioSession,
  options: MarkdownExportOptions = {},
): string {
  let markdown = line(`# ${session.scenario.title}`)
  markdown += line()
  markdown += line(`- Scenario: ${session.scenario.id}`)
  markdown += line(`- Format: ${session.scenario.formatVersion}`)
  markdown += line()
  markdown += renderSceneSections(session)
  markdown += line()
  markdown += renderRevelationGrid(session)
  markdown += line()
  markdown += renderFactLedger(session, options)
  return markdown.trimEnd() + '\n'
}
