import type { Scenario, ScenarioEvent, Condition } from '../types/scenario';
import type { WorldState, ActorRuntimeState, EventStatus } from '../types/engine';
import { evaluateCondition } from './conditions';

/**
 * Initialize a WorldState from a scenario template.
 */
export function initializeWorldState(scenario: Scenario): WorldState {
  const actorStates: Record<string, ActorRuntimeState> = {};

  // Initialize NPC states
  for (const npc of scenario.npcs) {
    actorStates[npc.id] = {
      alive: true,
      locationId: npc.initialLocationId,
      knowledge: [...npc.initialKnowledge],
      inventory: [],
      role: npc.allegiance,
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
    // NPCs present at this location from the start
    const npcsHere = scenario.npcs
      .filter((n) => n.initialLocationId === loc.id)
      .map((n) => n.id);
    locationStates[loc.id] = { visitedBy: npcsHere, custom: {} };
  }

  const eventStates: Record<string, WorldState['eventStates'][string]> = {};
  for (const evt of scenario.events) {
    eventStates[evt.id] = { occurred: false, occurredCount: 0 };
  }

  return {
    currentTime: '',
    facts: [],
    actorStates,
    locationStates,
    clueStates,
    eventStates,
    flags: {},
  };
}

/**
 * Query what an actor (PC or NPC) currently knows.
 */
export function queryActorKnowledge(actorId: string, state: WorldState): string[] {
  return state.actorStates[actorId]?.knowledge ?? [];
}

/**
 * Query which actors know a specific piece of knowledge.
 */
export function queryWhoKnows(knowledge: string, state: WorldState): string[] {
  return Object.entries(state.actorStates)
    .filter(([, s]) => s.knowledge.includes(knowledge))
    .map(([id]) => id);
}

/**
 * Get events whose trigger conditions are currently met.
 * For 'condition' type: evaluates triggerCondition
 * For 'time' type: checks if currentTime matches triggerTime
 * For 'manual': not included (KP fires manually)
 */
export function getAvailableEvents(scenario: Scenario, state: WorldState): ScenarioEvent[] {
  return scenario.events.filter((evt) => {
    const evtState = state.eventStates[evt.id];
    if (evtState?.occurred && !evt.isRepeatable) return false;

    // Check prevention first
    if (evt.preventedBy && evaluateCondition(evt.preventedBy, state)) return false;

    switch (evt.triggerType) {
      case 'condition':
        if (!evt.triggerCondition) return false;
        return evaluateCondition(evt.triggerCondition, state);
      case 'time':
        return evt.triggerTime === state.currentTime;
      case 'manual':
        return false; // manual events don't auto-trigger
    }
  });
}

/**
 * Get all manual events (for KP operation panel).
 */
export function getManualEvents(scenario: Scenario, state: WorldState): ScenarioEvent[] {
  return scenario.events.filter((evt) => {
    if (evt.triggerType !== 'manual') return false;
    const evtState = state.eventStates[evt.id];
    if (evtState?.occurred && !evt.isRepeatable) return false;
    return true;
  });
}

/**
 * Evaluate the status of all events.
 */
export function getEventStatuses(scenario: Scenario, state: WorldState): EventStatus[] {
  return scenario.events.map((evt) => {
    const evtState = state.eventStates[evt.id];

    if (evtState?.occurred) {
      return { eventId: evt.id, status: 'occurred' as const };
    }

    if (evt.preventedBy && evaluateCondition(evt.preventedBy, state)) {
      return {
        eventId: evt.id,
        status: 'prevented' as const,
        preventedReason: describeCondition(evt.preventedBy),
      };
    }

    return { eventId: evt.id, status: 'pending' as const };
  });
}

/**
 * Get actors at a specific location.
 */
export function getActorsAtLocation(
  locationId: string,
  scenario: Scenario,
  state: WorldState,
  currentTime?: string
): string[] {
  // Collect all actor IDs (NPCs from scenario + PCs from runtime)
  const allActorIds = [
    ...scenario.npcs.map((n) => n.id),
    ...Object.entries(state.actorStates)
      .filter(([, s]) => s.role === 'pc')
      .map(([id]) => id),
  ];

  return allActorIds.filter((actorId) => {
    const actorState = state.actorStates[actorId];
    if (actorState && !actorState.alive) return false;

    // Explicit runtime location takes priority
    if (actorState?.locationId) return actorState.locationId === locationId;

    // Fall back to NPC schedule
    const npc = scenario.npcs.find((n) => n.id === actorId);
    if (npc && currentTime && npc.schedule) {
      const entry = npc.schedule.find((s) => s.time === currentTime);
      if (entry) return entry.locationId === locationId;
    }

    // Fall back to initial location
    if (npc) return npc.initialLocationId === locationId;

    return false;
  });
}

/**
 * Get undiscovered clues at a location (physical clues only).
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
 * Get clues held by an actor (NPC or PC).
 */
export function getCluesHeldBy(holderId: string, state: WorldState): string[] {
  return Object.entries(state.clueStates)
    .filter(([, s]) => !s.destroyed && s.holderId === holderId)
    .map(([id]) => id);
}

/**
 * Get all PC actor IDs.
 */
export function getPcIds(state: WorldState): string[] {
  return Object.entries(state.actorStates)
    .filter(([, s]) => s.role === 'pc')
    .map(([id]) => id);
}

/**
 * Get all allied NPC IDs.
 */
export function getAlliedNpcIds(scenario: Scenario, state: WorldState): string[] {
  return scenario.npcs
    .filter((n) => {
      const s = state.actorStates[n.id];
      return s && s.alive && s.role === 'allied';
    })
    .map((n) => n.id);
}

/**
 * Human-readable description of a condition.
 */
function describeCondition(condition: Condition): string {
  switch (condition.type) {
    case 'always': return '常に';
    case 'never': return '不可';
    case 'flag': return `フラグ "${condition.flag}" ${condition.operator ?? '=='} ${condition.value}`;
    case 'clueDiscovered': return `手がかり発見済み`;
    case 'npcAlive': return `NPC 生存`;
    case 'eventOccurred': return `イベント発生済み`;
    case 'timeReached': return `時刻 "${condition.time}" に到達`;
    case 'and': return condition.conditions.map(describeCondition).join(' かつ ');
    case 'or': return condition.conditions.map(describeCondition).join(' または ');
    case 'not': return `${describeCondition(condition.condition)} でない`;
    default: return JSON.stringify(condition);
  }
}
