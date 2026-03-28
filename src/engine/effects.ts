import type { Effect } from '../types/scenario';
import type { WorldState, Fact } from '../types/engine';
import { generateId } from '../utils/id';
import { rollDice } from './dice';

/**
 * Apply a list of effects to the world state, producing a new state and log entries.
 * WorldState is mutated in place for performance.
 */
export function applyEffects(
  effects: Effect[],
  state: WorldState,
  timestamp: string
): Fact[] {
  const newFacts: Fact[] = [];

  for (const effect of effects) {
    const fact = applyEffect(effect, state, timestamp);
    if (fact) {
      newFacts.push(fact);
      state.facts.push(fact);
    }
  }

  return newFacts;
}

function applyEffect(effect: Effect, state: WorldState, timestamp: string): Fact | null {
  switch (effect.type) {
    case 'setFlag':
      state.flags[effect.flag] = effect.value;
      return makeFact(timestamp, 'state_change', `フラグ "${effect.flag}" を ${effect.value} に設定`, []);

    case 'setNpcState': {
      const npc = ensureNpcState(state, effect.npcId);
      npc.custom[effect.field] = effect.value;
      return makeFact(timestamp, 'state_change', `NPC の ${effect.field} を ${effect.value} に変更`, [effect.npcId]);
    }

    case 'addNpcKnowledge': {
      const npc = ensureNpcState(state, effect.npcId);
      if (!npc.knowledge.includes(effect.knowledge)) {
        npc.knowledge.push(effect.knowledge);
      }
      return makeFact(timestamp, 'knowledge_transfer', `NPC が "${effect.knowledge}" を知った`, [effect.npcId]);
    }

    case 'setClueLocation': {
      const clue = ensureClueState(state, effect.clueId);
      clue.locationId = effect.locationId;
      clue.holderId = effect.holderId;
      return makeFact(timestamp, 'state_change', `手がかりの所在が変更された`, [effect.clueId]);
    }

    case 'destroyClue': {
      const clue = ensureClueState(state, effect.clueId);
      clue.destroyed = true;
      return makeFact(timestamp, 'state_change', `手がかりが消失した`, [effect.clueId]);
    }

    case 'setLocationState': {
      const loc = ensureLocationState(state, effect.locationId);
      loc.custom[effect.field] = effect.value;
      return makeFact(timestamp, 'state_change', `場所の ${effect.field} を ${effect.value} に変更`, [effect.locationId]);
    }

    case 'sanCheck':
      return makeFact(timestamp, 'state_change', `SAN チェック (成功: ${effect.successLoss}, 失敗: ${effect.failureLoss})`, []);

    case 'hpChange': {
      const amount = resolveAmount(effect.amount);
      const pc = state.pcs.find((p) => p.id === effect.targetId);
      if (pc) {
        pc.stats.hp = Math.max(0, pc.stats.hp + amount);
      }
      return makeFact(timestamp, 'state_change', `HP が ${amount > 0 ? '+' : ''}${amount} 変化`, [effect.targetId]);
    }

    case 'mpChange': {
      const amount = resolveAmount(effect.amount);
      const pc = state.pcs.find((p) => p.id === effect.targetId);
      if (pc) {
        pc.stats.mp = Math.max(0, pc.stats.mp + amount);
      }
      return makeFact(timestamp, 'state_change', `MP が ${amount > 0 ? '+' : ''}${amount} 変化`, [effect.targetId]);
    }

    case 'addItem': {
      const pc = state.pcs.find((p) => p.id === effect.targetId);
      if (pc) pc.inventory.push(effect.item);
      return makeFact(timestamp, 'state_change', `"${effect.item}" を入手`, [effect.targetId]);
    }

    case 'removeItem': {
      const pc = state.pcs.find((p) => p.id === effect.targetId);
      if (pc) {
        const idx = pc.inventory.indexOf(effect.item);
        if (idx !== -1) pc.inventory.splice(idx, 1);
      }
      return makeFact(timestamp, 'state_change', `"${effect.item}" を失った`, [effect.targetId]);
    }

    case 'showMessage':
      return makeFact(timestamp, 'keeper_note', effect.message, []);

    case 'triggerEvent': {
      const evt = ensureEventState(state, effect.eventId);
      evt.occurred = true;
      evt.occurredCount++;
      return makeFact(timestamp, 'state_change', `イベントが発火した`, [effect.eventId]);
    }
  }
}

function resolveAmount(amount: string): number {
  if (/^[+-]?\d+$/.test(amount)) return parseInt(amount);
  const sign = amount.startsWith('-') ? -1 : 1;
  const expr = amount.replace(/^[+-]/, '');
  return sign * rollDice(expr).total;
}

function makeFact(timestamp: string, factType: Fact['factType'], description: string, relatedEntityIds: string[]): Fact {
  return {
    id: generateId(),
    timestamp,
    recordedAt: new Date().toISOString(),
    factType,
    description,
    relatedEntityIds,
  };
}

function ensureNpcState(state: WorldState, npcId: string) {
  if (!state.npcStates[npcId]) {
    state.npcStates[npcId] = { alive: true, knowledge: [], custom: {} };
  }
  return state.npcStates[npcId];
}

function ensureClueState(state: WorldState, clueId: string) {
  if (!state.clueStates[clueId]) {
    state.clueStates[clueId] = { discovered: false, destroyed: false };
  }
  return state.clueStates[clueId];
}

function ensureLocationState(state: WorldState, locationId: string) {
  if (!state.locationStates[locationId]) {
    state.locationStates[locationId] = { visited: false, custom: {} };
  }
  return state.locationStates[locationId];
}

function ensureEventState(state: WorldState, eventId: string) {
  if (!state.eventStates[eventId]) {
    state.eventStates[eventId] = { occurred: false, occurredCount: 0 };
  }
  return state.eventStates[eventId];
}
