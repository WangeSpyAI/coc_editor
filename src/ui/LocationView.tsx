import { useMemo } from 'react'
import type { Entity, WorldState, Scenario, Action } from '../core/types'
import { buildChildrenMap, getDescendants, getAvailableActions } from '../core/engine'

interface Props {
  entity: Entity
  scenario: Scenario
  worldState: WorldState
  onAction: (actionId: string) => void
  onNavigate: (entityId: string) => void
}

/**
 * 場所ビュー: KPのメインビュー
 *
 * 選択エンティティとその子孫の状態・アクションを集約表示。
 * KPはここを見るだけで「今の状況」が分かる。
 */
export function LocationView({ entity, scenario, worldState, onAction, onNavigate }: Props) {
  const childrenMap = useMemo(
    () => buildChildrenMap(worldState.entityStates),
    [worldState.entityStates],
  )

  const entityMap = useMemo(() => {
    const m = new Map<string, Entity>()
    for (const e of scenario.entities) m.set(e.id, e)
    return m
  }, [scenario.entities])

  const state = worldState.entityStates[entity.id]

  // Direct children
  const children = useMemo(() => {
    const ids = childrenMap[entity.id] ?? []
    return ids
      .map((id) => entityMap.get(id))
      .filter((e): e is Entity => e !== undefined)
  }, [childrenMap, entity.id, entityMap])

  // Descendant actions (aggregated)
  const descendantActions = useMemo(() => {
    const descIds = [entity.id, ...getDescendants(entity.id, childrenMap)]
    const result: { entity: Entity; action: Action }[] = []
    for (const id of descIds) {
      const ent = entityMap.get(id)
      if (!ent) continue
      const actions = getAvailableActions(id, worldState, scenario)
      for (const action of actions) {
        result.push({ entity: ent, action })
      }
    }
    return result
  }, [entity.id, childrenMap, entityMap, worldState, scenario])

  // Entity categories (current state)
  const categories = useMemo(() => {
    if (!state) return []
    return entity.categories.map((cat) => ({
      ...cat,
      currentValue: state.categoryValues[cat.id],
    }))
  }, [entity, state])

  return (
    <div className="location-view">
      <h2>{entity.name}</h2>
      <p className="description">{entity.description}</p>

      {/* Current state */}
      {categories.length > 0 && (
        <div className="state-section">
          <h3>状態</h3>
          <div className="state-badges">
            {categories.map((cat) => {
              const val = cat.currentValue
              if (Array.isArray(val)) {
                if (val.length === 0) return null
                return (
                  <span key={cat.id} className="state-badge multi">
                    <span className="cat-name">{cat.name}:</span>
                    <span className="cat-value">{val.join(', ')}</span>
                  </span>
                )
              }
              return (
                <span key={cat.id} className="state-badge">
                  <span className="cat-name">{cat.name}:</span>
                  <span className="cat-value">{val}</span>
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Children */}
      {children.length > 0 && (
        <div className="children-section">
          <div className="state-section">
            <h3>含まれるもの</h3>
          </div>
          <div className="children-grid">
            {children.map((child) => {
              const childState = worldState.entityStates[child.id]
              return (
                <div
                  key={child.id}
                  className="child-card"
                  onClick={() => onNavigate(child.id)}
                >
                  <div className="child-name">{child.name}</div>
                  <div className="child-labels">
                    {child.labels.map((l) => (
                      <span key={l} className="tree-label">{l}</span>
                    ))}
                  </div>
                  {/* Show child's current category values */}
                  {childState && child.categories.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      {child.categories.map((cat) => {
                        const v = childState.categoryValues[cat.id]
                        const display = Array.isArray(v) ? (v.length > 0 ? v.join(', ') : null) : v
                        if (!display) return null
                        return (
                          <span key={cat.id} className="state-badge" style={{ fontSize: 11, padding: '1px 6px', margin: '2px 2px 0 0' }}>
                            <span className="cat-name" style={{ fontSize: 10 }}>{cat.name}:</span>
                            <span className="cat-value" style={{ fontSize: 10 }}>{display}</span>
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Available actions (aggregated from self + descendants) */}
      {descendantActions.length > 0 && (
        <div className="actions-section">
          <div className="state-section">
            <h3>利用可能なアクション</h3>
          </div>
          <div className="action-list">
            {descendantActions.map(({ entity: ownerEntity, action }) => (
              <div key={action.id} className="action-card">
                <div className="action-info">
                  <div className="action-name">{action.name}</div>
                  {ownerEntity.id !== entity.id && (
                    <div className="action-owner">{ownerEntity.name}</div>
                  )}
                </div>
                <button
                  className="action-btn"
                  onClick={() => onAction(action.id)}
                >
                  実行
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {descendantActions.length === 0 && children.length === 0 && categories.length === 0 && (
        <div style={{ color: 'var(--text-dim)', marginTop: 16 }}>
          このエンティティには子要素・アクション・カテゴリがありません。
        </div>
      )}
    </div>
  )
}
