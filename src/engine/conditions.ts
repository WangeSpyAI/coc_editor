import type { Condition } from '../types/scenario';
import type { WorldState } from '../types/engine';

/**
 * Evaluate a condition against the current world state.
 */
export function evaluateCondition(condition: Condition, state: WorldState): boolean {
  switch (condition.type) {
    case 'always':
      return true;

    case 'never':
      return false;

    case 'flag': {
      const actual = state.flags[condition.flag];
      if (actual === undefined) return false;
      const op = condition.operator ?? '==';
      const expected = condition.value;
      if (expected === undefined) return actual !== undefined;
      switch (op) {
        case '==': return actual === expected;
        case '!=': return actual !== expected;
        case '>=': return (actual as number) >= (expected as number);
        case '<=': return (actual as number) <= (expected as number);
        default: return false;
      }
    }

    case 'clueDiscovered':
      return state.clueStates[condition.clueId]?.discovered === true;

    case 'clueCountGte': {
      const count = Object.values(state.clueStates).filter((c) => c.discovered).length;
      return count >= condition.count;
    }

    case 'npcAlive':
      return state.actorStates[condition.npcId]?.alive !== false;

    case 'npcAt':
      return state.actorStates[condition.npcId]?.locationId === condition.locationId;

    case 'npcKnows':
      return state.actorStates[condition.npcId]?.knowledge.includes(condition.knowledge) === true;

    case 'actorAt':
      return state.actorStates[condition.actorId]?.locationId === condition.locationId;

    case 'actorKnows':
      return state.actorStates[condition.actorId]?.knowledge.includes(condition.knowledge) === true;

    case 'actorHasItem':
      return state.actorStates[condition.actorId]?.inventory.includes(condition.item) === true;

    case 'locationVisited': {
      const loc = state.locationStates[condition.locationId];
      return loc ? loc.visitedBy.length > 0 : false;
    }

    case 'locationVisitedBy': {
      const loc = state.locationStates[condition.locationId];
      return loc ? loc.visitedBy.includes(condition.actorId) : false;
    }

    case 'eventOccurred':
      return state.eventStates[condition.eventId]?.occurred === true;

    case 'pcHasItem':
      return Object.values(state.actorStates)
        .filter((a) => a.role === 'pc')
        .some((a) => a.inventory.includes(condition.item));

    case 'pcStat': {
      const actor = state.actorStates[condition.pcId];
      if (!actor || actor.role !== 'pc') return false;
      const statVal = actor.custom[condition.stat];
      if (typeof statVal !== 'number') return false;
      switch (condition.operator) {
        case '>=': return statVal >= condition.value;
        case '<=': return statVal <= condition.value;
        case '==': return statVal === condition.value;
        default: return false;
      }
    }

    case 'factExists':
      return state.facts.some((f) => {
        if (condition.factType && f.factType !== condition.factType) return false;
        if (condition.descriptionContains && !f.description.includes(condition.descriptionContains)) return false;
        if (condition.entityId && !f.relatedEntityIds.includes(condition.entityId)) return false;
        return true;
      });

    case 'timeReached':
      return state.currentTime === condition.time;

    case 'and':
      return condition.conditions.every((c) => evaluateCondition(c, state));

    case 'or':
      return condition.conditions.some((c) => evaluateCondition(c, state));

    case 'not':
      return !evaluateCondition(condition.condition, state);
  }
}
