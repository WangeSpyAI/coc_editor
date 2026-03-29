<script setup lang="ts">
import { useSessionStore, type SessionTab } from '../../store/session'

const sessionStore = useSessionStore()

const tabs: { key: SessionTab; label: string }[] = [
  { key: 'control', label: 'コントロール' },
  { key: 'operations', label: '操作' },
  { key: 'world', label: '世界状態' },
  { key: 'facts', label: 'ログ' },
  { key: 'timeline', label: 'タイムライン' },
]
</script>

<template>
  <nav class="session-tabs">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      :class="['session-tab-btn', { active: sessionStore.activeTab === tab.key }]"
      :disabled="!sessionStore.session && tab.key !== 'control'"
      @click="sessionStore.setActiveTab(tab.key)"
    >
      {{ tab.label }}
    </button>
  </nav>
</template>
