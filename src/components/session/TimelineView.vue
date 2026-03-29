<script setup lang="ts">
import { computed } from 'vue'
import { useSessionStore } from '../../store/session'

const sessionStore = useSessionStore()

const entries = computed(() => {
  if (!sessionStore.scenario) return []
  const statuses = sessionStore.timelineStatuses
  return sessionStore.scenario.timeline.map((entry) => {
    const status = statuses.find((s) => s.entryId === entry.id)
    return {
      id: entry.id,
      time: entry.time,
      description: entry.description,
      notes: entry.notes,
      status: status?.status ?? 'pending',
      preventedReason: status?.preventedReason,
    }
  })
})

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
      <div v-if="entries.length === 0" class="empty-hint">タイムラインエントリはありません</div>
      <div class="timeline-list">
        <div
          v-for="entry in entries"
          :key="entry.id"
          :class="['timeline-item', `status-${entry.status}`]"
        >
          <div class="timeline-marker" :style="{ backgroundColor: statusColors[entry.status] }" />
          <div class="timeline-content">
            <div class="timeline-header">
              <span class="timeline-time">{{ entry.time || '(時刻未設定)' }}</span>
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
