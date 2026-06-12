// =====================================================
// エンジン層
//
// 純粋関数。フレームワーク非依存。
// ペトリネット意味論に基づくstabilize（不動点計算）が核。
// =====================================================

import type {
  Entity,
  EntityState,
  WorldState,
  ReadonlyWorldState,
  Scenario,
  TriggerCondition,
  ConditionClause,
  EntityReference,
  Effect,
  Trigger,
  Action,
} from './types'

import type { ReadonlyEntityState } from './types'

// ===== 読み取り専用エイリアス =====
// クエリ関数が ReadonlyWorldState を受け取れるように。
// mutation関数は引き続き Record<string, EntityState> を使う。
type ReadonlyStates = Readonly<Record<string, ReadonlyEntityState>>

const MAX_STABILIZE_STEPS = 100

// ===== ツリー操作 =====

/** 親→子のマップを構築 */
export function buildChildrenMap(states: ReadonlyStates): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const [id, s] of Object.entries(states)) {
    const pid = s.parentId ?? '__root__'
    if (!map[pid]) map[pid] = []
    map[pid].push(id)
  }
  return map
}

/** 祖先を上方向に辿る（自身は含まない） */
export function getAncestors(entityId: string, states: ReadonlyStates): string[] {
  const result: string[] = []
  let current = states[entityId]?.parentId
  while (current && states[current]) {
    result.push(current)
    current = states[current].parentId
  }
  return result
}

/** 子孫を下方向に辿る（自身は含まない） */
export function getDescendants(
  entityId: string,
  childrenMap: Record<string, string[]>,
): string[] {
  const result: string[] = []
  const stack = childrenMap[entityId] ? [...childrenMap[entityId]] : []
  while (stack.length > 0) {
    const id = stack.pop()!
    result.push(id)
    if (childrenMap[id]) stack.push(...childrenMap[id])
  }
  return result
}

/** 同位（同じ親を持つ、自身除く） */
export function getSiblings(
  entityId: string,
  states: ReadonlyStates,
  childrenMap: Record<string, string[]>,
): string[] {
  const pid = states[entityId]?.parentId ?? '__root__'
  return (childrenMap[pid] ?? []).filter((id) => id !== entityId)
}

// ===== 参照解決 =====

/** EntityReferenceを解決して、対象エンティティIDのリストを返す */
export function resolveReference(
  ref: EntityReference,
  selfId: string,
  states: ReadonlyStates,
  childrenMap: Record<string, string[]>,
): string[] {
  switch (ref.type) {
    case 'self':
      return [selfId]
    case 'ancestor':
      return getAncestors(selfId, states)
    case 'descendant':
      return getDescendants(selfId, childrenMap)
    case 'sibling':
      return getSiblings(selfId, states, childrenMap)
    case 'named':
      return ref.entityId && states[ref.entityId] ? [ref.entityId] : []
  }
}

// ===== 条件評価 =====

/** 単一のConditionClauseを評価 */
export function evaluateClause(
  clause: ConditionClause,
  selfId: string,
  states: ReadonlyStates,
  _entities: readonly Entity[],
  childrenMap: Record<string, string[]>,
): boolean {
  const targetIds = resolveReference(clause.reference, selfId, states, childrenMap)

  for (const targetId of targetIds) {
    const state = states[targetId]
    if (!state) continue

    const val = state.categoryValues[clause.categoryId]
    if (val === undefined) continue

    let matches: boolean
    if (Array.isArray(val)) {
      // 非排他カテゴリ: 値リストに含まれるか
      matches = val.includes(clause.value)
    } else {
      // 排他カテゴリ: 値が一致するか
      matches = val === clause.value
    }

    if (clause.negate) matches = !matches

    if (matches) return true
  }

  return false
}

/** TriggerCondition（AND結合）を評価 */
export function evaluateCondition(
  condition: TriggerCondition,
  selfId: string,
  states: ReadonlyStates,
  entities: readonly Entity[],
  childrenMap: Record<string, string[]>,
): boolean {
  return condition.clauses.every((clause) =>
    evaluateClause(clause, selfId, states, entities, childrenMap),
  )
}

// ===== 効果適用 =====

/** Effect target 内の $actor 参照を行為者IDに解決する */
function resolveActorTarget(target: EntityReference, actorId?: string): EntityReference {
  if (target.type === 'named' && target.entityId === '$actor') {
    // actorId が無ければ entityId: undefined → resolveReference が対象なしを返す
    return { ...target, entityId: actorId }
  }
  return target
}

