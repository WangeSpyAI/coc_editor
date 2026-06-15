import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  EventId,
  FactId,
  LinkedRef,
  MutationAPI,
  ReadonlyScenarioSession,
  RevelationId,
  ScenarioData,
  ScenarioSession,
  SceneId,
} from '../core/v6/types'
import {
  applyEvent as applyV6Event,
  createFact as createV6Fact,
  mutateAndEvaluate,
  redo as redoV6,
  setFact as setV6Fact,
  undo as undoV6,
  updateSceneText as updateV6SceneText,
  type UpdateSceneTextInput,
} from '../core/v6/engine'
import { reviveSession, serializeSession } from '../core/v6/persistence'
import { buildMiniScenario } from '../core/v6/__tests__/fixtures/mini-scenario'

const STORAGE_KEY = 'v6_session'

function firstSceneId(scenario: ScenarioData): SceneId {
  return (Object.keys(scenario.scenes)[0] ?? 'sc-missing') as SceneId
}

function buildDemoSession(): ScenarioSession {
  return buildMiniScenario().session
}

function loadStoredSession(): ScenarioSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return null
    }
    return reviveSession(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

function saveSession(session: ScenarioSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeSession(session)))
  } catch {
    // localStorage can be unavailable or full; the in-memory session remains usable.
  }
}

export interface V6SessionController {
  session: ReadonlyScenarioSession
  selectedSceneId: SceneId
  canUndo: boolean
  canRedo: boolean
  setSelectedSceneId(sceneId: SceneId): void
  mutate(label: string, mutation: (api: MutationAPI) => void): void
  setFactValue(factId: FactId, value: boolean): void
  addFact(statement: string, initial?: boolean, links?: LinkedRef[]): FactId
  applyEvent(eventId: EventId): void
  setRevelationUnderstood(revelationId: RevelationId, understood: boolean): void
  updateSceneText(sceneId: SceneId, input: UpdateSceneTextInput): void
  addSessionNote(text: string, sceneId?: SceneId): void
  undo(): void
  redo(): void
  loadDemo(): void
  importSessionJson(json: string): void
  exportSessionJson(): string
}

export function useV6Session(): V6SessionController {
  const initialSession = useRef<ScenarioSession | null>(null)
  if (!initialSession.current) {
    initialSession.current = loadStoredSession() ?? buildDemoSession()
  }

  const [session, setSession] = useState<ScenarioSession>(initialSession.current)
  const sessionRef = useRef(session)
  sessionRef.current = session

  const [selectedSceneId, setSelectedSceneIdState] = useState<SceneId>(
    firstSceneId(initialSession.current.scenario),
  )

  const commitSession = useCallback((next: ScenarioSession) => {
    sessionRef.current = next
    setSession(next)
  }, [])

  useEffect(() => {
    saveSession(session)
  }, [session])

  useEffect(() => {
    if (!session.scenario.scenes[selectedSceneId]) {
      setSelectedSceneIdState(firstSceneId(session.scenario))
    }
  }, [selectedSceneId, session])

  const setSelectedSceneId = useCallback((sceneId: SceneId) => {
    if (sessionRef.current.scenario.scenes[sceneId]) {
      setSelectedSceneIdState(sceneId)
    }
  }, [])

  const mutate = useCallback((label: string, mutation: (api: MutationAPI) => void) => {
    const result = mutateAndEvaluate(sessionRef.current, label, mutation)
    commitSession(result.session)
  }, [commitSession])

  const setFactValue = useCallback((factId: FactId, value: boolean) => {
    commitSession(setV6Fact(sessionRef.current, factId, value).session)
  }, [commitSession])

  const addFact = useCallback((statement: string, initial = true, links?: LinkedRef[]) => {
    const result = createV6Fact(sessionRef.current, {
      statement,
      initial,
      links,
    })
    commitSession(result.session)
    return result.factId
  }, [commitSession])

  const applyEvent = useCallback((eventId: EventId) => {
    commitSession(applyV6Event(sessionRef.current, eventId).session)
  }, [commitSession])

  const setRevelationUnderstood = useCallback((revelationId: RevelationId, understood: boolean) => {
    const result = mutateAndEvaluate(
      sessionRef.current,
      `set revelation understood ${revelationId}`,
      (api) => api.setRevelationUnderstood(revelationId, understood),
    )
    commitSession(result.session)
  }, [commitSession])

  const updateSceneText = useCallback((sceneId: SceneId, input: UpdateSceneTextInput) => {
    commitSession(updateV6SceneText(sessionRef.current, sceneId, input).session)
  }, [commitSession])

  const addSessionNote = useCallback((text: string, sceneId?: SceneId) => {
    mutate('add keeper note', (api) => {
      api.addLog({
        type: 'note',
        sceneId,
        text: { visibility: 'keeper', text },
      })
    })
  }, [mutate])

  const undo = useCallback(() => {
    commitSession(undoV6(sessionRef.current).session)
  }, [commitSession])

  const redo = useCallback(() => {
    commitSession(redoV6(sessionRef.current).session)
  }, [commitSession])

  const loadDemo = useCallback(() => {
    const next = buildDemoSession()
    commitSession(next)
    setSelectedSceneIdState(firstSceneId(next.scenario))
  }, [commitSession])

  const importSessionJson = useCallback((json: string) => {
    const next = reviveSession(JSON.parse(json) as unknown)
    commitSession(next)
    setSelectedSceneIdState(firstSceneId(next.scenario))
  }, [commitSession])

  const exportSessionJson = useCallback(() => {
    return JSON.stringify(serializeSession(sessionRef.current), null, 2)
  }, [])

  return {
    session,
    selectedSceneId,
    canUndo: session.history.length > 0,
    canRedo: session.redoHistory.length > 0,
    setSelectedSceneId,
    mutate,
    setFactValue,
    addFact,
    applyEvent,
    setRevelationUnderstood,
    updateSceneText,
    addSessionNote,
    undo,
    redo,
    loadDemo,
    importSessionJson,
    exportSessionJson,
  }
}
