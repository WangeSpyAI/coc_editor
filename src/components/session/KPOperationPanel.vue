<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSessionStore } from '../../store/session'
import { useEntityNames } from '../../composables/useEntityNames'
import { storeToRefs } from 'pinia'
import { getCluesHeldBy } from '../../engine/world'

const s = useSessionStore()
const { session } = storeToRefs(s)
const { npcName } = useEntityNames(session)

// --- Time advance ---
const newTime = ref('')
const timeShortcuts = computed(() => {
  if (!s.scenario) return []
  const times = s.scenario.events
    .filter((e) => e.triggerType === 'time' && e.triggerTime)
    .map((e) => e.triggerTime!)
  return [...new Set(times)]
})

function advanceTime() {
  if (!newTime.value.trim()) return
  s.doAdvanceTime(newTime.value.trim())
  newTime.value = ''
}

// --- All actors (PC + NPC) ---
const allActors = computed(() => {
  if (!s.scenario || !s.worldState) return []
  const npcs = s.scenario.npcs.map((n) => ({ id: n.id, name: n.name, role: s.worldState!.actorStates[n.id]?.role ?? n.allegiance }))
  const pcs = Object.entries(s.worldState!.actorStates)
    .filter(([, st]) => st.role === 'pc')
    .map(([id]) => ({ id, name: npcName(id), role: 'pc' as const }))
  return [...pcs, ...npcs]
})

const aliveActors = computed(() =>
  allActors.value.filter((a) => s.worldState!.actorStates[a.id]?.alive !== false)
)

const pcActors = computed(() => aliveActors.value.filter((a) => a.role === 'pc'))

// --- Visit location ---
const visitLocationId = ref('')
const visitActorId = ref('')

function visitLocation() {
  if (!visitLocationId.value || !visitActorId.value) return
  s.doVisitLocation(visitLocationId.value, visitActorId.value)
  visitLocationId.value = ''
}

// --- Discover clue (search at location) ---
const selectedClueId = ref('')
const discoverByActorId = ref('')
const undiscoveredClues = computed(() => {
  if (!s.scenario || !s.worldState) return []
  return s.scenario.clues.filter((c) => {
    const state = s.worldState!.clueStates[c.id]
    return state && !state.discovered && !state.destroyed && c.obtainMethod !== 'conversation'
  })
})

function discoverClue() {
  if (!selectedClueId.value) return
  s.doDiscoverClue(selectedClueId.value, discoverByActorId.value || undefined)
  selectedClueId.value = ''
}

// --- Obtain clue from NPC (conversation) ---
const obtainClueNpcId = ref('')
const obtainClueId = ref('')
const obtainToActorId = ref('')

const conversationClues = computed(() => {
  if (!s.scenario || !s.worldState || !obtainClueNpcId.value) return []
  const held = getCluesHeldBy(obtainClueNpcId.value, s.worldState!)
  return s.scenario.clues.filter((c) => held.includes(c.id) && !s.worldState!.clueStates[c.id]?.discovered)
})

function obtainClue() {
  if (!obtainClueId.value || !obtainClueNpcId.value) return
  s.doObtainClueFromActor(obtainClueId.value, obtainClueNpcId.value, obtainToActorId.value || undefined)
  obtainClueId.value = ''
}

// --- Move actor ---
const moveActorId = ref('')
const moveLocationId = ref('')

function moveActor() {
  if (!moveActorId.value || !moveLocationId.value) return
  s.doMoveActor(moveActorId.value, moveLocationId.value)
  moveActorId.value = ''
  moveLocationId.value = ''
}

// --- Fire event ---
const fireEventId = ref('')

function fireEvent() {
  if (!fireEventId.value) return
  s.doFireEvent(fireEventId.value)
  fireEventId.value = ''
}

// --- Kill actor ---
const killActorId = ref('')

function killActor() {
  if (!killActorId.value) return
  if (confirm('このアクターを死亡させますか？')) {
    s.doKillActor(killActorId.value)
    killActorId.value = ''
  }
}