/**
 * 単一のEffectを適用し、変更があったかを返す。
 *
 * actorId はアクション実行時のみ渡される（トリガーには行為者の概念がない）。
 * Effect 内の $actor を解決する:
 *   - target が named $actor → 行為者エンティティ（actorId なしなら対象なし）
 *   - move の newParentId $actor → 行為者ID（アイテムを行為者の手に移す等）
 *   - setCategory の value $actor → 行為者の名前（表示用途）
 */
export function applyEffect(
  effect: Effect,
  selfId: string,
  states: Record<string, EntityState>,
  entities: Entity[],
  childrenMap: Record<string, string[]>,
  actorId?: string,
): boolean {
  const target = resolveActorTarget(effect.target, actorId)
  const targetIds = resolveReference(target, selfId, states, childrenMap)
  let changed = false

  for (const targetId of targetIds) {
    const state = states[targetId]
    if (!state) continue

    switch (effect.type) {
      case 'setCategory': {
        // value の $actor は行為者の名前に解決（表示用途。見つからなければIDのまま）
        const value =
          effect.value === '$actor' && actorId
            ? (entities.find((e) => e.id === actorId)?.name ?? actorId)
            : effect.value
        const current = state.categoryValues[effect.categoryId]
        // エンティティ定義からカテゴリを探す
        const entity = entities.find((e) => e.id === targetId)
        const category = entity?.categories.find((c) => c.id === effect.categoryId)

        if (category?.exclusive) {
          // 排他: 値を置換
          if (current !== value) {
            state.categoryValues[effect.categoryId] = value
            changed = true
          }
        } else {
          // 非排他: 値を追加
          const arr = Array.isArray(current) ? current : current ? [current] : []
          if (!arr.includes(value)) {
            state.categoryValues[effect.categoryId] = [...arr, value]
            changed = true
          }
        }
        break
      }
      case 'removeCategory': {
        const current = state.categoryValues[effect.categoryId]
        if (Array.isArray(current)) {
          const idx = current.indexOf(effect.value)
          if (idx !== -1) {
            state.categoryValues[effect.categoryId] = current.filter((v) => v !== effect.value)
            changed = true
          }
        } else if (current === effect.value) {
          state.categoryValues[effect.categoryId] = ''
          changed = true
        }
        break
      }
      case 'move': {
        // newParentId の $actor は行為者IDに解決（actorId なしでは移動先が定まらない）
        const newParentId = effect.newParentId === '$actor' ? actorId : effect.newParentId
        if (newParentId === undefined) break
        if (state.parentId !== newParentId) {
          // childrenMap を更新
          const oldPid = state.parentId ?? '__root__'
          if (childrenMap[oldPid]) {
            childrenMap[oldPid] = childrenMap[oldPid].filter((id) => id !== targetId)
          }
          state.parentId = newParentId
          const newPid = newParentId ?? '__root__'
          if (!childrenMap[newPid]) childrenMap[newPid] = []
          childrenMap[newPid].push(targetId)
          changed = true
        }
        break
      }
      default: {
        // exhaustiveness check: コンパイルエラーで未処理のEffect typeを検出
        const _exhaustive: never = effect
        throw new Error(`Unknown effect type: ${(_exhaustive as Effect).type}`)
      }
    }
  }

  return changed
}

// ===== Stabilize（不動点計算） =====

export interface StabilizeResult {
  worldState: WorldState
  firedTriggers: { triggerId: string; entityId: string; step: number }[]
  reachedFixedPoint: boolean // true = 正常停止, false = 上限到達（振動の可能性）
}

/**
 * 状態を安定させる。
 *
 * 1. 全トリガーをスキャンし、条件が成立するものを見つける
 * 2. 効果を適用
 * 3. 変更があれば1に戻る
 * 4. 変更がなくなったら（不動点）停止
 */
