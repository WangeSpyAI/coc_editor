import { computed } from 'vue'
import type { GameSession } from '../types/engine'
import type { Ref } from 'vue'

export function useEntityNames(session: Ref<GameSession | null>) {
  const scenario = computed(() => session.value?.scenarioSnapshot ?? null)
  const pcNames = computed(() => session.value?.pcNames ?? {})

  function actorName(id: string): string {
    // Check PC names first
    if (pcNames.value[id]) return pcNames.value[id]
    // Then check NPCs
    return scenario.value?.npcs.find((n) => n.id === id)?.name ?? id
  }

  /** @deprecated Use actorName instead */
  function npcName(id: string): string {
    return actorName(id)
  }

  function locationName(id: string): string {
    return scenario.value?.locations.find((l) => l.id === id)?.name ?? id
  }

  function clueName(id: string): string {
    return scenario.value?.clues.find((c) => c.id === id)?.name ?? id
  }

  function eventName(id: string): string {
    return scenario.value?.events.find((e) => e.id === id)?.name ?? id
  }

  function resolveEntityName(id: string): string {
    if (!scenario.value) return pcNames.value[id] ?? id
    return actorName(id) !== id ? actorName(id)
      : locationName(id) !== id ? locationName(id)
      : clueName(id) !== id ? clueName(id)
      : eventName(id) !== id ? eventName(id)
      : id
  }

  return { actorName, npcName, locationName, clueName, eventName, resolveEntityName }
}
