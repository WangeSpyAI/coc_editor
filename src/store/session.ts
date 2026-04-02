import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Scenario, PCTemplate, FactType } from '../types/scenario'
import type { GameSession, EventStatus } from '../types/engine'
import type { ScenarioEvent } from '../types/scenario'
import {
  createSession,
  addFact as engineAddFact,
  discoverClue as engineDiscoverClue,
  obtainClueFromActor as engineObtainClue,
  moveActor as engineMoveActor,
  killActor as engineKillActor,
  addActorKnowledge as engineAddActorKnowledge,
  visitLocation as engineVisitLocation,
  advanceTime as engineAdvanceTime,
  addPlayerCharacter as engineAddPc,
  removePlayerCharacter as engineRemovePc,
  saveSession,
  loadSession,
} from '../engine/session'
import { getEventStatuses, getAvailableEvents, getManualEvents } from '../engine/world'

export type SessionTab = 'control' | 'world' | 'operations' | 'facts' | 'timeline'

const STORAGE_PREFIX = 'coc_session_'
const STORAGE_INDEX = 'coc_session_index'

export const useSessionStore = defineStore('session', () => {
  const session = ref<GameSession | null>(null)
  const activeTab = ref<SessionTab>('control')
  const lastActionMessage = ref('')

  // --- Computed ---

  const worldState = computed(() => session.value?.worldState ?? null)
  const scenario = computed(() => session.value?.scenarioSnapshot ?? null)

  const eventStatuses = computed<EventStatus[]>(() => {
    if (!scenario.value || !worldState.value) return []
    return getEventStatuses(scenario.value, worldState.value)
  })

  const availableEvents = computed<ScenarioEvent[]>(() => {
    if (!scenario.value || !worldState.value) return []
    return getAvailableEvents(scenario.value, worldState.value)
  })

  const manualEvents = computed<ScenarioEvent[]>(() => {
    if (!scenario.value || !worldState.value) return []
    return getManualEvents(scenario.value, worldState.value)
  })

  const discoveredClueCount = computed(() => {
    if (!worldState.value) return 0
    return Object.values(worldState.value.clueStates).filter((s) => s.discovered).length
  })

  const totalClueCount = computed(() => {
    if (!worldState.value) return 0
    return Object.keys(worldState.value.clueStates).length
  })

  const factsByTime = computed(() => {
    if (!worldState.value) return []
    return [...worldState.value.facts].reverse()
  })

  const pcIds = computed(() => {
    if (!worldState.value) return []
    return Object.entries(worldState.value.actorStates)
      .filter(([, s]) => s.role === 'pc')
      .map(([id]) => id)
  })

  // --- Actions ---

  function flash(msg: string) {
    lastActionMessage.value = msg
    setTimeout(() => { lastActionMessage.value = '' }, 4000)
  }

  function nameOf(id: string): string {
    if (!session.value) return id
    const s = session.value.scenarioSnapshot
    const pc = session.value.pcNames[id]
    if (pc) return pc
    return s.npcs.find((n) => n.id === id)?.name
      ?? s.locations.find((l) => l.id === id)?.name
      ?? s.clues.find((c) => c.id === id)?.name
      ?? s.events.find((e) => e.id === id)?.name
      ?? id
  }

  function createNewSession(scenarioData: Scenario, name: string) {
    session.value = createSession(scenarioData, name)
    activeTab.value = 'operations'
    autoSave()
    flash('セッション作成完了')
  }

  function doDiscoverClue(clueId: string, discoveredBy?: string) {
    if (!session.value) return
    engineDiscoverClue(session.value, clueId, discoveredBy)
    triggerReactivity()
    autoSave()
    flash(`「${nameOf(clueId)}」を発見`)
  }

  function doObtainClueFromActor(clueId: string, fromActorId: string, toActorId?: string) {
    if (!session.value) return
    engineObtainClue(session.value, clueId, fromActorId, toActorId)
    triggerReactivity()
    autoSave()
    flash(`${nameOf(fromActorId)}から「${nameOf(clueId)}」を入手`)
  }

  function doMoveActor(actorId: string, locationId: string) {
    if (!session.value) return
    engineMoveActor(session.value, actorId, locationId)
    triggerReactivity()
    autoSave()
    flash(`${nameOf(actorId)}を${nameOf(locationId)}に移動`)
  }

  function doKillActor(actorId: string) {
    if (!session.value) return
    engineKillActor(session.value, actorId)
    triggerReactivity()
    autoSave()
    flash(`${nameOf(actorId)}が死亡`)
  }

  function doAddActorKnowledge(actorId: string, knowledge: string) {
    if (!session.value) return
    engineAddActorKnowledge(session.value, actorId, knowledge)
    triggerReactivity()
    autoSave()
    flash(`${nameOf(actorId)}が「${knowledge}」を知った`)
  }

  function doVisitLocation(locationId: string, actorId: string) {
    if (!session.value) return
    engineVisitLocation(session.value, locationId, actorId)
    triggerReactivity()
    autoSave()
    flash(`${nameOf(actorId)}が${nameOf(locationId)}を訪問`)
  }

  function doFireEvent(eventId: string) {
    if (!session.value || !scenario.value) return
    const evt = scenario.value.events.find((e) => e.id === eventId)
    if (!evt) return
    // Prevent duplicate firing of non-repeatable events
    const evtState = session.value.worldState.eventStates[eventId]
    if (evtState?.occurred && !evt.isRepeatable) {
      flash(`イベント「${evt.name}」は既に発生済みです`)
      return
    }
    // Mark event as occurred BEFORE applying effects (consistent with advanceTime)
    if (evtState) {
      evtState.occurred = true
      evtState.occurredCount++
    }
    engineAddFact(session.value, {
      timestamp: session.value.worldState.currentTime,
      factType: 'state_change',
      description: `イベント「${evt.name}」が発生`,
      relatedEntityIds: [eventId],
      effects: evt.effects,
    })
    triggerReactivity()
    autoSave()
    flash(`イベント「${evt.name}」発生`)
  }

  function doAdvanceTime(newTime: string) {
    if (!session.value) return
    const result = engineAdvanceTime(session.value, newTime)
    triggerReactivity()
    autoSave()
    const msgs: string[] = [`時間を「${newTime}」に進行`]
    if (result.facts.length) msgs.push(`${result.facts.length}件のイベント発生`)
    if (result.prevented.length) msgs.push(`${result.prevented.length}件が阻止された`)
    flash(msgs.join(' / '))
  }

  function doAddCustomFact(factType: FactType, description: string, entityIds: string[] = []) {
    if (!session.value) return
    engineAddFact(session.value, {
      timestamp: session.value.worldState.currentTime,
      factType,
      description,
      relatedEntityIds: entityIds,
    })
    triggerReactivity()
    autoSave()
    flash('ファクト追加')
  }

  function doSetFlag(flag: string, value: string | number | boolean) {
    if (!session.value) return
    session.value.worldState.flags[flag] = value
    engineAddFact(session.value, {
      timestamp: session.value.worldState.currentTime,
      factType: 'state_change',
      description: `フラグ「${flag}」= ${value}`,
      relatedEntityIds: [],
    })
    triggerReactivity()
    autoSave()
    flash(`フラグ設定: ${flag}`)
  }

  function doAddPc(pc: PCTemplate) {
    if (!session.value) return
    engineAddPc(session.value, pc)
    triggerReactivity()
    autoSave()
  }

  function doRemovePc(pcId: string) {
    if (!session.value) return
    engineRemovePc(session.value, pcId)
    triggerReactivity()
    autoSave()
  }

  function triggerReactivity() {
    session.value = { ...session.value! }
  }

  function setActiveTab(tab: SessionTab) {
    activeTab.value = tab
  }

  // --- Persistence ---

  function autoSave() {
    if (!session.value) return
    const json = saveSession(session.value)
    localStorage.setItem(STORAGE_PREFIX + session.value.id, json)
    updateIndex()
  }

  function updateIndex() {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(STORAGE_PREFIX))
    const entries = keys.map((k) => {
      try {
        const s = JSON.parse(localStorage.getItem(k)!) as GameSession
        return { id: s.id, name: s.name, scenarioTitle: s.scenarioSnapshot.title, updatedAt: s.updatedAt }
      } catch { return null }
    }).filter(Boolean)
    localStorage.setItem(STORAGE_INDEX, JSON.stringify(entries))
  }

  function getSavedSessions(): { id: string; name: string; scenarioTitle: string; updatedAt: string }[] {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_INDEX) ?? '[]')
    } catch { return [] }
  }

  function loadFromStorage(sessionId: string) {
    const json = localStorage.getItem(STORAGE_PREFIX + sessionId)
    if (!json) return
    session.value = loadSession(json)
    activeTab.value = 'operations'
  }

  function deleteFromStorage(sessionId: string) {
    localStorage.removeItem(STORAGE_PREFIX + sessionId)
    updateIndex()
    if (session.value?.id === sessionId) session.value = null
  }

  function exportSession(): string | null {
    if (!session.value) return null
    return saveSession(session.value)
  }

  function importSession(json: string) {
    session.value = loadSession(json)
    autoSave()
    activeTab.value = 'operations'
  }

  return {
    session,
    activeTab,
    lastActionMessage,
    worldState,
    scenario,
    eventStatuses,
    availableEvents,
    manualEvents,
    discoveredClueCount,
    totalClueCount,
    factsByTime,
    pcIds,
    createNewSession,
    doDiscoverClue,
    doObtainClueFromActor,
    doMoveActor,
    doKillActor,
    doAddActorKnowledge,
    doVisitLocation,
    doFireEvent,
    doAdvanceTime,
    doAddCustomFact,
    doSetFlag,
    doAddPc,
    doRemovePc,
    setActiveTab,
    autoSave,
    getSavedSessions,
    loadFromStorage,
    deleteFromStorage,
    exportSession,
    importSession,
  }
})