export function stabilize(
  worldState: WorldState,
  scenario: Scenario,
): StabilizeResult {
  const states = worldState.entityStates
  let childrenMap = buildChildrenMap(states)
  const firedTriggers: StabilizeResult['firedTriggers'] = []
  let step = worldState.step

  for (let i = 0; i < MAX_STABILIZE_STEPS; i++) {
    let anyChanged = false

    for (const entity of scenario.entities) {
      for (const trigger of entity.triggers) {
        // firedOnce チェック
        if (trigger.firedOnce && worldState.firedTriggerIds.has(trigger.id)) {
          continue
        }

        // 条件評価
        if (
          evaluateCondition(trigger.condition, entity.id, states, scenario.entities, childrenMap)
        ) {
          // 効果適用
          let triggerChanged = false
          for (const effect of trigger.effects) {
            const changed = applyEffect(effect, entity.id, states, scenario.entities, childrenMap)
            if (changed) triggerChanged = true
          }

          // firedOnce は効果がなくても発火済みにする（二度目を防ぐため）
          if (trigger.firedOnce) {
            if (!worldState.firedTriggerIds.has(trigger.id)) {
              worldState.firedTriggerIds.add(trigger.id)
              triggerChanged = true
            }
          }

          if (triggerChanged) {
            anyChanged = true
            firedTriggers.push({ triggerId: trigger.id, entityId: entity.id, step })

            // ログ
            worldState.log.push({
              timestamp: step,
              at: Date.now(),
              type: 'trigger',
              sourceEntityId: entity.id,
              description: `トリガー「${trigger.name}」が発火`,
            })
          }
        }
      }
    }

    step++
    worldState.step = step

    if (!anyChanged) {
      return { worldState, firedTriggers, reachedFixedPoint: true }
    }
  }

  // 上限到達 = 振動の可能性
  return { worldState, firedTriggers, reachedFixedPoint: false }
}

// ===== 進入条件 =====

/**
 * 場所への進入可否を判定する。
 * entryCondition がなければ常に進入可。あれば対象場所を selfId として評価する。
 */
export function canEnter(
  entityId: string,
  worldState: ReadonlyWorldState,
  scenario: Scenario,
): boolean {
  const entity = scenario.entities.find((e) => e.id === entityId)
  if (!entity?.entryCondition) return true

  const states = worldState.entityStates
  const childrenMap = buildChildrenMap(states)
  return evaluateCondition(entity.entryCondition, entityId, states, scenario.entities, childrenMap)
}

// ===== 場面合成 =====

/**
 * エンティティの場面描写を合成する。
 *
 * 1. 自身の entity.description が非空なら先頭に置く
 * 2. 自身 + 子孫を木の深さ優先順（親→子）で走査し、各エンティティの
 *    カテゴリ定義順に、現在値（排他=単値、非排他=各値）が
 *    Category.descriptions に描写を持てば追加する
 *
 * 描写を持たない値は出力しない — 未発見アイテム等は自然に不可視になる。
 */
export function composeSceneDescription(
  entityId: string,
  worldState: ReadonlyWorldState,
  scenario: Scenario,
): { entityId: string; text: string }[] {
  const states = worldState.entityStates
  const childrenMap = buildChildrenMap(states)
  const result: { entityId: string; text: string }[] = []

  const self = scenario.entities.find((e) => e.id === entityId)
  if (self && self.description) {
    result.push({ entityId, text: self.description })
  }

  const visit = (id: string) => {
    const entity = scenario.entities.find((e) => e.id === id)
    const state = states[id]
    if (entity && state) {
      for (const cat of entity.categories) {
        if (!cat.descriptions) continue
        const val = state.categoryValues[cat.id]
        if (val === undefined) continue
        const values = typeof val === 'string' ? [val] : val
        for (const v of values) {
          const text = cat.descriptions[v]
          if (text) result.push({ entityId: id, text })
        }
      }
    }
    for (const childId of childrenMap[id] ?? []) visit(childId)
  }
  visit(entityId)

  return result
}

// ===== アクション実行 =====

/** アクションの表示条件を評価し、利用可能なアクションを返す */
export function getAvailableActions(
  entityId: string,
  worldState: ReadonlyWorldState,
  scenario: Scenario,
): Action[] {
  const entity = scenario.entities.find((e) => e.id === entityId)
  if (!entity) return []

  const states = worldState.entityStates
  const childrenMap = buildChildrenMap(states)

  return entity.actions.filter((action) => {
    if (!action.displayCondition) return true
    return evaluateCondition(action.displayCondition, entityId, states, scenario.entities, childrenMap)
  })
}

/**
 * アクションの効果を適用する（stabilize は呼ばない）。
 * 呼び出し元が mutateAndStabilize 経由で stabilize を保証する。
 *
 * rollResult:
 *   - undefined: ロール不要（rollRequirementなし）またはロールなしで実行
 *   - 'success': ロール成功 → effects + successEffects
 *   - 'failure': ロール失敗 → failureEffects のみ
 *
 * @returns false if action not found
 */
