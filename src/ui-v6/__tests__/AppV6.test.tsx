import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppV6 } from '../AppV6'
import { buildMiniScenario } from '../../core/v6/__tests__/fixtures/mini-scenario'
import { changeInput, click, createDomRenderer } from '../../ui/__tests__/testUtils'

const FIRST_RUN_COPY = {
  heading: 'このツールは？',
  body: 'CoC のキーパー(KP)が、セッション中に必要な情報を手元に出しておくための道具です。多すぎて頭に入りきらない「今の場面・登場NPC・手がかり・分岐」を、あなたの代わりに覚えておく“外部脳”です。',
  subheading: '使い方（3ステップ）',
  steps: [
    '今いる場面を開き、青い「PL描写」をプレイヤーに読み上げる。',
    '登場NPCのカードを見て演じる。「KP秘密」はあなただけが見る欄です。',
    'プレイヤーが動いたら事実を更新。詰まったら「真相一覧」で“次に渡す手がかり”を確認する。',
  ],
  note: 'いま開いているのはサンプル「霧鐘荘の消えた鍵」です。自由に触って試してください。',
  button: 'サンプルで試す',
}

const SCREEN_CAPTIONS = {
  scene: '今プレイヤーがいる場面。読み上げ文・登場NPC・手がかり・出口がここに集まります。',
  facts: 'この卓で今「成立している事実」の一覧。クリックで成立／未成立を切り替えます。',
  revelations: 'プレイヤーに気づかせたい真相と、それを渡す手がかり。話が収束しているか、次に何が足りないかが分かります。',
  events: '今の状況で起こせるイベントと、あと一歩で起こせるイベント。',
  log: '読み上げや事実の変化の記録。卓の進行ログです。',
  search: '「鍵はどこ？」のように、今の事実をすぐ引けます。',
}

const STUDY_EVENT_READ_ALOUD = '机の奥で紙束がほどけ、湿った古い日記の破れた頁が一枚、探索者たちの前に滑り出ます。'

function buttonByText(container: ParentNode, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => (
    candidate.textContent === text || candidate.textContent?.startsWith(text)
  ))
  expect(button).toBeTruthy()
  return button as HTMLButtonElement
}

function dialog(container: ParentNode): HTMLElement | null {
  return container.querySelector('[role="dialog"]')
}

