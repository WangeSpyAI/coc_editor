import { useEffect, useMemo, useState } from 'react'
import type { Action, Category, ConditionClause, Effect, Entity, EntityReference, Scenario, Trigger } from '../core/types'
import { describeClause } from './format'

type TemplateType = 'location' | 'npc' | 'pc' | 'item' | 'blank'

const TEMPLATE_BUTTONS: { type: TemplateType; label: string }[] = [
  { type: 'location', label: '場所' },
  { type: 'npc', label: 'NPC' },
  { type: 'pc', label: 'PC' },
  { type: 'item', label: 'アイテム' },
  { type: 'blank', label: '空' },
]

function templateEntity(type: TemplateType, name: string, parentId: string | null): Omit<Entity, 'id'> {
  const base = {
    name,
    parentId,
    description: '',
    connections: [] as string[],
    actions: [] as Action[],
    triggers: [] as Trigger[],
  }

  switch (type) {
    case 'location':
      return { ...base, labels: ['場所'], categories: [] }
    case 'npc':
      return {
        ...base,
        labels: ['NPC'],
        categories: [{ id: 'attitude', name: '態度', exclusive: true, options: ['中立', '友好', '敵対'] }],
      }
    case 'pc':
      return {
        ...base,
        labels: ['PC'],
        categories: [
          { id: 'pc-knowledge', name: '知識', exclusive: false, options: [] },
          { id: 'pc-status', name: '状態異常', exclusive: false, options: [] },
        ],
      }
    case 'item':
      return {
        ...base,
        labels: ['アイテム'],
        categories: [{ id: 'state', name: '状態', exclusive: true, options: ['未発見', '発見済'] }],
      }
    case 'blank':
      return { ...base, labels: [], categories: [] }
  }
}

export function EntityTemplateCreator({
  scenario,
  initialParentId,
  onAddEntity,
  onAddToParty,
  onCreated,
  onCancel,
}: {
  scenario: Scenario
  initialParentId: string | null
  onAddEntity: (entity: Omit<Entity, 'id'>) => string
  onAddToParty?: (entityId: string) => void
  onCreated?: (entityId: string) => void
  onCancel?: () => void
}) {
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState(initialParentId ?? '')

  useEffect(() => {
    setParentId(initialParentId ?? '')
  }, [initialParentId])

  const create = (type: TemplateType) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const id = onAddEntity(templateEntity(type, trimmed, parentId || null))
    if (type === 'pc') onAddToParty?.(id)
    onCreated?.(id)
    setName('')
  }

  return (
    <div className="entity-template-creator">
      <input
        aria-label="エンティティ名"
        autoFocus
        placeholder="エンティティ名"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') onCancel?.() }}
      />
      <select
        aria-label="親エンティティ"
        value={parentId}
        onChange={(e) => setParentId(e.target.value)}
      >
        <option value="">(ルート)</option>
        {scenario.entities.map((entity) => (
          <option key={entity.id} value={entity.id}>{entity.name}</option>
        ))}
      </select>
      <div className="template-type-buttons">
        {TEMPLATE_BUTTONS.map((button) => (
          <button
            key={button.type}
            className="btn btn-sm btn-primary"
            type="button"
            disabled={!name.trim()}
            onClick={() => create(button.type)}
          >
            {button.label}
          </button>
        ))}
        {onCancel && (
          <button className="btn btn-sm" type="button" onClick={onCancel}>キャンセル</button>
        )}
      </div>
    </div>
  )
}

function referenceKey(ref: EntityReference): string {
  if (ref.type === 'self') return 'self'
  if (ref.type === 'named' && ref.entityId === '$actor') return '$actor'
  if (ref.type === 'named') return ref.entityId ?? ''
  return ref.type
}

function keyToReference(key: string): EntityReference {
  if (key === 'self') return { type: 'self' }
  if (key === '$actor') return { type: 'named', entityId: '$actor' }
  return { type: 'named', entityId: key }
}

function targetLabel(ref: EntityReference, owner: Entity | undefined, scenario: Scenario): string {
  if (ref.type === 'self') return owner?.name ?? 'self'
  if (ref.type === 'named' && ref.entityId === '$actor') return '$actor (行為者)'
  if (ref.type === 'named') return scenario.entities.find((entity) => entity.id === ref.entityId)?.name ?? ref.entityId ?? '—'
  return ref.type
}

