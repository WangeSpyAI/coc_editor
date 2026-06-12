import { describe, expect, it } from 'vitest'
import { exportSessionToMarkdown } from '../markdown'
import { buildMiniScenario } from './fixtures/mini-scenario'

describe('v6 Phase 3 Markdown export', () => {
  it('exports a scene-centric session document before revelation grid and fact ledger', () => {
    const { session } = buildMiniScenario()

    const markdown = exportSessionToMarkdown(session)

    expect(markdown).toContain('# 霧鐘荘の消えた鍵')
    const sceneIndex = markdown.indexOf('## シーン')
    const revelationIndex = markdown.indexOf('## 真相グリッド')
    const ledgerIndex = markdown.indexOf('## Fact台帳')
    expect(sceneIndex).toBeGreaterThan(-1)
    expect(revelationIndex).toBeGreaterThan(sceneIndex)
    expect(ledgerIndex).toBeGreaterThan(revelationIndex)

    expect(markdown).toContain('### 書斎')
    expect(markdown).toContain('**PL描写**')
    expect(markdown).toContain('壁一面の本棚と重い机がある。')
    expect(markdown).toContain('> 【KP】日記を見つけたら、地下通路の存在を真相へ接続する。')
    expect(markdown).toContain('- Item: 古い日記 | 所在: 書斎 | 開示: 発見可能')
    expect(markdown).toContain('- Clue: 日記の破れた頁 | 所在: 書斎 | 開示: 未発見')
    expect(markdown).not.toContain('開示: discoverable')
    expect(markdown).not.toContain('開示: undiscovered')
    expect(markdown).toContain('- 発生可能: 書斎の机を調べる')
    expect(markdown).toContain('- NPC: 青木 | 現在地: 裏庭 | 意図: 裏庭の足跡を調べる | 恐れ: 証拠を鈴木に消される')
    expect(markdown).not.toContain('感情: 不明')
  })

  it('exports revelation progress and hides generated facts from the default ledger', () => {
    const { session, ids } = buildMiniScenario()

    const markdown = exportSessionToMarkdown(session)

    expect(markdown).toContain('| 屋敷には地下通路が隠されている | 未理解 | - | 日記の破れた頁 |')
    expect(markdown).toContain(`- ${ids.keyLocationHintFactId}: 鈴木は鉄の鍵が温室の鉢に隠されていると知っている`)
    expect(markdown).not.toContain('鈴木 の現在地は sc-foyer')

    const withGenerated = exportSessionToMarkdown(session, { includeGeneratedFacts: true })
    expect(withGenerated).toContain('鈴木 の現在地は sc-foyer')
  })
})
