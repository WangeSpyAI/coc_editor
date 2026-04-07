import { useState, useCallback, useRef } from 'react'
import type { Scenario, WorldState, ReadonlyWorldState, Entity, Action, Effect, Trigger, LogEntry } from '../core/types'
import {
  initializeWorldState,
  stabilize,
  applyActionEffects as engineApplyActionEffects,
  applyEffect as engineApplyEffect,
  getPendingTriggers,
  buildChildrenMap,
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
  selectedEntityId: string | null
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
  /** 単一の Effect を適用する */
  applyEffect(effect: Effect, selfId: string): boolean
  /** アクションの効果を適用する */
  fireAction(actionId: string, actorId?: string, rollResult?: 'success' | 'failure'): boolean
  /** 新しいエンティティの状態を初期化する */
  initEntity(entityId: string, parentId: string | null, categoryValues: Record<string, string | string[]>): void
  /** ログを追加する */
  log(type: LogEntry['type'], sourceEntityId: string, description: string, actorId?: string): void
}


function loadSession(): ScenarioSession | null {
  try {
    const json = localStorage.getItem(STORAGE_KEY)
    if (!json) return null
    const data = JSON.parse(json)
    data.worldState.firedTriggerIds = new Set(data.worldState.firedTriggerIds)
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

  // Undo 履歴: mutateAndStabilize が自動的にスナップショットを積む。
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
      applyEffect(effect, selfId) {
        return engineApplyEffect(effect, selfId, ws.entityStates, scenario.entities, childrenMap)
      },
      fireAction(actionId, actorId, rollResult) {
        return engineApplyActionEffects(actionId, ws, scenario, actorId, rollResult)
      },
      initEntity(entityId, parentId, categoryValues) {
        ws.entityStates[entityId] = { entityId, parentId, categoryValues }
      },
      log(type, sourceEntityId, description, actorId) {
        ws.log.push({ timestamp: ws.step, type, sourceEntityId, description, actorId })
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
      selectedEntityId: null,
      lastResult: result,
    })
  }, [lifecycleReset])

  const selectEntity = useCallback((id: string | null) => {
    if (!sessionRef.current) return
    // UI選択のみ — undo不要、commitMutationも不要
    const next = { ...sessionRef.current, selectedEntityId: id }
    sessionRef.current = next
    setSession(next)
    saveSession(next)
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
    canUndo,
    undo,
    loadScenario,
    selectEntity,
    doAction,
    setCategoryValue,
    resetWorld,
    clearSession,
    // Live editing
    addEntity,
    addAction,
    addTrigger,
    applyAdHoc,
    // Derived
    getPending,
  }
}
