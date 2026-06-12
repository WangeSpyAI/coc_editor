import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PartyBar } from '../PartyBar'
import type { Entity, Scenario } from '../../core/types'
import { initializeWorldState } from '../../core/engine'
import { click, createDomRenderer } from './testUtils'

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

describe('PartyBar', () => {
  let dom: ReturnType<typeof createDomRenderer>

  beforeEach(() => {
    dom = createDomRenderer()
  })

  afterEach(() => {
    dom.cleanup()
    vi.restoreAllMocks()
  })

  it('shows party tabs, active members, current location, and follows location on tab click', () => {
    const sc = scenario([
      entity({ id: 'hall', name: 'Hall', labels: ['場所'] }),
      entity({ id: 'study', name: 'Study', labels: ['場所'] }),
      entity({ id: 'pc-a', name: 'Alice', labels: ['PC'], parentId: 'hall' }),
      entity({ id: 'pc-b', name: 'Bob', labels: ['PC'], parentId: 'study' }),
    ])
    const ws = initializeWorldState(sc)
    ws.parties = [
      { id: 'party-a', name: 'Main', memberIds: ['pc-a'], locationId: 'hall' },
      { id: 'party-b', name: 'Split', memberIds: ['pc-b'], locationId: 'study' },
    ]
    ws.activePartyId = 'party-a'
    const setActiveParty = vi.fn()
    const selectEntity = vi.fn()
    const removeFromParty = vi.fn()

    dom.render(
      <PartyBar
        scenario={sc}
        worldState={ws}
        onSetActiveParty={setActiveParty}
        onSelectEntity={selectEntity}
        onSplitParty={vi.fn()}
        onMergeParties={vi.fn()}
        onRemoveFromParty={removeFromParty}
      />,
    )

    expect(dom.container.querySelector('.party-bar-location')?.textContent).toContain('Hall')
    expect(dom.container.querySelector('.party-tab.active')?.textContent).toContain('Main')
    expect(dom.container.querySelector('.party-member-chip')?.textContent).toContain('Alice')

    const tabs = dom.container.querySelectorAll('.party-tab')
    click(tabs[1])
    expect(setActiveParty).toHaveBeenCalledWith('party-b')
    expect(selectEntity).toHaveBeenCalledWith('study')

    const removeButton = dom.container.querySelector('.party-member-remove')
    expect(removeButton).not.toBeNull()
    click(removeButton!)
    expect(removeFromParty).toHaveBeenCalledWith('pc-a')
  })
})
