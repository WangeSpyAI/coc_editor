<script setup lang="ts">
import { useAppStore } from './store/app'
import { useScenarioStore } from './store/scenario'
import Sidebar from './components/Sidebar.vue'
import OverviewEditor from './components/OverviewEditor.vue'
import NPCEditor from './components/NPCEditor.vue'
import LocationEditor from './components/LocationEditor.vue'
import ClueEditor from './components/ClueEditor.vue'
import EventEditor from './components/EventEditor.vue'
import TimelineEditor from './components/TimelineEditor.vue'
import SessionLayout from './components/session/SessionLayout.vue'
import './App.css'

const appStore = useAppStore()
const scenarioStore = useScenarioStore()
</script>

<template>
  <div v-if="appStore.mode === 'editor'" class="app-layout">
    <Sidebar />
    <main class="editor-main">
      <OverviewEditor v-if="scenarioStore.activeTab === 'overview'" />
      <NPCEditor v-else-if="scenarioStore.activeTab === 'npc'" />
      <LocationEditor v-else-if="scenarioStore.activeTab === 'location'" />
      <ClueEditor v-else-if="scenarioStore.activeTab === 'clue'" />
      <EventEditor v-else-if="scenarioStore.activeTab === 'event'" />
      <TimelineEditor v-else-if="scenarioStore.activeTab === 'timeline'" />
    </main>
  </div>
  <SessionLayout v-else />
</template>
