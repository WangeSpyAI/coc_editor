# CoC Scenario Editor — Development Guide

## Design Principles (設計方針)

These principles were learned through debugging real issues. Follow them strictly.

### 1. Canonical Primitives (正準プリミティブ)

**All state mutations that touch multiple stores MUST go through a single canonical function.**

- **Location changes** → `placeActorAt(state, actorId, locationId)` in `world.ts`
  - Updates `actorState.locationId` AND `locationStates.visitedBy` atomically
  - Every function that moves an actor (session.ts `moveActor`, `visitLocation`, `addPlayerCharacter`; effects.ts `moveActor`, `setNpcState`) MUST call `placeActorAt`
  - NEVER set `locationId` or push to `visitedBy` directly

**Why**: Scattered location update logic caused bugs where `visitedBy` wasn't updated or `locationId` wasn't set. DRY violation was the root cause.

### 2. Dual-Write Invariant (二重書き込み不変条件)

When an operation must update N pieces of state, ALL N must be updated atomically. Test for this explicitly.

Examples:
- `placeActorAt`: locationId + visitedBy
- `addPlayerCharacter`: actorStates + pcNames + visitedBy
- `transferClue`: holderId + locationId + discovered + discoveredBy

### 3. Condition/Query Consistency (条件/クエリ一貫性)

**Conditions and queries that answer the same question MUST use the same resolution logic.**

- `evaluateCondition` for `actorAt`/`npcAt` and `getActorsAtLocation` both use `resolveActorLocation()`
- `resolveActorLocation` implements 3-tier fallback: runtime locationId → NPC schedule → initial location
- When adding a new location-aware feature, use `resolveActorLocation`, don't reimplement

### 4. Top-Level vs Custom Fields (トップレベル vs カスタムフィールド)

`ActorRuntimeState` has typed top-level fields (`alive`, `locationId`, `stats`) and an untyped `custom` bag.

- `setNpcState` effect MUST check `field` name and route to the correct target:
  - `alive` → `actor.alive` (boolean)
  - `locationId` → `placeActorAt()` (triggers dual-write)
  - Everything else → `actor.custom[field]`
- NEVER put typed data (HP, MP, stats) in `custom`. Use `stats?: CharacterStats`.

### 5. Facts are Audit Log, Not Event Source (事実は監査ログ)

- `WorldState` is mutable and is the **source of truth**
- `Fact[]` is an append-only audit trail for session history/replay display
- Do NOT derive current state from facts. Read state directly from WorldState fields.

### 6. Effect/Session Parity (エフェクト/セッション対称性)

Both `effects.ts` and `session.ts` can mutate WorldState. They must follow the same rules:
- Both use `placeActorAt` for location changes
- Both use `ensureActorState` patterns for safety
- Event state should be set BEFORE applying effects (consistent timing)

### 7. Optional Scenario Context (オプショナルシナリオコンテキスト)

`evaluateCondition(condition, state, scenario?)` takes an optional scenario for richer evaluation.
- Without scenario: runtime-only (backward compatible)
- With scenario: enables schedule-based and initial-location fallback
- Always pass scenario when available in session context

## Architecture

### Engine Layer (`src/engine/`)
Pure functions, no Vue/Pinia dependency. Fully testable with Vitest.

- `world.ts` — World state initialization, location resolution, actor/clue queries
- `conditions.ts` — Condition evaluation (all Condition types)
- `effects.ts` — Effect application (all Effect types)
- `session.ts` — Session lifecycle (create, PC management, actions, save/load)
- `dice.ts` — Dice rolling, skill checks
- `derived.ts` — Derived stat calculation

### UI Layer (`src/components/`, `src/store/`, `src/composables/`)
Vue 3 + Pinia. Components access engine through store actions.

- `store/session.ts` — Session store, wraps engine functions with reactivity + persistence
- `store/scenario.ts` — Scenario editing store
- `store/app.ts` — App mode switching (editor ↔ session)
- `composables/useEntityNames.ts` — ID → human-readable name resolution

### 8. Initialization vs Runtime (初期化とランタイムの区別)

NPC initial placement (`initializeWorldState`) sets `locationId` directly in the actorStates initializer. It does NOT use `placeActorAt` because NPCs are not "visitors" — `visitedBy` tracks PC visits for gameplay purposes, not NPC presence.

- `initializeWorldState`: direct `locationId` assignment (no visitedBy)
- Runtime moves (effects, session actions): always through `placeActorAt` (with visitedBy)

**Why**: Using `placeActorAt` during initialization caused NPCs to appear as "visited" in location cards from the start.

### 9. Non-Null Assertions in Computed (computed内の非nullアサーション)

Pinia store computed values may run when store state is null. Always guard before using `!` assertions:

```typescript
// BAD: crashes if worldState is null
const aliveActors = computed(() =>
  allActors.value.filter((a) => s.worldState!.actorStates[a.id]?.alive !== false)
)

// GOOD: guard first
const aliveActors = computed(() => {
  if (!s.worldState) return []
  return allActors.value.filter((a) => s.worldState!.actorStates[a.id]?.alive !== false)
})
```

### Testing

#### Unit Tests (`npm test`)
- Engine logic: `src/engine/__tests__/` (conditions, effects, session, world, consistency)
- Component mount: `src/components/__tests__/mount.test.ts` — verifies all components mount without runtime errors
- `consistency.test.ts` specifically tests dual-write invariants

#### E2E Smoke Tests (`npm run test:e2e`)
- Builds production bundle and starts preview server
- Verifies HTML, JS, CSS assets are served correctly
- Validates bundle contains expected code (createApp, pinia)

#### What Tests Catch and Don't Catch
Verified by intentional breakage experiments:
- **Import errors**: caught by both tests and build
- **Nonexistent fields**: caught by both tests and build  
- **Broken template bindings**: caught by both tests and build
- **Engine logic bugs** (e.g., missing visitedBy update): caught by tests, NOT by build
- **Missing triggerReactivity()**: NOT caught by either — needs DOM assertion tests or real browser E2E

### Stop Hook Workflow
On every commit attempt, the stop hook runs:
1. `npm test` — unit + component mount tests must pass
2. `npm run build` — TypeScript compilation + Vite build must succeed
3. `npm run test:e2e` — E2E smoke tests must pass
4. Agent design audit — checks for state consistency, dual-write invariants, effect/session parity, condition/query divergence, type safety

## Common Pitfalls

- Adding a new way to move actors without using `placeActorAt` → visitedBy desyncs
- Adding a new location condition without using `resolveActorLocation` → inconsistent with queries
- Putting typed state in `custom` instead of a proper field → bypasses type system
- Setting event state after effects → timing inconsistency with condition evaluation
- Using `placeActorAt` during initialization → NPCs incorrectly appear as visitors
- Non-null assertions (`!`) in computed without null guard → runtime crash when store is empty
- Forgetting `triggerReactivity()` after engine mutations → stale UI (not caught by unit tests)
