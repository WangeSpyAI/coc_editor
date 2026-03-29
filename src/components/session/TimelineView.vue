<script setup lang="ts">
import { computed } from 'vue'
import { useSessionStore } from '../../store/session'

const sessionStore = useSessionStore()

const entries = computed(() => {
  if (!sessionStore.scenario) return []
  const statuses = sessionStore.eventStatuses
  return sessionStore.scenario.events.map((evt) => {
    const status = statuses.find((s) => s.eventId === evt.id)
    return {
      id: evt.id,
      name: evt.name,
      triggerType: evt.triggerType,
      triggerTime: evt.triggerTime,
      description: evt.description,
      notes: evt.notes,
      status: status?.status ?? 'pending',
      preventedReason: status?.preventedReason,
    }
  })
})

const triggerTypeLabels: Record<string, string> = {
  time: '時刻',
  condition: '条件',
  manual: '手動',
}

const statusLabels: Record<string, string> = {
  pending: '待機中',
  occurred: '発生済',
  prevented: '阻止済',
}

const statusColors: Record<string, string> = {
  pending: '#9b9b9b',
  occurred: '#7ed321',
  prevented: '#d0021b',
}
</script>

<template>
  <div class="session-panel timeline-view">
    <div v-if="!sessionStore.session" class="empty-hint">セッションを開始してください</div>
    <template v-else>
      <div v-if="entries.length === 0" class="empty-hint">イベントはありません</div>
      <div class="timeline-list">
        <div
          v-for="entry in entries"
          :key="entry.id"
          :class="['timeline-item', `status-${entry.status}`]"
        >
          <div class="timeline-marker" :style="{ backgroundColor: statusColors[entry.status] }" />
          <div class="timeline-content">
            <div class="timeline-header">
              <span class="timeline-time">{{ entry.name }}</span>
              <span class="badge badge-unvisited" style="font-size:9px">{{ triggerTypeLabels[entry.triggerType] }}{{ entry.triggerTime ? ` (${entry.triggerTime})` : '' }}</span>
              <span class="timeline-status-badge" :style="{ backgroundColor: statusColors[entry.status] }">
                {{ statusLabels[entry.status] }}
              </span>
            </div>
            <div class="timeline-desc">{{ entry.description }}</div>
            <div v-if="entry.preventedReason" class="timeline-prevented-reason">
              阻止条件: {{ entry.preventedReason }}
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
