import { createContext, useContext, useReducer, type ReactNode } from 'react';
import type {
  Scenario,
  NPC,
  Location,
  Clue,
  Event,
  Scene,
  ScenarioElementType,
  EditorState,
} from '../types/scenario';
import { createEmptyScenario } from '../utils/scenario';
import { generateId } from '../utils/id';

type Action =
  | { type: 'SET_SCENARIO'; payload: Scenario }
  | { type: 'UPDATE_OVERVIEW'; payload: Partial<Scenario> }
  | { type: 'SET_ACTIVE_TAB'; payload: ScenarioElementType | 'overview' }
  | { type: 'SELECT_ELEMENT'; payload: { type: ScenarioElementType; id: string } | null }
  | { type: 'ADD_NPC' }
  | { type: 'UPDATE_NPC'; payload: NPC }
  | { type: 'DELETE_NPC'; payload: string }
  | { type: 'ADD_LOCATION' }
  | { type: 'UPDATE_LOCATION'; payload: Location }
  | { type: 'DELETE_LOCATION'; payload: string }
  | { type: 'ADD_CLUE' }
  | { type: 'UPDATE_CLUE'; payload: Clue }
  | { type: 'DELETE_CLUE'; payload: string }
  | { type: 'ADD_EVENT' }
  | { type: 'UPDATE_EVENT'; payload: Event }
  | { type: 'DELETE_EVENT'; payload: string }
  | { type: 'ADD_SCENE' }
  | { type: 'UPDATE_SCENE'; payload: Scene }
  | { type: 'DELETE_SCENE'; payload: string }
  | { type: 'MARK_SAVED' };

const initialState: EditorState = {
  scenario: createEmptyScenario(),
  selectedElement: null,
  activeTab: 'overview',
  isDirty: false,
};