// --- Actor knowledge ---
const knowledgeActorId = ref('')
const knowledgeText = ref('')

function addKnowledge() {
  if (!knowledgeActorId.value || !knowledgeText.value.trim()) return
  s.doAddActorKnowledge(knowledgeActorId.value, knowledgeText.value.trim())
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

      <!-- Visit location (actor-specific) -->
      <section class="op-row">
        <label class="op-label">場所訪問</label>
        <div class="op-controls">
          <select v-model="visitActorId">
            <option value="">誰が...</option>
            <option v-for="a in pcActors" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
          <select v-model="visitLocationId">
            <option value="">どこへ...</option>
            <option v-for="l in s.scenario?.locations ?? []" :key="l.id" :value="l.id">{{ l.name }}</option>
          </select>
          <button @click="visitLocation" :disabled="!visitLocationId || !visitActorId">訪問</button>
        </div>
      </section>

      <!-- Discover clue (search) -->
      <section class="op-row">
        <label class="op-label">手がかり発見（探索）</label>
        <div class="op-controls">
          <select v-model="selectedClueId">
            <option value="">手がかり...</option>
            <option v-for="c in undiscoveredClues" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
          <select v-model="discoverByActorId">
            <option value="">(発見者)</option>
            <option v-for="a in pcActors" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
          <button @click="discoverClue" :disabled="!selectedClueId">発見</button>
        </div>
      </section>

      <!-- Obtain clue from NPC (conversation) -->
      <section class="op-row">
        <label class="op-label">情報入手（会話）</label>
        <div class="op-controls">
          <select v-model="obtainClueNpcId">
            <option value="">NPCから...</option>
            <option v-for="a in aliveActors.filter(x => x.role !== 'pc')" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
          <select v-model="obtainClueId" :disabled="!obtainClueNpcId">
            <option value="">情報...</option>
            <option v-for="c in conversationClues" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
          <select v-model="obtainToActorId">
            <option value="">(受領者)</option>
            <option v-for="a in pcActors" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
          <button @click="obtainClue" :disabled="!obtainClueId || !obtainClueNpcId">入手</button>
        </div>
      </section>

      <!-- Move actor -->
      <section class="op-row">
        <label class="op-label">アクター移動</label>
        <div class="op-controls">
          <select v-model="moveActorId">
            <option value="">誰を...</option>
            <option v-for="a in aliveActors" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
          <select v-model="moveLocationId">
            <option value="">どこへ...</option>
            <option v-for="l in s.scenario?.locations ?? []" :key="l.id" :value="l.id">{{ l.name }}</option>
          </select>
          <button @click="moveActor" :disabled="!moveActorId || !moveLocationId">移動</button>
        </div>
      </section>

      <!-- Fire event -->
      <section class="op-row">
        <label class="op-label">イベント発火</label>
        <div class="op-controls">
          <select v-model="fireEventId">
            <option value="">選択...</option>
            <optgroup v-if="s.manualEvents.length" label="手動イベント">
              <option v-for="e in s.manualEvents" :key="e.id" :value="e.id">{{ e.name }}</option>
            </optgroup>
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

      <!-- Kill actor -->
      <section class="op-row">
        <label class="op-label">死亡</label>
        <div class="op-controls">
          <select v-model="killActorId">
            <option value="">アクター...</option>
            <option v-for="a in aliveActors" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
          <button class="danger-btn" @click="killActor" :disabled="!killActorId">死亡</button>
        </div>
      </section>

      <!-- Actor knowledge -->
      <section class="op-row">
        <label class="op-label">知識追加</label>
        <div class="op-controls">
          <select v-model="knowledgeActorId">
            <option value="">アクター...</option>
            <option v-for="a in allActors" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
          <input v-model="knowledgeText" placeholder="知識内容" @keyup.enter="addKnowledge" />
          <button @click="addKnowledge" :disabled="!knowledgeActorId || !knowledgeText.trim()">追加</button>
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
