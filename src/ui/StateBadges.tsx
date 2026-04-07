import type { Category } from '../core/types'

interface Props {
  categories: Category[]
  categoryValues: Record<string, string | string[]>
  entityId: string
  onSetCategory: (entityId: string, categoryId: string, value: string) => void
  compact?: boolean // true = 子エンティティ用の小さいバッジ
}

/**
 * クリッカブル状態バッジ — 全ビューで共通。
 *
 * KPがバッジをクリックすると setCategoryValue → applyEffect → stabilize が走る。
 * 排他カテゴリ: クリックで値切替、非排他カテゴリ: クリックでトグル。
 */
export function StateBadges({ categories, categoryValues, entityId, onSetCategory, compact }: Props) {
  if (categories.length === 0) return null

  const fontSize = compact ? 11 : undefined
  const badgePadding = compact ? '1px 6px' : undefined
  const labelFontSize = compact ? 10 : undefined

  return (
    <div className="state-badges" style={compact ? { marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 2 } : undefined}>
      {categories.map((cat) => {
        const val = categoryValues[cat.id]
        return cat.options.map((opt) => {
          const active = Array.isArray(val) ? val.includes(opt) : val === opt
          return (
            <span
              key={`${cat.id}-${opt}`}
              className="state-badge clickable"
              style={{
                cursor: 'pointer',
                borderColor: active ? 'var(--accent)' : 'var(--border)',
                opacity: active ? 1 : (compact ? 0.3 : 0.35),
                fontSize,
                padding: badgePadding,
              }}
              onClick={(e) => {
                e.stopPropagation()
                onSetCategory(entityId, cat.id, opt)
              }}
              title={`${cat.name}: ${opt}`}
            >
              {!compact && <span className="cat-name">{cat.name}:</span>}
              <span className={active ? 'cat-value' : 'cat-name'} style={labelFontSize ? { fontSize: labelFontSize } : undefined}>
                {opt}
              </span>
            </span>
          )
        })
      })}
    </div>
  )
}
