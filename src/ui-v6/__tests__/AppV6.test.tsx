import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppV6 } from '../AppV6'
import { buildMiniScenario } from '../../core/v6/__tests__/fixtures/mini-scenario'
import { changeInput, click, createDomRenderer } from '../../ui/__tests__/testUtils'

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

  it('renders the demo scene with public and keeper text separated and searchable scene navigation', () => {
    const fixture = buildMiniScenario()
    const foyer = fixture.session.scenario.scenes['sc-foyer']
    const study = fixture.session.scenario.scenes['sc-study']
    const keeperText = foyer.keeperNotes[0]?.text ?? ''

    dom.render(<AppV6 />)

    expect(dom.container.querySelector('[data-testid="scene-public"]')?.textContent).toContain(
      foyer.publicDescription.text,
    )
    expect(dom.container.querySelector('[data-testid="scene-public"]')?.textContent).not.toContain(keeperText)
    expect(dom.container.querySelector('[data-testid="scene-keeper"]')?.textContent).toContain(keeperText)

    click(Array.from(dom.container.querySelectorAll('button')).find((button) => button.textContent === '検索')!)
    changeInput(dom.container.querySelector('[aria-label="検索語"]')!, study.name)
    click(Array.from(dom.container.querySelectorAll('.v6-search-result')).find((button) => (
      button.querySelector('strong')?.textContent === study.name
    ))!)

    expect(dom.container.querySelector('[data-testid="active-scene-name"]')?.textContent).toBe(study.name)
  })
})
