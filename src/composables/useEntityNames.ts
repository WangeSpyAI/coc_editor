import { computed } from 'vue'
import type { GameSession } from '../types/engine'
import type { Ref } from 'vue'

export function useEntityNames(session: Ref<GameSession | null>) {
  const scenario = computed(() => session.value?.scenarioSnapshot ?? null)

  function npcName(id: string): string {
    return scenario.value?.npcs.find((n) => n.id === id)?.name ?? id
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
    if (!scenario.value) return id
    return npcName(id) !== id ? npcName(id)
      : locationName(id) !== id ? locationName(id)
      : clueName(id) !== id ? clueName(id)
      : eventName(id) !== id ? eventName(id)
      : id
  }

  return { npcName, locationName, clueName, eventName, resolveEntityName }
}
