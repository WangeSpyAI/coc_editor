import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EntityTree } from '../EntityTree'
import type { Entity, Scenario } from '../../core/types'
import { initializeWorldState } from '../../core/engine'
import { createDomRenderer } from './testUtils'

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

describe('EntityTree', () => {
  let dom: ReturnType<typeof createDomRenderer>

  beforeEach(() => {
    dom = createDomRenderer()
  })

  afterEach(() => {
    dom.cleanup()
    vi.restoreAllMocks()
  })

  it('marks the active party location node', () => {
    const sc = scenario([
      entity({ id: 'hall', name: 'Hall', labels: ['場所'] }),
      entity({ id: 'study', name: 'Study', labels: ['場所'] }),
      entity({ id: 'pc-a', name: 'Alice', labels: ['PC'], parentId: 'study' }),
    ])
    const ws = initializeWorldState(sc)
    ws.parties = [{ id: 'party-a', name: 'Main', memberIds: ['pc-a'], locationId: 'study' }]
    ws.activePartyId = 'party-a'

    dom.render(
      <EntityTree
        scenario={sc}
        worldState={ws}
        selectedId={null}
        onSelect={vi.fn()}
        onAddEntity={vi.fn()}
      />,
    )

    const marker = dom.container.querySelector('.tree-current-location')
    expect(marker?.textContent).toBe('●')
    expect(marker?.getAttribute('title')).toBe('アクティブパーティの現在地')
    expect(marker?.closest('.tree-node-row')?.textContent).toContain('Study')
  })
})
