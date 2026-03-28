import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  Scenario,
  NPC,
  Location,
  Clue,
  Event,
  Scene,
  ScenarioElementType,
} from '../types/scenario'
import { createEmptyScenario } from '../utils/scenario'
import { generateId } from '../utils/id'

export const useScenarioStore = defineStore('scenario', () => {
  const scenario = ref<Scenario>(createEmptyScenario())
  const selectedElement = ref<{ type: ScenarioElementType; id: string } | null>(null)
  const activeTab = ref<ScenarioElementType | 'overview'>('overview')
  const isDirty = ref(false)

  function touch() {
    isDirty.value = true
    scenario.value.updatedAt = new Date().toISOString()
  }

  function setScenario(s: Scenario) {
    scenario.value = s
    selectedElement.value = null
    activeTab.value = 'overview'
    isDirty.value = false
  }

  function updateOverview(partial: Partial<Scenario>) {
    Object.assign(scenario.value, partial)
    touch()
  }

  function setActiveTab(tab: ScenarioElementType | 'overview') {
    activeTab.value = tab
    selectedElement.value = null
  }

  function selectElement(el: { type: ScenarioElementType; id: string } | null) {
    selectedElement.value = el
  }

  // NPC
  function addNpc() {
    const npc: NPC = { id: generateId(), name: '新規NPC', description: '', notes: '' }
    scenario.value.npcs.push(npc)
    selectedElement.value = { type: 'npc', id: npc.id }
    touch()
  }

  function updateNpc(npc: NPC) {
    const idx = scenario.value.npcs.findIndex((n) => n.id === npc.id)
    if (idx !== -1) {
      scenario.value.npcs[idx] = npc
      touch()
    }
  }

  function deleteNpc(id: string) {
    scenario.value.npcs = scenario.value.npcs.filter((n) => n.id !== id)
    if (selectedElement.value?.id === id) selectedElement.value = null
    touch()
  }

  // Location
  function addLocation() {
    const loc: Location = { id: generateId(), name: '新規場所', description: '', clueIds: [], npcIds: [], notes: '' }
    scenario.value.locations.push(loc)
    selectedElement.value = { type: 'location', id: loc.id }
    touch()
  }

  function updateLocation(location: Location) {
    const idx = scenario.value.locations.findIndex((l) => l.id === location.id)
    if (idx !== -1) {
      scenario.value.locations[idx] = location
      touch()
    }
  }

  function deleteLocation(id: string) {
    scenario.value.locations = scenario.value.locations.filter((l) => l.id !== id)
    if (selectedElement.value?.id === id) selectedElement.value = null
    touch()
  }

  // Clue
  function addClue() {
    const clue: Clue = { id: generateId(), name: '新規手がかり', description: '', isKey: false, notes: '' }
    scenario.value.clues.push(clue)
    selectedElement.value = { type: 'clue', id: clue.id }
    touch()
  }

  function updateClue(clue: Clue) {
    const idx = scenario.value.clues.findIndex((c) => c.id === clue.id)
    if (idx !== -1) {
      scenario.value.clues[idx] = clue
      touch()
    }
  }

  function deleteClue(id: string) {
    scenario.value.clues = scenario.value.clues.filter((c) => c.id !== id)
    if (selectedElement.value?.id === id) selectedElement.value = null
    touch()
  }

  // Event
  function addEvent() {
    const evt: Event = { id: generateId(), name: '新規イベント', trigger: '', description: '', outcome: '', notes: '' }
    scenario.value.events.push(evt)
    selectedElement.value = { type: 'event', id: evt.id }
    touch()
  }

  function updateEvent(evt: Event) {
    const idx = scenario.value.events.findIndex((e) => e.id === evt.id)
    if (idx !== -1) {
      scenario.value.events[idx] = evt
      touch()
    }
  }

  function deleteEvent(id: string) {
    scenario.value.events = scenario.value.events.filter((e) => e.id !== id)
    if (selectedElement.value?.id === id) selectedElement.value = null
    touch()
  }

  // Scene
  function addScene() {
    const scene: Scene = {
      id: generateId(),
      name: '新規シーン',
      order: scenario.value.scenes.length + 1,
      description: '',
      locationIds: [],
      eventIds: [],
      npcIds: [],
      clueIds: [],
      notes: '',
    }
    scenario.value.scenes.push(scene)
    selectedElement.value = { type: 'scene', id: scene.id }
    touch()
  }

  function updateScene(scene: Scene) {
    const idx = scenario.value.scenes.findIndex((s) => s.id === scene.id)
    if (idx !== -1) {
      scenario.value.scenes[idx] = scene
      touch()
    }
  }

  function deleteScene(id: string) {
    scenario.value.scenes = scenario.value.scenes.filter((s) => s.id !== id)
    if (selectedElement.value?.id === id) selectedElement.value = null
    touch()
  }

  function markSaved() {
    isDirty.value = false
  }

  return {
    scenario,
    selectedElement,
    activeTab,
    isDirty,
    setScenario,
    updateOverview,
    setActiveTab,
    selectElement,
    addNpc,
    updateNpc,
    deleteNpc,
    addLocation,
    updateLocation,
    deleteLocation,
    addClue,
    updateClue,
    deleteClue,
    addEvent,
    updateEvent,
    deleteEvent,
    addScene,
    updateScene,
    deleteScene,
    markSaved,
  }
})
