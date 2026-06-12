import { useState, useCallback, useRef } from 'react'
import type { Scenario, WorldState, ReadonlyWorldState, ReadonlyParty, Entity, Action, Effect, Trigger, LogEntry, Category } from '../core/types'
import {
  initializeWorldState,
  createDefaultParties,
  stabilize,
  applyActionEffects as engineApplyActionEffects,
  applyEffect as engineApplyEffect,
  getPendingTriggers,
  buildChildrenMap,
  pushLog,
  canEnter,
  composeSceneDescription,
  type StabilizeResult,
} from '../core/engine'

const STORAGE_KEY = 'scenario_editor_data'
const MAX_UNDO_HISTORY = 50

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
    const data = JSON.parse(json)
    data.worldState.firedTriggerIds = new Set(data.worldState.firedTriggerIds)
    // Migrate: 古いデータに connections がない場合は補完
    for (const e of data.scenario.entities) {
      if (!e.connections) e.connections = []
    }
    // Migrate: 古いデータに parties / activePartyId がない場合は
    // initializeWorldState と同じロジック（createDefaultParties）で補完。
    // 位置はシナリオ定義ではなく保存済みの実状態（entityStates）から導出する —
    // プレイ中に move したPCの位置が初期位置に巻き戻らないように。
    if (!data.worldState.parties) {
      const defaults = createDefaultParties(data.scenario, data.worldState.entityStates)
      data.worldState.parties = defaults.parties
      data.worldState.activePartyId = defaults.activePartyId
    }
    return data as ScenarioSession
  } catch {
    return null
  }
}

function saveSession(session: ScenarioSession) {
  try {
    const data = {
      ...session,
      worldState: {
        ...session.worldState,
        firedTriggerIds: [...session.worldState.firedTriggerIds],
      },
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch { /* storage full */ }
}

let idCounter = Date.now()
function genId(prefix: string): string {
  return `${prefix}-${(idCounter++).toString(36)}`
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
    const { scenario } = sessionRef.current

    const entity = scenario.entities.find((e) => e.id === entityId)
    const cat = entity?.categories.find((c) => c.id === categoryId)
    if (!entity || !cat) return

    mutateAndStabilize((api) => {
      // Non-exclusive toggle-off
      if (!cat.exclusive) {
        const val = api.worldState.entityStates[entityId]?.categoryValues[categoryId]
        const arr = Array.isArray(val) ? val : []
        if (arr.includes(value)) {
          api.applyEffect(
            { type: 'removeCategory', target: { type: 'named', entityId }, categoryId, value },
            entityId,
          )
          api.log('system', entityId, `${entity.name}: ${cat.name} − ${value}`)
          return
        }
      }

      api.applyEffect(
        { type: 'setCategory', target: { type: 'named', entityId }, categoryId, value },
        entityId,
      )
      api.log('system', entityId, `${entity.name}: ${cat.name} → ${value}`)
    })
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

  /** アクティブパーティにメンバーを追加する（NPC同行用）。重複追加は無視 */
  const addToParty = useCallback((entityId: string) => {
    if (!sessionRef.current) return
    const { worldState } = sessionRef.current
    const active = worldState.parties.find((p) => p.id === worldState.activePartyId)
    if (!active || active.memberIds.includes(entityId)) return

    mutateAndStabilize((api) => {
      api.setParties(
        api.worldState.parties.map((p) =>
          p.id === active.id ? { ...p, memberIds: [...p.memberIds, entityId] } : p,
        ),
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

    mutateScenario((scenario) => ({
      ...scenario,
      entities: scenario.entities.map((e) =>
        e.id === entityId ? { ...e, actions: [...e.actions, newAction] } : e,
      ),
    }))
    return id
  }, [mutateScenario])

  /** Add a new trigger to an existing entity, then stabilize */
  const addTrigger = useCallback((entityId: string, trigger: Omit<Trigger, 'id' | 'entityId'> & { id?: string }): string => {
    if (!sessionRef.current) return ''
    const { scenario } = sessionRef.current
    const id = trigger.id ?? genId('trigger')
    const newTrigger: Trigger = { ...trigger, id, entityId } as Trigger

    const newScenario: Scenario = {
      ...scenario,
      entities: scenario.entities.map((e) =>
        e.id === entityId ? { ...e, triggers: [...e.triggers, newTrigger] } : e,
      ),
    }

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

  // === Entity Update/Delete ===

  /** Update entity properties (name, description, labels, parentId, connections) */
  const updateEntity = useCallback((entityId: string, patch: Partial<Pick<Entity, 'name' | 'description' | 'labels' | 'parentId' | 'connections'>>) => {
    if (!sessionRef.current) return
    const newScenario: Scenario = {
      ...sessionRef.current.scenario,
      entities: sessionRef.current.scenario.entities.map((e) =>
        e.id === entityId ? { ...e, ...patch } : e,
      ),
    }
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

  /** Remove entity + all children from scenario and world state */
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

    const newScenario: Scenario = {
      ...sessionRef.current.scenario,
      entities: sessionRef.current.scenario.entities.map((e) =>
        e.id === entityId ? { ...e, categories: [...e.categories, newCat] } : e,
      ),
    }

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

  /** Update a category definition (name, exclusive, options) */
  const updateCategoryDef = useCallback((entityId: string, categoryId: string, patch: Partial<Pick<Category, 'name' | 'exclusive' | 'options'>>) => {
    if (!sessionRef.current) return

    const newScenario: Scenario = {
      ...sessionRef.current.scenario,
      entities: sessionRef.current.scenario.entities.map((e) =>
        e.id === entityId
          ? { ...e, categories: e.categories.map((c) => c.id === categoryId ? { ...c, ...patch } : c) }
          : e,
      ),
    }

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

    const newScenario: Scenario = {
      ...sessionRef.current.scenario,
      entities: sessionRef.current.scenario.entities.map((e) =>
        e.id === entityId ? { ...e, categories: e.categories.filter((c) => c.id !== categoryId) } : e,
      ),
    }

    mutateAndStabilize((api) => {
      const es = api.worldState.entityStates[entityId]
      if (es) {
        const newValues = { ...es.categoryValues } as Record<string, string | string[]>
        delete newValues[categoryId]
        api.initEntity(entityId, es.parentId, newValues)
      }
    }, newScenario)
  }, [mutateAndStabilize])

  // === Action/Trigger Delete ===

  const removeAction = useCallback((entityId: string, actionId: string) => {
    mutateScenario((scenario) => ({
      ...scenario,
      entities: scenario.entities.map((e) =>
        e.id === entityId ? { ...e, actions: e.actions.filter((a) => a.id !== actionId) } : e,
      ),
    }))
  }, [mutateScenario])

  const removeTrigger = useCallback((entityId: string, triggerId: string) => {
    if (!sessionRef.current) return
    const newScenario: Scenario = {
      ...sessionRef.current.scenario,
      entities: sessionRef.current.scenario.entities.map((e) =>
        e.id === entityId ? { ...e, triggers: e.triggers.filter((t) => t.id !== triggerId) } : e,
      ),
    }
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
    exportScenario,
    resetWorld,
    clearSession,
    // UI state
    selectEntity,
    // World state changes
    doAction,
    setCategoryValue,
    applyAdHoc,
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
    removeAction,
    addTrigger,
    removeTrigger,
    // Derived
    getPending,
  }
}
