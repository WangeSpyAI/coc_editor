import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useV6Session } from '../useV6Session'
import { changeInput, click, createDomRenderer } from '../../ui/__tests__/testUtils'

const NEW_FACT = 'セッション中に足音を聞いた'

function Probe() {
  const v6 = useV6Session()
  const scene = v6.session.scenario.scenes[v6.selectedSceneId]
  const newFact = Object.values(v6.session.scenario.facts).find((fact) => fact.statement === NEW_FACT)
  const newFactValue = newFact ? v6.session.state.factStates[newFact.id]?.isTrue : undefined

  return (
    <section>
      <div data-testid="scenario-id">{v6.session.scenario.id}</div>
      <div data-testid="selected-scene">{v6.selectedSceneId}</div>
      <div data-testid="public-description">{scene?.publicDescription.text}</div>
      <div data-testid="keeper-notes">{scene?.keeperNotes.map((note) => note.text).join('\n')}</div>
      <div data-testid="new-fact-value">{String(newFactValue)}</div>
      <textarea
        aria-label="public"
        value={scene?.publicDescription.text ?? ''}
        onChange={(event) => v6.updateSceneText(v6.selectedSceneId, {
          publicDescription: event.currentTarget.value,
        })}
      />
      <button
        type="button"
        onClick={() => v6.updateSceneText(v6.selectedSceneId, {
          keeperNotes: ['KPだけが見る更新メモ'],
        })}
      >
        keeper
      </button>
      <button type="button" onClick={() => v6.addFact(NEW_FACT, true)}>fact</button>
      <button
        type="button"
        onClick={() => {
          if (newFact) {
            v6.setFactValue(newFact.id, false)
          }
        }}
      >
        toggle
      </button>
      <button type="button" onClick={v6.undo}>undo</button>
      <button type="button" onClick={v6.loadDemo}>demo</button>
    </section>
  )
}

describe('useV6Session', () => {
  let dom: ReturnType<typeof createDomRenderer>

  beforeEach(() => {
    localStorage.clear()
    dom = createDomRenderer()
  })

  afterEach(() => {
    dom.cleanup()
    localStorage.clear()
  })

  it('loads the demo, persists transactions, edits scene text, creates facts, and undoes', () => {
    dom.render(<Probe />)

    expect(dom.container.querySelector('[data-testid="scenario-id"]')?.textContent).toBe('scenario-fog-bell-manor')
    expect(dom.container.querySelector('[data-testid="selected-scene"]')?.textContent).toBe('sc-foyer')

    changeInput(dom.container.querySelector('textarea')!, 'PL向けの更新描写')
    expect(dom.container.querySelector('[data-testid="public-description"]')?.textContent).toBe('PL向けの更新描写')
    expect(localStorage.getItem('v6_session')).toContain('PL向けの更新描写')

    click(Array.from(dom.container.querySelectorAll('button')).find((button) => button.textContent === 'keeper')!)
    expect(dom.container.querySelector('[data-testid="keeper-notes"]')?.textContent).toBe('KPだけが見る更新メモ')

    click(Array.from(dom.container.querySelectorAll('button')).find((button) => button.textContent === 'fact')!)
    expect(dom.container.querySelector('[data-testid="new-fact-value"]')?.textContent).toBe('true')

    click(Array.from(dom.container.querySelectorAll('button')).find((button) => button.textContent === 'toggle')!)
    expect(dom.container.querySelector('[data-testid="new-fact-value"]')?.textContent).toBe('false')

    click(Array.from(dom.container.querySelectorAll('button')).find((button) => button.textContent === 'undo')!)
    expect(dom.container.querySelector('[data-testid="new-fact-value"]')?.textContent).toBe('true')
  })
})
