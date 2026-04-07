# Scenario Editor — Development Guide

> **頑張るんじゃダメ。勝手に自然にそうなるようにする。**
>
> 「気をつける」「覚えておく」「ドキュメントを読む」に依存する設計は設計じゃない。
> 正しい方法しか存在しない構造を作れ。間違った方法を選ぶ道を塞げ。
> コンパイラが弾く > APIが存在しない > ドキュメントに書いてある。
>
> 新しい領域では最初の1回は間違える。それは避けられない。
> **だからバグ修正にコード修正だけのコミットは禁止。**
> 必ず「同じ種類のバグが二度と起きない構造変更」をセットにする。
> 構造変更が思いつかないなら、まだ原因分析が足りない。

## What This Is

ペトリネット意味論に基づくシナリオエディタ。
エンティティツリー・カテゴリ・トリガー・アクションで世界を定義し、
stabilize（不動点計算）で因果連鎖を自動解決する。

## Architecture

### Core Engine (`src/core/`)
Pure functions. Framework-independent. Fully testable with Vitest.

- `types.ts` — Entity, Category, Trigger, Action, Effect, WorldState, Scenario
- `engine.ts` — Tree operations, condition evaluation, effect application, stabilize
- `sampleScenario.ts` — Demo scenario for development

### UI Layer (`src/ui/`, `src/hooks/`)
React + TypeScript. Components access engine through `useScenario` hook.

- `hooks/useScenario.ts` — Engine wrapper with React state, localStorage persistence, full CRUD
- `ui/App.tsx` — 3-column layout: tree | location view | detail panel. Landing page for create/import.
- `ui/StateBadges.tsx` — Clickable state badges (single-source component)
- `ui/LocationView.tsx` — Main KP view (actions, children, state)
- `ui/DetailPanel.tsx` — Entity editor: inline edit name/desc/labels, category CRUD, action/trigger delete
- `ui/EntityTree.tsx` — Collapsible tree sidebar
- `ui/DependencyGraph.tsx` — Trigger chain visualization
- `ui/LiveEditor.tsx` — Real-time scenario authoring (add actions/triggers/entities during play)

### Testing (`npm test`)
- Engine logic: `src/core/__tests__/engine.test.ts`
- Build: `npm run build` — TypeScript type-checking + production bundle

---

## Architectural Invariants（絶対に破らないルール）

以下は「なんとなくのガイドライン」ではなく、コードの構造的安全性を保証する不変条件。
違反するとバグが入る。例外なし。

### 1. 状態更新プリミティブは3つだけ

```
commitMutation(next)    — 状態/スキーマ変更。undo自動push。
lifecycleReset(next)    — セッション開始/終了。undoスタッククリア。
(selectEntity)          — UI選択のみ。独立したuseState。undoなし。永続化なし。
```

`update()` や `pushUndo()` のような汎用関数は存在しない。
`commitMutation` を呼べばundoは自動。忘れようがない。
`lifecycleReset` を呼べばundoはリセット。中途半端な履歴が残らない。

**全公開関数はこの3つのどれかを経由する:**

| プリミティブ | 使用関数 |
|---|---|
| `commitMutation` | `mutateAndStabilize`, `mutateScenario`, `resetWorld` |
| `lifecycleReset` | `loadScenario`, `clearSession` |
| 直書き | `selectEntity`, `undo` |

`mutateAndStabilize` / `mutateScenario` は `commitMutation` を内部で呼ぶ。
コールバックは `MutationAPI` を受け取る。生の `WorldState` には触れない:

```typescript
interface MutationAPI {
  readonly worldState: ReadonlyWorldState  // 読める。書けない。
  applyEffect(effect, selfId): boolean     // Effect 適用
  fireAction(actionId, actorId?, rollResult?): boolean  // アクション発火
  initEntity(entityId, parentId, categoryValues): void  // エンティティ初期化
  log(type, sourceEntityId, description): void          // ログ追加
}
```

**なぜ**: `entityStates[x].categoryValues[y] = z` と書く道がそもそもない。
stabilize 忘れも不可能。undo忘れも不可能。「気をつける」に依存しない。

### 2. UI層は ReadonlyWorldState しか見えない

```typescript
// types.ts
export type ReadonlyWorldState = { readonly entityStates: ...; readonly log: ...; ... }
```

コンポーネントの Props には `ReadonlyWorldState` を使う。`WorldState`（mutable版）は使わない。
エンジンの mutation 関数（`applyEffect`, `stabilize`）は mutable `WorldState` を取る。
エンジンの query 関数（`getAvailableActions`, `getPendingTriggers`）は `ReadonlyWorldState` を取る。

