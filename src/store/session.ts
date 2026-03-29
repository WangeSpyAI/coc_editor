import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Scenario } from '../types/scenario'
import type { GameSession, PlayerCharacter, TimelineStatus } from '../types/engine'
import type { ScenarioEvent } from '../types/scenario'
import {
  createSession,
  addFact as engineAddFact,
  discoverClue as engineDiscoverClue,
  moveNpc as engineMoveNpc,
  killNpc as engineKillNpc,
  addNpcKnowledge as engineAddNpcKnowledge,
  visitLocation as engineVisitLocation,
  advanceTime as engineAdvanceTime,
  addPlayerCharacter as engineAddPc,
  removePlayerCharacter as engineRemovePc,
  saveSession,
  loadSession,
} from '../engine/session'
import { getTimelineStatus, getAvailableEvents } from '../engine/world'
import type { FactType } from '../types/scenario'

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

  const timelineStatuses = computed<TimelineStatus[]>(() => {
    if (!scenario.value || !worldState.value) return []
    return getTimelineStatus(scenario.value, worldState.value)
  })

  const availableEvents = computed<ScenarioEvent[]>(() => {
    if (!scenario.value || !worldState.value) return []
    return getAvailableEvents(scenario.value, worldState.value)
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

  // --- Actions ---

  function flash(msg: string) {
    lastActionMessage.value = msg
    setTimeout(() => { lastActionMessage.value = '' }, 2000)
  }

  function createNewSession(scenarioData: Scenario, name: string) {
    session.value = createSession(scenarioData, name)
    activeTab.value = 'operations'
    autoSave()
    flash('セッション作成完了')
  }

  function doDiscoverClue(clueId: string, pcId?: string) {
    if (!session.value) return
    engineDiscoverClue(session.value, clueId, pcId)
    triggerReactivity()
    autoSave()
    flash('手がかりを発見')
  }

  function doMoveNpc(npcId: string, locationId: string) {
    if (!session.value) return
    engineMoveNpc(session.value, npcId, locationId)
    triggerReactivity()
    autoSave()
    flash('NPCを移動')
  }

  function doKillNpc(npcId: string) {
    if (!session.value) return
    engineKillNpc(session.value, npcId)
    triggerReactivity()
    autoSave()
    flash('NPCが死亡')
  }

  function doAddNpcKnowledge(npcId: string, knowledge: string) {
    if (!session.value) return
    engineAddNpcKnowledge(session.value, npcId, knowledge)
    triggerReactivity()
    autoSave()
    flash('NPC知識追加')
  }

  function doVisitLocation(locationId: string) {
    if (!session.value) return
    engineVisitLocation(session.value, locationId)
    triggerReactivity()
    autoSave()
    flash('場所を訪問')
  }

  function doFireEvent(eventId: string) {
    if (!session.value || !scenario.value) return
    const evt = scenario.value.events.find((e) => e.id === eventId)
    if (!evt) return
    engineAddFact(session.value, {
      timestamp: session.value.worldState.currentTime,
      factType: 'state_change',
      description: `イベント「${evt.name}」が発生`,
      relatedEntityIds: [eventId],
      effects: evt.effects,
    })
    const evtState = session.value.worldState.eventStates[eventId]
    if (evtState) {
      evtState.occurred = true
      evtState.occurredCount++
    }
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
    if (result.facts.length) msgs.push(`${result.facts.length}件のタイムラインイベント発生`)
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

  function doAddPc(pc: PlayerCharacter) {
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

  // Force Vue reactivity to pick up deep mutations
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
    timelineStatuses,
    availableEvents,
    discoveredClueCount,
    totalClueCount,
    factsByTime,
    createNewSession,
    doDiscoverClue,
    doMoveNpc,
    doKillNpc,
    doAddNpcKnowledge,
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
