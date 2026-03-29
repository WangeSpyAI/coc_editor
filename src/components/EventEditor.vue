<script setup lang="ts">
import { computed } from 'vue'
import { useScenarioStore } from '../store/scenario'
import type { ScenarioEvent, TriggerType } from '../types/scenario'

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

const triggerTypeLabels: Record<TriggerType, string> = {
  manual: '手動（KPが発火）',
  time: '時刻トリガー',
  condition: '条件トリガー',
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
      トリガー種別
      <select :value="event.triggerType" @change="update({ triggerType: ($event.target as HTMLSelectElement).value as TriggerType })">
        <option v-for="(label, key) in triggerTypeLabels" :key="key" :value="key">{{ label }}</option>
      </select>
    </label>

    <label v-if="event.triggerType === 'time'" class="form-full">
      発生時刻
      <input :value="event.triggerTime ?? ''" @input="update({ triggerTime: ($event.target as HTMLInputElement).value || undefined })" placeholder="例: Day1 夜" />
    </label>

    <label class="form-full">
      説明
      <textarea rows="4" :value="event.description" @input="update({ description: ($event.target as HTMLTextAreaElement).value })" />
    </label>

    <label class="form-full">
      メモ
      <textarea rows="3" :value="event.notes" @input="update({ notes: ($event.target as HTMLTextAreaElement).value })" />
    </label>
  </div>
</template>
