import { useState, useMemo } from 'react'
import type { Entity, Category, ReadonlyWorldState, Scenario, ConditionClause } from '../core/types'
import { getPendingTriggers } from '../core/engine'
import { StateBadges } from './StateBadges'

interface Props {
  entity: Entity
  scenario: Scenario
  worldState: ReadonlyWorldState
  onSetCategory: (entityId: string, categoryId: string, value: string) => void
  onUpdateEntity: (entityId: string, patch: Partial<Pick<Entity, 'name' | 'description' | 'labels' | 'parentId'>>) => void
  onRemoveEntity: (entityId: string) => void
  onAddCategoryDef: (entityId: string, category: Omit<Category, 'id'>) => string
  onUpdateCategoryDef: (entityId: string, categoryId: string, patch: Partial<Pick<Category, 'name' | 'exclusive' | 'options'>>) => void
  onRemoveCategoryDef: (entityId: string, categoryId: string) => void
  onRemoveAction: (entityId: string, actionId: string) => void
  onRemoveTrigger: (entityId: string, triggerId: string) => void
}

/**
 * 右パネル: エンティティの編集・状態表示
 *
 * ここがシナリオ定義の主要UI。
 * KPはここでエンティティの名前・説明・カテゴリを定義し、
 * カテゴリバッジをクリックして状態を変更する。
 */
