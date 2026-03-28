<script setup lang="ts">
import { computed } from 'vue'
import { useScenarioStore } from '../store/scenario'
import type { NPC } from '../types/scenario'

const store = useScenarioStore()

const npc = computed(() =>
  store.scenario.npcs.find((n) => n.id === store.selectedElement?.id)
)

const defaultStats = (): NonNullable<NPC['stats']> => ({
  str: 50, con: 50, siz: 50, dex: 50, app: 50,
  int: 50, pow: 50, edu: 50, hp: 10, mp: 10, san: 50,
})

function update(changes: Partial<NPC>) {
  if (!npc.value) return
  store.updateNpc({ ...npc.value, ...changes })
}

function handleDelete() {
  if (!npc.value) return
  if (confirm(`「${npc.value.name}」を削除しますか？`)) {
    store.deleteNpc(npc.value.id)
  }
}

const statKeys = ['str', 'con', 'siz', 'dex', 'app', 'int', 'pow', 'edu', 'hp', 'mp', 'san'] as const
</script>

<template>
  <div v-if="!npc" class="editor-panel empty">NPCを選択してください</div>
  <div v-else class="editor-panel">
    <div class="editor-header">
      <h2>NPC編集</h2>
      <button class="delete-btn" @click="handleDelete">削除</button>
    </div>

    <div class="form-grid">
      <label>
        名前
        <input :value="npc.name" @input="update({ name: ($event.target as HTMLInputElement).value })" />
      </label>
      <label>
        年齢
        <input type="number" :value="npc.age ?? ''" @input="update({ age: ($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : undefined })" />
      </label>
      <label>
        職業
        <input :value="npc.occupation ?? ''" @input="update({ occupation: ($event.target as HTMLInputElement).value })" />
      </label>
    </div>

    <label class="form-full">
      説明
      <textarea rows="3" :value="npc.description" @input="update({ description: ($event.target as HTMLTextAreaElement).value })" />
    </label>

    <div class="stats-section">
      <h3>
        能力値
        <button v-if="!npc.stats" class="small-btn" @click="update({ stats: defaultStats() })">
          能力値を追加
        </button>
      </h3>
      <div v-if="npc.stats" class="stats-grid">
        <label v-for="key in statKeys" :key="key">
          {{ key.toUpperCase() }}
          <input
            type="number"
            :value="npc.stats[key]"
            @input="update({ stats: { ...npc.stats!, [key]: Number(($event.target as HTMLInputElement).value) } })"
          />
        </label>
      </div>
    </div>

    <label class="form-full">
      メモ
      <textarea rows="3" :value="npc.notes" @input="update({ notes: ($event.target as HTMLTextAreaElement).value })" />
    </label>
  </div>
</template>
