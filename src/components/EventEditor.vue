<script setup lang="ts">
import { computed } from 'vue'
import { useScenarioStore } from '../store/scenario'
import type { ScenarioEvent } from '../types/scenario'

const store = useScenarioStore()

const event = computed(() =>
  store.scenario.events.find((e) => e.id === store.selectedElement?.id)
)

function update(changes: Partial<ScenarioEvent>) {
  if (!event.value) return
  store.updateEvent({ ...event.value, ...changes })
}

function handleDelete() {
  if (!event.value) return
  if (confirm(`「${event.value.name}」を削除しますか？`)) {
    store.deleteEvent(event.value.id)
  }
}
</script>

<template>
  <div v-if="!event" class="editor-panel empty">イベントを選択してください</div>
  <div v-else class="editor-panel">
    <div class="editor-header">
      <h2>イベント編集</h2>
      <button class="delete-btn" @click="handleDelete">削除</button>
    </div>

    <label class="form-full">
      名前
      <input :value="event.name" @input="update({ name: ($event.target as HTMLInputElement).value })" />
    </label>

    <label class="form-full">
      トリガー条件
      <textarea rows="2" :value="event.trigger" @input="update({ trigger: ($event.target as HTMLTextAreaElement).value })" />
    </label>

    <label class="form-full">
      説明
      <textarea rows="4" :value="event.description" @input="update({ description: ($event.target as HTMLTextAreaElement).value })" />
    </label>

    <label class="form-full">
      結果・影響
      <textarea rows="3" :value="event.outcome" @input="update({ outcome: ($event.target as HTMLTextAreaElement).value })" />
    </label>

    <label class="form-full">
      メモ
      <textarea rows="3" :value="event.notes" @input="update({ notes: ($event.target as HTMLTextAreaElement).value })" />
    </label>
  </div>
</template>
