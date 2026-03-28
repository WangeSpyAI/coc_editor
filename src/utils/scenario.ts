import type { Scenario } from '../types/scenario';
import { generateId } from './id';

export function createEmptyScenario(): Scenario {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    title: '新規シナリオ',
    author: '',
    era: '現代',
    playerCount: '3〜4人',
    estimatedTime: '',
    synopsis: '',
    truth: '',
    backgroundInfo: '',
    keeperNotes: '',
    npcs: [],
    locations: [],
    clues: [],
    events: [],
    timeline: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function exportScenario(scenario: Scenario): string {
  return JSON.stringify(scenario, null, 2);
}

export function importScenario(json: string): Scenario {
  return JSON.parse(json) as Scenario;
}
