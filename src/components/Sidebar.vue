<script setup lang="ts">
import { useScenarioStore } from '../store/scenario'
import { useAppStore } from '../store/app'
import type { ScenarioElementType } from '../types/scenario'

const store = useScenarioStore()
const appStore = useAppStore()

const tabs: { key: ScenarioElementType | 'overview'; label: string }[] = [
  { key: 'overview', label: '概要' },
  { key: 'npc', label: 'NPC' },
  { key: 'location', label: '場所' },
  { key: 'clue', label: '手がかり' },
  { key: 'event', label: 'イベント' },
]

function getItems(tab: ScenarioElementType) {
  switch (tab) {
    case 'npc': return store.scenario.npcs
    case 'location': return store.scenario.locations
    case 'clue': return store.scenario.clues
    case 'event': return store.scenario.events
  }
}

function handleAdd() {
  if (store.activeTab === 'overview') return
  const actionMap: Record<ScenarioElementType, () => void> = {
    npc: () => store.addNpc(),
    location: () => store.addLocation(),
    clue: () => store.addClue(),
    event: () => store.addEvent(),
  }
  actionMap[store.activeTab]()
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <h2>{{ store.scenario.title }}</h2>
      <span v-if="store.isDirty" class="dirty-indicator">未保存</span>
    </div>

    <nav class="sidebar-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        :class="['tab-btn', { active: store.activeTab === tab.key }]"
        @click="store.setActiveTab(tab.key)"
      >
        {{ tab.label }}
      </button>
    </nav>

    <div v-if="store.activeTab !== 'overview'" class="sidebar-list">
      <button class="add-btn" @click="handleAdd">
        + 追加
      </button>
      <ul>
        <li
          v-for="item in getItems(store.activeTab as ScenarioElementType)"
          :key="item.id"
          :class="{ selected: store.selectedElement?.id === item.id }"
          @click="store.selectElement({ type: store.activeTab as ScenarioElementType, id: item.id })"
        >
          {{ item.name }}
        </li>
      </ul>
    </div>

    <div class="sidebar-footer">
      <button class="session-mode-btn" @click="appStore.setMode('session')">
        ▶ セッションモード
      </button>
    </div>
  </aside>
</template>
