# Scenario Editor — Development Guide

## What This Is

ペトリネット意味論に基づくシナリオエディタ。
エンティティツリー・カテゴリ・トリガー・アクションで世界を定義し、
stabilize（不動点計算）で因果連鎖を自動解決する。

## Architecture

### Core Engine (`src/core/`)
Pure functions. Framework-independent. Fully testable with Vitest.

- `types.ts` — Entity, Category, Trigger, Action, Effect, WorldState, Scenario
- `engine.ts` — Tree operations, condition evaluation, effect application, stabilize, fireAction
- `sampleScenario.ts` — Demo scenario for development

Key concepts:
- **Entity Tree**: All entities (locations, NPCs, items) in parent-child tree. parentId = containment.
- **Categories**: State axes. Exclusive (enum, one value) or non-exclusive (flags, multiple values).
- **Triggers**: Auto-fire rules. Condition (AND of clauses) → Effects. Chain until fixed point.
- **Actions**: Manual operations with display conditions and effects.
- **Stabilize**: Scan all triggers, apply matching, repeat until no changes. MAX_STABILIZE_STEPS = 100.
- **References**: self, ancestor, descendant, sibling, named — resolve to entity IDs for conditions/effects.

### UI Layer (`src/ui/`, `src/hooks/`)
React + TypeScript. Components access engine through `useScenario` hook.

- `hooks/useScenario.ts` — Engine wrapper with React state, localStorage persistence, action dispatch
- `ui/App.tsx` — 3-column layout: tree | location view | detail panel
- `ui/EntityTree.tsx` — Collapsible tree of all entities
- `ui/LocationView.tsx` — Main KP view: selected entity + descendant actions aggregated
- `ui/DetailPanel.tsx` — All categories, triggers, pending triggers, logs for selected entity
- `ui/styles.css` — Dark theme CSS

### Testing

#### Unit Tests (`npm test`)
- Engine logic: `src/core/__tests__/engine.test.ts` — 18 tests
- Covers: tree ops, condition eval, effect application, stabilize (chains, firedOnce, oscillation), fireAction, getAvailableActions, getPendingTriggers

#### Build (`npm run build`)
- `tsc -b && vite build` — TypeScript type-checking + production bundle

## Design Principles

### 1. Engine is Pure
Engine functions take data in, return data out. No side effects, no framework deps.
All state mutation happens through `stabilize` and `fireAction`.

### 2. Stabilize Semantics
- Triggers only record as "fired" when effects actually change state (or firedOnce)
- No-op triggers don't count as changes — prevents infinite loops from idempotent rules
- `reachedFixedPoint: false` signals oscillation (MAX_STABILIZE_STEPS reached)

### 3. Reference Resolution
Conditions and effects use EntityReference to specify targets:
- `self` — the entity owning the trigger/action
- `ancestor` — up the parent chain
- `descendant` — down the children tree
- `sibling` — same parent, excluding self
- `named` — specific entity by ID

### 4. Category Semantics
- Exclusive: single string value, `setCategory` replaces
- Non-exclusive: string array, `setCategory` adds, `removeCategory` removes

### 5. UI State Management
- `useScenario` hook owns all state (scenario + worldState + selection)
- Session persisted to localStorage as JSON (Set → Array for serialization)
- World state reset re-initializes from scenario + stabilize

## Common Pitfalls

- Forgetting to deep-clone WorldState before mutation (structuredClone + Set restore)
- Adding effects that create oscillation (A→B→A) — stabilize detects but doesn't resolve
- Non-exclusive category: setCategory adds, doesn't replace — use removeCategory first if needed
- EntityReference resolution returns empty array if entity doesn't exist — effects silently skip
