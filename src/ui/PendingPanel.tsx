import { useEffect, useRef, useState } from 'react'
import type { ConditionClause, Scenario } from '../core/types'
import type { PendingTrigger } from '../core/engine'
import { describeClause } from './format'

interface ListProps {
  pending: PendingTrigger[]
  scenario: Scenario
  onSelectEntity: (entityId: string) => void
  onFulfill: (ownerEntityId: string, clause: ConditionClause) => void
}

/**
 * 待機中トリガーの一覧表示（共通コンポーネント）。
 * ヘッダのドロップダウン・empty-state の中央リスト・EntityPanel の
 * 待機中セクションの全てで使う — 二重実装しない。
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
 * 外側クリック・Escape で閉じる。エンティティ名クリックは selectEntity してから閉じる。
 */
export function PendingDropdown({ pending, scenario, onSelectEntity, onFulfill }: ListProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  // pending が空になったら open も畳む。開いたまま残すと、後で新しい待機が
  // 発生したときにパネルが頼んでいないのに自動で開いてしまう。
  useEffect(() => {
    if (pending.length === 0) setOpen(false)
  }, [pending.length])

  if (pending.length === 0) return null

  return (
    <div className="pending-dropdown" ref={rootRef}>
      <button
        className="pending-badge"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
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
