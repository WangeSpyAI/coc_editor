import { useState, useMemo } from 'react'
import type { Scenario, Effect, Entity } from '../core/types'

type EditorMode = 'closed' | 'action' | 'trigger' | 'entity' | 'effect'

interface Props {
  scenario: Scenario
  selectedEntityId: string | null
  onAddEntity: (entity: Omit<Entity, 'id'>) => string
  onAddAction: (entityId: string, action: { name: string; description: string; isPlayerAction: boolean; effects: Effect[]; displayCondition?: { clauses: { reference: { type: 'named'; entityId: string }; categoryId: string; value: string; negate?: boolean }[] } }) => string
  onAddTrigger: (entityId: string, trigger: { name: string; condition: { clauses: { reference: { type: 'named'; entityId: string }; categoryId: string; value: string; negate?: boolean }[] }; effects: Effect[]; firedOnce?: boolean }) => string
  onApplyEffect: (effects: Effect[], description: string) => void
}

/**
 * リアルタイムシナリオ執筆パネル
 *
 * PLが想定外の行動を提案したとき、KPはここで:
 * 1. 新しいアクションを書く（シナリオに追加される）
 * 2. 新しいトリガーを書く（因果関係をシナリオに追加）
 * 3. 新しいエンティティを出す（壊れた窓、出現した怪物など）
 * 4. 直接効果を適用する（既存の状態をその場で変える）
 *
 * 全てシナリオ自体が変更される = 次のセッションでも使える。
 */
export function LiveEditor({
  scenario,
  selectedEntityId,
  onAddEntity,
  onAddAction,
  onAddTrigger,
  onApplyEffect,
}: Props) {
  const [mode, setMode] = useState<EditorMode>('closed')

  if (mode === 'closed') {
    return (
      <div className="adhoc-section">
        <div className="state-section">
          <h3>シナリオ執筆</h3>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          <button className="btn btn-sm btn-primary" onClick={() => setMode('action')}>
            アクション追加
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => setMode('trigger')}>
            トリガー追加
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => setMode('entity')}>
            エンティティ追加
          </button>
          <button className="btn btn-sm" onClick={() => setMode('effect')}>
            直接効果
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="adhoc-section">
      <div className="state-section">
        <h3>
          {mode === 'action' && 'アクション追加（シナリオに書き込み）'}
          {mode === 'trigger' && 'トリガー追加（因果関係を定義）'}
          {mode === 'entity' && 'エンティティ追加（新しいモノ）'}
          {mode === 'effect' && '直接効果（即座に状態変更）'}
        </h3>
      </div>

      {mode === 'action' && (
        <ActionEditor
          scenario={scenario}
          selectedEntityId={selectedEntityId}
          onAdd={onAddAction}
          onClose={() => setMode('closed')}
        />
      )}
      {mode === 'trigger' && (
        <TriggerEditor
          scenario={scenario}
          selectedEntityId={selectedEntityId}
          onAdd={onAddTrigger}
          onClose={() => setMode('closed')}
        />
      )}
      {mode === 'entity' && (
        <EntityEditor
          scenario={scenario}
          selectedEntityId={selectedEntityId}
          onAdd={onAddEntity}
          onClose={() => setMode('closed')}
        />
      )}
      {mode === 'effect' && (
        <EffectEditor
          scenario={scenario}
          onApply={onApplyEffect}
          onClose={() => setMode('closed')}
        />
      )}
    </div>
  )
}

// ===== Sub-editors =====

