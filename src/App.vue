<script setup lang="ts">
import { useScenarioStore } from './store/scenario'
import Sidebar from './components/Sidebar.vue'
import OverviewEditor from './components/OverviewEditor.vue'
import NPCEditor from './components/NPCEditor.vue'
import LocationEditor from './components/LocationEditor.vue'
import ClueEditor from './components/ClueEditor.vue'
import EventEditor from './components/EventEditor.vue'
import SceneEditor from './components/SceneEditor.vue'
import './App.css'

const store = useScenarioStore()
</script>

<template>
  <div class="app-layout">
    <Sidebar />
    <main class="editor-main">
      <OverviewEditor v-if="store.activeTab === 'overview'" />
      <NPCEditor v-else-if="store.activeTab === 'npc'" />
      <LocationEditor v-else-if="store.activeTab === 'location'" />
      <ClueEditor v-else-if="store.activeTab === 'clue'" />
      <EventEditor v-else-if="store.activeTab === 'event'" />
      <SceneEditor v-else-if="store.activeTab === 'scene'" />
    </main>
  </div>
</template>
