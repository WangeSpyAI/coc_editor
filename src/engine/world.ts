import type { Scenario, ScenarioEvent } from '../types/scenario';
import type { WorldState, NpcRuntimeState, TimelineStatus } from '../types/engine';
import { evaluateCondition } from './conditions';

/**
 * Initialize a WorldState from a scenario template.
 */
export function initializeWorldState(scenario: Scenario): WorldState {
  const npcStates: Record<string, NpcRuntimeState> = {};
  for (const npc of scenario.npcs) {
    npcStates[npc.id] = {
      alive: true,
      locationId: npc.initialLocationId,
      knowledge: [...npc.initialKnowledge],
      custom: {},
    };
  }

  const clueStates: Record<string, WorldState['clueStates'][string]> = {};
  for (const clue of scenario.clues) {
    clueStates[clue.id] = {
      discovered: false,
      destroyed: false,
      locationId: clue.initialLocationId,
      holderId: clue.initialHolderId,
    };
  }

  const locationStates: Record<string, WorldState['locationStates'][string]> = {};
  for (const loc of scenario.locations) {
    locationStates[loc.id] = { visited: false, custom: {} };
  }

  const eventStates: Record<string, WorldState['eventStates'][string]> = {};
  for (const evt of scenario.events) {
    eventStates[evt.id] = { occurred: false, occurredCount: 0 };
  }

  return {
    currentTime: '',
    facts: [],
    npcStates,
    locationStates,
    clueStates,
    eventStates,
    pcs: [],
    flags: {},
  };
}

/**
 * Query what an NPC currently knows.
 */
export function queryNpcKnowledge(npcId: string, state: WorldState): string[] {
  return state.npcStates[npcId]?.knowledge ?? [];
}

/**
 * Query which NPCs know a specific piece of knowledge.
 */
export function queryWhoKnows(knowledge: string, state: WorldState): string[] {
  return Object.entries(state.npcStates)
    .filter(([, s]) => s.knowledge.includes(knowledge))
    .map(([id]) => id);
}

/**
 * Get events whose trigger conditions are currently met and haven't occurred
 * (or are repeatable).
 */
export function getAvailableEvents(scenario: Scenario, state: WorldState): ScenarioEvent[] {
  return scenario.events.filter((evt) => {
    const evtState = state.eventStates[evt.id];
    if (evtState?.occurred && !evt.isRepeatable) return false;
    if (!evt.triggerCondition) return false;
    return evaluateCondition(evt.triggerCondition, state);
  });
}

/**
 * Evaluate the status of all timeline entries.
 */
export function getTimelineStatus(scenario: Scenario, state: WorldState): TimelineStatus[] {
  return scenario.timeline.map((entry) => {
    // Check if already occurred
    const occurred = state.facts.some(
      (f) => f.factType === 'timeline_event' && f.relatedEntityIds.includes(entry.id)
    );
    if (occurred) {
      return { entryId: entry.id, status: 'occurred' as const };
    }

    // Check if prevented
    if (entry.preventedBy && evaluateCondition(entry.preventedBy, state)) {
      return {
        entryId: entry.id,
        status: 'prevented' as const,
        preventedReason: describeCondition(entry.preventedBy),
      };
    }

    return { entryId: entry.id, status: 'pending' as const };
  });
}

/**
 * Get NPCs at a specific location (based on current state or schedule).
 */
export function getNpcsAtLocation(
  locationId: string,
  scenario: Scenario,
  state: WorldState,
  currentTime?: string
): string[] {
  return scenario.npcs
    .filter((npc) => {
      const npcState = state.npcStates[npc.id];
      if (npcState && !npcState.alive) return false;

      // Explicit runtime location takes priority
      if (npcState?.locationId) return npcState.locationId === locationId;

      // Fall back to schedule
      if (currentTime && npc.schedule) {
        const entry = npc.schedule.find((s) => s.time === currentTime);
        if (entry) return entry.locationId === locationId;
      }

      // Fall back to initial location
      return npc.initialLocationId === locationId;
    })
    .map((npc) => npc.id);
}

/**
 * Get undiscovered clues at a location.
 */
export function getUndiscoveredCluesAtLocation(
  locationId: string,
  state: WorldState
): string[] {
  return Object.entries(state.clueStates)
    .filter(([, s]) => !s.discovered && !s.destroyed && s.locationId === locationId)
    .map(([id]) => id);
}

/**
 * Human-readable description of a condition (for UI display).
 */
function describeCondition(condition: import('../types/scenario').Condition): string {
  switch (condition.type) {
    case 'always': return '常に';
    case 'never': return '不可';
    case 'flag': return `フラグ "${condition.flag}" ${condition.operator ?? '=='} ${condition.value}`;
    case 'clueDiscovered': return `手がかり発見済み`;
    case 'npcAlive': return `NPC 生存`;
    case 'eventOccurred': return `イベント発生済み`;
    case 'and': return condition.conditions.map(describeCondition).join(' かつ ');
    case 'or': return condition.conditions.map(describeCondition).join(' または ');
    case 'not': return `${describeCondition(condition.condition)} でない`;
    default: return JSON.stringify(condition);
  }
}
