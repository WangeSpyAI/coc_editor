import { useState, useCallback, useRef } from 'react'
import type { Scenario, WorldState, ReadonlyWorldState, ReadonlyParty, Entity, Action, Effect, Trigger, LogEntry, Category, ConditionClause } from '../core/types'
import {
  initializeWorldState,
  stabilize,
  reconcileWorldWithScenario,
  applyActionEffects as engineApplyActionEffects,
  applyEffect as engineApplyEffect,
  getPendingTriggers,
  buildChildrenMap,
  pushLog,
  canEnter,
  composeSceneDescription,
  resolveReference,
} from '../core/engine'
import {
  serializeSession,
  reviveSession,
  type ScenarioSession,
  type PersistedSession,
} from '../core/persistence'

// 永続化（serialize / revive）は src/core/persistence.ts に分離 —
// 純粋関数なので単体テスト可能。型は既存利用箇所のためここから再公開する。
export type { ScenarioSession, PersistedSession }

const STORAGE_KEY = 'scenario_editor_data'
const MAX_UNDO_HISTORY = 50

/**
 * mutateAndStabilize コールバックが受け取る制限付きAPI。
 *
 * 生の WorldState を渡さず、許可された操作だけを公開する。
 * entityStates を直接触る道が存在しないので、間違えようがない。
 */
interface MutationAPI {
  /** 現在の状態を読む（readonly — 書き込み不可） */
  readonly worldState: ReadonlyWorldState
  /** 単一の Effect を適用する（actorId は Effect 内の $actor 解決用） */
  applyEffect(effect: Effect, selfId: string, actorId?: string): boolean
  /** アクションの効果を適用する */
  fireAction(actionId: string, actorId?: string, rollResult?: 'success' | 'failure'): boolean
  /** 新しいエンティティの状態を初期化する */
  initEntity(entityId: string, parentId: string | null, categoryValues: Record<string, string | string[]>): void
  /** ログを追加する */
  log(type: LogEntry['type'], sourceEntityId: string, description: string, actorId?: string): void
  /**
   * パーティ編成を差し替える（防御的コピーが入る）。
   * 触れるのはパーティ構成のみ — メンバーの位置変更は move Effect（applyEffect）経由。
   * entityStates に触る道はここにも存在しない。
   */
  setParties(parties: readonly ReadonlyParty[], activePartyId: string | null): void
}


function loadSession(): ScenarioSession | null {
  try {
    const json = localStorage.getItem(STORAGE_KEY)
    if (!json) return null
    return reviveSession(JSON.parse(json) as PersistedSession)
  } catch {
    return null
  }
}

function saveSession(session: ScenarioSession) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeSession(session)))
  } catch { /* storage full */ }
}

let idCounter = Date.now()
function genId(prefix: string): string {
  return `${prefix}-${(idCounter++).toString(36)}`
}

/**
 * scenario.entities のうち1エンティティだけを patch で差し替えた新 Scenario を返す。
 * 「entities.map で1件だけ更新」の唯一の書き方 — 個別サイトでの書き間違いを塞ぐ。
 */
function patchEntity(scenario: Scenario, entityId: string, patch: (e: Entity) => Entity): Scenario {
  return {
    ...scenario,
    entities: scenario.entities.map((e) => (e.id === entityId ? patch(e) : e)),
  }
}

/**
 * カテゴリの options に値を追記した新 Scenario を返す。
 * 自由入力値の自動追加（setCategoryValue / shareKnowledge）はここを通る。
 * 呼び出し側は「値を設定するとき」だけ呼ぶこと — 除去（トグルOFF）で選択肢を増やさない。
 */
function addCategoryOption(scenario: Scenario, entityId: string, categoryId: string, value: string): Scenario {
  return patchEntity(scenario, entityId, (e) => ({
    ...e,
    categories: e.categories.map((c) => (c.id === categoryId ? { ...c, options: [...c.options, value] } : c)),
  }))
}