function categoryById(scenario: Scenario, entityId: string | undefined, categoryId: string): Category | undefined {
  if (entityId) {
    return scenario.entities.find((entity) => entity.id === entityId)?.categories.find((category) => category.id === categoryId)
  }
  return scenario.entities.flatMap((entity) => entity.categories).find((category) => category.id === categoryId)
}

function categoryOptionsForTarget(scenario: Scenario, selfEntityId: string | null, targetKey: string): Category[] {
  if (targetKey === 'self') {
    return scenario.entities.find((entity) => entity.id === selfEntityId)?.categories ?? []
  }
  if (targetKey === '$actor') {
    const seen = new Set<string>()
    const categories: Category[] = []
    for (const entity of scenario.entities) {
      for (const category of entity.categories) {
        if (seen.has(category.id)) continue
        seen.add(category.id)
        categories.push(category)
      }
    }
    return categories
  }
  return scenario.entities.find((entity) => entity.id === targetKey)?.categories ?? []
}

function normalizeCategorySelection(categories: Category[], current: string, setCurrent: (value: string) => void) {
  if (categories.length === 0) {
    if (current) setCurrent('')
    return
  }
  if (!categories.some((category) => category.id === current)) {
    setCurrent(categories[0].id)
  }
}

function effectLabel(effect: Effect, selfEntity: Entity | undefined, scenario: Scenario): string {
  if (effect.type === 'move') {
    const target = targetLabel(effect.target, selfEntity, scenario)
    const destination = effect.newParentId === '$actor'
      ? '$actor (行為者)'
      : scenario.entities.find((entity) => entity.id === effect.newParentId)?.name ?? effect.newParentId
    return `移動: ${target} → ${destination}`
  }

  const target = targetLabel(effect.target, selfEntity, scenario)
  const targetEntityId = effect.target.type === 'named' && effect.target.entityId !== '$actor' ? effect.target.entityId : selfEntity?.id
  const category = categoryById(scenario, targetEntityId, effect.categoryId)
  const op = effect.type === 'setCategory' ? '付与' : '除去'
  return `${op}: ${target} / ${category?.name ?? effect.categoryId} = ${effect.value === '$actor' ? '$actor (行為者名)' : effect.value}`
}

