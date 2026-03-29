<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSessionStore } from '../../store/session'

const s = useSessionStore()

// --- Time advance ---
const newTime = ref('')
const timeShortcuts = computed(() => {
  if (!s.scenario) return []
  const times = s.scenario.timeline.map((t) => t.time).filter(Boolean)
  return [...new Set(times)]
})

function advanceTime() {
  if (!newTime.value.trim()) return
  s.doAdvanceTime(newTime.value.trim())
  newTime.value = ''
}

// --- Discover clue ---
const selectedClueId = ref('')
const undiscoveredClues = computed(() => {
  if (!s.scenario || !s.worldState) return []
  return s.scenario.clues.filter((c) => {
    const state = s.worldState!.clueStates[c.id]
    return state && !state.discovered && !state.destroyed
  })
})

function discoverClue() {
  if (!selectedClueId.value) return
  s.doDiscoverClue(selectedClueId.value)
  selectedClueId.value = ''
}

// --- Move NPC ---
const moveNpcId = ref('')
const moveLocationId = ref('')
const aliveNpcs = computed(() => {
  if (!s.scenario || !s.worldState) return []
  return s.scenario.npcs.filter((n) => s.worldState!.npcStates[n.id]?.alive !== false)
})

function moveNpc() {
  if (!moveNpcId.value || !moveLocationId.value) return
  s.doMoveNpc(moveNpcId.value, moveLocationId.value)
  moveNpcId.value = ''
  moveLocationId.value = ''
}

// --- Visit location ---
const visitLocationId = ref('')

function visitLocation() {
  if (!visitLocationId.value) return
  s.doVisitLocation(visitLocationId.value)
  visitLocationId.value = ''
}

// --- Fire event ---
const fireEventId = ref('')

function fireEvent() {
  if (!fireEventId.value) return
  s.doFireEvent(fireEventId.value)
  fireEventId.value = ''
}

// --- Kill NPC ---
const killNpcId = ref('')

function killNpc() {
  if (!killNpcId.value) return
  if (confirm('このNPCを死亡させますか？')) {
    s.doKillNpc(killNpcId.value)
    killNpcId.value = ''
  }
}

// --- NPC knowledge ---
const knowledgeNpcId = ref('')
const knowledgeText = ref('')

function addKnowledge() {
  if (!knowledgeNpcId.value || !knowledgeText.value.trim()) return
  s.doAddNpcKnowledge(knowledgeNpcId.value, knowledgeText.value.trim())
  knowledgeText.value = ''
}

// --- Custom fact ---
const factType = ref<string>('keeper_note')
const factDescription = ref('')

function addFact() {
  if (!factDescription.value.trim()) return
  s.doAddCustomFact(factType.value as import('../../types/scenario').FactType, factDescription.value.trim())
  factDescription.value = ''
}

// --- Flag ---
const flagKey = ref('')
const flagValue = ref('')

function setFlag() {
  if (!flagKey.value.trim()) return
  const v = flagValue.value
  const parsed = v === 'true' ? true : v === 'false' ? false : isNaN(Number(v)) ? v : Number(v)
  s.doSetFlag(flagKey.value.trim(), parsed)
  flagKey.value = ''
  flagValue.value = ''
}
</script>

