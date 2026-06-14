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

## 作業スタイル（Claude Fable 5 公式プロンプトガイド準拠）

Claude Fable 5 は 2026-06-12 に米商務省指令で停止された（Opus 4.8 が公式フォールバック）。
本リポジトリでの作業はモデルを問わず、Fable 5 公式プロンプトガイドの作業規律を採用する。
出所不明の「流出システムプロンプト」は採用しない（あれは claude.ai 消費者向け製品仕様であり、
コーディング作業の品質を下げる）。採用するのは挙動規律のみ。

- **結論先行。** 完了後の第一文は「何が起きたか／何が分かったか」。詳細と理由は後。
  簡潔さより可読性。短くするのは情報の取捨選択で行い、矢印連鎖・断片・隠語に圧縮しない。
- **十分な情報があれば動く。** 確定済みの事実を再導出しない。決定済みの判断を蒸し返さない。
  採らない選択肢をユーザー向けに列挙しない。
- **スコープ厳守。** 要求された以上の機能追加・リファクタ・抽象化をしない。バグ修正に周辺整理を足さない。
  起こり得ないケースのエラー処理・フォールバックを書かない。検証は境界（ユーザー入力・外部API）でのみ。
- **進捗主張はツール結果で裏取り。** 未検証なら「未検証」と明言。テスト失敗は出力付きで報告し、
  スキップした手順はそう言い、完了・検証済みは率直に断言する（このプロジェクトの Stop フックは
  実態と無関係に失敗を報告することがある＝必ず自分でテストを回して確認する）。
- **問題提示・質問・思考整理への成果物は「評価」。** 修正は求められてから。状態を変えるコマンド前に、
  証拠がその行動を支持するか確認する。
- **独立サブタスクは Codex に委譲し並行で進める。** 脱線・文脈不足があれば介入。委譲先の成果は
  テスト／ビルド／lint で検証してから Claude 側がコミットする。
- **メモリ。** 1ファイル1教訓＋一行要約。訂正も確認済み手法も理由付きで記録。既存更新を優先し、誤りは削除。
- **自己検証は明示的に。** 長時間タスクでは新規コンテキストの検証サブエージェントが自己批判に勝る。
- **ポーズは本当に必要な時だけ。** 破壊的・不可逆操作、真のスコープ変更、ユーザーにしか出せない入力。
  それ以外の可逆操作は確認せず進める。最後の段落が計画・質問・約束で終わるなら、その作業を今ツールで
  実行してからターンを終える。

## What This Is

ペトリネット意味論に基づくシナリオエディタ。
エンティティツリー・カテゴリ・トリガー・アクションで世界を定義し、
stabilize（不動点計算）で因果連鎖を自動解決する。

## Architecture

### Core Engine (`src/core/`)
Pure functions. Framework-independent. Fully testable with Vitest.

- `types.ts` — Entity, Category, Trigger, Action, Effect, WorldState, Scenario
- `engine.ts` — Tree operations, condition evaluation, effect application, stabilize
- `persistence.ts` — Session serialization / revival seam
- `sampleScenario.ts` — Demo scenario for development

### UI Layer (`src/ui/`, `src/hooks/`)
React + TypeScript. Components access engine through `useScenario` hook.

