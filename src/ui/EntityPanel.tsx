import { useState, useMemo } from 'react'
import type { Entity, Category, ReadonlyWorldState, Scenario, Action, ConditionClause } from '../core/types'
import {
  buildChildrenMap,
  canEnter,
  composeSceneDescription,
  evaluateClause,
  getDescendants,
  getAvailableActions,
  getEligibleActors,
  getPendingTriggers,
} from '../core/engine'
import { StateBadges } from './StateBadges'
import { PendingList } from './PendingPanel'
import { describeClause } from './format'

interface Props {
  entity: Entity
  scenario: Scenario
  worldState: ReadonlyWorldState
  onAction: (actionId: string, actorId?: string, rollResult?: 'success' | 'failure') => void
  onNavigate: (entityId: string) => void
  onMoveParty: (locationId: string) => void
  onShareKnowledge: (fromEntityId: string, toEntityId: string, categoryId: string, value: string) => void
  onSetCategory: (entityId: string, categoryId: string, value: string) => void
  onUpdateEntity: (entityId: string, patch: Partial<Pick<Entity, 'name' | 'description' | 'labels' | 'parentId' | 'connections'>>) => void
  onRemoveEntity: (entityId: string) => void
  onAddCategoryDef: (entityId: string, category: Omit<Category, 'id'>) => string
  onUpdateCategoryDef: (entityId: string, categoryId: string, patch: Partial<Pick<Category, 'name' | 'exclusive' | 'options'>>) => void
  onRemoveCategoryDef: (entityId: string, categoryId: string) => void
  onRemoveAction: (entityId: string, actionId: string) => void
  onRemoveTrigger: (entityId: string, triggerId: string) => void
  onFulfill: (ownerEntityId: string, clause: ConditionClause) => void
}