export function EffectRowsEditor({
  scenario,
  selfEntityId,
  effects,
  onChange,
  title = '効果',
}: {
  scenario: Scenario
  selfEntityId: string | null
  effects: Effect[]
  onChange: (effects: Effect[]) => void
  title?: string
}) {
  const [type, setType] = useState<Effect['type']>('setCategory')
  const [targetKey, setTargetKey] = useState('self')
  const [categoryId, setCategoryId] = useState('')
  const [valueChoice, setValueChoice] = useState('')
  const [freeValue, setFreeValue] = useState('')
  const [destinationId, setDestinationId] = useState('$actor')

  const selfEntity = scenario.entities.find((entity) => entity.id === selfEntityId)
  const categories = useMemo(
    () => categoryOptionsForTarget(scenario, selfEntityId, targetKey),
    [scenario, selfEntityId, targetKey],
  )
  const selectedCategory = categories.find((category) => category.id === categoryId)

  useEffect(() => {
    normalizeCategorySelection(categories, categoryId, setCategoryId)
  }, [categories, categoryId])

  useEffect(() => {
    if (!selectedCategory) {
      if (valueChoice) setValueChoice('')
      return
    }
    const choices = ['$actor', ...selectedCategory.options]
    if (!choices.includes(valueChoice) && valueChoice !== '__free__') {
      setValueChoice(selectedCategory.options[0] ?? '$actor')
    }
  }, [selectedCategory, valueChoice])

  const addEffect = () => {
    const target = keyToReference(targetKey)
    if (type === 'move') {
      onChange([...effects, { type: 'move', target, newParentId: destinationId }])
      return
    }
    const value = valueChoice === '__free__' ? freeValue.trim() : valueChoice
    if (!categoryId || !value) return
    onChange([...effects, { type, target, categoryId, value }])
    setFreeValue('')
  }

  return (
    <div className="effect-editor">
      <label className="editor-label">{title}</label>
      {effects.map((effect, index) => (
        <div key={`${index}-${effect.type}`} className="editor-row effect-row">
          <span>{effectLabel(effect, selfEntity, scenario)}</span>
          <button
            className="btn btn-sm btn-danger"
            type="button"
            onClick={() => onChange(effects.filter((_, rowIndex) => rowIndex !== index))}
          >
            ×
          </button>
        </div>
      ))}

      <div className="effect-builder">
        <select aria-label={`${title} 種別`} value={type} onChange={(e) => setType(e.target.value as Effect['type'])}>
          <option value="setCategory">付与</option>
          <option value="removeCategory">除去</option>
          <option value="move">移動</option>
        </select>
        <select aria-label={`${title} 対象`} value={targetKey} onChange={(e) => setTargetKey(e.target.value)}>
          <option value="self">self</option>
          <option value="$actor">$actor (行為者)</option>
          {scenario.entities.map((entity) => (
            <option key={entity.id} value={entity.id}>{entity.name}</option>
          ))}
        </select>
        {type !== 'move' ? (
          <>
            <select aria-label={`${title} カテゴリ`} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {categories.length === 0 && <option value="">カテゴリなし</option>}
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
            <select aria-label={`${title} 値`} value={valueChoice} onChange={(e) => setValueChoice(e.target.value)}>
              <option value="$actor">$actor (行為者名)</option>
              {selectedCategory?.options.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
              <option value="__free__">自由入力...</option>
            </select>
            {valueChoice === '__free__' && (
              <input
                aria-label={`${title} 自由入力値`}
                placeholder="値"
                value={freeValue}
                onChange={(e) => setFreeValue(e.target.value)}
              />
            )}
          </>
        ) : (
          <select aria-label={`${title} 移動先`} value={destinationId} onChange={(e) => setDestinationId(e.target.value)}>
            <option value="$actor">$actor (行為者)</option>
            {scenario.entities.map((entity) => (
              <option key={entity.id} value={entity.id}>{entity.name}</option>
            ))}
          </select>
        )}
        <button className="btn btn-sm" type="button" onClick={addEffect}>追加</button>
      </div>
    </div>
  )
}

function conditionLabel(clause: ConditionClause, owner: Entity | undefined, scenario: Scenario): string {
  return owner ? describeClause(clause, owner, scenario) : `${referenceKey(clause.reference)}.${clause.categoryId} = ${clause.value}`
}

export function ConditionRowsEditor({
  scenario,
  selfEntityId,
  condition,
  onChange,
  title = '表示条件',
}: {
  scenario: Scenario
  selfEntityId: string | null
  condition: { clauses: ConditionClause[] }
  onChange: (condition: { clauses: ConditionClause[] }) => void
  title?: string
}) {
  const [targetKey, setTargetKey] = useState('self')
  const [categoryId, setCategoryId] = useState('')
  const [value, setValue] = useState('')
  const [negate, setNegate] = useState(false)

  const owner = scenario.entities.find((entity) => entity.id === selfEntityId)
  const categories = useMemo(
    () => categoryOptionsForTarget(scenario, selfEntityId, targetKey).filter((category) => category.options.length > 0),
    [scenario, selfEntityId, targetKey],
  )
  const selectedCategory = categories.find((category) => category.id === categoryId)

  useEffect(() => {
    normalizeCategorySelection(categories, categoryId, setCategoryId)
  }, [categories, categoryId])

  useEffect(() => {
    if (!selectedCategory) {
      if (value) setValue('')
      return
    }
    if (!selectedCategory.options.includes(value)) {
      setValue(selectedCategory.options[0] ?? '')
    }
  }, [selectedCategory, value])

  const addClause = () => {
    if (!categoryId || !value) return
    onChange({
      clauses: [...condition.clauses, {
        reference: keyToReference(targetKey),
        categoryId,
        value,
        negate: negate || undefined,
      }],
    })
  }

  return (
    <div className="condition-editor">
      <label className="editor-label">{title}</label>
      {condition.clauses.map((clause, index) => (
        <div key={`${index}-${clause.categoryId}-${clause.value}`} className="editor-row condition-row">
          <span>{conditionLabel(clause, owner, scenario)}</span>
          <button
            className="btn btn-sm btn-danger"
            type="button"
            onClick={() => onChange({ clauses: condition.clauses.filter((_, rowIndex) => rowIndex !== index) })}
          >
            ×
          </button>
        </div>
      ))}
      <div className="condition-builder">
        <select aria-label={`${title} 対象`} value={targetKey} onChange={(e) => setTargetKey(e.target.value)}>
          <option value="self">self</option>
          {scenario.entities.map((entity) => (
            <option key={entity.id} value={entity.id}>{entity.name}</option>
          ))}
        </select>
        <select aria-label={`${title} カテゴリ`} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {categories.length === 0 && <option value="">カテゴリなし</option>}
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
        <select aria-label={`${title} 値`} value={value} onChange={(e) => setValue(e.target.value)}>
          {selectedCategory?.options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <label className="inline-checkbox">
          <input type="checkbox" checked={negate} onChange={(e) => setNegate(e.target.checked)} />
          否定
        </label>
        <button className="btn btn-sm" type="button" onClick={addClause}>追加</button>
      </div>
    </div>
  )
}

function splitComma(value: string): string[] {
  return value.split(/[,、\s]+/).map((part) => part.trim()).filter(Boolean)
}

function actionPatchFromState(
  name: string,
  description: string,
  isPlayerAction: boolean,
  displayCondition: { clauses: ConditionClause[] },
  requiredItems: string[],
  requiredKnowledgeDraft: string,
  effects: Effect[],
  rollSkill: string,
  rollDifficulty: string,
  rollOpposed: boolean,
  successEffects: Effect[],
  failureEffects: Effect[],
): Omit<Action, 'id' | 'entityId'> {
  const skill = rollSkill.trim()
  const difficulty = rollDifficulty.trim()
  return {
    name: name.trim(),
    description,
    isPlayerAction,
    displayCondition: displayCondition.clauses.length > 0 ? displayCondition : undefined,
    requiredItems: requiredItems.length > 0 ? requiredItems : undefined,
    requiredKnowledge: splitComma(requiredKnowledgeDraft).length > 0 ? splitComma(requiredKnowledgeDraft) : undefined,
    effects,
    rollRequirement: skill
      ? {
          skill,
          difficulty: difficulty ? Number(difficulty) : undefined,
          opposed: rollOpposed || undefined,
          successEffects: successEffects.length > 0 ? successEffects : undefined,
          failureEffects: failureEffects.length > 0 ? failureEffects : undefined,
        }
      : undefined,
  }
}

export function ActionDefinitionForm({
  scenario,
  initialOwnerId,
  action,
  allowOwnerSelect,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  scenario: Scenario
  initialOwnerId: string | null
  action?: Action
  allowOwnerSelect: boolean
  submitLabel: string
  onSubmit: (entityId: string, action: Omit<Action, 'id' | 'entityId'>) => void
  onCancel: () => void
}) {
  const [ownerId, setOwnerId] = useState(initialOwnerId ?? '')
  const [name, setName] = useState(action?.name ?? '')
  const [description, setDescription] = useState(action?.description ?? '')
  const [isPlayerAction, setIsPlayerAction] = useState(action?.isPlayerAction ?? true)
  const [displayCondition, setDisplayCondition] = useState(action?.displayCondition ?? { clauses: [] })
  const [requiredItems, setRequiredItems] = useState<string[]>(action?.requiredItems ?? [])
  const [requiredKnowledge, setRequiredKnowledge] = useState((action?.requiredKnowledge ?? []).join(', '))
  const [effects, setEffects] = useState<Effect[]>(action?.effects ?? [])
  const [rollSkill, setRollSkill] = useState(action?.rollRequirement?.skill ?? '')
  const [rollDifficulty, setRollDifficulty] = useState(action?.rollRequirement?.difficulty?.toString() ?? '')
  const [rollOpposed, setRollOpposed] = useState(action?.rollRequirement?.opposed ?? false)
  const [successEffects, setSuccessEffects] = useState<Effect[]>(action?.rollRequirement?.successEffects ?? [])
  const [failureEffects, setFailureEffects] = useState<Effect[]>(action?.rollRequirement?.failureEffects ?? [])

  const submit = () => {
    if (!ownerId || !name.trim()) return
    onSubmit(ownerId, actionPatchFromState(
      name,
      description,
      isPlayerAction,
      displayCondition,
      requiredItems,
      requiredKnowledge,
      effects,
      rollSkill,
      rollDifficulty,
      rollOpposed,
      successEffects,
      failureEffects,
    ))
  }

  return (
    <div className="definition-form">
      {allowOwnerSelect && (
        <>
          <label className="editor-label">対象エンティティ</label>
          <select aria-label="対象エンティティ" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">選択...</option>
            {scenario.entities.map((entity) => (
              <option key={entity.id} value={entity.id}>{entity.name}</option>
            ))}
          </select>
        </>
      )}

      <label className="editor-label">アクション名</label>
      <input aria-label="アクション名" value={name} onChange={(e) => setName(e.target.value)} />

      <label className="editor-label">描写</label>
      <textarea aria-label="描写" value={description} onChange={(e) => setDescription(e.target.value)} />

      <label className="inline-checkbox">
        <input type="checkbox" checked={isPlayerAction} onChange={(e) => setIsPlayerAction(e.target.checked)} />
        PLアクション
      </label>

      <div className="roll-editor">
        <label className="editor-label">ロール条件</label>
        <input aria-label="ロール技能" placeholder="技能" value={rollSkill} onChange={(e) => setRollSkill(e.target.value)} />
        <input
          aria-label="ロール難易度"
          placeholder="難易度"
          inputMode="numeric"
          value={rollDifficulty}
          onChange={(e) => setRollDifficulty(e.target.value.replace(/\D/g, ''))}
        />
        <label className="inline-checkbox">
          <input type="checkbox" checked={rollOpposed} onChange={(e) => setRollOpposed(e.target.checked)} />
          対抗
        </label>
      </div>

      <EffectRowsEditor scenario={scenario} selfEntityId={ownerId || null} effects={successEffects} onChange={setSuccessEffects} title="成功効果" />
      <EffectRowsEditor scenario={scenario} selfEntityId={ownerId || null} effects={failureEffects} onChange={setFailureEffects} title="失敗効果" />
      <ConditionRowsEditor scenario={scenario} selfEntityId={ownerId || null} condition={displayCondition} onChange={setDisplayCondition} title="表示条件" />

      <label className="editor-label">必要アイテム</label>
      <select
        aria-label="必要アイテム"
        multiple
        value={requiredItems}
        onChange={(e) => setRequiredItems(Array.from(e.target.selectedOptions).map((option) => option.value))}
      >
        {scenario.entities.map((entity) => (
          <option key={entity.id} value={entity.id}>{entity.name}</option>
        ))}
      </select>

      <label className="editor-label">必要知識</label>
      <input
        aria-label="必要知識"
        placeholder="カンマ区切り"
        value={requiredKnowledge}
        onChange={(e) => setRequiredKnowledge(e.target.value)}
      />

      <EffectRowsEditor scenario={scenario} selfEntityId={ownerId || null} effects={effects} onChange={setEffects} />

      <div className="editor-actions">
        <button className="btn btn-sm btn-primary" type="button" disabled={!ownerId || !name.trim()} onClick={submit}>{submitLabel}</button>
        <button className="btn btn-sm" type="button" onClick={onCancel}>キャンセル</button>
      </div>
    </div>
  )
}

export function TriggerDefinitionForm({
  scenario,
  initialOwnerId,
  trigger,
  allowOwnerSelect,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  scenario: Scenario
  initialOwnerId: string | null
  trigger?: Trigger
  allowOwnerSelect: boolean
  submitLabel: string
  onSubmit: (entityId: string, trigger: Omit<Trigger, 'id' | 'entityId'>) => void
  onCancel: () => void
}) {
  const [ownerId, setOwnerId] = useState(initialOwnerId ?? '')
  const [name, setName] = useState(trigger?.name ?? '')
  const [condition, setCondition] = useState(trigger?.condition ?? { clauses: [] })
  const [effects, setEffects] = useState<Effect[]>(trigger?.effects ?? [])
  const [firedOnce, setFiredOnce] = useState(trigger?.firedOnce ?? true)

  const submit = () => {
    if (!ownerId || !name.trim()) return
    onSubmit(ownerId, {
      name: name.trim(),
      condition,
      effects,
      firedOnce: firedOnce || undefined,
    })
  }

  return (
    <div className="definition-form">
      {allowOwnerSelect && (
        <>
          <label className="editor-label">所有エンティティ</label>
          <select aria-label="所有エンティティ" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">選択...</option>
            {scenario.entities.map((entity) => (
              <option key={entity.id} value={entity.id}>{entity.name}</option>
            ))}
          </select>
        </>
      )}

      <label className="editor-label">トリガー名</label>
      <input aria-label="トリガー名" value={name} onChange={(e) => setName(e.target.value)} />

      <label className="inline-checkbox">
        <input type="checkbox" checked={firedOnce} onChange={(e) => setFiredOnce(e.target.checked)} />
        一度限り
      </label>

      <ConditionRowsEditor scenario={scenario} selfEntityId={ownerId || null} condition={condition} onChange={setCondition} title="条件" />
      <EffectRowsEditor scenario={scenario} selfEntityId={ownerId || null} effects={effects} onChange={setEffects} />

      <div className="editor-actions">
        <button className="btn btn-sm btn-primary" type="button" disabled={!ownerId || !name.trim()} onClick={submit}>{submitLabel}</button>
        <button className="btn btn-sm" type="button" onClick={onCancel}>キャンセル</button>
      </div>
    </div>
  )
}