- `hooks/useScenario.ts` — Engine wrapper with React state, localStorage persistence, full CRUD
- `ui/App.tsx` — App shell: landing/import/export, layout slots, hook wiring
- `ui/EntityTree.tsx` — Collapsible tree sidebar and template entity creation
- `ui/EntityPanel.tsx` — Scene view, inline entity/category/action/trigger editing
- `ui/PartyBar.tsx` — Party selection, split/merge, member removal
- `ui/LiveEditor.tsx` — Real-time scenario authoring during play
- `ui/LogPane.tsx` — Description log display/copy controls
- `ui/PendingPanel.tsx` — Pending trigger dropdown/list
- `ui/StateBadges.tsx` — Clickable state badges (single-source component)
- `ui/format.ts` — Shared human-readable formatting helpers

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
  applyEffect(effect, selfId, actorId?): boolean  // Effect 適用（$actor 解決）
  fireAction(actionId, actorId?, rollResult?): boolean  // アクション発火
  initEntity(entityId, parentId, categoryValues): void  // エンティティ初期化
  log(type, sourceEntityId, description, actorId?): void  // ログ追加
  setParties(parties, activePartyId): void              // パーティ編成差し替え
}
```

**なぜ**: `entityStates[x].categoryValues[y] = z` と書く道がそもそもない。
stabilize 忘れも不可能。undo忘れも不可能。「気をつける」に依存しない。

`mutateAndStabilize` は `reconcileWorldWithScenario` の唯一のチョークポイントでもある。
シナリオ縮小後の ghost entityStates / party memberIds / locationId / activePartyId は、
stabilize 前にここで必ず掃除する。

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

App.tsx のグリッドスロット: `layout-sidebar`, `layout-main`, `layout-log`。
コンポーネント内部のクラス名: `entity-tree`, `entity-panel`, `party-bar`, `log-pane` 等。

名前空間が分かれているので衝突しない。コンポーネントは `layout-*` を使わない。

**なぜ**: 親のレイアウトクラスと子のルートクラスが同名だと二重ネストで表示が壊れる。
prefix で名前空間を分ければ、そもそも同じ名前になりようがない。

### 6. 1つの概念 = 1つのコンポーネント

同じ概念を2箇所で描画するなら、共通コンポーネントに抽出してから使う。

```
StateBadges           — クリッカブル状態バッジ（EntityPanel 内の状態表示で共用）
EntityTemplateCreator — エンティティ作成テンプレート（EntityTree, LiveEditor で共用）
EffectRowsEditor      — 効果編集UI（LiveEditor, EntityPanel のフォームで共用）
ConditionRowsEditor   — 条件編集UI（アクション/トリガーフォームで共用）
```

**なぜ**: 片方だけ変更してバグになるパターンを構造的に排除する。

### 7. 使われていないコードは書かない

hook が返す関数は、必ず1つ以上のコンポーネントで使われていること。
「将来使うかも」で書かない。必要になったら `mutateAndStabilize` パターンで追加する。

**なぜ**: デッドコードは認知負荷を上げ、「これ使っていいのか」の判断コストが発生する。

### 8. ログ追加は pushLog 経由のみ

ログエントリを直接 `worldState.log.push(...)` しない。
`MutationAPI.log` もエンジン内部も `pushLog` を通る。

**なぜ**: `timestamp` / `at` / actorId の付け忘れを構造で塞ぐ。

### 9. 永続化の継ぎ目は persistence.ts だけ

localStorage 保存、ファイルエクスポート、インポート復元は `serializeSession` / `reviveSession` を通す。
`lastResult` は一時的な stabilize レポートなので永続化しない。

**なぜ**: 「保存できるが読み込めない」形式乖離と、実行結果スナップショットのマイグレーション漏れを防ぐ。

---

## Design Concepts

### Petri Net Semantics
- **Entity Tree**: All entities (locations, NPCs, items) in parent-child tree. parentId = containment.
- **Categories**: State axes. Exclusive (enum, one value) or non-exclusive (flags, multiple values).
- **Triggers**: Auto-fire rules. Condition (AND of clauses) → Effects. Chain until fixed point.
- **Actions**: Manual operations with display conditions, effects, and optional roll requirements.
- **Stabilize**: Scan all triggers, apply matching, repeat until no changes. MAX_STABILIZE_STEPS = 100.
- **References**: self, ancestor, descendant, sibling, named — resolve to entity IDs.
- **Parties**: Live in `WorldState`, not scenario schema. Undo and persistence cover party split/merge/move automatically.
- **$actor**: In Effects, named target `$actor` resolves to actor entity ID; move destination `$actor` resolves to actor entity ID; set/remove category value `$actor` resolves to actor name.

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
