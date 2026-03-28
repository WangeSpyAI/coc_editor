<script setup lang="ts">
import { computed } from 'vue'
import { useScenarioStore } from '../store/scenario'
import type { Scene } from '../types/scenario'

const store = useScenarioStore()

const scene = computed(() =>
  store.scenario.scenes.find((s) => s.id === store.selectedElement?.id)
)

function update(changes: Partial<Scene>) {
  if (!scene.value) return
  store.updateScene({ ...scene.value, ...changes })
}

function handleDelete() {
  if (!scene.value) return
  if (confirm(`「${scene.value.name}」を削除しますか？`)) {
    store.deleteScene(scene.value.id)
  }
}

function addRelation(field: 'locationIds' | 'eventIds' | 'npcIds' | 'clueIds', e: globalThis.Event) {
  const select = e.target as HTMLSelectElement
  if (select.value && scene.value && !scene.value[field].includes(select.value)) {
    update({ [field]: [...scene.value[field], select.value] })
  }
  select.value = ''
}

function removeRelation(field: 'locationIds' | 'eventIds' | 'npcIds' | 'clueIds', id: string) {
  if (!scene.value) return
  update({ [field]: scene.value[field].filter((i) => i !== id) })
}
</script>

<template>
  <div v-if="!scene" class="editor-panel empty">シーンを選択してください</div>
  <div v-else class="editor-panel">
    <div class="editor-header">
      <h2>シーン編集</h2>
      <button class="delete-btn" @click="handleDelete">削除</button>
    </div>

    <div class="form-grid">
      <label>
        名前
        <input :value="scene.name" @input="update({ name: ($event.target as HTMLInputElement).value })" />
      </label>
      <label>
        順序
        <input type="number" :value="scene.order" @input="update({ order: Number(($event.target as HTMLInputElement).value) })" />
      </label>
    </div>

    <label class="form-full">
      説明
      <textarea rows="4" :value="scene.description" @input="update({ description: ($event.target as HTMLTextAreaElement).value })" />
    </label>

    <!-- 場所 -->
    <div class="related-section">
      <h3>場所</h3>
      <div class="chip-list">
        <span v-for="id in scene.locationIds" :key="id" class="chip">
          {{ store.scenario.locations.find((l) => l.id === id)?.name }}
          <button @click="removeRelation('locationIds', id)">×</button>
        </span>
      </div>
      <select value="" @change="addRelation('locationIds', $event)">
        <option value="">場所を追加...</option>
        <option
          v-for="l in store.scenario.locations.filter((l) => !scene!.locationIds.includes(l.id))"
          :key="l.id"
          :value="l.id"
        >
          {{ l.name }}
        </option>
      </select>
    </div>

    <!-- NPC -->
    <div class="related-section">
      <h3>NPC</h3>
      <div class="chip-list">
        <span v-for="id in scene.npcIds" :key="id" class="chip">
          {{ store.scenario.npcs.find((n) => n.id === id)?.name }}
          <button @click="removeRelation('npcIds', id)">×</button>
        </span>
      </div>
      <select value="" @change="addRelation('npcIds', $event)">
        <option value="">NPCを追加...</option>
        <option
          v-for="n in store.scenario.npcs.filter((n) => !scene!.npcIds.includes(n.id))"
          :key="n.id"
          :value="n.id"
        >
          {{ n.name }}
        </option>
      </select>
    </div>

    <!-- イベント -->
    <div class="related-section">
      <h3>イベント</h3>
      <div class="chip-list">
        <span v-for="id in scene.eventIds" :key="id" class="chip">
          {{ store.scenario.events.find((e) => e.id === id)?.name }}
          <button @click="removeRelation('eventIds', id)">×</button>
        </span>
      </div>
      <select value="" @change="addRelation('eventIds', $event)">
        <option value="">イベントを追加...</option>
        <option
          v-for="evt in store.scenario.events.filter((e) => !scene!.eventIds.includes(e.id))"
          :key="evt.id"
          :value="evt.id"
        >
          {{ evt.name }}
        </option>
      </select>
    </div>

    <!-- 手がかり -->
    <div class="related-section">
      <h3>手がかり</h3>
      <div class="chip-list">
        <span v-for="id in scene.clueIds" :key="id" class="chip">
          {{ store.scenario.clues.find((c) => c.id === id)?.name }}
          <button @click="removeRelation('clueIds', id)">×</button>
        </span>
      </div>
      <select value="" @change="addRelation('clueIds', $event)">
        <option value="">手がかりを追加...</option>
        <option
          v-for="c in store.scenario.clues.filter((c) => !scene!.clueIds.includes(c.id))"
          :key="c.id"
          :value="c.id"
        >
          {{ c.name }}
        </option>
      </select>
    </div>

    <label class="form-full">
      メモ
      <textarea rows="3" :value="scene.notes" @input="update({ notes: ($event.target as HTMLTextAreaElement).value })" />
    </label>
  </div>
</template>