**なぜ**: コンポーネントが `ws.entityStates[x].categoryValues[y] = z` と直接書き換えることを
TypeScript コンパイラが防ぐ。「気をつける」必要がない。

### 3. 状態変更は applyEffect 経由のみ

`categoryValues` を直接操作してはならない。テストも含む。

```typescript
// ✗ 禁止
ws.entityStates['room'].categoryValues['light'] = '暗い'

// ✓ 正解
applyEffect(
  { type: 'setCategory', target: { type: 'named', entityId: 'room' }, categoryId: 'light', value: '暗い' },
  'room', ws.entityStates, entities, map,
)
```

**なぜ**: テストと本番が同じコードパスを通ることを保証するため。
テストだけ通って本番でバグる、を防ぐ。

### 4. Effect 型は自動導出、switch は exhaustiveness check

```typescript
// types.ts — 手動 enum 禁止。Effect union から自動導出。
export type EffectType = Effect['type']

// engine.ts — 全 switch に default: never
default: {
  const _exhaustive: never = effect
  throw new Error(`Unknown effect type: ${(_exhaustive as Effect).type}`)
}
```

**なぜ**: 新しい Effect type を追加したとき、処理し忘れた箇所をコンパイラが検出する。

### 5. レイアウトスロットは `layout-` prefix

App.tsx のグリッドスロット: `layout-sidebar`, `layout-main`, `layout-detail`。
コンポーネント内部のクラス名: `entity-tree`, `location-view`, `detail-content`, `graph-view` 等。

名前空間が分かれているので衝突しない。コンポーネントは `layout-*` を使わない。

**なぜ**: 親のレイアウトクラスと子のルートクラスが同名だと二重ネストで表示が壊れる。
prefix で名前空間を分ければ、そもそも同じ名前になりようがない。

### 6. 1つの概念 = 1つのコンポーネント

同じ概念を2箇所で描画するなら、共通コンポーネントに抽出してから使う。

```
StateBadges    — クリッカブル状態バッジ（LocationView, DetailPanel で共用）
EffectPicker   — 効果選択UI（LiveEditor 内で共用）
ConditionPicker — 条件選択UI（LiveEditor 内で共用）
```

**なぜ**: 片方だけ変更してバグになるパターンを構造的に排除する。

### 7. 使われていないコードは書かない

hook が返す関数は、必ず1つ以上のコンポーネントで使われていること。
「将来使うかも」で書かない。必要になったら `mutateAndStabilize` パターンで追加する。

**なぜ**: デッドコードは認知負荷を上げ、「これ使っていいのか」の判断コストが発生する。

---

## Design Concepts

### Petri Net Semantics
- **Entity Tree**: All entities (locations, NPCs, items) in parent-child tree. parentId = containment.
- **Categories**: State axes. Exclusive (enum, one value) or non-exclusive (flags, multiple values).
- **Triggers**: Auto-fire rules. Condition (AND of clauses) → Effects. Chain until fixed point.
- **Actions**: Manual operations with display conditions, effects, and optional roll requirements.
- **Stabilize**: Scan all triggers, apply matching, repeat until no changes. MAX_STABILIZE_STEPS = 100.
- **References**: self, ancestor, descendant, sibling, named — resolve to entity IDs.

### Roll Judgment
エンジンはダイスを振らない。KPが成功/失敗を入力する。
- Success → base effects + successEffects
- Failure → failureEffects only
- Prerequisites (item possession) ≠ rolls (skill checks). 別の概念。

### Category Semantics
- Exclusive: single string value, `setCategory` replaces
- Non-exclusive: string array, `setCategory` adds, `removeCategory` removes

### Stabilize Semantics
- Triggers only record as "fired" when effects actually change state (or firedOnce)
- No-op triggers don't count as changes — prevents infinite loops from idempotent rules
- `reachedFixedPoint: false` signals oscillation (MAX_STABILIZE_STEPS reached)

---

## Adding New Features — Checklist

新しい操作を追加するとき:
1. WorldState を変える？ → `mutateAndStabilize` を使う
2. Scenario だけ変える？ → `mutateScenario` を使う
3. 新しい Effect type？ → `Effect` union に追加 → `applyEffect` の switch に追加（never が強制）
4. 新しいUI表示？ → 既存コンポーネントで表現できないか確認 → 新規なら共通コンポーネント化
5. テスト書く？ → `applyEffect` 経由で状態変更。直接 `categoryValues` 操作は禁止