export function EntityPanel({
  entity, scenario, worldState,
  onAction, onNavigate, onMoveParty, onShareKnowledge, onSetCategory,
  onUpdateEntity, onRemoveEntity,
  onAddCategoryDef, onUpdateCategoryDef, onRemoveCategoryDef,
  onRemoveAction, onRemoveTrigger, onFulfill,
}: Props) {
  const state = worldState.entityStates[entity.id]
  const [selectedActors, setSelectedActors] = useState<Record<string, string>>({})

  const childrenMap = useMemo(() => buildChildrenMap(worldState.entityStates), [worldState.entityStates])
  const entityMap = useMemo(() => {
    const m = new Map<string, Entity>()
    for (const e of scenario.entities) m.set(e.id, e)
    return m
  }, [scenario.entities])

  const children = useMemo(() => {
    const ids = childrenMap[entity.id] ?? []
    return ids.map((id) => entityMap.get(id)).filter((e): e is Entity => e !== undefined)
  }, [childrenMap, entity.id, entityMap])

  const descendantActions = useMemo(() => {
    const descIds = [entity.id, ...getDescendants(entity.id, childrenMap)]
    const result: { entity: Entity; action: Action }[] = []
    for (const id of descIds) {
      const ent = entityMap.get(id)
      if (!ent) continue
      for (const action of getAvailableActions(id, worldState, scenario)) {
        result.push({ entity: ent, action })
      }
    }
    return result
  }, [entity.id, childrenMap, entityMap, worldState, scenario])

  const pending = useMemo(
    () => getPendingTriggers(worldState, scenario).filter((p) => p.entity.id === entity.id),
    [worldState, scenario, entity.id],
  )

  const isLocation = entity.labels.includes('場所')
  const activeParty = useMemo(
    () => worldState.parties.find((party) => party.id === worldState.activePartyId) ?? null,
    [worldState.activePartyId, worldState.parties],
  )
  const activePartyLocation = activeParty?.locationId ? entityMap.get(activeParty.locationId) : null
  const activePartyLocationName = activeParty?.locationId
    ? activePartyLocation?.name ?? activeParty.locationId
    : 'ルート'

  const sceneText = useMemo(
    () => isLocation
      ? composeSceneDescription(entity.id, worldState, scenario).map((part) => part.text).join('\n\n')
      : '',
    [isLocation, entity.id, worldState, scenario],
  )

  const navigationTargets = useMemo(() => {
    if (!isLocation) return []
    const ids = new Set<string>()
    for (const id of entity.connections) ids.add(id)
    for (const candidate of scenario.entities) {
      if (candidate.id !== entity.id && candidate.parentId === entity.parentId) ids.add(candidate.id)
    }
    return [...ids]
      .map((id) => entityMap.get(id))
      .filter((candidate): candidate is Entity => Boolean(candidate?.labels.includes('場所')))
      .filter((candidate) => candidate.id !== entity.id)
  }, [entity.connections, entity.id, entity.parentId, entityMap, isLocation, scenario.entities])

  const shareRows = useMemo(() => {
    if (!isLocation || !activeParty) return []
    const pcIds = activeParty.memberIds.filter((memberId) => {
      const member = entityMap.get(memberId)
      return member?.labels.includes('PC') && worldState.entityStates[memberId]?.parentId === entity.id
    })
    if (pcIds.length < 2) return []

    const rows: { from: Entity; to: Entity; categoryId: string; value: string }[] = []
    for (const fromId of pcIds) {
      const from = entityMap.get(fromId)
      const fromState = worldState.entityStates[fromId]
      if (!from || !fromState) continue
      for (const category of from.categories) {
        if (category.exclusive) continue
        const rawValue = fromState.categoryValues[category.id]
        const values = Array.isArray(rawValue) ? rawValue : []
        for (const value of values) {
          for (const toId of pcIds) {
            if (toId === fromId) continue
            const to = entityMap.get(toId)
            const toState = worldState.entityStates[toId]
            if (!to || !toState) continue
            const targetCategory = to.categories.find((c) => c.name === category.name && !c.exclusive)
            const targetValue = targetCategory ? toState.categoryValues[targetCategory.id] : undefined
            const targetValues = Array.isArray(targetValue) ? targetValue : targetValue ? [targetValue] : []
            if (!targetValues.includes(value)) {
              rows.push({ from, to, categoryId: category.id, value })
            }
          }
        }
      }
    }
    return rows
  }, [activeParty, entity.id, entityMap, isLocation, worldState.entityStates])

  return (
    <div className="entity-panel">
      {isLocation && (
        <>
          <SceneNavigation
            entity={entity}
            scenario={scenario}
            worldState={worldState}
            activeParty={activeParty}
            activePartyLocationName={activePartyLocationName}
            navigationTargets={navigationTargets}
            onMove={(locationId) => {
              onMoveParty(locationId)
              onNavigate(locationId)
            }}
          />
          <SceneDescription text={sceneText} />
        </>
      )}

      {/* Header: name + description (editable) */}
      <EditableText
        value={entity.name}
        onCommit={(name) => onUpdateEntity(entity.id, { name })}
        className="entity-panel-name"
        placeholder="エンティティ名"
      />
      <EditableText
        value={entity.description}
        onCommit={(description) => onUpdateEntity(entity.id, { description })}
        className="entity-panel-desc"
        placeholder="説明を入力..."
        multiline
      />

      {/* Labels */}
      <EditableLabels
        labels={entity.labels}
        onCommit={(labels) => onUpdateEntity(entity.id, { labels })}
      />

      {/* Categories: definition + current value in one place */}
      <Section title="カテゴリ（状態軸）">
        {entity.categories.map((cat) => (
          <CategoryBlock
            key={cat.id}
            category={cat}
            entityId={entity.id}
            categoryValues={state?.categoryValues}
            onSetCategory={onSetCategory}
            onUpdate={(patch) => onUpdateCategoryDef(entity.id, cat.id, patch)}
            onRemove={() => onRemoveCategoryDef(entity.id, cat.id)}
          />
        ))}
        <AddCategoryForm entityId={entity.id} onAdd={onAddCategoryDef} />
      </Section>

      {/* Children */}
      {children.length > 0 && (
        <Section title="含まれるもの">
          <div className="children-grid">
            {children.map((child) => {
              const childState = worldState.entityStates[child.id]
              return (
                <div key={child.id} className="child-card" onClick={() => onNavigate(child.id)}>
                  <div className="child-name">{child.name}</div>
                  <div className="child-labels">
                    {child.labels.map((l) => <span key={l} className="tree-label">{l}</span>)}
                  </div>
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
        </Section>
      )}

      {/* Connections */}
      <ConnectionEditor
        entity={entity}
        scenario={scenario}
        onUpdate={(connections) => onUpdateEntity(entity.id, { connections })}
      />

      {/* Actions */}
      {descendantActions.length > 0 && !isLocation && (
        <Section title="アクション">
          <div className="action-list">
            {descendantActions.map(({ entity: owner, action }) => {
              const roll = action.rollRequirement
              return (
                <div key={action.id} className="action-card">
                  <div className="action-info">
                    <div className="action-name">
                      {action.name}
                      {roll && (
                        <span style={{ fontSize: 11, color: 'var(--warning)', marginLeft: 6 }}>
                          [{roll.skill}{roll.difficulty ? ` ${roll.difficulty}` : ''}{roll.opposed ? ' 対抗' : ''}]
                        </span>
                      )}
                    </div>
                    {owner.id !== entity.id && <div className="action-owner">{owner.name}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {!roll ? (
                      <button className="action-btn" onClick={() => onAction(action.id)}>実行</button>
                    ) : (
                      <>
                        <button className="action-btn" onClick={() => onAction(action.id, undefined, 'success')}>成功</button>
                        <button className="action-btn" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                          onClick={() => onAction(action.id, undefined, 'failure')}>失敗</button>
                      </>
                    )}
                    <button className="btn btn-sm btn-danger" onClick={() => onRemoveAction(owner.id, action.id)}
                      style={{ padding: '2px 6px', fontSize: 10 }}>×</button>
                  </div>
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {descendantActions.length > 0 && isLocation && (
        <SceneActions
          actions={descendantActions}
          entity={entity}
          worldState={worldState}
          scenario={scenario}
          selectedActors={selectedActors}
          onSelectActor={(actionId, actorId) => setSelectedActors((prev) => ({ ...prev, [actionId]: actorId }))}
          onAction={onAction}
          onRemoveAction={onRemoveAction}
        />
      )}

      {shareRows.length > 0 && (
        <KnowledgeShareSection rows={shareRows} onShare={onShareKnowledge} />
      )}

      {/* Triggers */}
      {entity.triggers.length > 0 && (
        <Section title="トリガー">
          {entity.triggers.map((trigger) => {
            const fired = trigger.firedOnce && worldState.firedTriggerIds.has(trigger.id)
            return (
              <div key={trigger.id} className="trigger-card" style={{ opacity: fired ? 0.5 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>
                    {trigger.name}
                    {trigger.firedOnce && (
                      <span style={{ fontSize: 10, color: fired ? 'var(--success)' : 'var(--text-dim)', marginLeft: 6 }}>
                        {fired ? '発火済' : '一度限り'}
                      </span>
                    )}
                  </span>
                  <button className="btn btn-sm btn-danger" onClick={() => onRemoveTrigger(entity.id, trigger.id)}
                    style={{ padding: '2px 6px', fontSize: 10 }}>×</button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                  条件: {trigger.condition.clauses.map((c) => describeClause(c, entity, scenario)).join(' AND ')}
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
        </Section>
      )}

      {/* Pending triggers — ヘッダのドロップダウンと同じ PendingList（付与ボタン付き） */}
      {pending.length > 0 && (
        <Section title="待機中（あと1条件）">
          <PendingList
            pending={pending}
            scenario={scenario}
            onSelectEntity={onNavigate}
            onFulfill={onFulfill}
          />
        </Section>
      )}

      {/* Delete */}
      <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <button className="btn btn-sm btn-danger" onClick={() => onRemoveEntity(entity.id)}>
          このエンティティを削除
        </button>
      </div>
    </div>
  )
}

function SceneNavigation({
  entity,
  scenario,
  worldState,
  activeParty,
  activePartyLocationName,
  navigationTargets,
  onMove,
}: {
  entity: Entity
  scenario: Scenario
  worldState: ReadonlyWorldState
  activeParty: ReadonlyWorldState['parties'][number] | null
  activePartyLocationName: string
  navigationTargets: Entity[]
  onMove: (locationId: string) => void
}) {
  if (!activeParty) {
    return <div className="scene-nav scene-nav-muted">アクティブパーティがありません</div>
  }

  if (activeParty.locationId !== entity.id) {
    const enterable = canEnter(entity.id, worldState, scenario)
    return (
      <div className="scene-nav scene-viewing">
        <span>⚠ パーティは「{activePartyLocationName}」にいます（閲覧中）</span>
        <button
          className="btn btn-sm btn-primary"
          type="button"
          disabled={!enterable}
          title={!enterable ? describeUnmetEntryCondition(entity, worldState, scenario) : undefined}
          onClick={() => onMove(entity.id)}
        >
          ここへ移動
        </button>
      </div>
    )
  }

  return (
    <div className="scene-nav">
      <span className="scene-nav-label">移動:</span>
      <div className="scene-nav-buttons">
        {navigationTargets.map((target) => {
          const enterable = canEnter(target.id, worldState, scenario)
          return (
            <button
              key={target.id}
              className="scene-nav-button"
              type="button"
              disabled={!enterable}
              title={!enterable ? describeUnmetEntryCondition(target, worldState, scenario) : undefined}
              onClick={() => onMove(target.id)}
            >
              {!enterable && '🔒 '}
              {target.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function describeUnmetEntryCondition(
  entity: Entity,
  worldState: ReadonlyWorldState,
  scenario: Scenario,
): string {
  if (!entity.entryCondition) return ''
  const childrenMap = buildChildrenMap(worldState.entityStates)
  return entity.entryCondition.clauses
    .filter((clause) => !evaluateClause(clause, entity.id, worldState.entityStates, scenario.entities, childrenMap))
    .map((clause) => describeClause(clause, entity, scenario))
    .join(' AND ')
}

function SceneDescription({ text }: { text: string }) {
  const copy = () => {
    if (!text || !navigator.clipboard) return
    navigator.clipboard.writeText(text).catch(() => { /* clipboard unavailable: silent no-op */ })
  }

  return (
    <div className="scene-description-block">
      <div className="scene-description">{text || '描写なし'}</div>
      <button className="btn btn-sm scene-copy-button" type="button" onClick={copy} disabled={!text}>
        場面をコピー
      </button>
    </div>
  )
}

function SceneActions({
  actions,
  entity,
  worldState,
  scenario,
  selectedActors,
  onSelectActor,
  onAction,
  onRemoveAction,
}: {
  actions: { entity: Entity; action: Action }[]
  entity: Entity
  worldState: ReadonlyWorldState
  scenario: Scenario
  selectedActors: Readonly<Record<string, string>>
  onSelectActor: (actionId: string, actorId: string) => void
  onAction: (actionId: string, actorId?: string, rollResult?: 'success' | 'failure') => void
  onRemoveAction: (entityId: string, actionId: string) => void
}) {
  const playerActions = actions.filter(({ action }) => action.isPlayerAction)
  const keeperActions = actions.filter(({ action }) => !action.isPlayerAction)

  return (
    <>
      {playerActions.length > 0 && (
        <Section title="PL行動">
          <div className="action-list">
            {playerActions.map(({ entity: owner, action }) => (
              <SceneActionCard
                key={action.id}
                owner={owner}
                currentEntity={entity}
                action={action}
                worldState={worldState}
                scenario={scenario}
                selectedActorId={selectedActors[action.id]}
                onSelectActor={(actorId) => onSelectActor(action.id, actorId)}
                onAction={onAction}
                onRemoveAction={onRemoveAction}
              />
            ))}
          </div>
        </Section>
      )}

      {keeperActions.length > 0 && (
        <Section title="KP判断">
          <div className="action-list">
            {keeperActions.map(({ entity: owner, action }) => (
              <SceneActionCard
                key={action.id}
                owner={owner}
                currentEntity={entity}
                action={action}
                worldState={worldState}
                scenario={scenario}
                selectedActorId={undefined}
                onSelectActor={() => {}}
                onAction={onAction}
                onRemoveAction={onRemoveAction}
              />
            ))}
          </div>
        </Section>
      )}
    </>
  )
}

function SceneActionCard({
  owner,
  currentEntity,
  action,
  worldState,
  scenario,
  selectedActorId,
  onSelectActor,
  onAction,
  onRemoveAction,
}: {
  owner: Entity
  currentEntity: Entity
  action: Action
  worldState: ReadonlyWorldState
  scenario: Scenario
  selectedActorId?: string
  onSelectActor: (actorId: string) => void
  onAction: (actionId: string, actorId?: string, rollResult?: 'success' | 'failure') => void
  onRemoveAction: (entityId: string, actionId: string) => void
}) {
  const roll = action.rollRequirement
  const eligibleActors = action.isPlayerAction ? getEligibleActors(action, worldState, scenario) : []
  const actorId = action.isPlayerAction
    ? eligibleActors.length === 1
      ? eligibleActors[0]
      : selectedActorId || eligibleActors[0] || ''
    : undefined
  const actorName = actorId ? scenario.entities.find((candidate) => candidate.id === actorId)?.name ?? actorId : ''
  const disabled = action.isPlayerAction && eligibleActors.length === 0
  const disabledTitle = disabled ? '行為者候補がいません' : undefined

  const run = (rollResult?: 'success' | 'failure') => {
    if (disabled) return
    onAction(action.id, actorId, rollResult)
  }

  return (
    <div className="action-card">
      <div className="action-info">
        <div className="action-name">
          {action.name}
          {roll && (
            <span className="scene-roll-badge">
              [{roll.skill}{roll.difficulty ? ` ${roll.difficulty}` : ''}{roll.opposed ? ' 対抗' : ''}]
            </span>
          )}
        </div>
        {owner.id !== currentEntity.id && <div className="action-owner">{owner.name}</div>}
        {action.isPlayerAction && eligibleActors.length === 1 && (
          <div className="scene-actor-hint">{actorName}</div>
        )}
      </div>
      <div className="scene-action-controls">
        {action.isPlayerAction && eligibleActors.length > 1 && (
          <select
            className="scene-actor-select"
            value={actorId}
            onChange={(e) => onSelectActor(e.target.value)}
          >
            {eligibleActors.map((id) => {
              const actor = scenario.entities.find((candidate) => candidate.id === id)
              return <option key={id} value={id}>{actor?.name ?? id}</option>
            })}
          </select>
        )}
        {!roll ? (
          <button
            className="action-btn scene-action-run"
            type="button"
            disabled={disabled}
            title={disabledTitle}
            onClick={() => run()}
          >
            実行
          </button>
        ) : (
          <>
            <button
              className="action-btn scene-action-run"
              type="button"
              disabled={disabled}
              title={disabledTitle}
              onClick={() => run('success')}
            >
              成功
            </button>
            <button
              className="action-btn scene-action-run scene-action-failure"
              type="button"
              disabled={disabled}
              title={disabledTitle}
              onClick={() => run('failure')}
            >
              失敗
            </button>
          </>
        )}
        <button
          className="btn btn-sm btn-danger scene-action-remove"
          type="button"
          onClick={() => onRemoveAction(owner.id, action.id)}
        >
          ×
        </button>
      </div>
    </div>
  )
}

function KnowledgeShareSection({
  rows,
  onShare,
}: {
  rows: { from: Entity; to: Entity; categoryId: string; value: string }[]
  onShare: (fromEntityId: string, toEntityId: string, categoryId: string, value: string) => void
}) {
  return (
    <Section title="情報共有">
      <div className="share-list">
        {rows.map((row) => (
          <div key={`${row.from.id}-${row.to.id}-${row.categoryId}-${row.value}`} className="share-row">
            <span>"{row.value}": {row.from.name} → {row.to.name}</span>
            <button
              className="btn btn-sm share-button"
              type="button"
              onClick={() => onShare(row.from.id, row.to.id, row.categoryId, row.value)}
            >
              共有
            </button>
          </div>
        ))}
      </div>
    </Section>
  )
}

// ===== Shared small components =====

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="entity-section">
      <h3>{title}</h3>
      {children}
    </div>
  )
}

function EditableText({ value, onCommit, className, placeholder, multiline }: {
  value: string; onCommit: (v: string) => void; className?: string; placeholder?: string; multiline?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (!editing) {
    return (
      <div className={className} onClick={() => { setDraft(value); setEditing(true) }} style={{ cursor: 'pointer' }}>
        {value || <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>{placeholder}</span>}
      </div>
    )
  }

  const commit = () => { if (draft !== value) onCommit(draft); setEditing(false) }

  if (multiline) {
    return (
      <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
        onBlur={commit} onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false) }}
        placeholder={placeholder}
        className={className}
        style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--accent)',
          borderRadius: 'var(--radius)', padding: '4px 8px', color: 'var(--text)', resize: 'vertical', minHeight: 60 }}
      />
    )
  }

  return (
    <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
      onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
      placeholder={placeholder}
      className={className}
      style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--accent)',
        borderRadius: 'var(--radius)', padding: '2px 8px', color: 'var(--text)' }}
    />
  )
}

function EditableLabels({ labels, onCommit }: { labels: string[]; onCommit: (labels: string[]) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(labels.join(', '))

  if (!editing) {
    return (
      <div className="entity-section" onClick={() => { setDraft(labels.join(', ')); setEditing(true) }} style={{ cursor: 'pointer' }}>
        <h3>ラベル</h3>
        <div className="state-badges">
          {labels.length > 0
            ? labels.map((l) => <span key={l} className="tree-label" style={{ fontSize: 12, padding: '2px 8px' }}>{l}</span>)
            : <span style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>クリックで追加...</span>
          }
        </div>
      </div>
    )
  }

  const commit = () => { onCommit(draft.split(/[,、\s]+/).filter(Boolean)); setEditing(false) }

  return (
    <div className="entity-section">
      <h3>ラベル（カンマ区切り）</h3>
      <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
        onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        placeholder="例: 場所, 屋内, 危険"
        style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--accent)',
          borderRadius: 'var(--radius)', padding: '4px 8px', fontSize: 12, color: 'var(--text)' }}
      />
    </div>
  )
}

function CategoryBlock({ category, entityId, categoryValues, onSetCategory, onUpdate, onRemove }: {
  category: Category; entityId: string
  categoryValues?: Readonly<Record<string, string | readonly string[]>>
  onSetCategory: (entityId: string, categoryId: string, value: string) => void
  onUpdate: (patch: Partial<Pick<Category, 'name' | 'exclusive' | 'options'>>) => void
  onRemove: () => void
}) {
  const [editingOptions, setEditingOptions] = useState(false)
  const [optionsDraft, setOptionsDraft] = useState('')

  return (
    <div className="category-block">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <EditableText
          value={category.name}
          onCommit={(name) => onUpdate({ name })}
          className="category-name"
          placeholder="カテゴリ名"
        />
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button className="btn btn-sm" onClick={() => onUpdate({ exclusive: !category.exclusive })}
            style={{ fontSize: 10, padding: '1px 6px' }}>
            {category.exclusive ? '排他' : '非排他'}
          </button>
          <button className="btn btn-sm btn-danger" onClick={onRemove} style={{ fontSize: 10, padding: '1px 6px' }}>×</button>
        </div>
      </div>

      {categoryValues && (
        <StateBadges categories={[category]} categoryValues={categoryValues}
          entityId={entityId} onSetCategory={onSetCategory} />
      )}

      {!editingOptions ? (
        <div className="category-options-display"
          onClick={() => { setOptionsDraft(category.options.join(', ')); setEditingOptions(true) }}>
          選択肢: {category.options.length > 0 ? category.options.join(', ') : '(なし — クリックで追加)'}
        </div>
      ) : (
        <input autoFocus value={optionsDraft} onChange={(e) => setOptionsDraft(e.target.value)}
          onBlur={() => { onUpdate({ options: optionsDraft.split(/[,、\s]+/).filter(Boolean) }); setEditingOptions(false) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { onUpdate({ options: optionsDraft.split(/[,、\s]+/).filter(Boolean) }); setEditingOptions(false) }
            if (e.key === 'Escape') setEditingOptions(false)
          }}
          placeholder="選択肢をカンマ区切りで入力"
          style={{ width: '100%', marginTop: 4, background: 'var(--bg)', border: '1px solid var(--accent)',
            borderRadius: 'var(--radius)', padding: '3px 6px', fontSize: 11, color: 'var(--text)' }}
        />
      )}
    </div>
  )
}

function AddCategoryForm({ entityId, onAdd }: {
  entityId: string; onAdd: (entityId: string, category: Omit<Category, 'id'>) => string
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [exclusive, setExclusive] = useState(true)
  const [options, setOptions] = useState('')

  if (!open) {
    return <button className="btn btn-sm btn-primary" onClick={() => setOpen(true)} style={{ marginTop: 4 }}>+ カテゴリ追加</button>
  }

  const handleSubmit = () => {
    if (!name.trim()) return
    onAdd(entityId, { name: name.trim(), exclusive, options: options.split(/[,、\s]+/).filter(Boolean) })
    setName(''); setOptions(''); setOpen(false)
  }

  return (
    <div className="add-category-form">
      <input autoFocus placeholder="カテゴリ名（例: 施錠状態）" value={name}
        onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
        style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '4px 8px', fontSize: 12, color: 'var(--text)', marginBottom: 4 }}
      />
      <input placeholder="選択肢（カンマ区切り: 施錠, 開錠）" value={options}
        onChange={(e) => setOptions(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
        style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '4px 8px', fontSize: 12, color: 'var(--text)', marginBottom: 4 }}
      />
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={exclusive} onChange={(e) => setExclusive(e.target.checked)} />
          排他（1つだけ選択）
        </label>
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm btn-primary" onClick={handleSubmit} disabled={!name.trim()}>追加</button>
        <button className="btn btn-sm" onClick={() => setOpen(false)}>キャンセル</button>
      </div>
    </div>
  )
}

function ConnectionEditor({ entity, scenario, onUpdate }: {
  entity: Entity; scenario: Scenario; onUpdate: (connections: string[]) => void
}) {
  const otherEntities = useMemo(
    () => scenario.entities.filter((e) => e.id !== entity.id),
    [scenario.entities, entity.id],
  )

  return (
    <div className="entity-section">
      <h3>接続先（地図）</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
        {entity.connections.map((connId) => {
          const target = scenario.entities.find((e) => e.id === connId)
          return (
            <span key={connId} className="state-badge" style={{ cursor: 'pointer' }}
              onClick={() => onUpdate(entity.connections.filter((c) => c !== connId))} title="クリックで削除">
              <span className="cat-value">{target?.name ?? connId}</span>
              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>×</span>
            </span>
          )
        })}
      </div>
      <select value="" onChange={(e) => {
          if (e.target.value && !entity.connections.includes(e.target.value))
            onUpdate([...entity.connections, e.target.value])
        }}
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', color: 'var(--text)', padding: '3px 6px', fontSize: 11 }}>
        <option value="">接続先を追加...</option>
        {otherEntities.filter((e) => !entity.connections.includes(e.id)).map((e) =>
          <option key={e.id} value={e.id}>{e.name}</option>
        )}
      </select>
    </div>
  )
}
