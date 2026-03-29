import type { Effect } from '../types/scenario';
import type { WorldState, Fact, ActorRuntimeState } from '../types/engine';
import { generateId } from '../utils/id';
import { rollDice } from './dice';
import { placeActorAt } from './world';

/**
 * Apply a list of effects to the world state.
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
      const actor = ensureActorState(state, effect.npcId);
      // Top-level fields must be set directly, not in custom
      if (effect.field === 'alive' && typeof effect.value === 'boolean') {
        actor.alive = effect.value;
      } else if (effect.field === 'locationId' && typeof effect.value === 'string') {
        placeActorAt(state, effect.npcId, effect.value);
      } else {
        actor.custom[effect.field] = effect.value;
      }
      return makeFact(timestamp, 'state_change', `NPC の ${effect.field} を ${effect.value} に変更`, [effect.npcId]);
    }

    case 'addNpcKnowledge': {
      const actor = ensureActorState(state, effect.npcId);
      if (!actor.knowledge.includes(effect.knowledge)) {
        actor.knowledge.push(effect.knowledge);
      }
      return makeFact(timestamp, 'knowledge_transfer', `NPC が "${effect.knowledge}" を知った`, [effect.npcId]);
    }

    case 'addActorKnowledge': {
      const actor = ensureActorState(state, effect.actorId);
      if (!actor.knowledge.includes(effect.knowledge)) {
        actor.knowledge.push(effect.knowledge);
      }
      return makeFact(timestamp, 'knowledge_transfer', `"${effect.knowledge}" を知った`, [effect.actorId]);
    }

    case 'moveActor': {
      ensureActorState(state, effect.actorId);
      placeActorAt(state, effect.actorId, effect.locationId);
      return makeFact(timestamp, 'state_change', `移動した`, [effect.actorId, effect.locationId]);
    }

    case 'setClueLocation': {
      const clue = ensureClueState(state, effect.clueId);
      clue.locationId = effect.locationId;
      clue.holderId = effect.holderId;
      return makeFact(timestamp, 'state_change', `手がかりの所在が変更された`, [effect.clueId]);
    }

    case 'transferClue': {
      const clue = ensureClueState(state, effect.clueId);
      clue.holderId = effect.toId;
      clue.locationId = undefined;
      clue.discovered = true;
      clue.discoveredBy = effect.toId;
      return makeFact(timestamp, 'state_change', `手がかりが移転された`, [effect.clueId, effect.fromId, effect.toId]);
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
      const actor = state.actorStates[effect.targetId];
      if (actor) {
        const hp = (actor.custom['hp'] as number) ?? 0;
        actor.custom['hp'] = Math.max(0, hp + amount);
      }
      return makeFact(timestamp, 'state_change', `HP が ${amount > 0 ? '+' : ''}${amount} 変化`, [effect.targetId]);
    }

    case 'mpChange': {
      const amount = resolveAmount(effect.amount);
      const actor = state.actorStates[effect.targetId];
      if (actor) {
        const mp = (actor.custom['mp'] as number) ?? 0;
        actor.custom['mp'] = Math.max(0, mp + amount);
      }
      return makeFact(timestamp, 'state_change', `MP が ${amount > 0 ? '+' : ''}${amount} 変化`, [effect.targetId]);
    }

    case 'addItem': {
      const actor = state.actorStates[effect.targetId];
      if (actor) actor.inventory.push(effect.item);
      return makeFact(timestamp, 'state_change', `"${effect.item}" を入手`, [effect.targetId]);
    }

    case 'removeItem': {
      const actor = state.actorStates[effect.targetId];
      if (actor) {
        const idx = actor.inventory.indexOf(effect.item);
        if (idx !== -1) actor.inventory.splice(idx, 1);
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

function ensureActorState(state: WorldState, actorId: string): ActorRuntimeState {
  if (!state.actorStates[actorId]) {
    state.actorStates[actorId] = { alive: true, knowledge: [], inventory: [], role: 'neutral', custom: {} };
  }
  return state.actorStates[actorId];
}

function ensureClueState(state: WorldState, clueId: string) {
  if (!state.clueStates[clueId]) {
    state.clueStates[clueId] = { discovered: false, destroyed: false, locationId: undefined, holderId: undefined };
  }
  return state.clueStates[clueId];
}

function ensureLocationState(state: WorldState, locationId: string) {
  if (!state.locationStates[locationId]) {
    state.locationStates[locationId] = { visitedBy: [], custom: {} };
  }
  return state.locationStates[locationId];
}

function ensureEventState(state: WorldState, eventId: string) {
  if (!state.eventStates[eventId]) {
    state.eventStates[eventId] = { occurred: false, occurredCount: 0 };
  }
  return state.eventStates[eventId];
}