export function DetailPanel({
  entity, scenario, worldState,
  onSetCategory, onUpdateEntity, onRemoveEntity,
  onAddCategoryDef, onUpdateCategoryDef, onRemoveCategoryDef,
  onRemoveAction, onRemoveTrigger,
}: Props) {
  const state = worldState.entityStates[entity.id]

  const entityMap = useMemo(() => {
    const m = new Map<string, Entity>()
    for (const e of scenario.entities) m.set(e.id, e)
    return m
  }, [scenario.entities])

  const pending = useMemo(
    () => getPendingTriggers(worldState, scenario).filter((p) => p.entity.id === entity.id),
    [worldState, scenario, entity.id],
  )

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
    <div className="detail-content">
      {/* Entity name — editable */}
      <EditableText
        value={entity.name}
        onCommit={(name) => onUpdateEntity(entity.id, { name })}
        style={{ fontSize: 16, fontWeight: 600 }}
        placeholder="エンティティ名"
      />

      {/* Description — editable */}
      <EditableText
        value={entity.description}
        onCommit={(description) => onUpdateEntity(entity.id, { description })}
        style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 12 }}
        placeholder="説明を入力..."
        multiline
      />

      {/* Labels — editable */}
      <EditableLabels
        labels={entity.labels}
        onCommit={(labels) => onUpdateEntity(entity.id, { labels })}
      />

      {/* Categories — the core editing experience */}
      <div className="detail-section">
        <h4>カテゴリ（状態軸）</h4>
        {entity.categories.map((cat) => (
          <CategoryEditor
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
      </div>

      {/* Actions */}
      {entity.actions.length > 0 && (
        <div className="detail-section">
          <h4>アクション</h4>
          {entity.actions.map((action) => (
            <div key={action.id} style={{
              padding: '6px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 13 }}>{action.name}</span>
              <button className="btn btn-sm btn-danger" onClick={() => onRemoveAction(entity.id, action.id)}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* Triggers */}
      {entity.triggers.length > 0 && (
        <div className="detail-section">
          <h4>トリガー</h4>
          {entity.triggers.map((trigger) => {
            const fired = trigger.firedOnce && worldState.firedTriggerIds.has(trigger.id)
            return (
              <div key={trigger.id} style={{
                padding: '6px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', marginBottom: 4, opacity: fired ? 0.5 : 1,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>
                    {trigger.name}
                    {trigger.firedOnce && (
                      <span style={{ fontSize: 10, color: fired ? 'var(--success)' : 'var(--text-dim)', marginLeft: 6 }}>
                        {fired ? '発火済' : '一度限り'}
                      </span>
                    )}
                  </span>
                  <button className="btn btn-sm btn-danger" onClick={() => onRemoveTrigger(entity.id, trigger.id)}>×</button>
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

      {/* Pending triggers */}
      {pending.length > 0 && (
        <div className="pending-section">
          <div className="detail-section"><h4>待機中（あと1条件）</h4></div>
          {pending.map(({ trigger, unmetClauses }) => (
            <div key={trigger.id} className="pending-trigger">
              <div className="trigger-name">{trigger.name}</div>
              <div className="unmet">未充足: {unmetClauses.map(formatClause).join(', ')}</div>
            </div>
          ))}
        </div>
      )}

      {/* Logs */}
      {relatedLogs.length > 0 && (
        <div className="log-section">
          <div className="detail-section"><h4>ログ</h4></div>
          {relatedLogs.map((log, i) => (
            <div key={i} className="log-entry">
              <span className="log-step">#{log.timestamp}</span>
              <span className={`log-type ${log.type}`}>{log.type}</span>
              {log.description}
            </div>
          ))}
        </div>
      )}

      {/* Delete entity */}
      <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <button className="btn btn-sm btn-danger" onClick={() => onRemoveEntity(entity.id)}>
          このエンティティを削除
        </button>
      </div>
    </div>
  )
}

// ===== Inline editing components =====

function EditableText({ value, onCommit, style, placeholder, multiline }: {
  value: string
  onCommit: (v: string) => void
  style?: React.CSSProperties
  placeholder?: string
  multiline?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (!editing) {
    return (
      <div
        onClick={() => { setDraft(value); setEditing(true) }}
        style={{ ...style, cursor: 'pointer', minHeight: multiline ? 40 : undefined }}
      >
        {value || <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>{placeholder}</span>}
      </div>
    )
  }

  const commit = () => {
    if (draft !== value) onCommit(draft)
    setEditing(false)
  }

  if (multiline) {
    return (
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false) }}
        placeholder={placeholder}
        style={{
          ...style, width: '100%', background: 'var(--bg-card)', border: '1px solid var(--accent)',
          borderRadius: 'var(--radius)', padding: '4px 8px', color: 'var(--text)', resize: 'vertical', minHeight: 60,
        }}
      />
    )
  }

  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
      placeholder={placeholder}
      style={{
        ...style, width: '100%', background: 'var(--bg-card)', border: '1px solid var(--accent)',
        borderRadius: 'var(--radius)', padding: '2px 8px', color: 'var(--text)',
      }}
    />
  )
}

function EditableLabels({ labels, onCommit }: {
  labels: string[]
  onCommit: (labels: string[]) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(labels.join(', '))

  if (!editing) {
    return (
      <div className="detail-section" onClick={() => { setDraft(labels.join(', ')); setEditing(true) }} style={{ cursor: 'pointer' }}>
        <h4>ラベル</h4>
        <div className="state-badges">
          {labels.length > 0
            ? labels.map((l) => <span key={l} className="tree-label" style={{ fontSize: 12, padding: '2px 8px' }}>{l}</span>)
            : <span style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>クリックで追加...</span>
          }
        </div>
      </div>
    )
  }

  const commit = () => {
    const newLabels = draft.split(/[,、\s]+/).filter(Boolean)
    onCommit(newLabels)
    setEditing(false)
  }

  return (
    <div className="detail-section">
      <h4>ラベル（カンマ区切り）</h4>
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        placeholder="例: 場所, 屋内, 危険"
        style={{
          width: '100%', background: 'var(--bg-card)', border: '1px solid var(--accent)',
          borderRadius: 'var(--radius)', padding: '4px 8px', fontSize: 12, color: 'var(--text)',
        }}
      />
    </div>
  )
}

function CategoryEditor({ category, entityId, categoryValues, onSetCategory, onUpdate, onRemove }: {
  category: Category
  entityId: string
  categoryValues?: Readonly<Record<string, string | readonly string[]>>
  onSetCategory: (entityId: string, categoryId: string, value: string) => void
  onUpdate: (patch: Partial<Pick<Category, 'name' | 'exclusive' | 'options'>>) => void
  onRemove: () => void
}) {
  const [editingOptions, setEditingOptions] = useState(false)
  const [optionsDraft, setOptionsDraft] = useState('')

  return (
    <div style={{
      marginBottom: 8, padding: '8px 10px', background: 'var(--bg-card)',
      border: '1px solid var(--border)', borderRadius: 'var(--radius)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <EditableText
          value={category.name}
          onCommit={(name) => onUpdate({ name })}
          style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}
          placeholder="カテゴリ名"
        />
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button
            className="btn btn-sm"
            onClick={() => onUpdate({ exclusive: !category.exclusive })}
            style={{ fontSize: 10, padding: '1px 6px' }}
          >
            {category.exclusive ? '排他' : '非排他'}
          </button>
          <button className="btn btn-sm btn-danger" onClick={onRemove} style={{ fontSize: 10, padding: '1px 6px' }}>×</button>
        </div>
      </div>

      {/* Current value badges (clickable to change state) */}
      {categoryValues && (
        <StateBadges
          categories={[category]}
          categoryValues={categoryValues}
          entityId={entityId}
          onSetCategory={onSetCategory}
        />
      )}

      {/* Option editing */}
      {!editingOptions ? (
        <div
          style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4, cursor: 'pointer' }}
          onClick={() => { setOptionsDraft(category.options.join(', ')); setEditingOptions(true) }}
        >
          選択肢: {category.options.length > 0 ? category.options.join(', ') : '(なし — クリックで追加)'}
        </div>
      ) : (
        <input
          autoFocus
          value={optionsDraft}
          onChange={(e) => setOptionsDraft(e.target.value)}
          onBlur={() => {
            onUpdate({ options: optionsDraft.split(/[,、\s]+/).filter(Boolean) })
            setEditingOptions(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onUpdate({ options: optionsDraft.split(/[,、\s]+/).filter(Boolean) })
              setEditingOptions(false)
            }
            if (e.key === 'Escape') setEditingOptions(false)
          }}
          placeholder="選択肢をカンマ区切りで入力"
          style={{
            width: '100%', marginTop: 4, background: 'var(--bg)', border: '1px solid var(--accent)',
            borderRadius: 'var(--radius)', padding: '3px 6px', fontSize: 11, color: 'var(--text)',
          }}
        />
      )}
    </div>
  )
}

function AddCategoryForm({ entityId, onAdd }: {
  entityId: string
  onAdd: (entityId: string, category: Omit<Category, 'id'>) => string
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [exclusive, setExclusive] = useState(true)
  const [options, setOptions] = useState('')

  if (!open) {
    return (
      <button
        className="btn btn-sm btn-primary"
        onClick={() => setOpen(true)}
        style={{ marginTop: 4 }}
      >
        + カテゴリ追加
      </button>
    )
  }

  const handleSubmit = () => {
    if (!name.trim()) return
    const optList = options.split(/[,、\s]+/).filter(Boolean)
    onAdd(entityId, { name: name.trim(), exclusive, options: optList })
    setName('')
    setOptions('')
    setOpen(false)
  }

  return (
    <div style={{
      marginTop: 4, padding: '8px 10px', background: 'var(--bg-card)',
      border: '1px solid var(--accent)', borderRadius: 'var(--radius)',
    }}>
      <input
        autoFocus
        placeholder="カテゴリ名（例: 施錠状態）"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
        style={{
          width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '4px 8px', fontSize: 12, color: 'var(--text)', marginBottom: 4,
        }}
      />
      <input
        placeholder="選択肢（カンマ区切り: 施錠, 開錠）"
        value={options}
        onChange={(e) => setOptions(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
        style={{
          width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '4px 8px', fontSize: 12, color: 'var(--text)', marginBottom: 4,
        }}
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
