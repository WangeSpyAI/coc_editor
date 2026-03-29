<script setup lang="ts">
import { useSessionStore } from '../../store/session'
import SessionHeader from './SessionHeader.vue'
import SessionTabs from './SessionTabs.vue'
import ControlPanel from './ControlPanel.vue'
import WorldDashboard from './WorldDashboard.vue'
import KPOperationPanel from './KPOperationPanel.vue'
import FactLog from './FactLog.vue'
import TimelineView from './TimelineView.vue'

const sessionStore = useSessionStore()
</script>

<template>
  <div class="session-layout">
    <SessionHeader />
    <SessionTabs />
    <div class="session-content">
      <ControlPanel v-if="sessionStore.activeTab === 'control'" />
      <WorldDashboard v-else-if="sessionStore.activeTab === 'world'" />
      <KPOperationPanel v-else-if="sessionStore.activeTab === 'operations'" />
      <FactLog v-else-if="sessionStore.activeTab === 'facts'" />
      <TimelineView v-else-if="sessionStore.activeTab === 'timeline'" />
    </div>
    <Transition name="fade">
      <div v-if="sessionStore.lastActionMessage" class="toast">
        {{ sessionStore.lastActionMessage }}
      </div>
    </Transition>
  </div>
</template>
