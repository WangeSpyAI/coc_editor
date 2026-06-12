# TS Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the v8b prototype (640-line single JSX) into typed, modular TypeScript with Zustand state management, preserving identical behavior.

**Architecture:** Engine layer as pure functions in `src/engine/`, Zustand store in `src/store/`, React components in `src/components/`. Data flows: user action → store action → engine pure function → state update → re-render.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Zustand (new dependency)

---

### Task 1: Install Zustand

**Step 1: Install**

Run: `npm install zustand`

**Step 2: Verify**

Run: `npm ls zustand`
Expected: `zustand@5.x.x`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add zustand dependency"
```

---

### Task 2: Type Definitions

**Files:**
- Create: `src/types/model.ts`

**Step 1: Write types**

```typescript
export type EntityId = string;
export type ActionId = string;
export type TriggerId = string;
export type PartyId = string;

export interface ValueDefinition {
  description: string | null;
}

export interface Category {
  name: string;
  exclusive: boolean;
  values: Record<string, ValueDefinition>;
  current: string | null | string[];
}

export interface Condition {
  ref: 'self' | 'named' | 'sibling' | 'ancestor' | 'descendant';
  entity?: EntityId;
  category: string;
  value: string;
  negated: boolean;
}

export interface Effect {
  type: 'set' | 'remove';
  entity?: EntityId;
  category: string;
  value: string;
}

export interface Action {
  id: ActionId;
  name: string;
  plAction: boolean;
  description: string;
  effects: Effect[];
  showConditions: Condition[];
  roll?: string;
  requiresItem?: EntityId;
  requiresKnowledge?: string;
}

export interface Trigger {
  id: TriggerId;
  conditions: Condition[];
  actionId: ActionId;
}

export interface Entity {
  id: EntityId;
  name: string;
  parent: EntityId | null;
  categoryOrder: string[];
  categories: Category[];
  actions: Action[];
  triggers: Trigger[];
  entryConditions?: Condition[];
}

export type Entities = Record<EntityId, Entity>;

export interface Party {
  id: PartyId;
  name: string;
  members: EntityId[];
}

export interface DescLogEntry {
  time: string;
  name: string;
  desc: string;
  roll: string | null;
  auto: boolean;
  location: string;
  actor: string | null;
}

export interface HistoryEntry {
  priorEntities: Entities;
  tree: {
    root: string;
    autoFired: string[];
  };
}

export interface FiredAction {
  name: string;
  desc: string | null;
}

export interface PendingTrigger {
  triggerId: TriggerId;
  entityId: EntityId;
  entityName: string;
  actionName: string;
  conditions: (Condition & { met: boolean })[];
}

export interface EntityTemplate {
  categoryOrder: string[];
  categories: Category[];
  actions: Action[];
  triggers: Trigger[];
}
```

**Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors (types are standalone, no imports from non-existent modules)

**Step 3: Commit**

```bash
git add src/types/model.ts
git commit -m "feat: add TypeScript type definitions for data model"
```

---

### Task 3: Engine — tree.ts

**Files:**
- Create: `src/engine/tree.ts`

**Step 1: Implement**

```typescript
import type { Entities, Entity, EntityId } from '../types/model';

export function getChildren(entities: Entities, parentId: EntityId | null): Entity[] {
  return Object.values(entities).filter(e => e.parent === parentId);
}

export function getDescendants(entities: Entities, entityId: EntityId): Entity[] {
  const result: Entity[] = [];
  for (const child of getChildren(entities, entityId)) {
    result.push(child);
    result.push(...getDescendants(entities, child.id));
  }
  return result;
}

export function findPCs(entities: Entities): Entity[] {
  return Object.values(entities).filter(e =>
    e.categories.some(c => c.name === '種別' && c.current === 'PC')
  );
}
```

**Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/engine/tree.ts
git commit -m "feat: add engine tree utilities"
```

---

### Task 4: Engine — conditions.ts

**Files:**
- Create: `src/engine/conditions.ts`

**Step 1: Implement**

