<script setup lang="ts">
import { ref } from 'vue'
import { useSessionStore } from '../../store/session'
import { useScenarioStore } from '../../store/scenario'

const sessionStore = useSessionStore()
const scenarioStore = useScenarioStore()

const newSessionName = ref('セッション 1')
const savedSessions = ref(sessionStore.getSavedSessions())

function handleCreate() {
  if (!newSessionName.value.trim()) return
  sessionStore.createNewSession(scenarioStore.scenario, newSessionName.value.trim())
}

function handleLoad(id: string) {
  sessionStore.loadFromStorage(id)
}

function handleDelete(id: string) {
  if (confirm('このセッションを削除しますか？')) {
    sessionStore.deleteFromStorage(id)
    savedSessions.value = sessionStore.getSavedSessions()
  }
}

function handleExport() {
  const json = sessionStore.exportSession()
  if (!json) return
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `session_${sessionStore.session?.name ?? 'export'}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function handleImport() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        sessionStore.importSession(ev.target?.result as string)
        savedSessions.value = sessionStore.getSavedSessions()
      } catch {
        alert('セッションファイルの読み込みに失敗しました。')
      }
    }
    reader.readAsText(file)
  }
  input.click()
}

function refreshList() {
  savedSessions.value = sessionStore.getSavedSessions()
}
</script>

<template>
  <div class="session-panel control-panel">
    <section class="panel-section">
      <h3>新規セッション</h3>
      <p class="hint">現在のシナリオ「{{ scenarioStore.scenario.title }}」からセッションを作成</p>
      <div class="inline-form">
        <input v-model="newSessionName" placeholder="セッション名" />
        <button class="primary-btn" @click="handleCreate">作成</button>
      </div>
    </section>

    <section class="panel-section">
      <h3>
        保存済みセッション
        <button class="small-btn" @click="refreshList">更新</button>
      </h3>
      <div v-if="savedSessions.length === 0" class="empty-hint">保存済みセッションはありません</div>
      <ul class="saved-list" v-else>
        <li v-for="s in savedSessions" :key="s.id" class="saved-item">
          <div class="saved-info">
            <strong>{{ s.name }}</strong>
            <span class="saved-meta">{{ s.scenarioTitle }} · {{ s.updatedAt.slice(0, 10) }}</span>
          </div>
          <div class="saved-actions">
            <button class="small-btn" @click="handleLoad(s.id)">読込</button>
            <button class="small-btn danger" @click="handleDelete(s.id)">削除</button>
          </div>
        </li>
      </ul>
    </section>

    <section class="panel-section">
      <h3>インポート / エクスポート</h3>
      <div class="inline-form">
        <button @click="handleImport">インポート</button>
        <button @click="handleExport" :disabled="!sessionStore.session">エクスポート</button>
      </div>
    </section>
  </div>
</template>
