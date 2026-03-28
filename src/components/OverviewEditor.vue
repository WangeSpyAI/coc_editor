<script setup lang="ts">
import { useScenarioStore } from '../store/scenario'
import { exportScenario, importScenario } from '../utils/scenario'

const store = useScenarioStore()

function handleChange(field: string, value: string) {
  store.updateOverview({ [field]: value })
}

function handleExport() {
  const json = exportScenario(store.scenario)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${store.scenario.title}.json`
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
        const imported = importScenario(ev.target?.result as string)
        store.setScenario(imported)
      } catch {
        alert('JSONファイルの読み込みに失敗しました。')
      }
    }
    reader.readAsText(file)
  }
  input.click()
}
</script>

<template>
  <div class="editor-panel">
    <div class="editor-header">
      <h2>シナリオ概要</h2>
      <div class="editor-actions">
        <button @click="handleImport">インポート</button>
        <button @click="handleExport">エクスポート</button>
      </div>
    </div>

    <div class="form-grid">
      <label>
        タイトル
        <input :value="store.scenario.title" @input="handleChange('title', ($event.target as HTMLInputElement).value)" />
      </label>
      <label>
        作者
        <input :value="store.scenario.author" @input="handleChange('author', ($event.target as HTMLInputElement).value)" />
      </label>
      <label>
        時代設定
        <input :value="store.scenario.era" @input="handleChange('era', ($event.target as HTMLInputElement).value)" />
      </label>
      <label>
        推奨人数
        <input :value="store.scenario.playerCount" @input="handleChange('playerCount', ($event.target as HTMLInputElement).value)" />
      </label>
      <label>
        プレイ時間目安
        <input :value="store.scenario.estimatedTime" @input="handleChange('estimatedTime', ($event.target as HTMLInputElement).value)" />
      </label>
    </div>

    <label class="form-full">
      あらすじ
      <textarea rows="4" :value="store.scenario.synopsis" @input="handleChange('synopsis', ($event.target as HTMLTextAreaElement).value)" />
    </label>
    <label class="form-full">
      真相
      <textarea rows="4" :value="store.scenario.truth" @input="handleChange('truth', ($event.target as HTMLTextAreaElement).value)" />
    </label>
    <label class="form-full">
      背景情報
      <textarea rows="4" :value="store.scenario.backgroundInfo" @input="handleChange('backgroundInfo', ($event.target as HTMLTextAreaElement).value)" />
    </label>
    <label class="form-full">
      キーパー向けメモ
      <textarea rows="4" :value="store.scenario.keeperNotes" @input="handleChange('keeperNotes', ($event.target as HTMLTextAreaElement).value)" />
    </label>

    <div class="stats-summary">
      <span>NPC: {{ store.scenario.npcs.length }}</span>
      <span>場所: {{ store.scenario.locations.length }}</span>
      <span>手がかり: {{ store.scenario.clues.length }}</span>
      <span>イベント: {{ store.scenario.events.length }}</span>
      <span>タイムライン: {{ store.scenario.timeline.length }}</span>
    </div>
  </div>
</template>
