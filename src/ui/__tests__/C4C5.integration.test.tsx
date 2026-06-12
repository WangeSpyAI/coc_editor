import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { EntityPanel } from '../EntityPanel'
import { EntityTree } from '../EntityTree'
import { useScenario } from '../../hooks/useScenario'
import { sampleScenario } from '../../core/sampleScenario'
import { initializeWorldState } from '../../core/engine'
import type { Action, Entity, Scenario, Trigger } from '../../core/types'
import { changeInput, click, createDomRenderer } from './testUtils'

function entity(patch: Partial<Entity> & Pick<Entity, 'id' | 'name'>): Entity {
  return {
    parentId: null,
    description: '',
    labels: [],
    connections: [],
    categories: [],
    actions: [],
    triggers: [],
    ...patch,
  }
}

function scenario(entities: Entity[]): Scenario {
  return {
    id: 's',
    title: 'test',
    author: '',
    description: '',
    entities,
    createdAt: '',
    updatedAt: '',
  }
}

function buttonByText(container: ParentNode, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button'))
    .find((candidate) => candidate.textContent?.trim() === text)
  if (!button) throw new Error(`button not found: ${text}`)
  return button as HTMLButtonElement
}

describe('C4/C5 UI integration', () => {
  let dom: ReturnType<typeof createDomRenderer>

  beforeEach(() => {
    localStorage.clear()
    dom = createDomRenderer()
  })

  afterEach(() => {
    dom.cleanup()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('EntityTree creates a PC from the shared template under the selected entity and joins it to the active party', () => {
    const sc = scenario([
      entity({ id: 'hall', name: '玄関ホール', labels: ['場所'] }),
    ])
    const ws = initializeWorldState(sc)
    const onAddEntity = vi.fn(() => 'pc-new')
    const onAddToParty = vi.fn()
    const onSelect = vi.fn()

    dom.render(
      <EntityTree
        scenario={sc}
        worldState={ws}
        selectedId="hall"
        onSelect={onSelect}
        onAddEntity={onAddEntity}
        onAddToParty={onAddToParty}
      />,
    )

    click(buttonByText(dom.container, '+ エンティティ追加'))
    const input = dom.container.querySelector('input[placeholder="エンティティ名"]') as HTMLInputElement
    changeInput(input, '探索者C')
    click(buttonByText(dom.container, 'PC'))

    expect(onAddEntity).toHaveBeenCalledWith(expect.objectContaining({
      name: '探索者C',
      parentId: 'hall',
      labels: ['PC'],
      categories: [
        expect.objectContaining({ name: '知識', exclusive: false }),
        expect.objectContaining({ name: '状態異常', exclusive: false }),
      ],
    }))
    expect(onAddToParty).toHaveBeenCalledWith('pc-new')
    expect(onSelect).toHaveBeenCalledWith('pc-new')
  })

  it('EntityPanel edits action definitions inline and writes category option descriptions', () => {
    const action: Action = {
      id: 'inspect',
      entityId: 'room',
      name: '調べる',
      description: '古い部屋を調べる。',
      isPlayerAction: true,
      effects: [],
    }
    const trigger: Trigger = {
      id: 'wake',
      entityId: 'room',
      name: '起動',
      condition: { clauses: [] },
      effects: [],
      firedOnce: true,
    }
    const room = entity({
      id: 'room',
      name: '部屋',
      labels: ['場所'],
      categories: [
        { id: 'mood', name: '雰囲気', exclusive: true, options: ['静寂', '不穏'] },
      ],
      actions: [action],
      triggers: [trigger],
    })
    const sc = scenario([room])
    const ws = initializeWorldState(sc)
    const updateAction = vi.fn()
    const updateCategoryDef = vi.fn()

    dom.render(
      <EntityPanel
        entity={room}
        scenario={sc}
        worldState={ws}
        onAction={vi.fn()}
        onNavigate={vi.fn()}
        onMoveParty={vi.fn()}
        onShareKnowledge={vi.fn()}
        onSetCategory={vi.fn()}
        onUpdateEntity={vi.fn()}
        onRemoveEntity={vi.fn()}
        onAddCategoryDef={vi.fn()}
        onUpdateCategoryDef={updateCategoryDef}
        onRemoveCategoryDef={vi.fn()}
        onUpdateAction={updateAction}
        onRemoveAction={vi.fn()}
        onUpdateTrigger={vi.fn()}
        onRemoveTrigger={vi.fn()}
        onFulfill={vi.fn()}
      />,
    )

    click(buttonByText(dom.container, '✎'))
    changeInput(dom.container.querySelector('input[aria-label="アクション名"]') as HTMLInputElement, '詳しく調べる')
    changeInput(dom.container.querySelector('input[aria-label="必要知識"]') as HTMLInputElement, '日記の内容,地下室の噂')
    click(buttonByText(dom.container, '保存'))

    expect(updateAction).toHaveBeenCalledWith('room', 'inspect', expect.objectContaining({
      name: '詳しく調べる',
      requiredKnowledge: ['日記の内容', '地下室の噂'],
    }))

    click(buttonByText(dom.container, '選択肢描写'))
    changeInput(dom.container.querySelector('textarea[aria-label="静寂 の描写"]') as HTMLTextAreaElement, 'しんと静まり返っている。')
    click(buttonByText(dom.container, '描写保存'))
    expect(updateCategoryDef).toHaveBeenCalledWith('room', 'mood', {
      descriptions: { '静寂': 'しんと静まり返っている。' },
    })
  })

  it('App exposes separate scenario-only and session export actions', () => {
    dom.render(<App />)

    click(buttonByText(dom.container, 'サンプル'))

    expect(buttonByText(dom.container, 'シナリオのみ')).toBeTruthy()
    expect(buttonByText(dom.container, 'セッション込み')).toBeTruthy()
  })
})

describe('C4 hook behavior', () => {
  let dom: ReturnType<typeof createDomRenderer>

  beforeEach(() => {
    localStorage.clear()
    dom = createDomRenderer()
  })

  afterEach(() => {
    dom.cleanup()
    localStorage.clear()
  })

  it('addToParty creates the default active party when the scenario has no active party', () => {
    function Harness() {
      const api = useScenario()
      const pcIdRef = { current: 'pc-new' }
      const load = () => {
        api.loadScenario(scenario([
          entity({ id: 'room', name: '部屋', labels: ['場所'] }),
        ]))
      }
      return (
        <div>
          <button type="button" onClick={load}>load</button>
          <button
            type="button"
            onClick={() => {
              pcIdRef.current = api.addEntity({
                id: 'pc-new',
                name: '探索者C',
                parentId: 'room',
                description: '',
                labels: ['PC'],
                connections: [],
                categories: [],
                actions: [],
                triggers: [],
              })
            }}
          >
            add pc
          </button>
          <button type="button" onClick={() => api.addToParty(pcIdRef.current)}>join</button>
          <pre>{JSON.stringify({
            parties: api.session?.worldState.parties ?? [],
            activePartyId: api.session?.worldState.activePartyId ?? null,
          })}</pre>
        </div>
      )
    }

    dom.render(<Harness />)
    click(buttonByText(dom.container, 'load'))
    click(buttonByText(dom.container, 'add pc'))
    click(buttonByText(dom.container, 'join'))

    const snapshot = JSON.parse(dom.container.querySelector('pre')?.textContent ?? '{}') as {
      parties: { id: string; name: string; memberIds: string[]; locationId: string | null }[]
      activePartyId: string | null
    }
    expect(snapshot.parties).toEqual([{ id: expect.any(String), name: 'パーティ', memberIds: ['pc-new'], locationId: 'room' }])
    expect(snapshot.activePartyId).toBe(snapshot.parties[0].id)
  })
})

describe('C5 sample scenario', () => {
  it('includes the expanded two-PC party, gate, knowledge, descriptions, and $actor demonstration', () => {
    const pcIds = sampleScenario.entities.filter((e) => e.labels.includes('PC')).map((e) => e.id)
    expect(pcIds).toEqual(expect.arrayContaining(['pc-a', 'pc-b']))

    const ws = initializeWorldState(sampleScenario)
    expect(ws.parties[0].name).toBe('パーティ')
    expect(ws.parties[0].memberIds).toEqual(expect.arrayContaining(['pc-a', 'pc-b']))

    const pcA = sampleScenario.entities.find((e) => e.id === 'pc-a')!
    const pcB = sampleScenario.entities.find((e) => e.id === 'pc-b')!
    expect(pcA.categories.some((c) => c.name === '知識' && !c.exclusive)).toBe(true)
    expect(pcB.categories.some((c) => c.name === '知識' && !c.exclusive)).toBe(true)

    const basement = sampleScenario.entities.find((e) => e.id === 'basement')!
    expect(basement.entryCondition?.clauses).toEqual([
      expect.objectContaining({ categoryId: 'basement-state', value: '開放' }),
    ])
    expect(basement.categories[0].descriptions?.['開放']).toBeTruthy()

    const readDiary = sampleScenario.entities.flatMap((e) => e.actions).find((a) => a.id === 'read-diary')!
    expect(readDiary.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'setCategory', target: { type: 'named', entityId: '$actor' }, value: '日記の内容' }),
      expect.objectContaining({ type: 'move', target: { type: 'self' }, newParentId: '$actor' }),
    ]))
    expect(sampleScenario.entities.flatMap((e) => e.actions).some((a) => a.requiredKnowledge?.length)).toBe(true)
  })
})