describe('AppV6', () => {
  let dom: ReturnType<typeof createDomRenderer>

  beforeEach(() => {
    localStorage.clear()
    dom = createDomRenderer()
  })

  afterEach(() => {
    dom.cleanup()
    localStorage.clear()
  })

  it('shows the first-run orientation over demo content and persists dismissal', () => {
    const fixture = buildMiniScenario()

    dom.render(<AppV6 />)

    expect(dom.container.querySelector('[data-testid="active-scene-name"]')?.textContent).toBe(
      fixture.session.scenario.scenes['sc-foyer'].name,
    )
    const firstRunDialog = dialog(dom.container)
    expect(firstRunDialog).not.toBeNull()
    expect(firstRunDialog?.textContent ?? '').toContain(FIRST_RUN_COPY.heading)
    expect(firstRunDialog?.textContent ?? '').toContain(FIRST_RUN_COPY.body)
    expect(firstRunDialog?.textContent ?? '').toContain(FIRST_RUN_COPY.subheading)
    for (const step of FIRST_RUN_COPY.steps) {
      expect(firstRunDialog?.textContent ?? '').toContain(step)
    }
    expect(firstRunDialog?.textContent ?? '').toContain(FIRST_RUN_COPY.note)

    click(buttonByText(dom.container, FIRST_RUN_COPY.button))

    expect(dialog(dom.container)).toBeNull()
    expect(localStorage.getItem('v6_onboarded')).toBe('1')
  })

  it('skips first-run overlay after onboarding and reopens it from the header', () => {
    localStorage.setItem('v6_onboarded', '1')
    dom.render(<AppV6 />)

    expect(dialog(dom.container)).toBeNull()
    expect(buttonByText(dom.container, '？使い方').getAttribute('aria-label')).toBe('使い方を開く')

    click(buttonByText(dom.container, '？使い方'))
    expect(dialog(dom.container)?.textContent).toContain(FIRST_RUN_COPY.heading)

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(dialog(dom.container)).toBeNull()

    click(buttonByText(dom.container, '？使い方'))
    expect(dialog(dom.container)?.textContent).toContain(FIRST_RUN_COPY.heading)

    click(dom.container.querySelector('[data-testid="v6-onboarding-backdrop"]')!)
    expect(dialog(dom.container)).toBeNull()
  })

  it('wires the sample badge, help button, and one-line captions for every screen', () => {
    localStorage.setItem('v6_onboarded', '1')

    dom.render(<AppV6 />)

    expect(dom.container.querySelector('.v6-sample-badge')?.textContent).toBe('サンプル')
    expect(buttonByText(dom.container, '？使い方')).toBeTruthy()
    expect(dom.container.textContent).toContain(SCREEN_CAPTIONS.scene)

    click(buttonByText(dom.container, '事実台帳'))
    expect(dom.container.textContent).toContain(SCREEN_CAPTIONS.facts)

    click(buttonByText(dom.container, '真相一覧'))
    expect(dom.container.textContent).toContain(SCREEN_CAPTIONS.revelations)

    click(buttonByText(dom.container, 'イベント通知'))
    expect(dom.container.textContent).toContain(SCREEN_CAPTIONS.events)

    click(buttonByText(dom.container, 'セッションログ'))
    expect(dom.container.textContent).toContain(SCREEN_CAPTIONS.log)

    click(buttonByText(dom.container, '検索'))
    expect(dom.container.textContent).toContain(SCREEN_CAPTIONS.search)
  })

  it('renders the demo scene with public and keeper text separated and searchable scene navigation', () => {
    const fixture = buildMiniScenario()
    const foyer = fixture.session.scenario.scenes['sc-foyer']
    const study = fixture.session.scenario.scenes['sc-study']
    const keeperText = foyer.keeperNotes[0]?.text ?? ''

    dom.render(<AppV6 />)
    click(buttonByText(dom.container, FIRST_RUN_COPY.button))

    expect(dom.container.querySelector('[data-testid="scene-public"]')?.textContent).toContain(
      foyer.publicDescription.text,
    )
    expect(dom.container.querySelector('[data-testid="scene-public"]')?.textContent).not.toContain(keeperText)
    expect(dom.container.querySelector('[data-testid="scene-keeper"]')?.textContent).toContain(keeperText)

    click(buttonByText(dom.container, '検索'))
    changeInput(dom.container.querySelector('[aria-label="検索語"]')!, study.name)
    click(Array.from(dom.container.querySelectorAll('.v6-search-result')).find((button) => (
      button.querySelector('strong')?.textContent === study.name
    ))!)

    expect(dom.container.querySelector('[data-testid="active-scene-name"]')?.textContent).toBe(study.name)
  })

  it('surfaces fired event public read-aloud text on the active scene page', () => {
    localStorage.setItem('v6_onboarded', '1')
    const fixture = buildMiniScenario()
    const study = fixture.session.scenario.scenes['sc-study']
    const studyEvent = fixture.session.scenario.events['ev-study-search']
    const keeperOnlyText = studyEvent.keeperNotes?.[0]?.text ?? ''

    dom.render(<AppV6 />)

    click(buttonByText(dom.container, study.name))
    expect(dom.container.querySelector('[data-testid="current-event-read-aloud"]')).toBeNull()
    expect(buttonByText(dom.container, '発生させる')).toBeTruthy()

    click(buttonByText(dom.container, '発生させる'))

    const readAloudPanel = dom.container.querySelector('[data-testid="current-event-read-aloud"]')
    expect(readAloudPanel).not.toBeNull()
    expect(readAloudPanel?.textContent).toContain('今読み上げる')
    expect(readAloudPanel?.textContent).toContain(STUDY_EVENT_READ_ALOUD)
    expect(readAloudPanel?.textContent).not.toContain(keeperOnlyText)
    expect(buttonByText(readAloudPanel!, 'コピー')).toBeTruthy()
  })
})