```typescript
import type { Action, Condition, Entities, Entity, EntityId } from '../types/model';
import { getDescendants } from './tree';

export function entityHasValue(entity: Entity, categoryName: string, value: string): boolean {
  if (categoryName === '居場所') return entity.parent === value;
  const cat = entity.categories.find(c => c.name === categoryName);
  if (!cat) return false;
  if (cat.exclusive) return cat.current === value;
  return Array.isArray(cat.current) && cat.current.includes(value);
}

export function evaluateCondition(condition: Condition, entities: Entities, ownerId: EntityId): boolean {
  const check = (eid: EntityId): boolean => {
    const e = entities[eid];
    return e ? entityHasValue(e, condition.category, condition.value) : false;
  };

  let result: boolean;
  switch (condition.ref) {
    case 'self':
      result = check(ownerId);
      break;
    case 'named':
      result = check(condition.entity!);
      break;
    case 'sibling': {
      const own = entities[ownerId];
      result = Object.values(entities).some(
        e => e.parent === own.parent && e.id !== ownerId && entityHasValue(e, condition.category, condition.value)
      );
      break;
    }
    case 'ancestor': {
      result = false;
      let cur = entities[ownerId];
      while (cur?.parent) {
        cur = entities[cur.parent];
        if (cur && entityHasValue(cur, condition.category, condition.value)) {
          result = true;
          break;
        }
      }
      break;
    }
    case 'descendant':
      result = getDescendants(entities, ownerId).some(
        d => entityHasValue(d, condition.category, condition.value)
      );
      break;
    default:
      result = false;
  }
  return condition.negated ? !result : result;
}

export function isActionAvailable(action: Action, entities: Entities, ownerId: EntityId): boolean {
  if (!action.showConditions || action.showConditions.length === 0) return true;
  return action.showConditions.every(c => evaluateCondition(c, entities, ownerId));
}

export function isLocationAccessible(entity: Entity, entities: Entities): boolean {
  if (!entity.entryConditions || entity.entryConditions.length === 0) return true;
  return entity.entryConditions.every(c => evaluateCondition(c, entities, entity.id));
}
```

**Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/engine/conditions.ts
git commit -m "feat: add engine condition evaluation"
```

---

### Task 5: Engine — effects.ts

**Files:**
- Create: `src/engine/effects.ts`

**Step 1: Implement**

```typescript
import type { Effect, Entities, EntityId } from '../types/model';

export function applyEffect(entities: Entities, effect: Effect, defaultEntityId: EntityId): Record<string, unknown> | null {
  const targetId = effect.entity || defaultEntityId;
  const target = entities[targetId];
  if (!target) return null;

  if (effect.category === '居場所') {
    const prior = target.parent;
    target.parent = effect.value;
    return { prior };
  }

  const cat = target.categories.find(c => c.name === effect.category);
  if (!cat) return null;

  if (effect.type === 'set') {
    if (cat.exclusive) {
      const prior = cat.current;
      cat.current = effect.value;
      if (!cat.values[effect.value]) cat.values[effect.value] = { description: null };
      return { prior };
    } else {
      if (!Array.isArray(cat.current)) cat.current = [];
      if (!cat.current.includes(effect.value)) cat.current = [...cat.current, effect.value];
      if (!cat.values[effect.value]) cat.values[effect.value] = { description: null };
      return {};
    }
  } else if (effect.type === 'remove') {
    if (cat.exclusive) {
      const prior = cat.current;
      if (cat.current === effect.value) cat.current = null;
      return { prior };
    } else {
      cat.current = ((cat.current as string[]) || []).filter(v => v !== effect.value);
      return {};
    }
  }
  return null;
}

export function wouldChange(entities: Entities, effects: Effect[], defaultEntityId: EntityId): boolean {
  for (const eff of effects) {
    const targetId = eff.entity || defaultEntityId;
    const target = entities[targetId];
    if (!target) continue;

    if (eff.category === '居場所') {
      if (target.parent !== eff.value) return true;
      continue;
    }

    const cat = target.categories.find(c => c.name === eff.category);
    if (!cat) continue;

    if (eff.type === 'set') {
      if (cat.exclusive) {
        if (cat.current !== eff.value) return true;
      } else {
        if (!((cat.current as string[]) || []).includes(eff.value)) return true;
      }
    } else {
      if (cat.exclusive) {
        if (cat.current === eff.value) return true;
      } else {
        if (((cat.current as string[]) || []).includes(eff.value)) return true;
      }
    }
  }
  return false;
}
```

**Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/engine/effects.ts
git commit -m "feat: add engine effect application"
```

---

### Task 6: Engine — stabilize.ts

**Files:**
- Create: `src/engine/stabilize.ts`

**Step 1: Implement**

```typescript
import type { Entities, FiredAction } from '../types/model';
import { evaluateCondition } from './conditions';
import { applyEffect, wouldChange } from './effects';

export function runStabilize(entities: Entities): FiredAction[] {
  const fired: FiredAction[] = [];
  const firedKeys = new Set<string>();
  let changed = true;
  let iter = 0;

  while (changed && iter < 200) {
    changed = false;
    iter++;
    for (const entity of Object.values(entities)) {
      for (const trigger of entity.triggers || []) {
        const key = entity.id + ':' + trigger.id;
        if (firedKeys.has(key)) continue;
        if (!trigger.conditions.every(c => evaluateCondition(c, entities, entity.id))) continue;

        const action = entity.actions.find(a => a.id === trigger.actionId);
        if (!action) continue;
        if (!wouldChange(entities, action.effects, entity.id)) {
          firedKeys.add(key);
          continue;
        }

        firedKeys.add(key);
        for (const eff of action.effects) applyEffect(entities, eff, entity.id);
        fired.push({ name: action.name, desc: action.description || null });
        changed = true;
      }
    }
  }
  return fired;
}
```

**Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/engine/stabilize.ts
git commit -m "feat: add engine stabilize (fixed-point trigger evaluation)"
```

---

### Task 7: Engine — projection.ts + pending.ts + utils.ts

**Files:**
- Create: `src/engine/projection.ts`
- Create: `src/engine/pending.ts`
- Create: `src/engine/utils.ts`

**Step 1: Implement projection.ts**

```typescript
import type { Entities, EntityId } from '../types/model';
import { getChildren } from './tree';

const DEFAULT_CATEGORY_ORDER = ['外見', '服装', '態度', '環境', '雰囲気'];

export function computeProjection(entities: Entities, entityId: EntityId): string {
  const entity = entities[entityId];
  if (!entity) return '';

  const order = entity.categoryOrder?.length ? entity.categoryOrder : DEFAULT_CATEGORY_ORDER;
  const descs: string[] = [];
  const seen = new Set<string>();

  const addCategory = (cat: { exclusive: boolean; current: string | null | string[]; values: Record<string, { description: string | null }> }) => {
    if (cat.exclusive) {
      const desc = cat.current && cat.values[cat.current as string]?.description;
      if (desc) descs.push(desc);
    } else {
      for (const v of (cat.current as string[]) || []) {
        const desc = cat.values[v]?.description;
        if (desc) descs.push(desc);
      }
    }
  };

  for (const catName of order) {
    seen.add(catName);
    const cat = entity.categories.find(c => c.name === catName);
    if (cat) addCategory(cat);
  }
  for (const cat of entity.categories) {
    if (!seen.has(cat.name)) addCategory(cat);
  }

  return descs.join('\n');
}

export function computeFullProjection(entities: Entities, entityId: EntityId): string {
  const self = computeProjection(entities, entityId);
  const childDescs = getChildren(entities, entityId)
    .map(c => computeProjection(entities, c.id))
    .filter(Boolean);
  return [self, ...childDescs].filter(Boolean).join('\n');
}
```

**Step 2: Implement pending.ts**

```typescript
import type { Entities, PendingTrigger } from '../types/model';
import { evaluateCondition, isActionAvailable } from './conditions';

export function computePending(entities: Entities): PendingTrigger[] {
  const pending: PendingTrigger[] = [];
  for (const entity of Object.values(entities)) {
    for (const trigger of entity.triggers || []) {
      const conds = trigger.conditions.map(c => ({
        ...c,
        met: evaluateCondition(c, entities, entity.id),
      }));
      const metCount = conds.filter(c => c.met).length;
      if (metCount > 0 && conds.length - metCount === 1) {
        const action = entity.actions.find(a => a.id === trigger.actionId);
        if (action && isActionAvailable(action, entities, entity.id)) {
          pending.push({
            triggerId: trigger.id,
            entityId: entity.id,
            entityName: entity.name,
            actionName: action.name,
            conditions: conds,
          });
        }
      }
    }
  }
  return pending;
}
```

**Step 3: Implement utils.ts**

```typescript
import type { Condition, Entities, EntityId } from '../types/model';

export function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function uid(): string {
  return 'id_' + Math.random().toString(36).slice(2, 9);
}