export function useScenario() {
  const [session, setSession] = useState<ScenarioSession | null>(loadSession)
  const sessionRef = useRef(session)
  sessionRef.current = session

  // selectedEntityId はUI状態 — セッションデータとは分離。
  // undo/redo/永続化の対象外。commitMutationを通さない。
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)

  // Undo 履歴: commitMutation が自動的にスナップショットを積む。
  // 個別関数が「履歴に入れ忘れる」ことが構造的にない。
  const undoStackRef = useRef<ScenarioSession[]>([])
  const [canUndo, setCanUndo] = useState(false)

  // Clone worldState for mutation (Set復元込み)
  const cloneWorld = useCallback((): WorldState => {
    const ws = sessionRef.current!.worldState
    const cloned = structuredClone(ws) as WorldState
    cloned.firedTriggerIds = new Set(ws.firedTriggerIds)
    return cloned
  }, [])

  // ====================================================================
  // 状態更新プリミティブは3つだけ。それぞれundoの意味が異なる。
  //
  //   commitMutation  — 状態/スキーマ変更。undo自動push。
  //   lifecycleReset  — セッション開始/終了。undoスタッククリア。
  //   (selectEntity)  — UI選択のみ。undoなし。直書き。
  //
  // update() や pushUndo() は存在しない。
  // commitMutation を呼べばundoは自動。忘れようがない。
  // lifecycleReset を呼べばundoはリセット。中途半端な履歴が残らない。
  // ====================================================================

  /** 状態変更コミット: undo自動push → 新状態を保存 */
  const commitMutation = useCallback((next: ScenarioSession) => {
    if (sessionRef.current) {
      const stack = undoStackRef.current
      stack.push(sessionRef.current)
      if (stack.length > MAX_UNDO_HISTORY) stack.shift()
      setCanUndo(true)
    }
    sessionRef.current = next
    setSession(next)
    saveSession(next)
  }, [])

  /** セッション境界: undoスタッククリア → 新状態を保存（またはnullでクリア） */
  const lifecycleReset = useCallback((next: ScenarioSession | null) => {
    undoStackRef.current = []
    setCanUndo(false)
    sessionRef.current = next
    setSession(next)
    if (next) {
      saveSession(next)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  /** WorldState変更パス: clone → MutationAPI → stabilize → commitMutation */
  const mutateAndStabilize = useCallback((
    mutate: (api: MutationAPI) => void,
    scenarioOverride?: Scenario,
  ) => {
    if (!sessionRef.current) return
    const scenario = scenarioOverride ?? sessionRef.current.scenario
    const ws = cloneWorld()
    const childrenMap = buildChildrenMap(ws.entityStates)

    const api: MutationAPI = {
      get worldState() { return ws as unknown as ReadonlyWorldState },
      applyEffect(effect, selfId, actorId) {
        return engineApplyEffect(effect, selfId, ws.entityStates, scenario.entities, childrenMap, actorId)
      },
      fireAction(actionId, actorId, rollResult) {
        return engineApplyActionEffects(actionId, ws, scenario, actorId, rollResult)
      },
      initEntity(entityId, parentId, categoryValues) {
        ws.entityStates[entityId] = { entityId, parentId, categoryValues }
      },
      log(type, sourceEntityId, description, actorId) {
        pushLog(ws, { type, sourceEntityId, description, actorId })
      },
      setParties(parties, activePartyId) {
        ws.parties = parties.map((p) => ({
          id: p.id,
          name: p.name,
          memberIds: [...p.memberIds],
          locationId: p.locationId,
        }))
        ws.activePartyId = activePartyId
      },
    }

    mutate(api)
    // シナリオ縮小（removeEntity 等）後の参照切れ（ghost entityStates /
    // memberIds / locationId / activePartyId / 空パーティ）をここで必ず掃除する。
    // scenarioOverride の有無で分岐しない — 冪等かつ O(n) なので無条件実行とし、
    // パーティ操作だけのパス（splitParty の空 husk 等）も同じチョークポイントで整合させる。
    reconcileWorldWithScenario(ws, scenario)
    const result = stabilize(ws, scenario)
    commitMutation({
      ...sessionRef.current,
      scenario,
      worldState: result.worldState,
      lastResult: result,
    })
  }, [commitMutation, cloneWorld])

  /** Scenario変更パス: scenario 差し替え → commitMutation */
  const mutateScenario = useCallback((
    mutate: (scenario: Scenario) => Scenario,
  ) => {
    if (!sessionRef.current) return
    const newScenario = mutate(sessionRef.current.scenario)
    commitMutation({ ...sessionRef.current, scenario: newScenario })
  }, [commitMutation])

  // === Session lifecycle (undoスタッククリア) ===

  const loadScenario = useCallback((scenario: Scenario) => {
    const worldState = initializeWorldState(scenario)
    const result = stabilize(worldState, scenario)
    lifecycleReset({
      scenario,
      worldState: result.worldState,
      lastResult: result,
    })
    setSelectedEntityId(null)
  }, [lifecycleReset])

  /** エクスポートされたセッション（scenario + worldState）を復元する。進行状態ごと再開 */
  const importSession = useCallback((data: PersistedSession) => {
    lifecycleReset(reviveSession(data))
    setSelectedEntityId(null)
  }, [lifecycleReset])

  const selectEntity = useCallback((id: string | null) => {
    setSelectedEntityId(id)
  }, [])

  const resetWorld = useCallback(() => {
    if (!sessionRef.current) return
    const { scenario } = sessionRef.current
    const worldState = initializeWorldState(scenario)
    const result = stabilize(worldState, scenario)
    commitMutation({ ...sessionRef.current, worldState: result.worldState, lastResult: result })
  }, [commitMutation])

  const clearSession = useCallback(() => {
    lifecycleReset(null)
  }, [lifecycleReset])

  // === Action execution ===

  const doAction = useCallback((actionId: string, actorId?: string, rollResult?: 'success' | 'failure') => {
    mutateAndStabilize((api) => {
      api.fireAction(actionId, actorId, rollResult)
    })
  }, [mutateAndStabilize])

  /** KP直接操作: カテゴリ値を変更して stabilize */
  const setCategoryValue = useCallback((entityId: string, categoryId: string, value: string) => {
    if (!sessionRef.current) return
    const { scenario, worldState } = sessionRef.current

    const entity = scenario.entities.find((e) => e.id === entityId)
    const cat = entity?.categories.find((c) => c.id === categoryId)
    if (!entity || !cat) return

    // 非排他カテゴリで既に保持している値ならトグルOFF（除去）。
    // 選択肢の自動追加より先に判定する — 除去操作で options を増やしてはならない。
    const current = worldState.entityStates[entityId]?.categoryValues[categoryId]
    const isToggleOff = !cat.exclusive && Array.isArray(current) && current.includes(value)

    // 自由入力値は「設定するとき」だけ選択肢に自動追加（v5: 即興を阻害しない）。
    // scenarioOverride で状態変更と同一コミット — undo も一体で戻る。
    let scenarioOverride: Scenario | undefined
    if (!isToggleOff && value && !cat.options.includes(value)) {
      scenarioOverride = addCategoryOption(scenario, entityId, categoryId, value)
    }

    mutateAndStabilize((api) => {
      if (isToggleOff) {
        api.applyEffect(
          { type: 'removeCategory', target: { type: 'named', entityId }, categoryId, value },
          entityId,
        )
        api.log('system', entityId, `${entity.name}: ${cat.name} − ${value}`)
        return
      }

      api.applyEffect(
        { type: 'setCategory', target: { type: 'named', entityId }, categoryId, value },
        entityId,
      )
      api.log('system', entityId, `${entity.name}: ${cat.name} → ${value}`)
    }, scenarioOverride)
  }, [mutateAndStabilize])

  // === Party operations (パーティ操作と移動) ===

  /** アクティブパーティを切り替える（編成は変えない。ログ不要） */
  const setActiveParty = useCallback((partyId: string) => {
    if (!sessionRef.current) return
    const { worldState } = sessionRef.current
    if (worldState.activePartyId === partyId) return
    if (!worldState.parties.some((p) => p.id === partyId)) return
    mutateAndStabilize((api) => {
      api.setParties(api.worldState.parties, partyId)
    })
  }, [mutateAndStabilize])

  /**
   * アクティブパーティを場所へ移動する。
   * - canEnter false（進入条件未充足）なら何もしない
   * - 全メンバーに move Effect → party.locationId 更新
   * - ログ: 移動の記録 + 移動先の場面描写（空なら省略）
   */
  const moveParty = useCallback((locationId: string) => {
    if (!sessionRef.current) return
    const { scenario, worldState } = sessionRef.current
    const party = worldState.parties.find((p) => p.id === worldState.activePartyId)
    if (!party) return
    if (!canEnter(locationId, worldState, scenario)) return
    const locationName = scenario.entities.find((e) => e.id === locationId)?.name ?? locationId

    mutateAndStabilize((api) => {
      for (const memberId of party.memberIds) {
        api.applyEffect(
          { type: 'move', target: { type: 'named', entityId: memberId }, newParentId: locationId },
          memberId,
        )
      }
      api.setParties(
        api.worldState.parties.map((p) => (p.id === party.id ? { ...p, locationId } : p)),
        api.worldState.activePartyId,
      )
      api.log('system', locationId, `パーティ「${party.name}」が「${locationName}」へ移動`)
      // 移動先の場面描写もログに残す（v5: 描写が成果物）
      const scene = composeSceneDescription(locationId, api.worldState, scenario)
      if (scene.length > 0) {
        api.log('system', locationId, scene.map((s) => s.text).join('\n'))
      }
    })
  }, [mutateAndStabilize])

  /** アクティブパーティから指定メンバーを抜いて新パーティを作り、それをアクティブにする */
  const splitParty = useCallback((memberIds: string[], newName: string) => {
    if (!sessionRef.current) return
    const { scenario, worldState } = sessionRef.current
    const active = worldState.parties.find((p) => p.id === worldState.activePartyId)
    if (!active) return
    const moving = active.memberIds.filter((id) => memberIds.includes(id))
    if (moving.length === 0) return
    const newId = genId('party')

    mutateAndStabilize((api) => {
      const remaining = api.worldState.parties.map((p) =>
        p.id === active.id ? { ...p, memberIds: p.memberIds.filter((m) => !moving.includes(m)) } : p,
      )
      api.setParties(
        [...remaining, { id: newId, name: newName, memberIds: moving, locationId: active.locationId }],
        newId,
      )
      const names = moving.map((id) => scenario.entities.find((e) => e.id === id)?.name ?? id)
      api.log('system', active.locationId ?? '', `パーティ「${active.name}」から「${newName}」が分かれた（${names.join('、')}）`)
    })
  }, [mutateAndStabilize])

  /** src パーティをアクティブパーティへ統合する（同じ場所にいるときのみ）。src は消える */
  const mergeParties = useCallback((srcPartyId: string) => {
    if (!sessionRef.current) return
    const { worldState } = sessionRef.current
    const active = worldState.parties.find((p) => p.id === worldState.activePartyId)
    const src = worldState.parties.find((p) => p.id === srcPartyId)
    if (!active || !src || src.id === active.id) return
    if (src.locationId !== active.locationId) return

    mutateAndStabilize((api) => {
      api.setParties(
        api.worldState.parties
          .filter((p) => p.id !== src.id)
          .map((p) =>
            p.id === active.id
              ? { ...p, memberIds: [...p.memberIds, ...src.memberIds.filter((m) => !p.memberIds.includes(m))] }
              : p,
          ),
        active.id,
      )
      api.log('system', active.locationId ?? '', `パーティ「${src.name}」が「${active.name}」に合流`)
    })
  }, [mutateAndStabilize])

  /**
   * アクティブパーティにメンバーを追加する（NPC同行用）。重複追加は無視。
   * 他パーティに所属していたら抜いてから追加する（移籍扱い）—
   * 同一エンティティが2つの名簿に載ると「どこにいるか」をパーティが語れなくなる。
   * 移籍で空になった元パーティは mutateAndStabilize の整合処理が取り除く。
   */
  const addToParty = useCallback((entityId: string) => {
    if (!sessionRef.current) return
    const { worldState } = sessionRef.current
    const active = worldState.parties.find((p) => p.id === worldState.activePartyId)
    const entityState = worldState.entityStates[entityId]
    if (!entityState) return
    if (active?.memberIds.includes(entityId)) return

    mutateAndStabilize((api) => {
      const partiesWithoutMember = api.worldState.parties.map((p) =>
        p.memberIds.includes(entityId) ? { ...p, memberIds: p.memberIds.filter((m) => m !== entityId) } : p
      )

      if (!active) {
        const partyId = api.worldState.parties.some((p) => p.id === 'party-default')
          ? genId('party')
          : 'party-default'
        api.setParties(
          [
            ...partiesWithoutMember,
            { id: partyId, name: 'パーティ', memberIds: [entityId], locationId: entityState.parentId },
          ],
          partyId,
        )
        return
      }

      api.setParties(
        partiesWithoutMember.map((p) => {
          if (p.id === active.id) return { ...p, memberIds: [...p.memberIds, entityId] }
          return p
        }),
        api.worldState.activePartyId,
      )
    })
  }, [mutateAndStabilize])

  /** アクティブパーティからメンバーを除く */
  const removeFromParty = useCallback((entityId: string) => {
    if (!sessionRef.current) return
    const { worldState } = sessionRef.current
    const active = worldState.parties.find((p) => p.id === worldState.activePartyId)
    if (!active || !active.memberIds.includes(entityId)) return

    mutateAndStabilize((api) => {
      api.setParties(
        api.worldState.parties.map((p) =>
          p.id === active.id ? { ...p, memberIds: p.memberIds.filter((m) => m !== entityId) } : p,
        ),
        api.worldState.activePartyId,
      )
    })
  }, [mutateAndStabilize])

  // === Live scenario editing (リアルタイム執筆) ===
  //
  // These mutate the scenario AND patch the current world state.
  // The session is NOT reset — ongoing state is preserved.

  /** Add a new entity to the scenario + world state */
  const addEntity = useCallback((entity: Omit<Entity, 'id'> & { id?: string }): string => {
    if (!sessionRef.current) return ''
    const { scenario } = sessionRef.current
    const id = entity.id ?? genId('entity')
    const newEntity: Entity = { ...entity, id } as Entity

    const newScenario: Scenario = {
      ...scenario,
      entities: [...scenario.entities, newEntity],
    }

    mutateAndStabilize((api) => {
      const categoryValues: Record<string, string | string[]> = {}
      for (const cat of newEntity.categories) {
        categoryValues[cat.id] = cat.exclusive ? (cat.options[0] ?? '') : []
      }
      api.initEntity(id, newEntity.parentId, categoryValues)
    }, newScenario)
    return id
  }, [mutateAndStabilize])

  /** Add a new action to an existing entity (schema-only, no stabilize) */
  const addAction = useCallback((entityId: string, action: Omit<Action, 'id' | 'entityId'> & { id?: string }): string => {
    if (!sessionRef.current) return ''
    const id = action.id ?? genId('action')
    const newAction: Action = { ...action, id, entityId } as Action

    mutateScenario((scenario) => patchEntity(scenario, entityId, (e) => ({ ...e, actions: [...e.actions, newAction] })))
    return id
  }, [mutateScenario])

  /** Add a new trigger to an existing entity, then stabilize */
  const addTrigger = useCallback((entityId: string, trigger: Omit<Trigger, 'id' | 'entityId'> & { id?: string }): string => {
    if (!sessionRef.current) return ''
    const { scenario } = sessionRef.current
    const id = trigger.id ?? genId('trigger')
    const newTrigger: Trigger = { ...trigger, id, entityId } as Trigger

    const newScenario = patchEntity(scenario, entityId, (e) => ({ ...e, triggers: [...e.triggers, newTrigger] }))

    // New trigger might fire immediately → stabilize (no mutation needed, just re-evaluate)
    mutateAndStabilize(() => {}, newScenario)
    return id
  }, [mutateAndStabilize])

  /** Execute ad-hoc effects (direct state manipulation) + stabilize */
  const applyAdHoc = useCallback((effects: Effect[], description: string) => {
    mutateAndStabilize((api) => {
      for (const effect of effects) {
        api.applyEffect(effect, '__adhoc__')
      }
      api.log('action', '__adhoc__', description)
    })
  }, [mutateAndStabilize])

  // === Session assistance (セッション支援) ===

  /**
   * 知識の共有: from のカテゴリ値を to にコピーする（PC間の情報共有用）。
   *
   * to に同じ受け皿がなければ作る:
   *   1. 同IDのカテゴリ定義があればそれを使う
   *   2. なければ同名・非排他のカテゴリを再利用（過去の共有で作られたもの。
   *      毎回新規作成すると共有のたびに同名カテゴリが増殖するため）
   *   3. それもなければ同名・非排他のカテゴリを新規IDで to のスキーマに追加
   *
   * スキーマ追加と値コピーは scenarioOverride で同一コミット — undo も一体で戻る。
   */
  const shareKnowledge = useCallback((fromEntityId: string, toEntityId: string, categoryId: string, value: string) => {
    if (!sessionRef.current) return
    const { scenario } = sessionRef.current
    const from = scenario.entities.find((e) => e.id === fromEntityId)
    const to = scenario.entities.find((e) => e.id === toEntityId)
    const fromCat = from?.categories.find((c) => c.id === categoryId)
    if (!from || !to || !fromCat) return

    const existing =
      to.categories.find((c) => c.id === categoryId)
      ?? to.categories.find((c) => c.name === fromCat.name && !c.exclusive)

    // UI（StateBadges）は options にある値しか描画しない —
    // 共有値が選択肢に入っていないと「共有したのに見えない」が起きるため必ず含める。
    let targetCategoryId: string
    let scenarioOverride: Scenario | undefined
    if (existing) {
      targetCategoryId = existing.id
      if (!existing.options.includes(value)) {
        scenarioOverride = addCategoryOption(scenario, toEntityId, existing.id, value)
      }
    } else {
      targetCategoryId = genId('cat')
      const options = fromCat.options.includes(value) ? [...fromCat.options] : [...fromCat.options, value]
      const newCat: Category = { id: targetCategoryId, name: fromCat.name, exclusive: false, options }
      scenarioOverride = patchEntity(scenario, toEntityId, (e) => ({ ...e, categories: [...e.categories, newCat] }))
    }

    mutateAndStabilize((api) => {
      api.applyEffect(
        { type: 'setCategory', target: { type: 'named', entityId: toEntityId }, categoryId: targetCategoryId, value },
        toEntityId,
      )
      api.log('system', fromEntityId, `${from.name}が${to.name}に「${value}」を共有`)
    }, scenarioOverride)
  }, [mutateAndStabilize])

  /**
   * 待機中トリガーの未充足節をワンクリックで充足させる（KP支援）。
   * negate 節（「〜でない」）は値の付与では充足できないので何もしない。
   * 充足後は mutateAndStabilize が自動で stabilize → トリガーが発火する。
   */
  const fulfillPendingClause = useCallback((ownerEntityId: string, clause: ConditionClause) => {
    if (!sessionRef.current) return
    if (clause.negate) return
    const { scenario, worldState } = sessionRef.current

    const targets = resolveReference(
      clause.reference, ownerEntityId, worldState.entityStates, buildChildrenMap(worldState.entityStates),
    )
    const targetId = targets[0]
    if (!targetId) return

    const targetEntity = scenario.entities.find((e) => e.id === targetId)
    const catName = targetEntity?.categories.find((c) => c.id === clause.categoryId)?.name ?? clause.categoryId

    mutateAndStabilize((api) => {
      api.applyEffect(
        { type: 'setCategory', target: { type: 'named', entityId: targetId }, categoryId: clause.categoryId, value: clause.value },
        targetId,
      )
      api.log('system', targetId, `付与: ${targetEntity?.name ?? targetId}: ${catName} → ${clause.value}`)
    })
  }, [mutateAndStabilize])

  // === Entity Update/Delete ===

  /** Update entity properties (name, description, labels, parentId, connections, entryCondition) */
  const updateEntity = useCallback((entityId: string, patch: Partial<Pick<Entity, 'name' | 'description' | 'labels' | 'parentId' | 'connections' | 'entryCondition'>>) => {
    if (!sessionRef.current) return
    const newScenario = patchEntity(sessionRef.current.scenario, entityId, (e) => ({ ...e, ...patch }))
    // parentId change affects world state
    if ('parentId' in patch) {
      mutateAndStabilize((api) => {
        const es = api.worldState.entityStates[entityId]
        if (es) api.initEntity(entityId, patch.parentId ?? null, { ...es.categoryValues } as Record<string, string | string[]>)
      }, newScenario)
    } else {
      mutateScenario(() => newScenario)
    }
  }, [mutateAndStabilize, mutateScenario])

  /**
   * Remove entity + all children from scenario and world state.
   * シナリオから消すだけでよい — ghost entityStates / memberIds / locationId /
   * activePartyId の掃除は mutateAndStabilize 内の reconcileWorldWithScenario が行う。
   */
  const removeEntity = useCallback((entityId: string) => {
    if (!sessionRef.current) return
    const { scenario } = sessionRef.current

    // Collect entity and all descendants
    const toRemove = new Set<string>()
    const collect = (id: string) => {
      toRemove.add(id)
      for (const e of scenario.entities) {
        if (e.parentId === id) collect(e.id)
      }
    }
    collect(entityId)

    const newScenario: Scenario = {
      ...scenario,
      entities: scenario.entities.filter((e) => !toRemove.has(e.id)),
    }

    mutateAndStabilize(() => {}, newScenario)

    // Clear selection if removed
    if (toRemove.has(selectedEntityId ?? '')) setSelectedEntityId(null)
  }, [mutateAndStabilize, selectedEntityId])

  // === Category Definition CRUD ===

  /** Add a category definition to an entity + initialize its world state value */
  const addCategoryDef = useCallback((entityId: string, category: Omit<Category, 'id'> & { id?: string }): string => {
    if (!sessionRef.current) return ''
    const id = category.id ?? genId('cat')
    const newCat: Category = { ...category, id } as Category

    const newScenario = patchEntity(sessionRef.current.scenario, entityId, (e) => ({ ...e, categories: [...e.categories, newCat] }))

    mutateAndStabilize((api) => {
      const es = api.worldState.entityStates[entityId]
      if (es) {
        const newValues = { ...es.categoryValues } as Record<string, string | string[]>
        newValues[id] = newCat.exclusive ? (newCat.options[0] ?? '') : []
        api.initEntity(entityId, es.parentId, newValues)
      }
    }, newScenario)
    return id
  }, [mutateAndStabilize])

  /** Update a category definition (name, exclusive, options, descriptions) */
  const updateCategoryDef = useCallback((entityId: string, categoryId: string, patch: Partial<Pick<Category, 'name' | 'exclusive' | 'options' | 'descriptions'>>) => {
    if (!sessionRef.current) return

    const newScenario = patchEntity(sessionRef.current.scenario, entityId, (e) => ({
      ...e,
      categories: e.categories.map((c) => (c.id === categoryId ? { ...c, ...patch } : c)),
    }))

    // If options changed, the current value might be invalid → re-initialize
    mutateAndStabilize((api) => {
      if (patch.options || patch.exclusive !== undefined) {
        const es = api.worldState.entityStates[entityId]
        if (es) {
          const updatedCat = newScenario.entities.find((e) => e.id === entityId)?.categories.find((c) => c.id === categoryId)
          if (updatedCat) {
            const newValues = { ...es.categoryValues } as Record<string, string | string[]>
            const currentVal = newValues[categoryId]
            if (updatedCat.exclusive) {
              // If current value not in options, reset to first
              if (!updatedCat.options.includes(currentVal as string)) {
                newValues[categoryId] = updatedCat.options[0] ?? ''
              }
            } else {
              // Filter out values no longer in options
              const arr = Array.isArray(currentVal) ? currentVal : []
              newValues[categoryId] = arr.filter((v) => updatedCat.options.includes(v))
            }
            api.initEntity(entityId, es.parentId, newValues)
          }
        }
      }
    }, newScenario)
  }, [mutateAndStabilize])

  /** Remove a category definition from an entity */
  const removeCategoryDef = useCallback((entityId: string, categoryId: string) => {
    if (!sessionRef.current) return

    const newScenario = patchEntity(sessionRef.current.scenario, entityId, (e) => ({
      ...e,
      categories: e.categories.filter((c) => c.id !== categoryId),
    }))

    mutateAndStabilize((api) => {
      const es = api.worldState.entityStates[entityId]
      if (es) {
        const newValues = { ...es.categoryValues } as Record<string, string | string[]>
        delete newValues[categoryId]
        api.initEntity(entityId, es.parentId, newValues)
      }
    }, newScenario)
  }, [mutateAndStabilize])

  // === Action/Trigger Update/Delete ===

  /** Update an action definition (schema-only — 表示条件や効果の変更は次の実行時に反映される) */
  const updateAction = useCallback((entityId: string, actionId: string, patch: Partial<Omit<Action, 'id' | 'entityId'>>) => {
    mutateScenario((scenario) => patchEntity(scenario, entityId, (e) => ({
      ...e,
      actions: e.actions.map((a) => (a.id === actionId ? { ...a, ...patch } : a)),
    })))
  }, [mutateScenario])

  /** Update a trigger definition — 新しい条件が現状態で即発火しうるので stabilize 必須 */
  const updateTrigger = useCallback((entityId: string, triggerId: string, patch: Partial<Omit<Trigger, 'id' | 'entityId'>>) => {
    if (!sessionRef.current) return
    const newScenario = patchEntity(sessionRef.current.scenario, entityId, (e) => ({
      ...e,
      triggers: e.triggers.map((t) => (t.id === triggerId ? { ...t, ...patch } : t)),
    }))
    mutateAndStabilize(() => {}, newScenario)
  }, [mutateAndStabilize])

  const removeAction = useCallback((entityId: string, actionId: string) => {
    mutateScenario((scenario) => patchEntity(scenario, entityId, (e) => ({
      ...e,
      actions: e.actions.filter((a) => a.id !== actionId),
    })))
  }, [mutateScenario])

  const removeTrigger = useCallback((entityId: string, triggerId: string) => {
    if (!sessionRef.current) return
    const newScenario = patchEntity(sessionRef.current.scenario, entityId, (e) => ({
      ...e,
      triggers: e.triggers.filter((t) => t.id !== triggerId),
    }))
    mutateAndStabilize(() => {}, newScenario)
  }, [mutateAndStabilize])

  // === Scenario Create/Export ===

  const createScenario = useCallback((title: string) => {
    const scenario: Scenario = {
      id: genId('scenario'),
      title,
      author: '',
      description: '',
      entities: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    loadScenario(scenario)
  }, [loadScenario])

  const exportScenario = useCallback((): string | null => {
    if (!sessionRef.current) return null
    return JSON.stringify(sessionRef.current.scenario, null, 2)
  }, [])

  /** セッション全体（scenario + worldState）をエクスポート。localStorage 保存と同じシリアライザ */
  const exportSession = useCallback((): string | null => {
    if (!sessionRef.current) return null
    return JSON.stringify(serializeSession(sessionRef.current), null, 2)
  }, [])

  // === Undo (スタックから復元。commitMutationもlifecycleResetも通さない) ===

  const undo = useCallback(() => {
    const stack = undoStackRef.current
    const prev = stack.pop()
    if (!prev) return
    setCanUndo(stack.length > 0)
    sessionRef.current = prev
    setSession(prev)
    saveSession(prev)
  }, [])

  // === Derived helpers ===

  const getPending = useCallback(() => {
    if (!sessionRef.current) return []
    return getPendingTriggers(sessionRef.current.worldState, sessionRef.current.scenario)
  }, [])

  return {
    session,
    selectedEntityId,
    canUndo,
    undo,
    // Scenario lifecycle
    createScenario,
    loadScenario,
    importSession,
    exportScenario,
    exportSession,
    resetWorld,
    clearSession,
    // UI state
    selectEntity,
    // World state changes
    doAction,
    setCategoryValue,
    applyAdHoc,
    shareKnowledge,
    fulfillPendingClause,
    // Party operations
    setActiveParty,
    moveParty,
    splitParty,
    mergeParties,
    addToParty,
    removeFromParty,
    // Schema editing
    addEntity,
    updateEntity,
    removeEntity,
    addCategoryDef,
    updateCategoryDef,
    removeCategoryDef,
    addAction,
    updateAction,
    removeAction,
    addTrigger,
    updateTrigger,
    removeTrigger,
    // Derived
    getPending,
  }
}
