import { useState } from 'react'
import type { Action, Effect, Entity, Scenario, Trigger } from '../core/types'
import {
  ActionDefinitionForm,
  EffectRowsEditor,
  EntityTemplateCreator,
  TriggerDefinitionForm,
} from './editorParts'

type EditorMode = 'closed' | 'action' | 'trigger' | 'entity' | 'effect'

interface Props {
  scenario: Scenario
  selectedEntityId: string | null
  onAddEntity: (entity: Omit<Entity, 'id'>) => string
  onAddToParty: (entityId: string) => void
  onAddAction: (entityId: string, action: Omit<Action, 'id' | 'entityId'>) => string
  onAddTrigger: (entityId: string, trigger: Omit<Trigger, 'id' | 'entityId'>) => string
  onApplyEffect: (effects: Effect[], description: string) => void
}

/**
 * リアルタイムシナリオ執筆パネル。
 * セッション中の追加編集も、EntityPanel のインライン編集と同じ部品を通す。
 */
export function LiveEditor({
  scenario,
  selectedEntityId,
  onAddEntity,
  onAddToParty,
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
        <ActionDefinitionForm
          scenario={scenario}
          initialOwnerId={selectedEntityId}
          allowOwnerSelect
          submitLabel="シナリオに追加"
          onSubmit={(entityId, action) => {
            onAddAction(entityId, action)
            setMode('closed')
          }}
          onCancel={() => setMode('closed')}
        />
      )}
      {mode === 'trigger' && (
        <TriggerDefinitionForm
          scenario={scenario}
          initialOwnerId={selectedEntityId}
          allowOwnerSelect
          submitLabel="シナリオに追加"
          onSubmit={(entityId, trigger) => {
            onAddTrigger(entityId, trigger)
            setMode('closed')
          }}
          onCancel={() => setMode('closed')}
        />
      )}
      {mode === 'entity' && (
        <EntityTemplateCreator
          scenario={scenario}
          initialParentId={selectedEntityId}
          onAddEntity={onAddEntity}
          onAddToParty={onAddToParty}
          onCreated={() => setMode('closed')}
          onCancel={() => setMode('closed')}
        />
      )}
      {mode === 'effect' && (
        <DirectEffectEditor
          scenario={scenario}
          selectedEntityId={selectedEntityId}
          onApply={onApplyEffect}
          onClose={() => setMode('closed')}
        />
      )}
    </div>
  )
}

function DirectEffectEditor({
  scenario,
  selectedEntityId,
  onApply,
  onClose,
}: {
  scenario: Scenario
  selectedEntityId: string | null
  onApply: (effects: Effect[], description: string) => void
  onClose: () => void
}) {
  const [description, setDescription] = useState('')
  const [effects, setEffects] = useState<Effect[]>([])

  const apply = () => {
    if (effects.length === 0) return
    onApply(effects, description || 'アドホック効果')
    onClose()
  }

  return (
    <div className="definition-form">
      <label className="editor-label">描写テキスト</label>
      <input
        aria-label="描写テキスト"
        placeholder="例: 探索者が窓を割った"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <EffectRowsEditor
        scenario={scenario}
        selfEntityId={selectedEntityId}
        effects={effects}
        onChange={setEffects}
      />
      <div className="editor-actions">
        <button className="btn btn-sm btn-primary" type="button" onClick={apply} disabled={effects.length === 0}>
          適用 + Stabilize
        </button>
        <button className="btn btn-sm" type="button" onClick={onClose}>キャンセル</button>
      </div>
    </div>
  )
}