function ActionEditor({ scenario, selectedEntityId, onAdd, onClose }: {
  scenario: Scenario
  selectedEntityId: string | null
  onAdd: Props['onAddAction']
  onClose: () => void
}) {
  const [targetEntityId, setTargetEntityId] = useState(selectedEntityId ?? '')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPlayerAction, setIsPlayerAction] = useState(true)
  const [effects, setEffects] = useState<Effect[]>([])

  const handleSubmit = () => {
    if (!targetEntityId || !name) return
    onAdd(targetEntityId, { name, description, isPlayerAction, effects })
    onClose()
  }

  return (
    <div className="adhoc-form">
      <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>対象エンティティ</label>
      <select value={targetEntityId} onChange={(e) => setTargetEntityId(e.target.value)}>
        <option value="">選択...</option>
        {scenario.entities.map((e) => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </select>

      <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>アクション名</label>
      <input placeholder="例: 窓を割って侵入する" value={name} onChange={(e) => setName(e.target.value)} />

      <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>描写テキスト（$actor = 行為者）</label>
      <input placeholder="例: $actorが窓を割って書斎に入った" value={description} onChange={(e) => setDescription(e.target.value)} />

      <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
        <input type="checkbox" checked={isPlayerAction} onChange={(e) => setIsPlayerAction(e.target.checked)} />
        PLアクション
      </label>

      <EffectPicker scenario={scenario} effects={effects} onChange={setEffects} />

      <div className="adhoc-row">
        <button className="btn btn-sm btn-primary" onClick={handleSubmit} disabled={!targetEntityId || !name}>
          シナリオに追加
        </button>
        <button className="btn btn-sm" onClick={onClose}>キャンセル</button>
      </div>
    </div>
  )
}

function TriggerEditor({ scenario, selectedEntityId, onAdd, onClose }: {
  scenario: Scenario
  selectedEntityId: string | null
  onAdd: Props['onAddTrigger']
  onClose: () => void
}) {
  const [targetEntityId, setTargetEntityId] = useState(selectedEntityId ?? '')
  const [name, setName] = useState('')
  const [firedOnce, setFiredOnce] = useState(true)
  const [conditions, setConditions] = useState<{ entityId: string; categoryId: string; value: string; negate: boolean }[]>([])
  const [effects, setEffects] = useState<Effect[]>([])

  const handleSubmit = () => {
    if (!targetEntityId || !name || conditions.length === 0) return
    onAdd(targetEntityId, {
      name,
      firedOnce,
      condition: {
        clauses: conditions.map((c) => ({
          reference: { type: 'named' as const, entityId: c.entityId },
          categoryId: c.categoryId,
          value: c.value,
          negate: c.negate || undefined,
        })),
      },
      effects,
    })
    onClose()
  }

  return (
    <div className="adhoc-form">
      <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>トリガーの所有エンティティ</label>
      <select value={targetEntityId} onChange={(e) => setTargetEntityId(e.target.value)}>
        <option value="">選択...</option>
        {scenario.entities.map((e) => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </select>

      <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>トリガー名</label>
      <input placeholder="例: 窓が割れたら山田が駆けつける" value={name} onChange={(e) => setName(e.target.value)} />

      <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
        <input type="checkbox" checked={firedOnce} onChange={(e) => setFiredOnce(e.target.checked)} />
        一度限り
      </label>

      {/* Conditions */}
      <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>条件（全てAND）</label>
      {conditions.map((c, i) => (
        <div key={i} className="adhoc-row">
          <span style={{ fontSize: 12, flex: 1 }}>
            {scenario.entities.find((e) => e.id === c.entityId)?.name}.{c.categoryId} {c.negate ? '!=' : '='} {c.value}
          </span>
          <button className="btn btn-sm btn-danger" onClick={() => setConditions((p) => p.filter((_, j) => j !== i))}>x</button>
        </div>
      ))}
      <ConditionPicker scenario={scenario} onAdd={(c) => setConditions((p) => [...p, c])} />

      {/* Effects */}
      <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>効果</label>
      <EffectPicker scenario={scenario} effects={effects} onChange={setEffects} />

      <div className="adhoc-row">
        <button className="btn btn-sm btn-primary" onClick={handleSubmit} disabled={!targetEntityId || !name || conditions.length === 0}>
          シナリオに追加
        </button>
        <button className="btn btn-sm" onClick={onClose}>キャンセル</button>
      </div>
    </div>
  )
}

function EntityEditor({ scenario, selectedEntityId, onAdd, onClose }: {
  scenario: Scenario
  selectedEntityId: string | null
  onAdd: Props['onAddEntity']
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState(selectedEntityId ?? '')
  const [description, setDescription] = useState('')
  const [labels, setLabels] = useState('')

  const handleSubmit = () => {
    if (!name) return
    onAdd({
      name,
      parentId: parentId || null,
      description,
      labels: labels.split(/[,、\s]+/).filter(Boolean),
      categories: [],
      actions: [],
      triggers: [],
    })
    onClose()
  }

  return (
    <div className="adhoc-form">
      <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>名前</label>
      <input placeholder="例: 割れた窓" value={name} onChange={(e) => setName(e.target.value)} />

      <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>親エンティティ</label>
      <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
        <option value="">(ルート)</option>
        {scenario.entities.map((e) => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </select>

      <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>説明</label>
      <input placeholder="説明" value={description} onChange={(e) => setDescription(e.target.value)} />

      <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>ラベル（カンマ区切り）</label>
      <input placeholder="例: 物体, 破損" value={labels} onChange={(e) => setLabels(e.target.value)} />

      <div className="adhoc-row">
        <button className="btn btn-sm btn-primary" onClick={handleSubmit} disabled={!name}>
          シナリオに追加
        </button>
        <button className="btn btn-sm" onClick={onClose}>キャンセル</button>
      </div>
    </div>
  )
}

function EffectEditor({ scenario, onApply, onClose }: {
  scenario: Scenario
  onApply: (effects: Effect[], description: string) => void
  onClose: () => void
}) {
  const [description, setDescription] = useState('')
  const [effects, setEffects] = useState<Effect[]>([])

  const handleApply = () => {
    if (effects.length === 0) return
    onApply(effects, description || 'アドホック効果')
    onClose()
  }

  return (
    <div className="adhoc-form">
      <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>描写テキスト</label>
      <input placeholder="例: 探索者が窓を割った" value={description} onChange={(e) => setDescription(e.target.value)} />

      <EffectPicker scenario={scenario} effects={effects} onChange={setEffects} />

      <div className="adhoc-row">
        <button className="btn btn-sm btn-primary" onClick={handleApply} disabled={effects.length === 0}>
          適用 + Stabilize
        </button>
        <button className="btn btn-sm" onClick={onClose}>キャンセル</button>
      </div>
    </div>
  )
}

// ===== Shared pickers =====

function EffectPicker({ scenario, effects, onChange }: {
  scenario: Scenario
  effects: Effect[]
  onChange: (effects: Effect[]) => void
}) {
  const options = useMemo(() => {
    const opts: { key: string; entityId: string; entityName: string; categoryId: string; categoryName: string; value: string }[] = []
    for (const entity of scenario.entities) {
      for (const cat of entity.categories) {
        for (const opt of cat.options) {
          opts.push({
            key: `${entity.id}|${cat.id}|${opt}`,
            entityId: entity.id,
            entityName: entity.name,
            categoryId: cat.id,
            categoryName: cat.name,
            value: opt,
          })
        }
      }
    }
    return opts
  }, [scenario.entities])

  return (
    <>
      {effects.map((eff, i) => {
        const targetEntityId = eff.target.type === 'named' ? eff.target.entityId : undefined
        const ent = targetEntityId ? scenario.entities.find((e) => e.id === targetEntityId) : undefined
        const label = eff.type === 'setCategory' ? `${ent?.name ?? '?'} / ${eff.categoryId} = ${eff.value}`
          : eff.type === 'removeCategory' ? `${ent?.name ?? '?'} / ${eff.categoryId} − ${eff.value}`
          : eff.type === 'move' ? `${ent?.name ?? '?'} → ${eff.newParentId}`
          : '?'
        return (
          <div key={i} className="adhoc-row">
            <span style={{ fontSize: 12, flex: 1 }}>
              {label}
            </span>
            <button className="btn btn-sm btn-danger" onClick={() => onChange(effects.filter((_, j) => j !== i))}>x</button>
          </div>
        )
      })}
      <select
        value=""
        onChange={(e) => {
          const [entityId, categoryId, value] = e.target.value.split('|')
          if (entityId && categoryId && value) {
            onChange([...effects, {
              type: 'setCategory',
              target: { type: 'named', entityId },
              categoryId,
              value,
            }])
          }
        }}
      >
        <option value="">効果を追加...</option>
        {options.map((opt) => (
          <option key={opt.key} value={opt.key}>
            {opt.entityName} / {opt.categoryName} = {opt.value}
          </option>
        ))}
      </select>
    </>
  )
}

function ConditionPicker({ scenario, onAdd }: {
  scenario: Scenario
  onAdd: (condition: { entityId: string; categoryId: string; value: string; negate: boolean }) => void
}) {
  const options = useMemo(() => {
    const opts: { key: string; entityId: string; entityName: string; categoryId: string; categoryName: string; value: string }[] = []
    for (const entity of scenario.entities) {
      for (const cat of entity.categories) {
        for (const opt of cat.options) {
          opts.push({
            key: `${entity.id}|${cat.id}|${opt}`,
            entityId: entity.id,
            entityName: entity.name,
            categoryId: cat.id,
            categoryName: cat.name,
            value: opt,
          })
        }
      }
    }
    return opts
  }, [scenario.entities])

  return (
    <select
      value=""
      onChange={(e) => {
        const [entityId, categoryId, value] = e.target.value.split('|')
        if (entityId && categoryId && value) {
          onAdd({ entityId, categoryId, value, negate: false })
        }
      }}
    >
      <option value="">条件を追加...</option>
      {options.map((opt) => (
        <option key={opt.key} value={opt.key}>
          {opt.entityName} / {opt.categoryName} = {opt.value}
        </option>
      ))}
    </select>
  )
}
