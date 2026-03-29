<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSessionStore } from '../../store/session'
import { useEntityNames } from '../../composables/useEntityNames'
import { storeToRefs } from 'pinia'
import type { FactType } from '../../types/scenario'

const sessionStore = useSessionStore()
const { session } = storeToRefs(sessionStore)
const { resolveEntityName } = useEntityNames(session)

const searchText = ref('')
const filterTypes = ref<Set<FactType>>(new Set())

const factTypeLabels: Record<FactType, string> = {
  pc_action: 'PC行動',
  npc_action: 'NPC行動',
  discovery: '発見',
  state_change: '状態変化',
  knowledge_transfer: '知識伝達',
  timeline_event: 'タイムライン',
  keeper_note: 'KPメモ',
}

const factTypeColors: Record<FactType, string> = {
  pc_action: '#4a9eff',
  npc_action: '#f5a623',
  discovery: '#7ed321',
  state_change: '#bd10e0',
  knowledge_transfer: '#50e3c2',
  timeline_event: '#d0021b',
  keeper_note: '#9b9b9b',
}

function toggleFilter(type: FactType) {
  if (filterTypes.value.has(type)) {
    filterTypes.value.delete(type)
  } else {
    filterTypes.value.add(type)
  }
}

const filteredFacts = computed(() => {
  let facts = sessionStore.factsByTime
  if (filterTypes.value.size > 0) {
    facts = facts.filter((f) => filterTypes.value.has(f.factType))
  }
  if (searchText.value.trim()) {
    const q = searchText.value.toLowerCase()
    facts = facts.filter((f) => f.description.toLowerCase().includes(q))
  }
  return facts
})

const allFactTypes: FactType[] = ['pc_action', 'npc_action', 'discovery', 'state_change', 'knowledge_transfer', 'timeline_event', 'keeper_note']
</script>

<template>
  <div class="session-panel fact-log">
    <div v-if="!sessionStore.session" class="empty-hint">セッションを開始してください</div>
    <template v-else>
      <div class="fact-filters">
        <input v-model="searchText" placeholder="検索..." class="fact-search" />
        <div class="filter-chips">
          <button
            v-for="ft in allFactTypes"
            :key="ft"
            :class="['chip-btn', { active: filterTypes.has(ft) }]"
            :style="filterTypes.has(ft) ? { backgroundColor: factTypeColors[ft], color: '#fff' } : {}"
            @click="toggleFilter(ft)"
          >
            {{ factTypeLabels[ft] }}
          </button>
        </div>
      </div>

      <div class="fact-list">
        <div v-if="filteredFacts.length === 0" class="empty-hint">ファクトはありません</div>
        <div v-for="fact in filteredFacts" :key="fact.id" class="fact-item">
          <div class="fact-header">
            <span class="fact-time">{{ fact.timestamp || '—' }}</span>
            <span class="fact-type-badge" :style="{ backgroundColor: factTypeColors[fact.factType] }">
              {{ factTypeLabels[fact.factType] }}
            </span>
          </div>
          <div class="fact-description">{{ fact.description }}</div>
          <div v-if="fact.relatedEntityIds.length" class="fact-entities">
            <span v-for="eid in fact.relatedEntityIds" :key="eid" class="entity-tag">
              {{ resolveEntityName(eid) }}
            </span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
