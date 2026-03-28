<script setup lang="ts">
import { computed } from 'vue'
import { useScenarioStore } from '../store/scenario'
import type { Location } from '../types/scenario'

const store = useScenarioStore()

const location = computed(() =>
  store.scenario.locations.find((l) => l.id === store.selectedElement?.id)
)

function update(changes: Partial<Location>) {
  if (!location.value) return
  store.updateLocation({ ...location.value, ...changes })
}

function handleDelete() {
  if (!location.value) return
  if (confirm(`「${location.value.name}」を削除しますか？`)) {
    store.deleteLocation(location.value.id)
  }
}

function addNpcRelation(e: globalThis.Event) {
  const select = e.target as HTMLSelectElement
  if (select.value && location.value && !location.value.npcIds.includes(select.value)) {
    update({ npcIds: [...location.value.npcIds, select.value] })
  }
  select.value = ''
}

function removeNpcRelation(id: string) {
  if (!location.value) return
  update({ npcIds: location.value.npcIds.filter((i) => i !== id) })
}

function addClueRelation(e: globalThis.Event) {
  const select = e.target as HTMLSelectElement
  if (select.value && location.value && !location.value.clueIds.includes(select.value)) {
    update({ clueIds: [...location.value.clueIds, select.value] })
  }
  select.value = ''
}

function removeClueRelation(id: string) {
  if (!location.value) return
  update({ clueIds: location.value.clueIds.filter((i) => i !== id) })
}
</script>

<template>
  <div v-if="!location" class="editor-panel empty">場所を選択してください</div>
  <div v-else class="editor-panel">
    <div class="editor-header">
      <h2>場所編集</h2>
      <button class="delete-btn" @click="handleDelete">削除</button>
    </div>

    <label class="form-full">
      名前
      <input :value="location.name" @input="update({ name: ($event.target as HTMLInputElement).value })" />
    </label>

    <label class="form-full">
      説明
      <textarea rows="4" :value="location.description" @input="update({ description: ($event.target as HTMLTextAreaElement).value })" />
    </label>

    <div class="related-section">
      <h3>関連NPC</h3>
      <div class="chip-list">
        <span v-for="id in location.npcIds" :key="id" class="chip">
          {{ store.scenario.npcs.find((n) => n.id === id)?.name }}
          <button @click="removeNpcRelation(id)">×</button>
        </span>
      </div>
      <select value="" @change="addNpcRelation">
        <option value="">NPCを追加...</option>
        <option
          v-for="n in store.scenario.npcs.filter((n) => !location!.npcIds.includes(n.id))"
          :key="n.id"
          :value="n.id"
        >
          {{ n.name }}
        </option>
      </select>
    </div>

    <div class="related-section">
      <h3>関連手がかり</h3>
      <div class="chip-list">
        <span v-for="id in location.clueIds" :key="id" class="chip">
          {{ store.scenario.clues.find((c) => c.id === id)?.name }}
          <button @click="removeClueRelation(id)">×</button>
        </span>
      </div>
      <select value="" @change="addClueRelation">
        <option value="">手がかりを追加...</option>
        <option
          v-for="c in store.scenario.clues.filter((c) => !location!.clueIds.includes(c.id))"
          :key="c.id"
          :value="c.id"
        >
          {{ c.name }}
        </option>
      </select>
    </div>

    <label class="form-full">
      メモ
      <textarea rows="3" :value="location.notes" @input="update({ notes: ($event.target as HTMLTextAreaElement).value })" />
    </label>
  </div>
</template>
