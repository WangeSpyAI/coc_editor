<script setup lang="ts">
import { computed } from 'vue'
import { useScenarioStore } from '../store/scenario'
import type { Clue } from '../types/scenario'

const store = useScenarioStore()

const clue = computed(() =>
  store.scenario.clues.find((c) => c.id === store.selectedElement?.id)
)

function update(changes: Partial<Clue>) {
  if (!clue.value) return
  store.updateClue({ ...clue.value, ...changes })
}

function handleDelete() {
  if (!clue.value) return
  if (confirm(`「${clue.value.name}」を削除しますか？`)) {
    store.deleteClue(clue.value.id)
  }
}
</script>

<template>
  <div v-if="!clue" class="editor-panel empty">手がかりを選択してください</div>
  <div v-else class="editor-panel">
    <div class="editor-header">
      <h2>手がかり編集</h2>
      <button class="delete-btn" @click="handleDelete">削除</button>
    </div>

    <div class="form-grid">
      <label>
        名前
        <input :value="clue.name" @input="update({ name: ($event.target as HTMLInputElement).value })" />
      </label>
      <label class="checkbox-label">
        <input type="checkbox" :checked="clue.isKey" @change="update({ isKey: ($event.target as HTMLInputElement).checked })" />
        重要な手がかり
      </label>
    </div>

    <label class="form-full">
      発見場所
      <select
        :value="clue.locationId ?? ''"
        @change="update({ locationId: ($event.target as HTMLSelectElement).value || undefined })"
      >
        <option value="">未設定</option>
        <option v-for="l in store.scenario.locations" :key="l.id" :value="l.id">
          {{ l.name }}
        </option>
      </select>
    </label>

    <label class="form-full">
      説明
      <textarea rows="4" :value="clue.description" @input="update({ description: ($event.target as HTMLTextAreaElement).value })" />
    </label>

    <label class="form-full">
      メモ
      <textarea rows="3" :value="clue.notes" @input="update({ notes: ($event.target as HTMLTextAreaElement).value })" />
    </label>
  </div>
</template>
