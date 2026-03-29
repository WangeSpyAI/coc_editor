import type {
  Scenario,
  Effect,
  FactType,
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

// --- Actor Runtime State (PC・NPC共通) ---

export interface ActorRuntimeState {
  alive: boolean;
  locationId?: string;
  knowledge: string[];
  inventory: string[];
  /** NPC: hostile/neutral/allied, PC: always 'pc' */
  role: 'pc' | 'hostile' | 'neutral' | 'allied';
  /** NPCの場合の追加状態 */
  attitude?: string;
  custom: Record<string, string | number | boolean>;
}

// --- Location Runtime State ---

export interface LocationRuntimeState {
  /** actorId ごとの訪問記録 */
  visitedBy: string[];
  custom: Record<string, string | number | boolean>;
}

// --- Clue Runtime State ---

export interface ClueRuntimeState {
  discovered: boolean;
  discoveredBy?: string;
  locationId?: string;
  holderId?: string;
  destroyed: boolean;
}

// --- Event Runtime State ---

export interface EventRuntimeState {
  occurred: boolean;
  occurredCount: number;
}

// --- World State ---

export interface WorldState {
  currentTime: string;
  facts: Fact[];
  /** PC・NPC の統合ランタイム状態 */
  actorStates: Record<string, ActorRuntimeState>;
  locationStates: Record<string, LocationRuntimeState>;
  clueStates: Record<string, ClueRuntimeState>;
  eventStates: Record<string, EventRuntimeState>;
  flags: Record<string, string | number | boolean>;
}

// --- Event Status (replaces TimelineStatus) ---

export interface EventStatus {
  eventId: string;
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
  /** PC名の逆引き (pcId → キャラ名) */
  pcNames: Record<string, string>;
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