function reducer(state: EditorState, action: Action): EditorState {
  const now = new Date().toISOString();

  switch (action.type) {
    case 'SET_SCENARIO':
      return { ...state, scenario: action.payload, isDirty: false, selectedElement: null, activeTab: 'overview' };

    case 'UPDATE_OVERVIEW':
      return {
        ...state,
        isDirty: true,
        scenario: { ...state.scenario, ...action.payload, updatedAt: now },
      };

    case 'SET_ACTIVE_TAB':
      return { ...state, activeTab: action.payload, selectedElement: null };

    case 'SELECT_ELEMENT':
      return { ...state, selectedElement: action.payload };

    case 'ADD_NPC': {
      const npc: NPC = { id: generateId(), name: '新規NPC', description: '', notes: '' };
      return {
        ...state,
        isDirty: true,
        scenario: { ...state.scenario, npcs: [...state.scenario.npcs, npc], updatedAt: now },
        selectedElement: { type: 'npc', id: npc.id },
      };
    }
    case 'UPDATE_NPC':
      return {
        ...state,
        isDirty: true,
        scenario: {
          ...state.scenario,
          npcs: state.scenario.npcs.map((n) => (n.id === action.payload.id ? action.payload : n)),
          updatedAt: now,
        },
      };
    case 'DELETE_NPC':
      return {
        ...state,
        isDirty: true,
        selectedElement: state.selectedElement?.id === action.payload ? null : state.selectedElement,
        scenario: {
          ...state.scenario,
          npcs: state.scenario.npcs.filter((n) => n.id !== action.payload),
          updatedAt: now,
        },
      };

    case 'ADD_LOCATION': {
      const loc: Location = { id: generateId(), name: '新規場所', description: '', clueIds: [], npcIds: [], notes: '' };
      return {
        ...state,
        isDirty: true,
        scenario: { ...state.scenario, locations: [...state.scenario.locations, loc], updatedAt: now },
        selectedElement: { type: 'location', id: loc.id },
      };
    }
    case 'UPDATE_LOCATION':
      return {
        ...state,
        isDirty: true,
        scenario: {
          ...state.scenario,
          locations: state.scenario.locations.map((l) => (l.id === action.payload.id ? action.payload : l)),
          updatedAt: now,
        },
      };
    case 'DELETE_LOCATION':
      return {
        ...state,
        isDirty: true,
        selectedElement: state.selectedElement?.id === action.payload ? null : state.selectedElement,
        scenario: {
          ...state.scenario,
          locations: state.scenario.locations.filter((l) => l.id !== action.payload),
          updatedAt: now,
        },
      };

    case 'ADD_CLUE': {
      const clue: Clue = { id: generateId(), name: '新規手がかり', description: '', isKey: false, notes: '' };
      return {
        ...state,
        isDirty: true,
        scenario: { ...state.scenario, clues: [...state.scenario.clues, clue], updatedAt: now },
        selectedElement: { type: 'clue', id: clue.id },
      };
    }
    case 'UPDATE_CLUE':
      return {
        ...state,
        isDirty: true,
        scenario: {
          ...state.scenario,
          clues: state.scenario.clues.map((c) => (c.id === action.payload.id ? action.payload : c)),
          updatedAt: now,
        },
      };
    case 'DELETE_CLUE':
      return {
        ...state,
        isDirty: true,
        selectedElement: state.selectedElement?.id === action.payload ? null : state.selectedElement,
        scenario: {
          ...state.scenario,
          clues: state.scenario.clues.filter((c) => c.id !== action.payload),
          updatedAt: now,
        },
      };

    case 'ADD_EVENT': {
      const evt: Event = { id: generateId(), name: '新規イベント', trigger: '', description: '', outcome: '', notes: '' };
      return {
        ...state,
        isDirty: true,
        scenario: { ...state.scenario, events: [...state.scenario.events, evt], updatedAt: now },
        selectedElement: { type: 'event', id: evt.id },
      };
    }
    case 'UPDATE_EVENT':
      return {
        ...state,
        isDirty: true,
        scenario: {
          ...state.scenario,
          events: state.scenario.events.map((e) => (e.id === action.payload.id ? action.payload : e)),
          updatedAt: now,
        },
      };
    case 'DELETE_EVENT':
      return {
        ...state,
        isDirty: true,
        selectedElement: state.selectedElement?.id === action.payload ? null : state.selectedElement,
        scenario: {
          ...state.scenario,
          events: state.scenario.events.filter((e) => e.id !== action.payload),
          updatedAt: now,
        },
      };

    case 'ADD_SCENE': {
      const scene: Scene = {
        id: generateId(),
        name: '新規シーン',
        order: state.scenario.scenes.length + 1,
        description: '',
        locationIds: [],
        eventIds: [],
        npcIds: [],
        clueIds: [],
        notes: '',
      };
      return {
        ...state,
        isDirty: true,
        scenario: { ...state.scenario, scenes: [...state.scenario.scenes, scene], updatedAt: now },
        selectedElement: { type: 'scene', id: scene.id },
      };
    }
    case 'UPDATE_SCENE':
      return {
        ...state,
        isDirty: true,
        scenario: {
          ...state.scenario,
          scenes: state.scenario.scenes.map((s) => (s.id === action.payload.id ? action.payload : s)),
          updatedAt: now,
        },
      };
    case 'DELETE_SCENE':
      return {
        ...state,
        isDirty: true,
        selectedElement: state.selectedElement?.id === action.payload ? null : state.selectedElement,
        scenario: {
          ...state.scenario,
          scenes: state.scenario.scenes.filter((s) => s.id !== action.payload),
          updatedAt: now,
        },
      };

    case 'MARK_SAVED':
      return { ...state, isDirty: false };

    default:
      return state;
  }
}

interface ScenarioContextValue {
  state: EditorState;
  dispatch: React.Dispatch<Action>;
}

const ScenarioContext = createContext<ScenarioContextValue | null>(null);

export function ScenarioProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <ScenarioContext.Provider value={{ state, dispatch }}>
      {children}
    </ScenarioContext.Provider>
  );
}

export function useScenario() {
  const ctx = useContext(ScenarioContext);
  if (!ctx) throw new Error('useScenario must be used within ScenarioProvider');
  return ctx;
}
