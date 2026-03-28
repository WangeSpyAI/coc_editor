import type {
  Scenario,
  Effect,
  FactType,
  CharacterStats,
} from './scenario';

// --- Fact: the core of the engine ---

export interface Fact {
  id: string;
  timestamp: string;
  recordedAt: string;
  factType: FactType;
  description: string;
  relatedEntityIds: string[];
  effects?: Effect[];
}

// --- Player Character ---

export interface PlayerCharacter {
  id: string;
  playerName: string;
  characterName: string;
  occupation: string;
  stats: CharacterStats;
  skills: Record<string, number>;
  inventory: string[];
  conditions: string[];
  notes: string;
}

// --- Runtime State (derived from facts) ---

export interface NpcRuntimeState {
  alive: boolean;
  locationId?: string;
  attitude?: string;
  knowledge: string[];
  custom: Record<string, string | number | boolean>;
}

export interface LocationRuntimeState {
  visited: boolean;
  custom: Record<string, string | number | boolean>;
}

export interface ClueRuntimeState {
  discovered: boolean;
  discoveredBy?: string;
  locationId?: string;
  holderId?: string;
  destroyed: boolean;
}

export interface EventRuntimeState {
  occurred: boolean;
  occurredCount: number;
}

export interface WorldState {
  currentTime: string;
  facts: Fact[];
  npcStates: Record<string, NpcRuntimeState>;
  locationStates: Record<string, LocationRuntimeState>;
  clueStates: Record<string, ClueRuntimeState>;
  eventStates: Record<string, EventRuntimeState>;
  pcs: PlayerCharacter[];
  flags: Record<string, string | number | boolean>;
}

// --- Timeline Status ---

export interface TimelineStatus {
  entryId: string;
  status: 'pending' | 'occurred' | 'prevented';
  preventedReason?: string;
}

// --- Game Session ---

export interface GameSession {
  id: string;
  name: string;
  scenarioId: string;
  scenarioSnapshot: Scenario;
  worldState: WorldState;
  createdAt: string;
  updatedAt: string;
}

// --- Dice ---

export interface DiceRoll {
  expression: string;
  results: number[];
  modifier: number;
  total: number;
}

export type SkillCheckResult =
  | 'criticalSuccess'
  | 'extremeSuccess'
  | 'hardSuccess'
  | 'regularSuccess'
  | 'failure'
  | 'fumble';