<template>
  <div class="session-panel op-panel">
    <div v-if="!s.session" class="empty-hint">セッションを開始してください</div>
    <template v-else>
      <!-- Time advance -->
      <section class="op-row">
        <label class="op-label">時間進行</label>
        <div class="op-controls">
          <input v-model="newTime" placeholder="例: Day1 夜" @keyup.enter="advanceTime" />
          <button class="primary-btn" @click="advanceTime">進行</button>
        </div>
        <div v-if="timeShortcuts.length" class="op-shortcuts">
          <button v-for="t in timeShortcuts" :key="t" class="chip-btn" @click="newTime = t">{{ t }}</button>
        </div>
      </section>

      <!-- Discover clue -->
      <section class="op-row">
        <label class="op-label">手がかり発見</label>
        <div class="op-controls">
          <select v-model="selectedClueId">
            <option value="">選択...</option>
            <option v-for="c in undiscoveredClues" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
          <button @click="discoverClue" :disabled="!selectedClueId">発見</button>
        </div>
      </section>

      <!-- Visit location -->
      <section class="op-row">
        <label class="op-label">場所訪問</label>
        <div class="op-controls">
          <select v-model="visitLocationId">
            <option value="">選択...</option>
            <option v-for="l in s.scenario?.locations ?? []" :key="l.id" :value="l.id">{{ l.name }}</option>
          </select>
          <button @click="visitLocation" :disabled="!visitLocationId">訪問</button>
        </div>
      </section>

      <!-- Move NPC -->
      <section class="op-row">
        <label class="op-label">NPC移動</label>
        <div class="op-controls">
          <select v-model="moveNpcId">
            <option value="">NPC...</option>
            <option v-for="n in aliveNpcs" :key="n.id" :value="n.id">{{ n.name }}</option>
          </select>
          <select v-model="moveLocationId">
            <option value="">場所...</option>
            <option v-for="l in s.scenario?.locations ?? []" :key="l.id" :value="l.id">{{ l.name }}</option>
          </select>
          <button @click="moveNpc" :disabled="!moveNpcId || !moveLocationId">移動</button>
        </div>
      </section>

      <!-- Fire event -->
      <section class="op-row">
        <label class="op-label">イベント発火</label>
        <div class="op-controls">
          <select v-model="fireEventId">
            <option value="">選択...</option>
            <optgroup v-if="s.availableEvents.length" label="条件達成">
              <option v-for="e in s.availableEvents" :key="e.id" :value="e.id">{{ e.name }}</option>
            </optgroup>
            <optgroup label="全イベント">
              <option v-for="e in s.scenario?.events ?? []" :key="e.id" :value="e.id">{{ e.name }}</option>
            </optgroup>
          </select>
          <button @click="fireEvent" :disabled="!fireEventId">発火</button>
        </div>
      </section>

      <!-- Kill NPC -->
      <section class="op-row">
        <label class="op-label">NPC死亡</label>
        <div class="op-controls">
          <select v-model="killNpcId">
            <option value="">NPC...</option>
            <option v-for="n in aliveNpcs" :key="n.id" :value="n.id">{{ n.name }}</option>
          </select>
          <button class="danger-btn" @click="killNpc" :disabled="!killNpcId">死亡</button>
        </div>
      </section>

      <!-- NPC knowledge -->
      <section class="op-row">
        <label class="op-label">NPC知識追加</label>
        <div class="op-controls">
          <select v-model="knowledgeNpcId">
            <option value="">NPC...</option>
            <option v-for="n in s.scenario?.npcs ?? []" :key="n.id" :value="n.id">{{ n.name }}</option>
          </select>
          <input v-model="knowledgeText" placeholder="知識内容" @keyup.enter="addKnowledge" />
          <button @click="addKnowledge" :disabled="!knowledgeNpcId || !knowledgeText.trim()">追加</button>
        </div>
      </section>

      <!-- Custom fact -->
      <section class="op-row">
        <label class="op-label">ファクト追加</label>
        <div class="op-controls">
          <select v-model="factType">
            <option value="keeper_note">KPメモ</option>
            <option value="pc_action">PC行動</option>
            <option value="npc_action">NPC行動</option>
            <option value="state_change">状態変化</option>
          </select>
          <input v-model="factDescription" placeholder="説明" @keyup.enter="addFact" />
          <button @click="addFact" :disabled="!factDescription.trim()">追加</button>
        </div>
      </section>

      <!-- Flag -->
      <section class="op-row">
        <label class="op-label">フラグ設定</label>
        <div class="op-controls">
          <input v-model="flagKey" placeholder="キー" />
          <input v-model="flagValue" placeholder="値" @keyup.enter="setFlag" />
          <button @click="setFlag" :disabled="!flagKey.trim()">設定</button>
        </div>
      </section>
    </template>
  </div>
</template>
