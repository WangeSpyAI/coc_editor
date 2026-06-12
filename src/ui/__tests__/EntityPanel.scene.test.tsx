import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EntityPanel } from '../EntityPanel'
import type { Category, Entity, Scenario } from '../../core/types'
import { applyEffect, buildChildrenMap, initializeWorldState } from '../../core/engine'
import { changeSelect, click, createDomRenderer } from './testUtils'

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

const knowledge: Category = {
  id: 'knowledge',
  name: 'Knowledge',
  exclusive: false,
  options: ['clue'],
  descriptions: { clue: 'A hidden mark is visible.' },
}

describe('EntityPanel scene mode', () => {
  let dom: ReturnType<typeof createDomRenderer>

  beforeEach(() => {
    dom = createDomRenderer()
  })

  afterEach(() => {
    dom.cleanup()
    vi.restoreAllMocks()
  })

  it('renders scene navigation, actor-aware PL actions, and shareable knowledge for locations', () => {
    const hall = entity({
      id: 'hall',
      name: 'Hall',
      labels: ['場所'],
      description: 'A cold entrance hall.',
      connections: ['study', 'locked'],
      actions: [
        {
          id: 'search',
          entityId: 'hall',
          name: 'Search',
          description: '$actor searches the hall.',
          isPlayerAction: true,
          effects: [],
        },
        {
          id: 'reveal',
          entityId: 'hall',
          name: 'Reveal',
          description: 'Keeper reveals a detail.',
          isPlayerAction: false,
          effects: [],
        },
      ],
    })
    const sc = scenario([
      entity({ id: 'root', name: 'Root' }),
      { ...hall, parentId: 'root' },
      entity({ id: 'study', name: 'Study', labels: ['場所'], parentId: 'root' }),
      entity({
        id: 'locked',
        name: 'Locked Room',
        labels: ['場所'],
        parentId: 'root',
        entryCondition: {
          clauses: [{ reference: { type: 'self' }, categoryId: 'open', value: 'yes' }],
        },
      }),
      entity({ id: 'garden', name: 'Garden', labels: ['場所'], parentId: 'root' }),
      entity({ id: 'alice', name: 'Alice', labels: ['PC'], parentId: 'hall', categories: [knowledge] }),
      entity({
        id: 'bob',
        name: 'Bob',
        labels: ['PC'],
        parentId: 'hall',
        categories: [{ ...knowledge, id: 'bob-knowledge', descriptions: undefined }],
      }),
    ])
    const ws = initializeWorldState(sc)
    applyEffect(
      { type: 'setCategory', target: { type: 'named', entityId: 'alice' }, categoryId: 'knowledge', value: 'clue' },
      'alice',
      ws.entityStates,
      sc.entities,
      buildChildrenMap(ws.entityStates),
    )
    ws.parties = [{ id: 'party-a', name: 'Main', memberIds: ['alice', 'bob'], locationId: 'hall' }]
    ws.activePartyId = 'party-a'
    const moveParty = vi.fn()
    const selectEntity = vi.fn()
    const onAction = vi.fn()
    const shareKnowledge = vi.fn()

    dom.render(
      <EntityPanel
        entity={sc.entities.find((e) => e.id === 'hall')!}
        scenario={sc}
        worldState={ws}
        onAction={onAction}
        onNavigate={selectEntity}
        onMoveParty={moveParty}
        onShareKnowledge={shareKnowledge}
        onSetCategory={vi.fn()}
        onUpdateEntity={vi.fn()}
        onRemoveEntity={vi.fn()}
        onAddCategoryDef={vi.fn()}
        onUpdateCategoryDef={vi.fn()}
        onRemoveCategoryDef={vi.fn()}
        onRemoveAction={vi.fn()}
        onRemoveTrigger={vi.fn()}
        onFulfill={vi.fn()}
      />,
    )

    expect(dom.container.querySelector('.scene-description')?.textContent).toContain('A cold entrance hall.')
    expect(dom.container.querySelector('.scene-description')?.textContent).toContain('A hidden mark is visible.')

    const navButtons = Array.from(dom.container.querySelectorAll('.scene-nav-button'))
    expect(navButtons.map((button) => button.textContent)).toEqual(
      expect.arrayContaining(['Study', 'Garden', '🔒 Locked Room']),
    )
    const lockedButton = navButtons.find((button) => button.textContent?.includes('Locked Room')) as HTMLButtonElement
    expect(lockedButton.disabled).toBe(true)

    click(navButtons.find((button) => button.textContent === 'Study')!)
    expect(moveParty).toHaveBeenCalledWith('study')
    expect(selectEntity).toHaveBeenCalledWith('study')

    const actorSelect = dom.container.querySelector('.scene-actor-select') as HTMLSelectElement
    changeSelect(actorSelect, 'bob')
    click(dom.container.querySelector('.scene-action-run')!)
    expect(onAction).toHaveBeenCalledWith('search', 'bob', undefined)

    const kpButton = Array.from(dom.container.querySelectorAll('.scene-action-run'))
      .find((button) => button.textContent === '実行' && button.closest('.action-card')?.textContent?.includes('Reveal'))
    click(kpButton!)
    expect(onAction).toHaveBeenCalledWith('reveal', undefined, undefined)

    const shareButton = dom.container.querySelector('.share-button')
    expect(shareButton?.textContent).toBe('共有')
    expect(shareButton?.closest('.share-row')?.textContent).toContain('"clue": Alice → Bob')
    click(shareButton!)
    expect(shareKnowledge).toHaveBeenCalledWith('alice', 'bob', 'knowledge', 'clue')
  })

  it('falls back to the first eligible actor when the selected actor becomes ineligible', () => {
    const hall = entity({
      id: 'hall',
      name: 'Hall',
      labels: ['場所'],
      actions: [
        {
          id: 'inspect',
          entityId: 'hall',
          name: 'Inspect',
          description: '$actor inspects the hall.',
          isPlayerAction: true,
          requiredKnowledge: ['clue'],
          effects: [],
        },
      ],
    })
    const sc = scenario([
      entity({ id: 'root', name: 'Root' }),
      { ...hall, parentId: 'root' },
      entity({ id: 'alice', name: 'Alice', labels: ['PC'], parentId: 'hall', categories: [knowledge] }),
      entity({ id: 'bob', name: 'Bob', labels: ['PC'], parentId: 'hall', categories: [knowledge] }),
      entity({ id: 'carol', name: 'Carol', labels: ['PC'], parentId: 'hall', categories: [knowledge] }),
    ])
    const ws = initializeWorldState(sc)
    for (const actorId of ['alice', 'bob', 'carol']) {
      applyEffect(
        { type: 'setCategory', target: { type: 'named', entityId: actorId }, categoryId: 'knowledge', value: 'clue' },
        actorId,
        ws.entityStates,
        sc.entities,
        buildChildrenMap(ws.entityStates),
      )
    }
    ws.parties = [{ id: 'party-a', name: 'Main', memberIds: ['alice', 'bob', 'carol'], locationId: 'hall' }]
    ws.activePartyId = 'party-a'
    const onAction = vi.fn()

    const renderPanel = () => dom.render(
      <EntityPanel
        entity={sc.entities.find((e) => e.id === 'hall')!}
        scenario={sc}
        worldState={ws}
        onAction={onAction}
        onNavigate={vi.fn()}
        onMoveParty={vi.fn()}
        onShareKnowledge={vi.fn()}
        onSetCategory={vi.fn()}
        onUpdateEntity={vi.fn()}
        onRemoveEntity={vi.fn()}
        onAddCategoryDef={vi.fn()}
        onUpdateCategoryDef={vi.fn()}
        onRemoveCategoryDef={vi.fn()}
        onRemoveAction={vi.fn()}
        onRemoveTrigger={vi.fn()}
        onFulfill={vi.fn()}
      />,
    )

    renderPanel()
    changeSelect(dom.container.querySelector('.scene-actor-select') as HTMLSelectElement, 'bob')

    applyEffect(
      { type: 'removeCategory', target: { type: 'named', entityId: 'bob' }, categoryId: 'knowledge', value: 'clue' },
      'bob',
      ws.entityStates,
      sc.entities,
      buildChildrenMap(ws.entityStates),
    )
    renderPanel()

    const actorSelect = dom.container.querySelector('.scene-actor-select') as HTMLSelectElement
    expect(Array.from(actorSelect.options).map((option) => option.value)).toEqual(['alice', 'carol'])
    expect(actorSelect.value).toBe('alice')

    click(dom.container.querySelector('.scene-action-run')!)
    expect(onAction).toHaveBeenCalledWith('inspect', 'alice', undefined)
  })

  it('uses live world parent state when listing same-parent location navigation', () => {
    const sc = scenario([
      entity({ id: 'root', name: 'Root' }),
      entity({ id: 'lower', name: 'Lower Level', labels: ['場所'], parentId: 'root' }),
      entity({ id: 'hall', name: 'Hall', labels: ['場所'], parentId: 'root' }),
      entity({ id: 'study', name: 'Study', labels: ['場所'], parentId: 'root' }),
      entity({ id: 'cellar', name: 'Cellar', labels: ['場所'], parentId: 'lower' }),
      entity({ id: 'alice', name: 'Alice', labels: ['PC'], parentId: 'hall' }),
    ])
    const ws = initializeWorldState(sc)
    applyEffect(
      { type: 'move', target: { type: 'named', entityId: 'cellar' }, newParentId: 'root' },
      'cellar',
      ws.entityStates,
      sc.entities,
      buildChildrenMap(ws.entityStates),
    )
    ws.parties = [{ id: 'party-a', name: 'Main', memberIds: ['alice'], locationId: 'hall' }]
    ws.activePartyId = 'party-a'

    dom.render(
      <EntityPanel
        entity={sc.entities.find((e) => e.id === 'hall')!}
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
        onUpdateCategoryDef={vi.fn()}
        onRemoveCategoryDef={vi.fn()}
        onRemoveAction={vi.fn()}
        onRemoveTrigger={vi.fn()}
        onFulfill={vi.fn()}
      />,
    )

    const navButtons = Array.from(dom.container.querySelectorAll('.scene-nav-button'))
    expect(navButtons.map((button) => button.textContent)).toEqual(
      expect.arrayContaining(['Study', 'Cellar']),
    )
    expect(navButtons.map((button) => button.textContent)).not.toContain('Hall')
  })
})
