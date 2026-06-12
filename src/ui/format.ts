// =====================================================
// 条件節の人間可読フォーマット（UI共通）
//
// PendingPanel と EntityPanel の両方がここを通る —
// 「片方だけカテゴリIDが生で出る」ような表示の乖離を構造的に塞ぐ。
// =====================================================

import type { ConditionClause, Entity, EntityReference, Scenario } from '../core/types'

/** 参照の人間可読名: named→エンティティ名解決, self→所属エンティティ名, それ以外→相対語 */
export function refLabel(ref: EntityReference, owner: Entity, scenario: Scenario): string {
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
 * 所属エンティティ → 残りの全エンティティの順で同IDのカテゴリ定義を探す。
 */
export function categoryLabel(clause: ConditionClause, owner: Entity, scenario: Scenario): string {
  const target =
    clause.reference.type === 'named'
      ? scenario.entities.find((e) => e.id === clause.reference.entityId)
      : clause.reference.type === 'self' ? owner : undefined
  const candidates = target ? [target] : [owner, ...scenario.entities.filter((e) => e.id !== owner.id)]
  for (const e of candidates) {
    const cat = e.categories.find((c) => c.id === clause.categoryId)
    if (cat) return cat.name
  }
  return clause.categoryId
}

/** 条件節の人間可読表示（例「書斎のドア.施錠 = 解錠」） */
export function describeClause(clause: ConditionClause, owner: Entity, scenario: Scenario): string {
  return `${refLabel(clause.reference, owner, scenario)}.${categoryLabel(clause, owner, scenario)} ${clause.negate ? '≠' : '='} ${clause.value}`
}
