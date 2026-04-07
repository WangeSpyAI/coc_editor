import { useMemo } from 'react'
import type { Entity, WorldState, Scenario, Action } from '../core/types'
import { buildChildrenMap, getDescendants, getAvailableActions } from '../core/engine'

interface Props {
  entity: Entity
  scenario: Scenario
  worldState: WorldState
  onAction: (actionId: string) => void
  onNavigate: (entityId: string) => void
  onSetCategory: (entityId: string, categoryId: string, value: string) => void
}

/**
 * 場所ビュー: KPのメインビュー
 *
 * 状態バッジはクリッカブル。「〜を調べる」のようなアクションは不要 —
 * KPがバッジをクリックすれば状態が変わり、トリガーが連鎖する。
 */
export function LocationView({ entity, scenario, worldState, onAction, onNavigate, onSetCategory }: Props) {
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

  const children = useMemo(() => {
    const ids = childrenMap[entity.id] ?? []
    return ids
      .map((id) => entityMap.get(id))
      .filter((e): e is Entity => e !== undefined)
  }, [childrenMap, entity.id, entityMap])

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

      {/* Clickable state badges */}
      {categories.length > 0 && (
        <div className="state-section">
          <h3>状態</h3>
          <div className="state-badges">
            {categories.map((cat) => {
              const val = cat.currentValue
              return cat.options.map((opt) => {
                const active = Array.isArray(val) ? val.includes(opt) : val === opt
                return (
                  <span
                    key={`${cat.id}-${opt}`}
                    className="state-badge clickable"
                    style={{
                      cursor: 'pointer',
                      borderColor: active ? 'var(--accent)' : 'var(--border)',
                      opacity: active ? 1 : 0.35,
                    }}
                    onClick={() => onSetCategory(entity.id, cat.id, opt)}
                    title={`${cat.name}: ${opt}`}
                  >
                    <span className="cat-name">{cat.name}:</span>
                    <span className={active ? 'cat-value' : 'cat-name'}>{opt}</span>
                  </span>
                )
              })
            })}
          </div>
        </div>
      )}

      {/* Children with inline clickable states */}
      {children.length > 0 && (
        <div className="children-section">
          <div className="state-section">
            <h3>含まれるもの</h3>
          </div>
          <div className="children-grid">
            {children.map((child) => {
              const childState = worldState.entityStates[child.id]
              return (
                <div key={child.id} className="child-card">
                  <div className="child-name" style={{ cursor: 'pointer' }} onClick={() => onNavigate(child.id)}>
                    {child.name}
                  </div>
                  <div className="child-labels">
                    {child.labels.map((l) => (
                      <span key={l} className="tree-label">{l}</span>
                    ))}
                  </div>
                  {/* Clickable child state badges */}
                  {childState && child.categories.length > 0 && (
                    <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                      {child.categories.map((cat) =>
                        cat.options.map((opt) => {
                          const v = childState.categoryValues[cat.id]
                          const active = Array.isArray(v) ? v.includes(opt) : v === opt
                          return (
                            <span
                              key={`${cat.id}-${opt}`}
                              className="state-badge clickable"
                              style={{
                                fontSize: 11, padding: '1px 6px',
                                cursor: 'pointer',
                                borderColor: active ? 'var(--accent)' : 'var(--border)',
                                opacity: active ? 1 : 0.3,
                              }}
                              onClick={(e) => {
                                e.stopPropagation()
                                onSetCategory(child.id, cat.id, opt)
                              }}
                              title={`${cat.name}: ${opt}`}
                            >
                              <span className={active ? 'cat-value' : 'cat-name'} style={{ fontSize: 10 }}>{opt}</span>
                            </span>
                          )
                        }),
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Actions — only those with real causal effects */}
      {descendantActions.length > 0 && (
        <div className="actions-section">
          <div className="state-section">
            <h3>アクション</h3>
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
                <button className="action-btn" onClick={() => onAction(action.id)}>
                  実行
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
