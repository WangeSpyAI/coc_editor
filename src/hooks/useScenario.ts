import { useState, useCallback, useRef } from 'react'
import type { Scenario, WorldState, Entity, Action, Effect, Trigger } from '../core/types'
import {
  initializeWorldState,
  stabilize,
  applyActionEffects,
  applyEffect,
  getPendingTriggers,
  buildChildrenMap,
  type StabilizeResult,
} from '../core/engine'

const STORAGE_KEY = 'scenario_editor_data'

export interface ScenarioSession {
  scenario: Scenario
  worldState: WorldState
  selectedEntityId: string | null
  lastResult: StabilizeResult | null
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

  const update = useCallback((next: ScenarioSession) => {
    sessionRef.current = next
    setSession(next)
    saveSession(next)
  }, [])

  // Clone worldState for mutation (Set復元込み)
  const cloneWorld = useCallback((): WorldState => {
    const ws = sessionRef.current!.worldState
    const cloned = structuredClone(ws) as WorldState
    cloned.firedTriggerIds = new Set(ws.firedTriggerIds)
    return cloned
  }, [])

  /**
   * 状態変更の唯一のパス: clone → mutate → stabilize → update
   * 個別の関数がstabilizeを忘れることを構造的に不可能にする。
   */
  const mutateAndStabilize = useCallback((
    mutate: (worldState: WorldState, scenario: Scenario) => void,
    scenarioOverride?: Scenario,
  ) => {
    if (!sessionRef.current) return
    const scenario = scenarioOverride ?? sessionRef.current.scenario
    const cloned = cloneWorld()
    mutate(cloned, scenario)
    const result = stabilize(cloned, scenario)
    update({
      ...sessionRef.current,
      scenario,
      worldState: result.worldState,
      lastResult: result,
    })
  }, [update, cloneWorld])

  // === Session lifecycle ===

  const loadScenario = useCallback((scenario: Scenario) => {
    const worldState = initializeWorldState(scenario)
    const result = stabilize(worldState, scenario)
    update({
      scenario,
      worldState: result.worldState,
      selectedEntityId: null,
      lastResult: result,
    })
  }, [update])

  const selectEntity = useCallback((id: string | null) => {
    if (!sessionRef.current) return
    update({ ...sessionRef.current, selectedEntityId: id })
  }, [update])

  const resetWorld = useCallback(() => {
    if (!sessionRef.current) return
    const { scenario } = sessionRef.current
    const worldState = initializeWorldState(scenario)
    const result = stabilize(worldState, scenario)
    update({ ...sessionRef.current, worldState: result.worldState, lastResult: result })
  }, [update])

  const clearSession = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setSession(null)
    sessionRef.current = null
  }, [])

  // === Action execution ===

  const doAction = useCallback((actionId: string, actorId?: string, rollResult?: 'success' | 'failure') => {
    mutateAndStabilize((ws, scenario) => {
      applyActionEffects(actionId, ws, scenario, actorId, rollResult)
    })
  }, [mutateAndStabilize])

  /** KP直接操作: カテゴリ値を変更して stabilize（applyEffect経由） */
  const setCategoryValue = useCallback((entityId: string, categoryId: string, value: string) => {
    if (!sessionRef.current) return
    const { scenario } = sessionRef.current

    const entity = scenario.entities.find((e) => e.id === entityId)
    const cat = entity?.categories.find((c) => c.id === categoryId)
    if (!entity || !cat) return

    mutateAndStabilize((ws) => {
      const states = ws.entityStates
      const childrenMap = buildChildrenMap(states)

      // Non-exclusive toggle-off: use removeCategory effect
      if (!cat.exclusive) {
        const arr = Array.isArray(states[entityId]?.categoryValues[categoryId])
          ? states[entityId].categoryValues[categoryId] as string[]
          : []
        if (arr.includes(value)) {
          applyEffect(
            { type: 'removeCategory', target: { type: 'named', entityId }, categoryId, value },
            entityId, states, scenario.entities, childrenMap,
          )
          ws.log.push({
            timestamp: ws.step, type: 'system', sourceEntityId: entityId,
            description: `${entity.name}: ${cat.name} − ${value}`,
          })
          return
        }
      }

      // setCategory effect (exclusive: replace, non-exclusive: add)
      applyEffect(
        { type: 'setCategory', target: { type: 'named', entityId }, categoryId, value },
        entityId, states, scenario.entities, childrenMap,
      )

      ws.log.push({
        timestamp: ws.step, type: 'system', sourceEntityId: entityId,
        description: `${entity.name}: ${cat.name} → ${value}`,
      })
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

    mutateAndStabilize((ws) => {
      const categoryValues: Record<string, string | string[]> = {}
      for (const cat of newEntity.categories) {
        categoryValues[cat.id] = cat.exclusive ? (cat.options[0] ?? '') : []
      }
      ws.entityStates[id] = {
        entityId: id,
        parentId: newEntity.parentId,
        categoryValues,
      }
    }, newScenario)
    return id
  }, [mutateAndStabilize])

  /** Add a new action to an existing entity */
  const addAction = useCallback((entityId: string, action: Omit<Action, 'id' | 'entityId'> & { id?: string }): string => {
    if (!sessionRef.current) return ''
    const { scenario } = sessionRef.current
    const id = action.id ?? genId('action')
    const newAction: Action = { ...action, id, entityId } as Action

    const newScenario: Scenario = {
      ...scenario,
      entities: scenario.entities.map((e) =>
        e.id === entityId ? { ...e, actions: [...e.actions, newAction] } : e,
      ),
    }

    // Actions don't change world state, just scenario
    update({ ...sessionRef.current, scenario: newScenario })
    return id
  }, [update])

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

    // New trigger might fire immediately → stabilize
    mutateAndStabilize(() => {}, newScenario)
    return id
  }, [mutateAndStabilize])

  /** Execute ad-hoc effects (direct state manipulation) + stabilize */
  const applyAdHoc = useCallback((effects: Effect[], description: string) => {
    if (!sessionRef.current) return
    const { scenario } = sessionRef.current

    mutateAndStabilize((ws) => {
      const states = ws.entityStates
      const childrenMap = buildChildrenMap(states)

      for (const effect of effects) {
        applyEffect(effect, '__adhoc__', states, scenario.entities, childrenMap)
      }

      ws.log.push({
        timestamp: ws.step,
        type: 'action',
        sourceEntityId: '__adhoc__',
        description,
      })
    })
  }, [mutateAndStabilize])

  // === Derived helpers ===

  const getPending = useCallback(() => {
    if (!sessionRef.current) return []
    return getPendingTriggers(sessionRef.current.worldState, sessionRef.current.scenario)
  }, [])

  return {
    session,
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
