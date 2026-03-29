<script setup lang="ts">
import { computed } from 'vue'
import { useSessionStore } from '../../store/session'
import { useEntityNames } from '../../composables/useEntityNames'
import { storeToRefs } from 'pinia'
import { getActorsAtLocation, getUndiscoveredCluesAtLocation, getCluesHeldBy } from '../../engine/world'

const sessionStore = useSessionStore()
const { session } = storeToRefs(sessionStore)
const { npcName, locationName } = useEntityNames(session)

const actors = computed(() => {
  if (!sessionStore.scenario || !sessionStore.worldState) return []
  // NPCs from scenario
  const npcActors = sessionStore.scenario.npcs.map((npc) => {
    const state = sessionStore.worldState!.actorStates[npc.id]
    const heldClues = getCluesHeldBy(npc.id, sessionStore.worldState!)
    return {
      id: npc.id,
      name: npc.name,
      role: state?.role ?? npc.allegiance,
      alive: state?.alive ?? true,
      locationId: state?.locationId,
      locationName: state?.locationId ? locationName(state.locationId) : '不明',
      knowledgeCount: state?.knowledge.length ?? 0,
      heldClueCount: heldClues.length,
      isPC: false,
    }
  })
  // PCs from runtime
  const pcActors = Object.entries(sessionStore.worldState!.actorStates)
    .filter(([, s]) => s.role === 'pc')
    .map(([id, state]) => ({
      id,
      name: npcName(id), // will fallback to id if not found in scenario
      role: 'pc' as const,
      alive: state.alive,
      locationId: state.locationId,
      locationName: state.locationId ? locationName(state.locationId) : '不明',
      knowledgeCount: state.knowledge.length,
      heldClueCount: getCluesHeldBy(id, sessionStore.worldState!).length,
      isPC: true,
    }))
  return [...pcActors, ...npcActors]
})

const roleLabels: Record<string, string> = {
  pc: 'PC',
  allied: '味方',
  neutral: '中立',
  hostile: '敵対',
}

const locations = computed(() => {
  if (!sessionStore.scenario || !sessionStore.worldState) return []
  return sessionStore.scenario.locations.map((loc) => {
    const state = sessionStore.worldState!.locationStates[loc.id]
    const actorsHere = getActorsAtLocation(loc.id, sessionStore.scenario!, sessionStore.worldState!)
    const undiscoveredClues = getUndiscoveredCluesAtLocation(loc.id, sessionStore.worldState!)
    return {
      id: loc.id,
      name: loc.name,
      visited: state ? state.visitedBy.length > 0 : false,
      visitedByCount: state?.visitedBy.length ?? 0,
      actorNames: actorsHere.map((id) => npcName(id)),
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
      holderId: state?.holderId,
      holderName: state?.holderId ? npcName(state.holderId) : undefined,
      obtainMethod: clue.obtainMethod,
    }
  })
})
</script>

<template>
  <div class="session-panel world-dashboard">
    <div v-if="!sessionStore.session" class="empty-hint">セッションを開始してください</div>
    <template v-else>
      <section class="dashboard-section">
        <h3>アクター ({{ actors.length }})</h3>
        <div class="card-grid">
          <div v-for="actor in actors" :key="actor.id" :class="['dash-card', { dead: !actor.alive }]">
            <div class="card-header">
              <strong>{{ actor.name }}</strong>
              <div style="display:flex;gap:4px">
                <span :class="['badge', actor.role === 'pc' ? 'badge-visited' : actor.role === 'allied' ? 'badge-ok' : 'badge-unvisited']">
                  {{ roleLabels[actor.role] }}
                </span>
                <span v-if="!actor.alive" class="badge badge-dead">死亡</span>
              </div>
            </div>
            <div class="card-body">
              <div>所在: {{ actor.locationName }}</div>
              <div>知識: {{ actor.knowledgeCount }}件</div>
              <div v-if="actor.heldClueCount">所持手がかり: {{ actor.heldClueCount }}件</div>
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
              <div v-if="loc.actorNames.length">在場: {{ loc.actorNames.join(', ') }}</div>
              <div v-else>在場: なし</div>
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
            <span class="clue-name">
              {{ clue.isKey ? '★ ' : '' }}{{ clue.name }}
              <span v-if="clue.holderName" style="font-size:11px;color:var(--text-muted)"> ({{ clue.holderName }}所持)</span>
            </span>
            <span class="badge" v-if="clue.destroyed">消失</span>
            <span class="badge badge-ok" v-else-if="clue.discovered">発見</span>
            <span class="badge badge-unvisited" v-else>{{ clue.obtainMethod === 'conversation' ? '会話' : '未発見' }}</span>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
