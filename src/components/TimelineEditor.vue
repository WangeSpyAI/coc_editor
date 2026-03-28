<script setup lang="ts">
import { computed } from 'vue'
import { useScenarioStore } from '../store/scenario'
import type { TimelineEntry } from '../types/scenario'

const store = useScenarioStore()

const entry = computed(() =>
  store.scenario.timeline.find((t) => t.id === store.selectedElement?.id)
)

function update(changes: Partial<TimelineEntry>) {
  if (!entry.value) return
  store.updateTimelineEntry({ ...entry.value, ...changes })
}

function handleDelete() {
  if (!entry.value) return
  if (confirm('このタイムラインエントリを削除しますか？')) {
    store.deleteTimelineEntry(entry.value.id)
  }
}
</script>

<template>
  <div v-if="!entry" class="editor-panel empty">タイムラインエントリを選択してください</div>
  <div v-else class="editor-panel">
    <div class="editor-header">
      <h2>タイムライン編集</h2>
      <button class="delete-btn" @click="handleDelete">削除</button>
    </div>

    <label class="form-full">
      時刻
      <input :value="entry.time" @input="update({ time: ($event.target as HTMLInputElement).value })" placeholder="例: Day1 夜" />
    </label>

    <label class="form-full">
      説明
      <textarea rows="4" :value="entry.description" @input="update({ description: ($event.target as HTMLTextAreaElement).value })" />
    </label>

    <label class="form-full">
      メモ
      <textarea rows="3" :value="entry.notes" @input="update({ notes: ($event.target as HTMLTextAreaElement).value })" />
    </label>
  </div>
</template>
