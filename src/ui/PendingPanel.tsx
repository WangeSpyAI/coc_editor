import { useEffect, useRef, useState } from 'react'
import type { ConditionClause, Entity, EntityReference, Scenario, Trigger } from '../core/types'

/** getPendingTriggers の戻り値1件ぶん */
export interface PendingItem {
  trigger: Trigger
  entity: Entity
  unmetClauses: ConditionClause[]
}

interface ListProps {
  pending: PendingItem[]
  scenario: Scenario
  onSelectEntity: (entityId: string) => void
  onFulfill: (ownerEntityId: string, clause: ConditionClause) => void
}

/** 参照の人間可読名: named→エンティティ名解決, self→所属エンティティ名, それ以外→相対語 */
function refLabel(ref: EntityReference, owner: Entity, scenario: Scenario): string {
  switch (ref.type) {
    case 'named':
      return scenario.entities.find((e) => e.id === ref.entityId)?.name ?? ref.entityName ?? ref.entityId ?? '—'
    case 'self':
      return owner.name
    case 'ancestor':
      return '祖先'
    case 'descendant':
      return '子孫'
    case 'sibling':
      return '同位'
  }
}

/**
 * カテゴリIDの人間可読名。named/self は対象エンティティの定義から引く。
 * ancestor/descendant/sibling は対象が実行時にしか決まらない —
 * 所属エンティティ → 全エンティティの順で同IDのカテゴリ定義を探す。
 */
function categoryLabel(clause: ConditionClause, owner: Entity, scenario: Scenario): string {
  const target =
    clause.reference.type === 'named'
      ? scenario.entities.find((e) => e.id === clause.reference.entityId)
      : clause.reference.type === 'self' ? owner : undefined
  const candidates = target ? [target] : [owner, ...scenario.entities]
  for (const e of candidates) {
    const cat = e.categories.find((c) => c.id === clause.categoryId)
    if (cat) return cat.name
  }
  return clause.categoryId
}

/** 未充足節の人間可読表示（例「書斎のドア.施錠 = 解錠」） */
function describeClause(clause: ConditionClause, owner: Entity, scenario: Scenario): string {
  return `${refLabel(clause.reference, owner, scenario)}.${categoryLabel(clause, owner, scenario)} ${clause.negate ? '≠' : '='} ${clause.value}`
}

/**
 * 待機中トリガーの一覧表示（共通コンポーネント）。
 * ヘッダのドロップダウンと empty-state の中央リストの両方で使う — 二重実装しない。
 * negate なしの節には [付与 ▶]（fulfillPendingClause）を出す。
 */
export function PendingList({ pending, scenario, onSelectEntity, onFulfill }: ListProps) {
  if (pending.length === 0) {
    return <div className="pending-empty">待機中のトリガーはありません</div>
  }
  return (
    <>
      {pending.map(({ trigger, entity, unmetClauses }) => (
        <div key={trigger.id} className="pending-trigger">
          <div className="trigger-name">{trigger.name}</div>
          <div className="pending-owner" onClick={() => onSelectEntity(entity.id)} title="エンティティを開く">
            {entity.name}
          </div>
          {unmetClauses.map((clause, i) => (
            <div key={i} className="pending-clause">
              <span className="unmet">{describeClause(clause, entity, scenario)}</span>
              {!clause.negate && (
                <button className="btn btn-sm btn-primary" onClick={() => onFulfill(entity.id, clause)}>
                  付与 ▶
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
    </>
  )
}

/**
 * ヘッダの「待機中: N」バッジ + クリックで開閉するドロップダウンパネル。
 * 外側クリックで閉じる。エンティティ名クリックは selectEntity してから閉じる。
 */
export function PendingDropdown({ pending, scenario, onSelectEntity, onFulfill }: ListProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  if (pending.length === 0) return null

  return (
    <div className="pending-dropdown" ref={rootRef}>
      <button className="pending-badge" onClick={() => setOpen((o) => !o)}>
        待機中: {pending.length}
      </button>
      {open && (
        <div className="pending-panel">
          <PendingList
            pending={pending}
            scenario={scenario}
            onSelectEntity={(id) => { onSelectEntity(id); setOpen(false) }}
            onFulfill={onFulfill}
          />
        </div>
      )}
    </div>
  )
}
