<script setup lang="ts">
import { ref } from 'vue'
import { useAppStore } from './store/app'
import { useScenarioStore } from './store/scenario'
import Sidebar from './components/Sidebar.vue'
import OverviewEditor from './components/OverviewEditor.vue'
import NPCEditor from './components/NPCEditor.vue'
import LocationEditor from './components/LocationEditor.vue'
import ClueEditor from './components/ClueEditor.vue'
import EventEditor from './components/EventEditor.vue'
import SessionLayout from './components/session/SessionLayout.vue'
import './App.css'

const appStore = useAppStore()
const scenarioStore = useScenarioStore()
const sidebarOpen = ref(false)

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}

function closeSidebar() {
  sidebarOpen.value = false
}
</script>

<template>
  <div v-if="appStore.mode === 'editor'" class="app-layout">
    <button class="mobile-menu-btn" @click="toggleSidebar">&#9776;</button>
    <div :class="['sidebar-overlay', { visible: sidebarOpen }]" @click="closeSidebar" />
    <Sidebar :class="{ open: sidebarOpen }" @click="closeSidebar" />
    <main class="editor-main">
      <OverviewEditor v-if="scenarioStore.activeTab === 'overview'" />
      <NPCEditor v-else-if="scenarioStore.activeTab === 'npc'" />
      <LocationEditor v-else-if="scenarioStore.activeTab === 'location'" />
      <ClueEditor v-else-if="scenarioStore.activeTab === 'clue'" />
      <EventEditor v-else-if="scenarioStore.activeTab === 'event'" />
    </main>
  </div>
  <SessionLayout v-else />
</template>
