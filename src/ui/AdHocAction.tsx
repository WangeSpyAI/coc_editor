import { useState, useMemo } from 'react'
import type { Scenario, Effect, Entity } from '../core/types'

interface Props {
  scenario: Scenario
  onApply: (effects: Effect[], description: string) => void
}

/**
 * アドホックアクション
 *
 * シナリオに定義されていない行動をPLが提案した時、
 * KPがその場で効果を組み立てて適用する。
 *
 * 例: 「窓を割って入る」→ KPが「書斎.探索=探索済」をセット
 */
export function AdHocAction({ scenario, onApply }: Props) {
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [effects, setEffects] = useState<Effect[]>([])

  const entityMap = useMemo(() => {
    const m = new Map<string, Entity>()
    for (const e of scenario.entities) m.set(e.id, e)
    return m
  }, [scenario.entities])

  // All entity+category+option combinations for the effect picker
  const categoryOptions = useMemo(() => {
    const opts: { entityId: string; entityName: string; categoryId: string; categoryName: string; value: string; exclusive: boolean }[] = []
    for (const entity of scenario.entities) {
      for (const cat of entity.categories) {
        for (const opt of cat.options) {
          opts.push({
            entityId: entity.id,
            entityName: entity.name,
            categoryId: cat.id,
            categoryName: cat.name,
            value: opt,
            exclusive: cat.exclusive,
          })
        }
      }
    }
    return opts
  }, [scenario.entities])

  const addEffect = (entityId: string, categoryId: string, value: string) => {
    setEffects((prev) => [
      ...prev,
      {
        type: 'setCategory' as const,
        target: { type: 'named' as const, entityId },
        categoryId,
        value,
      },
    ])
  }

  const removeEffect = (index: number) => {
    setEffects((prev) => prev.filter((_, i) => i !== index))
  }

  const handleApply = () => {
    if (effects.length === 0) return
    onApply(effects, description || 'アドホックアクション')
    setDescription('')
    setEffects([])
    setOpen(false)
  }

  if (!open) {
    return (
      <div className="adhoc-section">
        <button className="btn btn-sm btn-primary" onClick={() => setOpen(true)}>
          想定外の行動に対応
        </button>
      </div>
    )
  }

  return (
    <div className="adhoc-section">
      <div className="state-section">
        <h3>アドホックアクション</h3>
      </div>
      <div className="adhoc-form">
        <input
          type="text"
          placeholder="描写テキスト（例: 窓を割って書斎に侵入した）"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        {/* Effect list */}
        {effects.map((eff, i) => {
          if (eff.type !== 'setCategory') return null
          const ent = entityMap.get(('entityId' in eff.target) ? eff.target.entityId! : '')
          return (
            <div key={i} className="adhoc-row">
              <span style={{ fontSize: 12, flex: 1 }}>
                {ent?.name ?? '?'}.{eff.categoryId} = {eff.value}
              </span>
              <button className="btn btn-sm btn-danger" onClick={() => removeEffect(i)}>
                x
              </button>
            </div>
          )
        })}

        {/* Add effect */}
        <select
          value=""
          onChange={(e) => {
            const [entityId, categoryId, value] = e.target.value.split('|')
            if (entityId && categoryId && value) {
              addEffect(entityId, categoryId, value)
            }
          }}
        >
          <option value="">効果を追加...</option>
          {categoryOptions.map((opt) => (
            <option
              key={`${opt.entityId}|${opt.categoryId}|${opt.value}`}
              value={`${opt.entityId}|${opt.categoryId}|${opt.value}`}
            >
              {opt.entityName} / {opt.categoryName} = {opt.value}
            </option>
          ))}
        </select>

        <div className="adhoc-row">
          <button
            className="btn btn-sm btn-primary"
            onClick={handleApply}
            disabled={effects.length === 0}
          >
            適用 + Stabilize
          </button>
          <button className="btn btn-sm" onClick={() => { setOpen(false); setEffects([]); setDescription('') }}>
            キャンセル
          </button>
        </div>
      </div>
    </div>
  )
}
