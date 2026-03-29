<script setup lang="ts">
import { computed } from 'vue'
import { useSessionStore } from '../../store/session'
import { useEntityNames } from '../../composables/useEntityNames'
import { storeToRefs } from 'pinia'
import { getNpcsAtLocation, getUndiscoveredCluesAtLocation } from '../../engine/world'

const sessionStore = useSessionStore()
const { session } = storeToRefs(sessionStore)
const { npcName, locationName } = useEntityNames(session)

const npcs = computed(() => {
  if (!sessionStore.scenario || !sessionStore.worldState) return []
  return sessionStore.scenario.npcs.map((npc) => {
    const state = sessionStore.worldState!.npcStates[npc.id]
    return {
      id: npc.id,
      name: npc.name,
      alive: state?.alive ?? true,
      locationId: state?.locationId,
      locationName: state?.locationId ? locationName(state.locationId) : '不明',
      knowledgeCount: state?.knowledge.length ?? 0,
    }
  })
})

const locations = computed(() => {
  if (!sessionStore.scenario || !sessionStore.worldState) return []
  return sessionStore.scenario.locations.map((loc) => {
    const state = sessionStore.worldState!.locationStates[loc.id]
    const npcsHere = getNpcsAtLocation(loc.id, sessionStore.scenario!, sessionStore.worldState!)
    const undiscoveredClues = getUndiscoveredCluesAtLocation(loc.id, sessionStore.worldState!)
    return {
      id: loc.id,
      name: loc.name,
      visited: state?.visited ?? false,
      npcNames: npcsHere.map((id) => npcName(id)),
      undiscoveredClueCount: undiscoveredClues.length,
    }
  })
})

const clues = computed(() => {
  if (!sessionStore.scenario || !sessionStore.worldState) return []
  return sessionStore.scenario.clues.map((clue) => {
    const state = sessionStore.worldState!.clueStates[clue.id]
    return {
      id: clue.id,
      name: clue.name,
      isKey: clue.isKey,
      discovered: state?.discovered ?? false,
      destroyed: state?.destroyed ?? false,
    }
  })
})
</script>

<template>
  <div class="session-panel world-dashboard">
    <div v-if="!sessionStore.session" class="empty-hint">セッションを開始してください</div>
    <template v-else>
      <section class="dashboard-section">
        <h3>NPC ({{ npcs.length }})</h3>
        <div class="card-grid">
          <div v-for="npc in npcs" :key="npc.id" :class="['dash-card', { dead: !npc.alive }]">
            <div class="card-header">
              <strong>{{ npc.name }}</strong>
              <span :class="['badge', npc.alive ? 'badge-ok' : 'badge-dead']">
                {{ npc.alive ? '生存' : '死亡' }}
              </span>
            </div>
            <div class="card-body">
              <div>所在: {{ npc.locationName }}</div>
              <div>知識: {{ npc.knowledgeCount }}件</div>
            </div>
          </div>
        </div>
      </section>

      <section class="dashboard-section">
        <h3>場所 ({{ locations.length }})</h3>
        <div class="card-grid">
          <div v-for="loc in locations" :key="loc.id" :class="['dash-card', { visited: loc.visited }]">
            <div class="card-header">
              <strong>{{ loc.name }}</strong>
              <span :class="['badge', loc.visited ? 'badge-visited' : 'badge-unvisited']">
                {{ loc.visited ? '訪問済' : '未訪問' }}
              </span>
            </div>
            <div class="card-body">
              <div v-if="loc.npcNames.length">NPC: {{ loc.npcNames.join(', ') }}</div>
              <div v-else>NPC: なし</div>
              <div>未発見手がかり: {{ loc.undiscoveredClueCount }}件</div>
            </div>
          </div>
        </div>
      </section>

      <section class="dashboard-section">
        <h3>手がかり ({{ sessionStore.discoveredClueCount }}/{{ sessionStore.totalClueCount }})</h3>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: sessionStore.totalClueCount ? (sessionStore.discoveredClueCount / sessionStore.totalClueCount * 100) + '%' : '0%' }" />
        </div>
        <div class="clue-list">
          <div v-for="clue in clues" :key="clue.id" :class="['clue-item', { discovered: clue.discovered, destroyed: clue.destroyed, key: clue.isKey }]">
            <span class="clue-name">{{ clue.isKey ? '★ ' : '' }}{{ clue.name }}</span>
            <span class="badge" v-if="clue.destroyed">消失</span>
            <span class="badge badge-ok" v-else-if="clue.discovered">発見</span>
            <span class="badge badge-unvisited" v-else>未発見</span>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
