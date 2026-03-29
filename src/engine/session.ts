import type { Scenario, PCTemplate } from '../types/scenario';
import type { GameSession, Fact } from '../types/engine';
import { generateId } from '../utils/id';
import { initializeWorldState } from './world';
import { applyEffects } from './effects';
import { evaluateCondition } from './conditions';

/**
 * Create a new game session from a scenario template.
 */
export function createSession(scenario: Scenario, name: string): GameSession {
  const now = new Date().toISOString();
  const snapshot = JSON.parse(JSON.stringify(scenario)) as Scenario;
  return {
    id: generateId(),
    name,
    scenarioId: scenario.id,
    scenarioSnapshot: snapshot,
    worldState: initializeWorldState(snapshot),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Add a fact to the session's world state.
 */
export function addFact(session: GameSession, fact: Omit<Fact, 'id' | 'recordedAt'>): Fact {
  const fullFact: Fact = {
    ...fact,
    id: generateId(),
    recordedAt: new Date().toISOString(),
  };

  session.worldState.facts.push(fullFact);

  if (fullFact.effects) {
    applyEffects(fullFact.effects, session.worldState, fullFact.timestamp);
  }

  session.updatedAt = new Date().toISOString();
  return fullFact;
}

/**
 * Record a PC action as a fact.
 */
export function recordPcAction(session: GameSession, description: string, entityIds: string[] = []): Fact {
  return addFact(session, {
    timestamp: session.worldState.currentTime,
    factType: 'pc_action',
    description,
    relatedEntityIds: entityIds,
  });
}

/**
 * Discover a clue.
 */
export function discoverClue(session: GameSession, clueId: string, discoveredBy?: string): Fact {
  const clueState = session.worldState.clueStates[clueId];
  if (clueState) {
    clueState.discovered = true;
    clueState.discoveredBy = discoveredBy;
  }
  return addFact(session, {
    timestamp: session.worldState.currentTime,
    factType: 'discovery',
    description: '手がかりを発見した',
    relatedEntityIds: [clueId, ...(discoveredBy ? [discoveredBy] : [])],
  });
}

/**
 * Obtain a clue from an NPC (conversation-based).
 */
export function obtainClueFromActor(session: GameSession, clueId: string, fromActorId: string, toActorId?: string): Fact {
  const clueState = session.worldState.clueStates[clueId];
  if (clueState) {
    clueState.discovered = true;
    clueState.discoveredBy = toActorId;
    // Remove from holder
    if (clueState.holderId === fromActorId) {
      clueState.holderId = toActorId;
    }
  }
  return addFact(session, {
    timestamp: session.worldState.currentTime,
    factType: 'discovery',
    description: '情報を入手した',
    relatedEntityIds: [clueId, fromActorId, ...(toActorId ? [toActorId] : [])],
  });
}

/**
 * Transfer knowledge to an actor (PC or NPC).
 */
export function addActorKnowledge(session: GameSession, actorId: string, knowledge: string): Fact {
  const actorState = session.worldState.actorStates[actorId];
  if (actorState && !actorState.knowledge.includes(knowledge)) {
    actorState.knowledge.push(knowledge);
  }
  return addFact(session, {
    timestamp: session.worldState.currentTime,
    factType: 'knowledge_transfer',
    description: `"${knowledge}" を知った`,
    relatedEntityIds: [actorId],
  });
}

/**
 * Advance the world time and evaluate time-triggered events.
 */
export function advanceTime(session: GameSession, newTime: string): { facts: Fact[]; prevented: string[] } {
  session.worldState.currentTime = newTime;
  const resultFacts: Fact[] = [];
  const prevented: string[] = [];

  const scenario = session.scenarioSnapshot;
  for (const evt of scenario.events) {
    // Only process time-triggered events
    if (evt.triggerType !== 'time' || evt.triggerTime !== newTime) continue;

    const alreadyOccurred = session.worldState.eventStates[evt.id]?.occurred;
    if (alreadyOccurred && !evt.isRepeatable) continue;

    // Check prevention
    if (evt.preventedBy) {
      if (evaluateCondition(evt.preventedBy, session.worldState)) {
        prevented.push(evt.id);
        continue;
      }
    }

    // Execute event
    const evtState = session.worldState.eventStates[evt.id];
    if (evtState) {
      evtState.occurred = true;
      evtState.occurredCount++;
    }

    const fact = addFact(session, {
      timestamp: newTime,
      factType: 'timeline_event',
      description: evt.description,
      relatedEntityIds: [evt.id],
      effects: evt.effects,
    });
    resultFacts.push(fact);
  }

  return { facts: resultFacts, prevented };
}

/**
 * Add a PC to the session.
 */
export function addPlayerCharacter(session: GameSession, pc: PCTemplate): void {
  session.worldState.actorStates[pc.id] = {
    alive: true,
    locationId: pc.initialLocationId,
    knowledge: [...pc.initialKnowledge],
    inventory: [...pc.inventory],
    role: 'pc',
    custom: {},
  };
}

/**
 * Remove a PC from the session.
 */
export function removePlayerCharacter(session: GameSession, pcId: string): void {
  delete session.worldState.actorStates[pcId];
}

/**
 * Move an actor (PC or NPC) to a location.
 */
export function moveActor(session: GameSession, actorId: string, locationId: string): Fact {
  const actorState = session.worldState.actorStates[actorId];
  if (actorState) actorState.locationId = locationId;
  return addFact(session, {
    timestamp: session.worldState.currentTime,
    factType: actorState?.role === 'pc' ? 'pc_action' : 'npc_action',
    description: '移動した',
    relatedEntityIds: [actorId, locationId],
  });
}

/**
 * Set an actor as dead.
 */
export function killActor(session: GameSession, actorId: string): Fact {
  const actorState = session.worldState.actorStates[actorId];
  if (actorState) actorState.alive = false;
  return addFact(session, {
    timestamp: session.worldState.currentTime,
    factType: 'state_change',
    description: '死亡した',
    relatedEntityIds: [actorId],
  });
}

/**
 * Visit a location (records which actor visited).
 */
export function visitLocation(session: GameSession, locationId: string, actorId: string): Fact {
  const locState = session.worldState.locationStates[locationId];
  if (locState && !locState.visitedBy.includes(actorId)) {
    locState.visitedBy.push(actorId);
  }
  return addFact(session, {
    timestamp: session.worldState.currentTime,
    factType: 'pc_action',
    description: '場所を訪れた',
    relatedEntityIds: [locationId, actorId],
  });
}

/**
 * Serialize session to JSON.
 */
export function saveSession(session: GameSession): string {
  return JSON.stringify(session, null, 2);
}

/**
 * Deserialize session from JSON.
 */
export function loadSession(json: string): GameSession {
  return JSON.parse(json) as GameSession;
}
