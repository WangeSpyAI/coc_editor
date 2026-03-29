<script setup lang="ts">
import { useSessionStore } from '../../store/session'
import { useAppStore } from '../../store/app'

const sessionStore = useSessionStore()
const appStore = useAppStore()
</script>

<template>
  <header class="session-header">
    <div class="session-header-left">
      <button class="back-btn" @click="appStore.setMode('editor')" title="エディタに戻る">
        ← エディタ
      </button>
      <span v-if="sessionStore.session" class="session-title">
        {{ sessionStore.scenario?.title }} — {{ sessionStore.session.name }}
      </span>
      <span v-else class="session-title">セッション管理</span>
    </div>
    <div v-if="sessionStore.session" class="session-header-right">
      <span class="current-time">
        ⏰ {{ sessionStore.worldState?.currentTime || '(未設定)' }}
      </span>
    </div>
  </header>
</template>
