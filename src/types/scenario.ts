export interface NPC {
  id: string;
  name: string;
  age?: number;
  occupation?: string;
  description: string;
  stats?: {
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
  };
  notes: string;
}

export interface Location {
  id: string;
  name: string;
  description: string;
  clueIds: string[];
  npcIds: string[];
  notes: string;
}

export interface Clue {
  id: string;
  name: string;
  description: string;
  locationId?: string;
  isKey: boolean;
  notes: string;
}

export interface Event {
  id: string;
  name: string;
  trigger: string;
  description: string;
  outcome: string;
  notes: string;
}

export interface Scene {
  id: string;
  name: string;
  order: number;
  description: string;
  locationIds: string[];
  eventIds: string[];
  npcIds: string[];
  clueIds: string[];
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
  backgroundInfo: string;
  keeperNotes: string;
  npcs: NPC[];
  locations: Location[];
  clues: Clue[];
  events: Event[];
  scenes: Scene[];
  createdAt: string;
  updatedAt: string;
}

export type ScenarioElementType = 'npc' | 'location' | 'clue' | 'event' | 'scene';

export interface EditorState {
  scenario: Scenario;
  selectedElement: {
    type: ScenarioElementType;
    id: string;
  } | null;
  activeTab: ScenarioElementType | 'overview';
  isDirty: boolean;
}
