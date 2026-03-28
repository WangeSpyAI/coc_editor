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
      return state.npcStates[condition.npcId]?.alive !== false;

    case 'npcAt':
      return state.npcStates[condition.npcId]?.locationId === condition.locationId;

    case 'npcKnows':
      return state.npcStates[condition.npcId]?.knowledge.includes(condition.knowledge) === true;

    case 'locationVisited':
      return state.locationStates[condition.locationId]?.visited === true;

    case 'eventOccurred':
      return state.eventStates[condition.eventId]?.occurred === true;

    case 'pcHasItem':
      return state.pcs.some((pc) => pc.inventory.includes(condition.item));

    case 'pcStat': {
      const pc = state.pcs.find((p) => p.id === condition.pcId);
      if (!pc) return false;
      const stat = pc.stats[condition.stat as keyof typeof pc.stats];
      if (typeof stat !== 'number') return false;
      switch (condition.operator) {
        case '>=': return stat >= condition.value;
        case '<=': return stat <= condition.value;
        case '==': return stat === condition.value;
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

    case 'and':
      return condition.conditions.every((c) => evaluateCondition(c, state));

    case 'or':
      return condition.conditions.some((c) => evaluateCondition(c, state));

    case 'not':
      return !evaluateCondition(condition.condition, state);
  }
}
