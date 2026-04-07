import { useMemo } from 'react'
import type { Entity, ReadonlyWorldState, Scenario, Action } from '../core/types'
import { buildChildrenMap, getDescendants, getAvailableActions } from '../core/engine'
import { StateBadges } from './StateBadges'

interface Props {
  entity: Entity
  scenario: Scenario
  worldState: ReadonlyWorldState
  onAction: (actionId: string, rollResult?: 'success' | 'failure') => void
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

  return (
    <div className="location-view">
      <h2>{entity.name}</h2>
      <p className="description">{entity.description}</p>

      {/* Clickable state badges */}
      {state && entity.categories.length > 0 && (
        <div className="state-section">
          <h3>状態</h3>
          <StateBadges
            categories={entity.categories}
            categoryValues={state.categoryValues}
            entityId={entity.id}
            onSetCategory={onSetCategory}
          />
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
                    <StateBadges
                      categories={child.categories}
                      categoryValues={childState.categoryValues}
                      entityId={child.id}
                      onSetCategory={onSetCategory}
                      compact
                    />
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
            {descendantActions.map(({ entity: ownerEntity, action }) => {
              const roll = action.rollRequirement
              return (
                <div key={action.id} className="action-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div className="action-info">
                      <div className="action-name">
                        {action.name}
                        {roll && (
                          <span style={{ fontSize: 11, color: 'var(--warning)', marginLeft: 6 }}>
                            [{roll.skill}{roll.difficulty ? ` ${roll.difficulty}` : ''}{roll.opposed ? ' 対抗' : ''}]
                          </span>
                        )}
                      </div>
                      {ownerEntity.id !== entity.id && (
                        <div className="action-owner">{ownerEntity.name}</div>
                      )}
                    </div>
                    {!roll ? (
                      <button className="action-btn" onClick={() => onAction(action.id)}>
                        実行
                      </button>
                    ) : (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="action-btn" onClick={() => onAction(action.id, 'success')}>
                          成功
                        </button>
                        <button className="action-btn" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                          onClick={() => onAction(action.id, 'failure')}>
                          失敗
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
