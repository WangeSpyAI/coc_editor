// =====================================================
// セッション永続化
//
// 純粋関数。React 非依存（engine と types のみ import 可）。
// localStorage 保存とファイルエクスポートの両方がこの1組の
// serialize/revive を通る — 「保存はできるが読み込めない」形式乖離が起きない。
// =====================================================

import type { Scenario, WorldState, ReadonlyWorldState } from './types'
import { createDefaultParties, type StabilizeResult } from './engine'

/** 現在の保存形式バージョン。serializeSession が常にこの値を書く */
export const SESSION_FORMAT_VERSION = 1

/**
 * 外部公開用セッション型。
 * worldState は ReadonlyWorldState — コンポーネントは読み取り専用。
 * 状態変更は useScenario のコールバック（doAction, setCategoryValue等）経由のみ。
 */
export interface ScenarioSession {
  scenario: Scenario
  worldState: ReadonlyWorldState
  lastResult: StabilizeResult | null
}

/**
 * セッションの永続化形式。
 *
 * - firedTriggerIds は JSON 化のため配列
 * - lastResult は含めない（一時的な stabilize レポートでありセッション状態ではない。
 *   永続化するとマイグレーション漏れの温床になる）
 * - 旧データは formatVersion / parties を持たないことがある（revive で補完）
 */
export interface PersistedSession {
  formatVersion?: number
  scenario: Scenario
  worldState: Omit<WorldState, 'firedTriggerIds' | 'parties' | 'activePartyId'> &
    Partial<Pick<WorldState, 'parties' | 'activePartyId'>> & { firedTriggerIds: string[] }
}

export function serializeSession(session: ScenarioSession): PersistedSession {
  return {
    formatVersion: SESSION_FORMAT_VERSION,
    scenario: session.scenario,
    worldState: {
      ...session.worldState,
      firedTriggerIds: [...session.worldState.firedTriggerIds],
    } as PersistedSession['worldState'],
  }
}

/**
 * 永続化形式から ScenarioSession を復元する（localStorage / インポートファイル共通）。
 *
 * 未来の保存形式（formatVersion > 現行）は例外を投げる —
 * 構造を知らないデータを「読めた風」にして壊れた世界を作るより、
 * 読み込み失敗（loadSession → null / インポート no-op）に倒す。
 */
export function reviveSession(data: PersistedSession): ScenarioSession {
  if (data.formatVersion !== undefined && data.formatVersion > SESSION_FORMAT_VERSION) {
    throw new Error(`未対応の保存形式バージョン: ${data.formatVersion}`)
  }
  const scenario = data.scenario
  // Migrate: 古いデータに connections がない場合は補完
  for (const e of scenario.entities) {
    if (!e.connections) e.connections = []
  }
  const worldState: WorldState = {
    ...data.worldState,
    firedTriggerIds: new Set(data.worldState.firedTriggerIds),
    parties: data.worldState.parties ?? [],
    activePartyId: data.worldState.activePartyId ?? null,
  }
  // Migrate: 古いデータに parties / activePartyId がない場合は
  // initializeWorldState と同じロジック（createDefaultParties）で補完。
  // 位置はシナリオ定義ではなく保存済みの実状態（entityStates）から導出する —
  // プレイ中に move したPCの位置が初期位置に巻き戻らないように。
  if (!data.worldState.parties) {
    const defaults = createDefaultParties(scenario, worldState.entityStates)
    worldState.parties = defaults.parties
    worldState.activePartyId = defaults.activePartyId
  }
  // lastResult は永続化対象外 — 復元時は常に null
  return { scenario, worldState, lastResult: null }
}
