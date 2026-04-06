import { useMemo } from 'react'
import type { Entity, WorldState, Scenario, ConditionClause } from '../core/types'
import { getPendingTriggers } from '../core/engine'

interface Props {
  entity: Entity
  scenario: Scenario
  worldState: WorldState
}

/**
 * 右パネル: 選択エンティティの詳細情報
 *
 * - 全カテゴリの現在値
 * - トリガー一覧（発火済み表示）
 * - 待機中トリガー（あと1条件で発火）
 * - 描写ログ（このエンティティ関連）
 */
export function DetailPanel({ entity, scenario, worldState }: Props) {
  const state = worldState.entityStates[entity.id]

  const entityMap = useMemo(() => {
    const m = new Map<string, Entity>()
    for (const e of scenario.entities) m.set(e.id, e)
    return m
  }, [scenario.entities])

  // Pending triggers for the whole world, filtered to this entity
  const pending = useMemo(
    () => getPendingTriggers(worldState, scenario).filter((p) => p.entity.id === entity.id),
    [worldState, scenario, entity.id],
  )

  // Logs related to this entity
  const relatedLogs = useMemo(
    () => worldState.log.filter((l) => l.sourceEntityId === entity.id).slice(-20),
    [worldState.log, entity.id],
  )

  const formatClause = (c: ConditionClause): string => {
    const refLabel =
      c.reference.type === 'named'
        ? entityMap.get(c.reference.entityId ?? '')?.name ?? c.reference.entityId
        : c.reference.type === 'self'
          ? '自身'
          : c.reference.type
    const neg = c.negate ? '≠' : '='
    return `${refLabel}.${c.categoryId} ${neg} ${c.value}`
  }

  return (
    <div className="detail-panel">
      <h2>{entity.name}</h2>
      <p className="description">{entity.description}</p>

      {entity.labels.length > 0 && (
        <div className="detail-section">
          <h4>ラベル</h4>
          <div className="state-badges">
            {entity.labels.map((l) => (
              <span key={l} className="tree-label" style={{ fontSize: 12, padding: '2px 8px' }}>{l}</span>
            ))}
          </div>
        </div>
      )}

      {/* All categories with current values */}
      {entity.categories.length > 0 && state && (
        <div className="detail-section">
          <h4>カテゴリ</h4>
          {entity.categories.map((cat) => {
            const val = state.categoryValues[cat.id]
            return (
              <div key={cat.id} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>
                  {cat.name} ({cat.exclusive ? '排他' : '非排他'})
                </div>
                <div className="state-badges">
                  {cat.options.map((opt) => {
                    const active = Array.isArray(val) ? val.includes(opt) : val === opt
                    return (
                      <span
                        key={opt}
                        className="state-badge"
                        style={{
                          borderColor: active ? 'var(--accent)' : 'var(--border)',
                          opacity: active ? 1 : 0.4,
                        }}
                      >
                        <span className={active ? 'cat-value' : 'cat-name'}>{opt}</span>
                      </span>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Triggers */}
      {entity.triggers.length > 0 && (
        <div className="detail-section">
          <h4>トリガー</h4>
          {entity.triggers.map((trigger) => {
            const fired = trigger.firedOnce && worldState.firedTriggerIds.has(trigger.id)
            return (
              <div
                key={trigger.id}
                style={{
                  padding: '6px 10px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  marginBottom: 4,
                  opacity: fired ? 0.5 : 1,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  {trigger.name}
                  {trigger.firedOnce && (
                    <span style={{ fontSize: 10, color: fired ? 'var(--success)' : 'var(--text-dim)', marginLeft: 6 }}>
                      {fired ? '発火済' : '一度限り'}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                  条件: {trigger.condition.clauses.map(formatClause).join(' AND ')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  効果: {trigger.effects.map((e) =>
                    e.type === 'setCategory' ? `${e.categoryId}→${e.value}` :
                    e.type === 'removeCategory' ? `${e.categoryId}−${e.value}` :
                    e.type === 'move' ? `移動→${e.newParentId}` : '?'
                  ).join(', ')}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pending triggers (1 remaining condition) */}
      {pending.length > 0 && (
        <div className="pending-section">
          <div className="detail-section">
            <h4>待機中（あと1条件）</h4>
          </div>
          {pending.map(({ trigger, unmetClauses }) => (
            <div key={trigger.id} className="pending-trigger">
              <div className="trigger-name">{trigger.name}</div>
              <div className="unmet">
                未充足: {unmetClauses.map(formatClause).join(', ')}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Related logs */}
      {relatedLogs.length > 0 && (
        <div className="log-section">
          <div className="detail-section">
            <h4>ログ</h4>
          </div>
          {relatedLogs.map((log, i) => (
            <div key={i} className="log-entry">
              <span className="log-step">#{log.timestamp}</span>
              <span className={`log-type ${log.type}`}>{log.type}</span>
              {log.description}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
