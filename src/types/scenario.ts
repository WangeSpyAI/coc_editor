export interface NPC {
  id: string;
  name: string;
  age?: number;
  occupation?: string;
  description: string;
  stats?: CharacterStats;
  skills?: Record<string, number>;
  traits: string[];
  relations: Relation[];
  initialKnowledge: string[];
  initialLocationId?: string;
  schedule?: ScheduleEntry[];
  notes: string;
}

export interface CharacterStats {
  str: number;
  con: number;
  siz: number;
  dex: number;
  app: number;
  int: number;
  pow: number;
  edu: number;
  hp: number;
  mp: number;
  san: number;
}

export interface Relation {
  targetId: string;
  type: string;
  description?: string;
}

export interface ScheduleEntry {
  time: string;
  locationId?: string;
  activity?: string;
}

export interface Location {
  id: string;
  name: string;
  description: string;
  tags: string[];
  connectedLocationIds: string[];
  clueIds: string[];
  npcIds: string[];
  notes: string;
}

export interface Clue {
  id: string;
  name: string;
  description: string;
  isKey: boolean;
  initialLocationId?: string;
  initialHolderId?: string;
  discoverySkill?: string;
  discoveryDifficulty?: 'regular' | 'hard' | 'extreme';
  leadsTo: string[];
  notes: string;
}

export interface ScenarioEvent {
  id: string;
  name: string;
  description: string;
  trigger: string;
  outcome: string;
  triggerCondition?: Condition;
  effects?: Effect[];
  isRepeatable?: boolean;
  notes: string;
}

export interface TimelineEntry {
  id: string;
  time: string;
  description: string;
  preventedBy?: Condition;
  effects?: Effect[];
  notes: string;
}

export interface Scenario {
  id: string;
  title: string;
  author: string;
  era: string;
  playerCount: string;
  estimatedTime: string;
  synopsis: string;
  truth: string;
  backgroundInfo: string;
  keeperNotes: string;
  npcs: NPC[];
  locations: Location[];
  clues: Clue[];
  events: ScenarioEvent[];
  timeline: TimelineEntry[];
  createdAt: string;
  updatedAt: string;
}

export type ScenarioElementType = 'npc' | 'location' | 'clue' | 'event' | 'timeline';

export interface EditorState {
  scenario: Scenario;
  selectedElement: {
    type: ScenarioElementType;
    id: string;
  } | null;
  activeTab: ScenarioElementType | 'overview';
  isDirty: boolean;
}

// --- Condition & Effect (used by both scenario and engine) ---

export type Condition =
  | { type: 'always' }
  | { type: 'never' }
  | { type: 'flag'; flag: string; operator?: '==' | '!=' | '>=' | '<='; value?: string | number | boolean }
  | { type: 'clueDiscovered'; clueId: string }
  | { type: 'clueCountGte'; count: number }
  | { type: 'npcAlive'; npcId: string }
  | { type: 'npcAt'; npcId: string; locationId: string }
  | { type: 'npcKnows'; npcId: string; knowledge: string }
  | { type: 'locationVisited'; locationId: string }
  | { type: 'eventOccurred'; eventId: string }
  | { type: 'pcHasItem'; item: string }
  | { type: 'pcStat'; pcId: string; stat: string; operator: '>=' | '<=' | '=='; value: number }
  | { type: 'factExists'; factType?: FactType; descriptionContains?: string; entityId?: string }
  | { type: 'and'; conditions: Condition[] }
  | { type: 'or'; conditions: Condition[] }
  | { type: 'not'; condition: Condition };

export type Effect =
  | { type: 'setFlag'; flag: string; value: string | number | boolean }
  | { type: 'setNpcState'; npcId: string; field: string; value: string | number | boolean }
  | { type: 'addNpcKnowledge'; npcId: string; knowledge: string }
  | { type: 'setClueLocation'; clueId: string; locationId?: string; holderId?: string }
  | { type: 'destroyClue'; clueId: string }
  | { type: 'setLocationState'; locationId: string; field: string; value: string | number | boolean }
  | { type: 'sanCheck'; successLoss: string; failureLoss: string }
  | { type: 'hpChange'; targetId: string; amount: string }
  | { type: 'mpChange'; targetId: string; amount: string }
  | { type: 'addItem'; targetId: string; item: string }
  | { type: 'removeItem'; targetId: string; item: string }
  | { type: 'showMessage'; message: string }
  | { type: 'triggerEvent'; eventId: string };

export type FactType =
  | 'pc_action'
  | 'npc_action'
  | 'discovery'
  | 'state_change'
  | 'knowledge_transfer'
  | 'timeline_event'
  | 'keeper_note';
