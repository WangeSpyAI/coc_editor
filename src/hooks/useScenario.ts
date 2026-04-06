import { useState, useCallback, useRef } from 'react'
import type { Scenario, WorldState, Entity, Action, Effect } from '../core/types'
import {
  initializeWorldState,
  stabilize,
  fireAction,
  applyEffect,
  getAvailableActions,
  getPendingTriggers,
  buildChildrenMap,
  getDescendants,
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
    // Restore Set from array
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

export function useScenario() {
  const [session, setSession] = useState<ScenarioSession | null>(loadSession)
  const sessionRef = useRef(session)
  sessionRef.current = session

  const update = useCallback((next: ScenarioSession) => {
    sessionRef.current = next
    setSession(next)
    saveSession(next)
  }, [])

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

  const doAction = useCallback((actionId: string, actorId?: string) => {
    if (!sessionRef.current) return
    const { worldState, scenario } = sessionRef.current
    // Deep clone worldState for immutability
    const cloned = structuredClone(worldState) as WorldState
    cloned.firedTriggerIds = new Set(worldState.firedTriggerIds)
    const result = fireAction(actionId, cloned, scenario, actorId)
    update({
      ...sessionRef.current,
      worldState: result.worldState,
      lastResult: result,
    })
  }, [update])

  const updateScenario = useCallback((scenario: Scenario) => {
    if (!sessionRef.current) return
    // Re-initialize world state when scenario changes
    const worldState = initializeWorldState(scenario)
    const result = stabilize(worldState, scenario)
    update({
      ...sessionRef.current,
      scenario,
      worldState: result.worldState,
      lastResult: result,
    })
  }, [update])

  const resetWorld = useCallback(() => {
    if (!sessionRef.current) return
    const { scenario } = sessionRef.current
    const worldState = initializeWorldState(scenario)
    const result = stabilize(worldState, scenario)
    update({
      ...sessionRef.current,
      worldState: result.worldState,
      lastResult: result,
    })
  }, [update])

  const clearSession = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setSession(null)
    sessionRef.current = null
  }, [])

  // Derived helpers
  const getEntityChildren = useCallback((entityId: string): Entity[] => {
    if (!sessionRef.current) return []
    const { scenario, worldState } = sessionRef.current
    const childrenMap = buildChildrenMap(worldState.entityStates)
    const childIds = childrenMap[entityId] ?? []
    return childIds
      .map((id) => scenario.entities.find((e) => e.id === id))
      .filter((e): e is Entity => e !== undefined)
  }, [])

  const getEntityActions = useCallback((entityId: string): Action[] => {
    if (!sessionRef.current) return []
    return getAvailableActions(entityId, sessionRef.current.worldState, sessionRef.current.scenario)
  }, [])

  const getDescendantActions = useCallback((entityId: string): { entity: Entity; actions: Action[] }[] => {
    if (!sessionRef.current) return []
    const { scenario, worldState } = sessionRef.current
    const childrenMap = buildChildrenMap(worldState.entityStates)
    const descIds = [entityId, ...getDescendants(entityId, childrenMap)]
    const result: { entity: Entity; actions: Action[] }[] = []
    for (const id of descIds) {
      const entity = scenario.entities.find((e) => e.id === id)
      if (!entity) continue
      const actions = getAvailableActions(id, worldState, scenario)
      if (actions.length > 0) {
        result.push({ entity, actions })
      }
    }
    return result
  }, [])

  const applyAdHoc = useCallback((effects: Effect[], description: string) => {
    if (!sessionRef.current) return
    const { worldState, scenario } = sessionRef.current
    const cloned = structuredClone(worldState) as WorldState
    cloned.firedTriggerIds = new Set(worldState.firedTriggerIds)
    const states = cloned.entityStates
    const childrenMap = buildChildrenMap(states)

    for (const effect of effects) {
      // Ad-hoc effects use '__adhoc__' as selfId since they have no owning entity
      applyEffect(effect, '__adhoc__', states, scenario.entities, childrenMap)
    }

    cloned.log.push({
      timestamp: cloned.step,
      type: 'action',
      sourceEntityId: '__adhoc__',
      description,
    })

    const result = stabilize(cloned, scenario)
    update({
      ...sessionRef.current,
      worldState: result.worldState,
      lastResult: result,
    })
  }, [update])

  const getPending = useCallback(() => {
    if (!sessionRef.current) return []
    return getPendingTriggers(sessionRef.current.worldState, sessionRef.current.scenario)
  }, [])

  return {
    session,
    loadScenario,
    selectEntity,
    doAction,
    updateScenario,
    resetWorld,
    clearSession,
    applyAdHoc,
    getEntityChildren,
    getEntityActions,
    getDescendantActions,
    getPending,
  }
}
