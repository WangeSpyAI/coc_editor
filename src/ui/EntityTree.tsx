import { useState, useMemo, useCallback } from 'react'
import type { Entity, ReadonlyWorldState, Scenario } from '../core/types'
import { buildChildrenMap } from '../core/engine'

interface Props {
  scenario: Scenario
  worldState: ReadonlyWorldState
  selectedId: string | null
  onSelect: (id: string) => void
}

export function EntityTree({ scenario, worldState, selectedId, onSelect }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const childrenMap = useMemo(
    () => buildChildrenMap(worldState.entityStates),
    [worldState.entityStates],
  )

  const entityMap = useMemo(() => {
    const m = new Map<string, Entity>()
    for (const e of scenario.entities) m.set(e.id, e)
    return m
  }, [scenario.entities])

  const rootIds = useMemo(
    () => scenario.entities.filter((e) => e.parentId === null).map((e) => e.id),
    [scenario.entities],
  )

  const toggleCollapse = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const renderNode = (entityId: string, depth: number): React.ReactNode => {
    const entity = entityMap.get(entityId)
    if (!entity) return null

    const children = childrenMap[entityId] ?? []
    const hasChildren = children.length > 0
    const isCollapsed = collapsed[entityId]
    const isSelected = entityId === selectedId

    return (
      <div key={entityId} className="tree-node">
        <div
          className={`tree-node-row${isSelected ? ' selected' : ''}`}
          onClick={() => onSelect(entityId)}
        >
          {Array.from({ length: depth }).map((_, i) => (
            <span key={i} className="tree-indent" />
          ))}
          {hasChildren ? (
            <span
              className="tree-toggle"
              onClick={(e) => toggleCollapse(entityId, e)}
            >
              {isCollapsed ? '\u25B6' : '\u25BC'}
            </span>
          ) : (
            <span className="tree-toggle" />
          )}
          <span className="tree-node-name">{entity.name}</span>
          <span className="entity-indicators">
            {entity.triggers.length > 0 && <span className="indicator trigger" title="トリガーあり" />}
            {entity.actions.length > 0 && <span className="indicator action" title="アクションあり" />}
          </span>
          {entity.labels.length > 0 && (
            <span className="tree-node-labels">
              {entity.labels.slice(0, 2).map((l) => (
                <span key={l} className="tree-label">{l}</span>
              ))}
            </span>
          )}
        </div>
        {hasChildren && !isCollapsed && children.map((cid) => renderNode(cid, depth + 1))}
      </div>
    )
  }

  return (
    <div className="entity-tree">
      {rootIds.map((id) => renderNode(id, 0))}
    </div>
  )
}