export function applyActionEffects(
  actionId: string,
  worldState: WorldState,
  scenario: Scenario,
  actorId?: string,
  rollResult?: 'success' | 'failure',
): boolean {
  // アクションを探す
  let action: Action | undefined
  let ownerEntity: Entity | undefined
  for (const entity of scenario.entities) {
    const found = entity.actions.find((a) => a.id === actionId)
    if (found) {
      action = found
      ownerEntity = entity
      break
    }
  }

  if (!action || !ownerEntity) return false

  const states = worldState.entityStates
  const childrenMap = buildChildrenMap(states)

  // ロール判定の結果に基づいて適用する効果を決定
  const hasRoll = action.rollRequirement != null
  const effectiveRollResult = hasRoll ? (rollResult ?? 'success') : undefined

  if (effectiveRollResult === 'failure') {
    // 失敗: failureEffects のみ
    const failEffects = action.rollRequirement?.failureEffects ?? []
    for (const effect of failEffects) {
      applyEffect(effect, ownerEntity.id, states, scenario.entities, childrenMap, actorId)
    }
  } else {
    // 成功 or ロールなし: 基本effects適用
    for (const effect of action.effects) {
      applyEffect(effect, ownerEntity.id, states, scenario.entities, childrenMap, actorId)
    }
    // 成功時追加効果
    if (effectiveRollResult === 'success') {
      const successEffects = action.rollRequirement?.successEffects ?? []
      for (const effect of successEffects) {
        applyEffect(effect, ownerEntity.id, states, scenario.entities, childrenMap, actorId)
      }
    }
  }

  // ログ
  const desc = actorId
    ? action.description.replace(/\$actor/g, actorId)
    : action.description
  const rollSuffix = effectiveRollResult
    ? effectiveRollResult === 'success' ? '（成功）' : '（失敗）'
    : ''
  worldState.log.push({
    timestamp: worldState.step,
    at: Date.now(),
    type: 'action',
    sourceEntityId: ownerEntity.id,
    description: desc + rollSuffix,
    actorId,
  })

  return true
}

/**
 * アクションを発火し、stabilize する。
 * テストや外部からの一括操作向け便利関数。
 * UI層は mutateAndStabilize + applyActionEffects を使うこと。
 */
export function fireAction(
  actionId: string,
  worldState: WorldState,
  scenario: Scenario,
  actorId?: string,
  rollResult?: 'success' | 'failure',
): StabilizeResult {
  applyActionEffects(actionId, worldState, scenario, actorId, rollResult)
  return stabilize(worldState, scenario)
}

// ===== ワールド状態初期化 =====

export function initializeWorldState(scenario: Scenario): WorldState {
  const entityStates: Record<string, EntityState> = {}

  for (const entity of scenario.entities) {
    const categoryValues: Record<string, string | string[]> = {}
    for (const cat of entity.categories) {
      if (cat.exclusive) {
        // 排他: 最初の選択肢をデフォルト
        categoryValues[cat.id] = cat.options[0] ?? ''
      } else {
        // 非排他: 空リスト
        categoryValues[cat.id] = []
      }
    }

    entityStates[entity.id] = {
      entityId: entity.id,
      parentId: entity.parentId,
      categoryValues,
    }
  }

  return {
    scenarioId: scenario.id,
    entityStates,
    firedTriggerIds: new Set(),
    log: [],
    step: 0,
  }
}

// ===== ユーティリティ =====

/** エンティティのツリー構造を返す */
export function getChildren(
  entityId: string,
  states: ReadonlyStates,
): string[] {
  return Object.entries(states)
    .filter(([, s]) => s.parentId === entityId)
    .map(([id]) => id)
}

/** 待機中トリガー: 条件が部分充足（残り1つ）のトリガーを検出 */
export function getPendingTriggers(
  worldState: ReadonlyWorldState,
  scenario: Scenario,
): { trigger: Trigger; entity: Entity; unmetClauses: ConditionClause[] }[] {
  const states = worldState.entityStates
  const childrenMap = buildChildrenMap(states)
  const result: { trigger: Trigger; entity: Entity; unmetClauses: ConditionClause[] }[] = []

  for (const entity of scenario.entities) {
    for (const trigger of entity.triggers) {
      if (trigger.firedOnce && worldState.firedTriggerIds.has(trigger.id)) continue

      const unmet = trigger.condition.clauses.filter(
        (c) => !evaluateClause(c, entity.id, states, scenario.entities, childrenMap),
      )

      // 残り1つ = あと一歩で発火
      if (unmet.length === 1) {
        result.push({ trigger, entity, unmetClauses: unmet })
      }
    }
  }

  return result
}
