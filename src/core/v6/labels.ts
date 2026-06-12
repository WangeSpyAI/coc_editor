import type { DisclosureValue } from './types'

export const DISCLOSURE_LABELS = {
  hidden: '隠匿',
  undiscovered: '未発見',
  discoverable: '発見可能',
  discovered: '発見済み',
  explained: '説明済み',
  public: '公開',
} satisfies Record<DisclosureValue, string>

export function disclosureLabel(value: DisclosureValue | null | undefined): string | null {
  return value ? DISCLOSURE_LABELS[value] : null
}
