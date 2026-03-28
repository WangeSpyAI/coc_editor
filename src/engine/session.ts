import type { Scenario } from '../types/scenario';
import type { GameSession, Fact, PlayerCharacter } from '../types/engine';
import { generateId } from '../utils/id';
import { initializeWorldState } from './world';
import { applyEffects } from './effects';
import { evaluateCondition } from './conditions';

/**
 * Create a new game session from a scenario template.
 */
export function createSession(scenario: Scenario, name: string): GameSession {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    name,
    scenarioId: scenario.id,
    scenarioSnapshot: structuredClone(scenario),
    worldState: initializeWorldState(scenario),
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

  // Apply effects if the fact carries them
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
 * Record a clue discovery.
 */
export function discoverClue(session: GameSession, clueId: string, pcId?: string): Fact {
  const clueState = session.worldState.clueStates[clueId];
  if (clueState) {
    clueState.discovered = true;
    clueState.discoveredBy = pcId;
  }
  return addFact(session, {
    timestamp: session.worldState.currentTime,
    factType: 'discovery',
    description: '手がかりを発見した',
    relatedEntityIds: [clueId, ...(pcId ? [pcId] : [])],
  });
}

/**
 * Transfer knowledge to an NPC.
 */
export function addNpcKnowledge(session: GameSession, npcId: string, knowledge: string): Fact {
  const npcState = session.worldState.npcStates[npcId];
  if (npcState && !npcState.knowledge.includes(knowledge)) {
    npcState.knowledge.push(knowledge);
  }
  return addFact(session, {
    timestamp: session.worldState.currentTime,
    factType: 'knowledge_transfer',
    description: `NPC が "${knowledge}" を知った`,
    relatedEntityIds: [npcId],
  });
}

/**
 * Advance the world time and evaluate timeline entries.
 */
export function advanceTime(session: GameSession, newTime: string): { facts: Fact[]; prevented: string[] } {
  session.worldState.currentTime = newTime;
  const resultFacts: Fact[] = [];
  const prevented: string[] = [];

  // Process timeline entries up to and including the new time
  // (simplified: process all pending entries whose time matches)
  const scenario = session.scenarioSnapshot;
  for (const entry of scenario.timeline) {
    if (entry.time !== newTime) continue;

    const alreadyOccurred = session.worldState.facts.some(
      (f) => f.factType === 'timeline_event' && f.relatedEntityIds.includes(entry.id)
    );
    if (alreadyOccurred) continue;

    // Check prevention
    if (entry.preventedBy) {
      if (evaluateCondition(entry.preventedBy, session.worldState)) {
        prevented.push(entry.id);
        continue;
      }
    }

    // Execute timeline entry
    const fact = addFact(session, {
      timestamp: newTime,
      factType: 'timeline_event',
      description: entry.description,
      relatedEntityIds: [entry.id],
      effects: entry.effects,
    });
    resultFacts.push(fact);
  }

  return { facts: resultFacts, prevented };
}

/**
 * Add a player character to the session.
 */
export function addPlayerCharacter(session: GameSession, pc: PlayerCharacter): void {
  session.worldState.pcs.push(pc);
}

/**
 * Remove a player character from the session.
 */
export function removePlayerCharacter(session: GameSession, pcId: string): void {
  session.worldState.pcs = session.worldState.pcs.filter((p) => p.id !== pcId);
}

/**
 * Set an NPC as dead.
 */
export function killNpc(session: GameSession, npcId: string): Fact {
  const npcState = session.worldState.npcStates[npcId];
  if (npcState) npcState.alive = false;
  return addFact(session, {
    timestamp: session.worldState.currentTime,
    factType: 'state_change',
    description: 'NPC が死亡した',
    relatedEntityIds: [npcId],
  });
}

/**
 * Move an NPC to a location.
 */
export function moveNpc(session: GameSession, npcId: string, locationId: string): Fact {
  const npcState = session.worldState.npcStates[npcId];
  if (npcState) npcState.locationId = locationId;
  return addFact(session, {
    timestamp: session.worldState.currentTime,
    factType: 'npc_action',
    description: 'NPC が移動した',
    relatedEntityIds: [npcId, locationId],
  });
}

/**
 * Mark a location as visited.
 */
export function visitLocation(session: GameSession, locationId: string): Fact {
  const locState = session.worldState.locationStates[locationId];
  if (locState) locState.visited = true;
  return addFact(session, {
    timestamp: session.worldState.currentTime,
    factType: 'pc_action',
    description: '場所を訪れた',
    relatedEntityIds: [locationId],
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