export function timeStr(): string {
  const d = new Date();
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

export function condLabel(condition: Condition, entities: Entities): string {
  const neg = condition.negated ? 'NOT ' : '';
  const srcMap: Record<string, string> = {
    self: '自身',
    named: entities[condition.entity!]?.name || condition.entity || '?',
    sibling: '同位',
    ancestor: '祖先',
    descendant: '子孫',
  };
  const src = srcMap[condition.ref] || '?';
  return `${neg}${src}: ${condition.category} = ${condition.value}`;
}

export function condTargetEntity(condition: Condition, ownerId: EntityId): EntityId | null {
  return condition.ref === 'self' ? ownerId : condition.ref === 'named' ? (condition.entity ?? null) : null;
}
```

**Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add src/engine/projection.ts src/engine/pending.ts src/engine/utils.ts
git commit -m "feat: add engine projection, pending triggers, and utilities"
```

---

### Task 8: Theme + Sample Data

**Files:**
- Create: `src/theme.ts`
- Create: `src/data/sampleScenario.ts`

**Step 1: Implement theme.ts**

Extract `C`, `font`, and common styles (`sIn`, `sBtn`, `sEBtn`, `sLbl`, `sSel`) from the prototype. Keep as plain objects — identical to prototype's inline style approach.

```typescript
import type { CSSProperties } from 'react';

export const C = {
  bg0: '#0d1017', bg1: '#141b22', bg2: '#1b2430', bg3: '#243040', bgAct: '#1a3548',
  tx: '#dce0e8', tx2: '#8f99a8', tx3: '#5c6878',
  acc: '#4ec9b0', accDim: '#2a7a68', accBg: '#162e28',
  warn: '#d9a334', warnBg: '#2e2510',
  err: '#d05050', ok: '#4caf6a', blue: '#5099d0',
  plBdr: '#2a4a6a', bdr: '#253040', pcMark: '#e8c547',
  edit: '#c084fc', editBg: '#1e1530',
} as const;

export const font = '"Hiragino Sans","Yu Gothic UI","Noto Sans JP",sans-serif';

export const sIn: CSSProperties = {
  background: C.bg3, color: C.tx, border: `1px solid ${C.bdr}`,
  borderRadius: 4, padding: '3px 6px', fontSize: 12, fontFamily: font, outline: 'none',
};

export const sSel: CSSProperties = { ...sIn, cursor: 'pointer', minWidth: 70 };

export const sBtn: CSSProperties = {
  background: C.bg3, color: C.tx2, border: `1px solid ${C.bdr}`,
  borderRadius: 3, padding: '2px 8px', fontSize: 11, cursor: 'pointer', fontFamily: font,
};

export const sEBtn: CSSProperties = {
  background: C.editBg, color: C.edit, border: `1px solid ${C.edit}44`,
  borderRadius: 3, padding: '2px 8px', fontSize: 11, cursor: 'pointer', fontFamily: font,
};

export const sLbl: CSSProperties = {
  fontSize: 11, color: C.tx3, fontFamily: font, marginBottom: 4,
  textTransform: 'uppercase', letterSpacing: 1,
};
```

**Step 2: Implement sampleScenario.ts**

Copy `createScenario()`, `createInitialParties()`, and `templates` from prototype, adding type annotations.

```typescript
import type { Entities, EntityTemplate, Party } from '../types/model';

export function createScenario(): Entities {
  // Exact copy of prototype's createScenario(), typed as Entities
  return { /* ... full scenario data from prototype L74 ... */ };
}

export function createInitialParties(): Party[] {
  return [{ id: 'p1', name: 'パーティ', members: ['e-pcA', 'e-pcB'] }];
}

export const templates: Record<string, EntityTemplate> = {
  // Exact copy of prototype's templates object from L531-537, typed
  '場所': { categoryOrder: ['雰囲気'], categories: [{ name: '雰囲気', exclusive: true, values: {}, current: null }], actions: [], triggers: [] },
  'NPC': { categoryOrder: ['外見', '態度'], categories: [{ name: '種別', exclusive: true, values: { 'NPC': { description: null } }, current: 'NPC' }, { name: '外見', exclusive: true, values: {}, current: null }, { name: '態度', exclusive: true, values: { '丁寧': { description: null }, '中立': { description: null }, '敵対': { description: null } }, current: '中立' }], actions: [], triggers: [] },
  'PC': { categoryOrder: [], categories: [{ name: '種別', exclusive: true, values: { 'PC': { description: null } }, current: 'PC' }, { name: '知識', exclusive: false, values: {}, current: [] }, { name: '状態異常', exclusive: false, values: {}, current: [] }], actions: [], triggers: [] },
  'アイテム': { categoryOrder: ['状態'], categories: [{ name: '種別', exclusive: true, values: { 'アイテム': { description: null } }, current: 'アイテム' }, { name: '状態', exclusive: true, values: { '未発見': { description: null }, '発見': { description: null } }, current: '未発見' }], actions: [], triggers: [] },
  '空': { categoryOrder: [], categories: [], actions: [], triggers: [] },
};
```

Note: `createScenario` body is the full scenario object from prototype L74. Copy verbatim, the plan omits it for brevity.

**Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/theme.ts src/data/sampleScenario.ts
git commit -m "feat: add theme constants and sample scenario data"
```

---

### Task 9: Zustand Store

**Files:**
- Create: `src/store/scenarioStore.ts`

**Step 1: Implement**

Migrate all state and callbacks from prototype's App component (L514-582) into a Zustand store. The store uses engine functions for all state transitions.

```typescript
import { create } from 'zustand';
import type { Entities, Party, PartyId, EntityId, ActionId, DescLogEntry, HistoryEntry, EntityTemplate } from '../types/model';
import { clone, uid, timeStr } from '../engine/utils';
import { runStabilize } from '../engine/stabilize';
import { applyEffect } from '../engine/effects';
import { evaluateCondition, isLocationAccessible } from '../engine/conditions';
import { computeFullProjection } from '../engine/projection';
import { getDescendants } from '../engine/tree';
import { createScenario, createInitialParties, templates } from '../data/sampleScenario';

interface LastAction {
  names: string[];
  auto: boolean;
}

interface ActorPick {
  entityId: EntityId;
  actionId: ActionId;
  actionName: string;
  roll?: string;
  candidates: EntityId[];
}

interface ScenarioState {
  entities: Entities;
  parties: Party[];
  activePartyId: PartyId;
  selId: EntityId;
  history: HistoryEntry[];
  descLog: DescLogEntry[];
  lastAction: LastAction | null;
  sideTab: 'pending' | 'history';
  dragOver: EntityId | null;
  actorPick: ActorPick | null;
  splitMode: boolean;
  splitSelection: Set<EntityId>;
  newEntName: string;
  newEntType: string;
  addingTo: EntityId | null;

  // Actions — mirror prototype callbacks
  setSelId: (id: EntityId) => void;
  setDragOver: (id: EntityId | null) => void;
  setSideTab: (tab: 'pending' | 'history') => void;
  setActorPick: (pick: ActorPick | null) => void;
  setSplitMode: (mode: boolean) => void;
  setSplitSelection: (sel: Set<EntityId>) => void;
  setNewEntName: (name: string) => void;
  setNewEntType: (type: string) => void;
  setAddingTo: (id: EntityId | null) => void;
  setEntities: (entities: Entities) => void;

  executeWithActor: (actionName: string, effects: { type: string; entity?: string; category: string; value: string }[], sourceEntityId: EntityId, directDesc: string | null, roll: string | null, actorId: EntityId | null) => void;
  handleAction: (entityId: EntityId, actionId: ActionId) => void;
  handleActorConfirm: (pcId: EntityId) => void;
  handleSetVal: (entityId: EntityId, categoryName: string, value: string | null) => void;
  handleShareKnowledge: (knowledge: string, toPcIds: EntityId[]) => void;
  handleNavigate: (locationId: EntityId) => void;
  handleUndo: () => void;
  handleDrop: (targetId: EntityId, sourceId: string) => void;
  handleAddEntity: (parentId: EntityId | null) => void;
  confirmAddEntity: () => void;
  handleSplitConfirm: () => void;
  handleMerge: () => void;
  handleAddToParty: (entityId: EntityId) => void;
  setActivePartyAndNavigate: (partyId: PartyId) => void;
  clearLastAction: () => void;
}

export const useScenarioStore = create<ScenarioState>((set, get) => ({
  entities: createScenario(),
  parties: createInitialParties(),
  activePartyId: 'p1',
  selId: 'e-hall',
  history: [],
  descLog: [],
  lastAction: null,
  sideTab: 'pending',
  dragOver: null,
  actorPick: null,
  splitMode: false,
  splitSelection: new Set(),
  newEntName: '',
  newEntType: '場所',
  addingTo: null,

  setSelId: (id) => set({ selId: id }),
  setDragOver: (id) => set({ dragOver: id }),
  setSideTab: (tab) => set({ sideTab: tab }),
  setActorPick: (pick) => set({ actorPick: pick }),
  setSplitMode: (mode) => set({ splitMode: mode }),
  setSplitSelection: (sel) => set({ splitSelection: sel }),
  setNewEntName: (name) => set({ newEntName: name }),
  setNewEntType: (type) => set({ newEntType: type }),
  setAddingTo: (id) => set({ addingTo: id }),
  setEntities: (entities) => set({ entities }),
  clearLastAction: () => set({ lastAction: null }),

  executeWithActor: (actionName, effects, sourceEntityId, directDesc, roll, actorId) => {
    const { entities, selId, descLog, history } = get();
    const prior = clone(entities);
    const newEnts = clone(entities);

    const resolved = effects.map(eff => ({
      ...eff,
      entity: eff.entity === '$actor' ? actorId! : eff.entity,
      value: eff.value === '$actor' ? actorId! : eff.value,
    }));
    for (const eff of resolved) applyEffect(newEnts, eff as any, sourceEntityId);
    const autoFired = runStabilize(newEnts);

    const time = timeStr();
    const locName = entities[selId]?.name || '';
    const actorName = actorId ? entities[actorId]?.name || null : null;
    const newLogs: DescLogEntry[] = [];
    if (directDesc) newLogs.push({ time, name: actionName, desc: directDesc, roll: roll || null, auto: false, location: locName, actor: actorName });
    for (const af of autoFired) {
      if (af.desc) newLogs.push({ time, name: af.name, desc: af.desc, roll: null, auto: true, location: locName, actor: null });
    }

    set({
      entities: newEnts,
      history: [...history, { priorEntities: prior, tree: { root: actionName, autoFired: autoFired.map(a => a.name) } }],
      descLog: [...descLog, ...newLogs],
      lastAction: newLogs.length > 0 ? { names: newLogs.map(l => l.name), auto: autoFired.length > 0 } : null,
    });
  },

  handleAction: (eid, actionId) => {
    const { entities, parties, activePartyId, selId, executeWithActor } = get();
    const ent = entities[eid];
    const action = ent?.actions.find(a => a.id === actionId);
    if (!action) return;

    const activeParty = parties.find(p => p.id === activePartyId);
    if (action.plAction && activeParty) {
      let candidates = activeParty.members.filter(m => entities[m]?.parent === selId);
      if (action.requiresItem) candidates = candidates.filter(m => entities[action.requiresItem!]?.parent === m);
      if (action.requiresKnowledge) candidates = candidates.filter(m => {
        const pc = entities[m];
        const kc = pc?.categories.find(c => c.name === '知識');
        return kc && Array.isArray(kc.current) && kc.current.includes(action.requiresKnowledge!);
      });
      if (candidates.length === 0) executeWithActor(action.name, action.effects, eid, action.description || null, action.roll || null, null);
      else if (candidates.length === 1) executeWithActor(action.name, action.effects, eid, action.description || null, action.roll || null, candidates[0]);
      else { set({ actorPick: { entityId: eid, actionId, actionName: action.name, roll: action.roll, candidates } }); return; }
    } else {
      executeWithActor(action.name, action.effects, eid, action.description || null, action.roll || null, null);
    }
  },

  handleActorConfirm: (pcId) => {
    const { actorPick, entities, executeWithActor } = get();
    if (!actorPick) return;
    const ent = entities[actorPick.entityId];
    const action = ent?.actions.find(a => a.id === actorPick.actionId);
    if (!action) return;
    set({ actorPick: null });
    executeWithActor(action.name, action.effects, actorPick.entityId, action.description || null, action.roll || null, pcId);
  },

  handleSetVal: (eid, catName, value) => {
    const { entities, executeWithActor } = get();
    const ent = entities[eid];
    const label = catName === '居場所'
      ? `${ent.name}: 居場所 → ${entities[value!]?.name || value}`
      : `${ent.name}: ${catName} → ${value}`;
    executeWithActor(label, [{ type: 'set', entity: eid, category: catName, value: value! }], eid, null, null, null);
  },

  handleShareKnowledge: (knowledge, toPcIds) => {
    const { entities, executeWithActor } = get();
    const effects = toPcIds.map(pcId => ({ type: 'set' as const, entity: pcId, category: '知識', value: knowledge }));
    const names = toPcIds.map(id => entities[id]?.name || id).join(', ');
    executeWithActor(`情報共有: ${knowledge}`, effects, toPcIds[0], `「${knowledge}」の情報を${names}に共有した。`, null, null);
  },

  handleNavigate: (locationId) => {
    const { entities, parties, activePartyId, history, descLog } = get();
    const loc = entities[locationId];
    if (loc && !isLocationAccessible(loc, entities)) return;
    const activeParty = parties.find(p => p.id === activePartyId);
    if (!activeParty) return;

    const prior = clone(entities);
    const newEnts = clone(entities);
    for (const m of activeParty.members) {
      if (newEnts[m]) newEnts[m].parent = locationId;
    }
    const autoFired = runStabilize(newEnts);
    const locName = entities[locationId]?.name || locationId;

    const time = timeStr();
    const newLogs: DescLogEntry[] = [];
    const sd = computeFullProjection(newEnts, locationId);
    if (sd) newLogs.push({ time, name: `${locName}に到着`, desc: sd, roll: null, auto: false, location: locName, actor: null });
    for (const af of autoFired) {
      if (af.desc) newLogs.push({ time, name: af.name, desc: af.desc, roll: null, auto: true, location: locName, actor: null });
    }

    set({
      entities: newEnts,
      selId: locationId,
      history: [...history, { priorEntities: prior, tree: { root: `${locName}へ移動`, autoFired: autoFired.map(a => a.name) } }],
      descLog: [...descLog, ...newLogs],
    });
  },

  handleUndo: () => {
    const { history } = get();
    if (history.length === 0) return;
    set({
      entities: history[history.length - 1].priorEntities,
      history: history.slice(0, -1),
      actorPick: null,
    });
  },

  handleDrop: (targetId, sourceId) => {
    const { entities, executeWithActor } = get();
    set({ dragOver: null });
    if (!sourceId || sourceId === targetId) return;
    if (getDescendants(entities, sourceId).some(d => d.id === targetId)) return;
    if (entities[sourceId].parent === targetId) return;
    executeWithActor(
      `${entities[sourceId].name}: 居場所 → ${entities[targetId]?.name}`,
      [{ type: 'set', entity: sourceId, category: '居場所', value: targetId }],
      sourceId, null, null, null
    );
  },

  handleAddEntity: (parentId) => set({ addingTo: parentId }),

  confirmAddEntity: () => {
    const { newEntName, newEntType, addingTo, entities, parties, activePartyId } = get();
    if (!newEntName.trim()) return;
    const id = uid();
    const tmpl = clone(templates[newEntType] || templates['空']);
    const newEntities = { ...entities, [id]: { id, name: newEntName.trim(), parent: addingTo, ...tmpl } };

    let newParties = parties;
    if (newEntType === 'PC') {
      newParties = parties.map(p =>
        p.id === activePartyId ? { ...p, members: [...p.members, id] } : p
      );
    }

    set({
      entities: newEntities,
      parties: newParties,
      newEntName: '',
      addingTo: null,
      newEntType: '場所',
      selId: id,
    });
  },

  handleSplitConfirm: () => {
    const { splitSelection, parties, activePartyId, entities } = get();
    const activeParty = parties.find(p => p.id === activePartyId);
    if (splitSelection.size === 0 || !activeParty) return;
    const remaining = activeParty.members.filter(m => !splitSelection.has(m));
    if (remaining.length === 0) return;
    const newId = 'p' + Date.now();

    const first = entities[[...splitSelection][0]];
    set({
      parties: [
        ...parties.map(p => p.id === activePartyId ? { ...p, members: remaining } : p),
        { id: newId, name: '別動隊', members: [...splitSelection] },
      ],
      activePartyId: newId,
      selId: first?.parent || get().selId,
      splitMode: false,
      splitSelection: new Set(),
    });
  },

  handleMerge: () => {
    const { parties, activePartyId, entities } = get();
    const activeParty = parties.find(p => p.id === activePartyId);
    if (!activeParty) return;
    const activeLoc = activeParty.members[0] ? entities[activeParty.members[0]]?.parent : null;
    if (!activeLoc || parties.length <= 1) return;
    const mergeableParties = parties.filter(p =>
      p.id !== activePartyId && p.members.some(m => entities[m]?.parent === activeLoc)
    );
    if (mergeableParties.length === 0) return;

    const mergeIds = new Set(mergeableParties.map(p => p.id));
    const merged = parties.filter(p => mergeIds.has(p.id)).flatMap(p => p.members);
    const newMembers = [...activeParty.members, ...merged];

    const prior = clone(entities);
    const newEnts = clone(entities);
    for (const m of merged) {
      if (newEnts[m]) newEnts[m].parent = activeLoc;
    }
    const autoFired = runStabilize(newEnts);

    set({
      entities: newEnts,
      history: [...get().history, { priorEntities: prior, tree: { root: 'パーティ合流', autoFired: autoFired.map(a => a.name) } }],
      parties: parties.filter(p => !mergeIds.has(p.id)).map(p =>
        p.id === activePartyId ? { ...p, members: newMembers } : p
      ),
    });
  },

  handleAddToParty: (entityId) => {
    const { parties, activePartyId } = get();
    set({
      parties: parties.map(p =>
        p.id === activePartyId ? { ...p, members: [...p.members, entityId] } : p
      ),
    });
  },

  setActivePartyAndNavigate: (partyId) => {
    const { entities, parties } = get();
    const party = parties.find(p => p.id === partyId);
    const firstMember = party?.members[0] ? entities[party.members[0]] : null;
    set({
      activePartyId: partyId,
      selId: firstMember?.parent || get().selId,
    });
  },
}));
```

**Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/store/scenarioStore.ts
git commit -m "feat: add Zustand store with all scenario actions"
```

---

### Task 10: Components — common/AddRow + TreePane

**Files:**
- Create: `src/components/common/AddRow.tsx`
- Create: `src/components/TreePane.tsx`

**Step 1: Implement AddRow.tsx**

Port prototype L85-92 with types.

```typescript
import { useState } from 'react';
import { sIn, sEBtn } from '../../theme';

interface AddRowProps {
  placeholder: string;
  onAdd: (value: string) => void;
  buttonLabel?: string;
}

export function AddRow({ placeholder, onAdd, buttonLabel }: AddRowProps) {
  const [value, setValue] = useState('');
  const submit = () => { if (value.trim()) { onAdd(value.trim()); setValue(''); } };
  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
      <input value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit(); }} placeholder={placeholder} style={{ ...sIn, flex: 1 }} />
      <button onClick={submit} style={sEBtn}>{buttonLabel || '＋'}</button>
    </div>
  );
}
```

**Step 2: Implement TreePane.tsx**

Port prototype L334-607 (TreeNode + tree pane from App). Components read from store directly.

The component should:
- Render TreeNode recursively (L334-349)
- Include add entity UI (L589-607)
- Use `useScenarioStore` for state access

**Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/components/common/AddRow.tsx src/components/TreePane.tsx
git commit -m "feat: add AddRow and TreePane components"
```

---

### Task 11: Components — EditPanel + ActionEditor

**Files:**
- Create: `src/components/EditPanel.tsx`
- Create: `src/components/ActionEditor.tsx`

**Step 1: Implement EditPanel.tsx**

Port prototype L95-239: `EditEntityPanel`, `CatEditor`, `CatAdder`. All take typed props. `EditEntityPanel` receives `eid` and reads entities from store.

**Step 2: Implement ActionEditor.tsx**

Port prototype L241-331: `ActionEditor`, `ActionAdder`, `CondAdder`, `TriggerAdder`. These remain pure presentational components with typed props.

**Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/components/EditPanel.tsx src/components/ActionEditor.tsx
git commit -m "feat: add EditPanel and ActionEditor components"
```

---

### Task 12: Components — SceneView

**Files:**
- Create: `src/components/SceneView.tsx`

**Step 1: Implement**

Port prototype's MainPanel (L351-473). This is the largest component. It:
- Reads state from `useScenarioStore`
- Renders: navigation bar, actor pick, notification, scene header, PL actions, knowledge sharing, KP actions, quick state, edit panel (uses EditPanel), mini log
- Uses engine functions: `computeFullProjection`, `isLocationAccessible`, `isActionAvailable`, `getChildren`

**Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/SceneView.tsx
git commit -m "feat: add SceneView component"
```

---

### Task 13: Components — PartyBar, PendingPanel, HistoryPanel, LogPane

**Files:**
- Create: `src/components/PartyBar.tsx`
- Create: `src/components/PendingPanel.tsx`
- Create: `src/components/HistoryPanel.tsx`
- Create: `src/components/LogPane.tsx`

**Step 1: Implement PartyBar.tsx**

Port prototype L610-623 (party bar + split mode). Reads from store.

**Step 2: Implement PendingPanel.tsx**

Port prototype L475-483. Pure presentational, receives pending triggers and entities as props or reads from store.

**Step 3: Implement HistoryPanel.tsx**

Port prototype L505-511. Reads history from store, calls handleUndo.

**Step 4: Implement LogPane.tsx**

Port prototype L484-503 (LogPanel for right sidebar). Copy button with clipboard.

**Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add src/components/PartyBar.tsx src/components/PendingPanel.tsx src/components/HistoryPanel.tsx src/components/LogPane.tsx
git commit -m "feat: add PartyBar, PendingPanel, HistoryPanel, LogPane components"
```

---

### Task 14: App.tsx — Layout Shell

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`

**Step 1: Rewrite App.tsx**

Replace Vite default template with 3-pane layout. App.tsx only does layout — all logic is in store.

```typescript
import { useMemo } from 'react';
import { useScenarioStore } from './store/scenarioStore';
import { TreePane } from './components/TreePane';
import { PartyBar } from './components/PartyBar';
import { SceneView } from './components/SceneView';
import { PendingPanel } from './components/PendingPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { computePending } from './engine/pending';
import { findPCs } from './engine/tree';
import { C, font } from './theme';

export default function App() {
  const { entities, sideTab, setSideTab } = useScenarioStore();
  const pending = useMemo(() => computePending(entities), [entities]);
  const pcLocs = useMemo(() => {
    const s = new Set<string>();
    findPCs(entities).forEach(pc => { if (pc.parent) s.add(pc.parent); });
    return [...s];
  }, [entities]);

  const sTab = (active: boolean) => ({
    flex: 1, padding: '6px 0', textAlign: 'center' as const, fontSize: 11, fontFamily: font,
    cursor: 'pointer', letterSpacing: 0.5,
    color: active ? C.acc : C.tx3,
    background: active ? C.bg2 : C.bg1,
    borderBottom: active ? `2px solid ${C.acc}` : '2px solid transparent',
  });

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', background: C.bg0, color: C.tx, overflow: 'hidden' }}>
      <TreePane pcLocs={pcLocs} />
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <PartyBar />
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <SceneView />
        </div>
      </div>
      <div style={{ width: 260, minWidth: 260, borderLeft: `1px solid ${C.bdr}`, background: C.bg1, overflow: 'auto', flexShrink: 0 }}>
        <div style={{ display: 'flex', borderBottom: `1px solid ${C.bdr}` }}>
          <div style={sTab(sideTab === 'pending')} onClick={() => setSideTab('pending')}>
            ⚡ 待機中 {pending.length > 0 && `(${pending.length})`}
          </div>
          <div style={sTab(sideTab === 'history')} onClick={() => setSideTab('history')}>履歴</div>
        </div>
        {sideTab === 'pending' ? <PendingPanel pending={pending} /> : <HistoryPanel />}
      </div>
    </div>
  );
}
```

**Step 2: Clean up App.css**

Remove Vite default styles. Keep minimal or empty (since we use inline styles).

**Step 3: Clean up index.css**

Minimal reset only: `body { margin: 0; }` and remove Vite defaults.

**Step 4: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: Both succeed

**Step 5: Commit**

```bash
git add src/App.tsx src/App.css src/index.css
git commit -m "feat: replace default template with 3-pane layout shell"
```

---

### Task 15: Manual Verification

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Verify all features work**

Check these in browser:
- Tree pane: entities display with hierarchy, PC location markers (●), drag & drop
- Party bar: party display, split, merge buttons
- Scene view: navigation buttons, scene description, PL/KP action buttons, actor selection, knowledge sharing, quick state dropdowns, edit panel, mini log
- Right panel: pending triggers with grant button, history with undo
- Entity creation: template buttons, name input

**Step 3: Fix any TypeScript or runtime errors found**

**Step 4: Final commit if fixes needed**

```bash
git add -A
git commit -m "fix: resolve issues found during manual verification"
```

---

### Task 16: Clean Up

**Step 1: Remove unused files**

- Delete `src/assets/react.svg`
- Delete `public/vite.svg`
- Remove any unused imports

**Step 2: Verify build is clean**

Run: `npm run build && npm run lint`
Expected: No errors, no warnings

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove unused default template files"
```
