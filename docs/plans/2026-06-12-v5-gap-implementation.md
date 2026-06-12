# v5仕様ギャップ実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** coc_editor を「実際にキーパリングとシナリオ執筆に使える段階」へ — v5仕様の不足14項目を実装する。

**Architecture:** 既存のペトリネット型エンジン (src/core/, 純粋関数) + useScenario フック (状態更新3プリミティブ) + React UI の構造を維持。エンジン→フック→UI の順に段階実装。パーティは WorldState 内に置く (undo/永続化/エクスポートが自動で揃う)。

**Tech Stack:** React 19 + TypeScript + Vite + Vitest (既存のまま、依存追加なし)

**全タスク共通の制約 (リポジトリ CLAUDE.md の不変条件):**
- 状態更新は `commitMutation` / `lifecycleReset` / `selectEntity` の3プリミティブ経由のみ
- UI層は `ReadonlyWorldState` のみ参照。状態変更は useScenario コールバック経由
- `categoryValues` の直接操作禁止 (テスト含む)。`applyEffect` 経由
- Effect 型は自動導出、switch は exhaustiveness check
- エンジン (src/core/) に React import 禁止
- TDD: テスト先行 → 失敗確認 → 実装 → 通過確認 → コミット
- バグ修正にはコード修正だけでなく構造的再発防止をセットにする

---

## Phase A: エンジン層 (純粋関数 + テスト)

### Task A1: カテゴリ値の静的描写と場面合成 (project)

**Files:** Modify: `src/core/types.ts`, `src/core/engine.ts`, Test: `src/core/__tests__/engine.test.ts`

- `Category` に `descriptions?: Record<string, string>` を追加 (選択肢値 → 描写テキスト)。旧データは undefined のままで動く (マイグレーション不要)。
- engine に `composeSceneDescription(entityId, worldState, scenario): { entityId: string; text: string }[]` を追加:
  1. 自身の `entity.description` が非空なら先頭に push
  2. 自身 + 子孫を木の深さ優先順 (childrenMap の登録順) で走査し、各エンティティのカテゴリ定義順に、現在値 (排他=単値、非排他=各値) が `descriptions` に描写を持てば push
  3. 描写を持たない値は出力しない (v5: 未発見アイテム等は自然に不可視)
- テスト: 描写あり/なし値の選別、非排他複数値、子孫の順序、エンティティ状態欠落時の安全性

### Task A2: $actor の Effect 内解決

**Files:** Modify: `src/core/engine.ts`, `src/hooks/useScenario.ts` (MutationAPI), Test: engine.test.ts

- `applyEffect(effect, selfId, states, entities, childrenMap, actorId?)` — 末尾に optional `actorId` を追加
- 解決規則 (テストで仕様化):
  - `target` が `{type:'named', entityId:'$actor'}` → actorId に置換 (actorId 無しなら対象なし=変更なし)
  - `MoveEffect.newParentId === '$actor'` → actorId (例: アイテムを行為者の手に移す)
  - `SetCategoryEffect.value === '$actor'` → 行為者エンティティの **名前** (表示用途。entities から lookup、見つからなければ actorId)
- `applyActionEffects` は全 applyEffect 呼び出し (effects / successEffects / failureEffects) に actorId を渡す
- MutationAPI.applyEffect にも optional actorId を追加
- トリガー effects には actor 概念がない → stabilize からの applyEffect は actorId なし (現状維持)

### Task A3: 場所の進入条件

**Files:** Modify: `src/core/types.ts`, `src/core/engine.ts`, Test: engine.test.ts

- `Entity.entryCondition?: TriggerCondition` を追加
- engine に `canEnter(entityId, worldState, scenario): boolean` — 条件なし→true、あれば selfId=対象場所で evaluateCondition
- テスト: 条件なし、充足、未充足、negate 条件

### Task A4: パーティの WorldState 統合と行為者候補

**Files:** Modify: `src/core/types.ts`, `src/core/engine.ts`, `src/hooks/useScenario.ts` (loadSession マイグレーション), Test: engine.test.ts

- `WorldState` に `parties: Party[]` と `activePartyId: string | null` を追加。`ReadonlyWorldState` に readonly 版を追加 (Party の readonly 型も定義)
- `initializeWorldState`: ラベル 'PC' を持つ全エンティティで デフォルトパーティ「パーティ」を作成 (locationId = 先頭PCの parentId、PCなしなら parties:[] / activePartyId:null)
- `loadSession` マイグレーション: parties / activePartyId が無い旧データに同ロジックで補完
- engine に `getEligibleActors(action, worldState, scenario): string[]`:
  - アクティブパーティのメンバーのうちラベル 'PC' のもの
  - `requiredItems`: 指定エンティティが PC の子孫 (getDescendants) であること
  - `requiredKnowledge`: PC のいずれかの categoryValue (配列なら includes、単値なら一致) に値が含まれること
  - isPlayerAction でないアクションには使わない (UI 側の責務)
- テスト: デフォルトパーティ生成、アイテム/知識による絞り込み、アクティブパーティなし→[]

### Task A5: ログの実時刻

**Files:** Modify: `src/core/types.ts`, `src/core/engine.ts`, `src/hooks/useScenario.ts`, Test: engine.test.ts (型レベル確認のみ)

- `LogEntry.at?: number` (epoch ms)。全 log push 箇所 (engine の stabilize / applyActionEffects、useScenario の api.log) で `at: Date.now()` を設定
- テストは at の存在のみ確認 (値は非決定的なので assert しない)

---

## Phase B: フック層 (useScenario)

### Task B1: パーティ操作と移動

**Files:** Modify: `src/hooks/useScenario.ts`, `src/ui/App.tsx` (doAction の actorId 'PC' ハードコード除去), Test: なし (フックはUI検証で担保。ロジックはエンジン側でテスト済み)

- `setActiveParty(partyId)` — worldState.activePartyId 変更 (mutateAndStabilize、ログ不要)
- `moveParty(locationId)` — ガード: canEnter が false なら何もしない。アクティブパーティ全メンバーに move effect (named target) を適用 → party.locationId 更新 → ログ2件: 'system' 「パーティが◯◯へ移動」+ 移動先の composeSceneDescription を結合した 'system' エントリ (v5: 移動先の場面描写もログに追加)
- `splitParty(memberIds, newName)` — アクティブパーティから指定メンバーを抜いて新パーティ作成 (同じ locationId)、新パーティをアクティブに
- `mergeParties(srcPartyId)` — src をアクティブパーティに統合 (同一 locationId のときのみ)。空になった src は削除
- `addToParty(entityId)` / `removeFromParty(entityId)` — NPC同行用。アクティブパーティ対象
- すべて mutateAndStabilize 経由 (parties は WorldState 内なので undo / 永続化が自動で効く)

### Task B2: 執筆・セッション支援コールバック

**Files:** Modify: `src/hooks/useScenario.ts`, `src/core/engine.ts` (必要なら resolveReference 利用のヘルパー), `src/ui/App.tsx` (インポート分岐), Test: engine.test.ts (新エンジンヘルパーがあれば)

- `setCategoryValue`: 値が cat.options に無い場合、scenario の options に自動追加 (mutateAndStabilize の scenarioOverride で同一コミット。v5: 自由入力値は候補に加わる)
- `updateCategoryDef` の patch に `descriptions` を追加
- `updateAction(entityId, actionId, patch)` / `updateTrigger(entityId, triggerId, patch)` — 既存アクション/トリガーのインライン編集用 (schema変更。updateTrigger は新条件が即発火しうるので mutateAndStabilize)
- `updateEntity` の patch に `entryCondition` を追加
- `shareKnowledge(fromEntityId, toEntityId, categoryId, value)` — to 側の同名カテゴリに setCategory (to に同名カテゴリがなければ非排他で自動作成) + 'system' ログ「◯◯が△△に「値」を共有」
- `fulfillPendingClause(ownerEntityId, clause)` — 待機中トリガーのワンクリック付与: negate なし節のみ対象。reference を resolveReference で解決した先頭ターゲットに setCategory + 'system' ログ + stabilize
- `exportSession(): string` — `{ formatVersion: 1, scenario, worldState }` (firedTriggerIds は配列化、saveSession と同じシリアライズを共通関数に抽出)
- インポート: 既存 handleImport を拡張 — `{scenario, worldState}` 形なら セッション復元 (lifecycleReset)、素の Scenario 形なら従来通り初期化

---

## Phase C: UI層

### Task C1: 描写ログペイン (LogPane)

**Files:** Create: `src/ui/LogPane.tsx`, Modify: `src/ui/App.tsx`, `src/ui/styles.css`

- layout-main 下部に固定高 (約180px、折りたたみ可) のログペイン。常時表示 (エンティティ未選択でも)
- エントリ: 時刻 HH:MM (at から。無ければ #step)、種別アイコン (action ▶ / trigger ⚡ / system ・)、発生源エンティティ名、行為者名 (あれば)、描写テキスト、ホバーでコピーボタン (navigator.clipboard)
- 新エントリで自動スクロール。ヘッダに [全文コピー] (セッション記録としてテキスト整形)
- EntityPanel 内の既存「ログ」セクションは削除 (重複)

### Task C2: 場面ビュー化 (パーティバー / 場面描写 / ナビゲーション / 行為者選択 / 情報共有)

**Files:** Create: `src/ui/PartyBar.tsx`, Modify: `src/ui/EntityPanel.tsx`, `src/ui/EntityTree.tsx`, `src/ui/App.tsx`, `src/ui/styles.css`

- **PartyBar** (layout-main 最上部、セッション中常時表示): パーティタブ (クリックでアクティブ切替+その現在地へビュー移動)、メンバーチップ、[分割] (メンバー選択UI→新パーティ)、[合流] (同一場所のパーティがあるとき)、現在地名表示
- **EntityPanel (ラベル '場所' のエンティティのとき):**
  - 場面描写ブロック: composeSceneDescription の結合テキスト + [場面をコピー]
  - ナビゲーション行: connections + 同階層の '場所' ラベルエンティティをボタン表示。canEnter false は 🔒 + disabled (title に未充足条件)。クリック = moveParty + selectEntity。アクティブパーティがこの場所にいない場合は「⚠ パーティは◯◯にいます (閲覧中)」表示 (v5: ツリークリックは閲覧のみ)
  - アクションを「PL行動」「KP判断」にグループ分け (isPlayerAction)。PL行動: getEligibleActors が 2人以上→行為者ドロップダウン選択して実行、1人→自動、0人→disabled (理由表示)。doAction に選択 actorId を渡す
  - 情報共有セクション: この場所にアクティブパーティのPCが2人以上いるとき、非排他カテゴリの値の差分を「値: 持つ人 → 持たない人 [共有]」形式で列挙 (shareKnowledge)
- **EntityTree**: アクティブパーティの現在地に ● マーカー
- doAction の actorId ハードコードが残っていれば除去

### Task C3: 待機中トリガーのワンクリック付与と振動警告

**Files:** Modify: `src/ui/App.tsx`, `src/ui/styles.css` (必要なら Create: `src/ui/PendingPanel.tsx`)

- ヘッダの「待機中: N」をクリックで開閉するパネル化: 各項目 = トリガー名 / 所属エンティティ (クリックでジャンプ) / 未充足節の表示 / negate なし節には [付与 ▶] ボタン (fulfillPendingClause)
- エンティティ未選択時の中央リストにも [付与 ▶] を追加
- `session.lastResult.reachedFixedPoint === false` のときヘッダに赤い「⚠ トリガー振動の可能性」バッジ (title で説明)

### Task C4: テンプレートと効果GUI編集

**Files:** Modify: `src/ui/EntityTree.tsx`, `src/ui/LiveEditor.tsx`, `src/ui/EntityPanel.tsx`

- **テンプレート** (エンティティ追加UI = EntityTree の追加ボタンと LiveEditor の両方): 名前入力 + 種別ボタン [場所] [NPC] [PC] [アイテム] [空] でワンステップ作成。初期値 (v5仕様):
  - 場所: labels ['場所']
  - NPC: labels ['NPC'], カテゴリ 態度 (排他: 中立/友好/敵対, 初期 中立)
  - PC: labels ['PC'], カテゴリ 知識 (非排他), 状態異常 (非排他)。作成後アクティブパーティに自動参加 (addToParty)
  - アイテム: labels ['アイテム'], カテゴリ 状態 (排他: 未発見/発見済, 初期 未発見)
  - 空: labels []
  - 親 = 現在選択中のエンティティ (未選択ならルート)
- **効果GUI編集**: LiveEditor の効果入力を エンティティ/カテゴリ/値 のドロップダウン連動選択にする (現状を確認し、テキスト入力なら置換)。`$actor` も選択肢に含める (target と move 先)
- **アクション/トリガーのインライン編集**: EntityPanel のアクション/トリガーカードに ✎ ボタン → LiveEditor と同形式のフォームで updateAction / updateTrigger。アクションフォームに isPlayerAction / ロール条件 / 表示条件 / requiredItems / requiredKnowledge / 効果列 を含める
- **カテゴリ値の描写編集**: CategoryBlock の選択肢編集に、値ごとの描写テキスト入力を追加 (updateCategoryDef の descriptions)

### Task C5: サンプルシナリオ拡充とエクスポートUI

**Files:** Modify: `src/core/sampleScenario.ts`, `src/ui/App.tsx`

- サンプルに追加: 探索者B (PC)、知識カテゴリ (探索者A/B)、主要カテゴリ値に descriptions (書斎の雰囲気等)、地下室に entryCondition (書斎のドア=解錠 等)、アクションの isPlayerAction 適切化、requiredKnowledge を使う1アクション、$actor を使う1アクション (例: 日記を読む→行為者に知識付与+日記を行為者の手に)
- エクスポートボタン: 「シナリオのみ」「セッション込み」の2択 (ドロップダウン or 2ボタン)
- 全機能がサンプルで一通り試せること (D2 の通し検証の土台)

---

## Phase D: 検証とリリース

### Task D1: ドキュメント更新

**Files:** Modify: `CLAUDE.md`, `README.md`

- CLAUDE.md: 現存コンポーネント一覧に修正 (LocationView/DetailPanel/MapView/DependencyGraph は既に存在しない)、parties-in-WorldState / $actor 解決規則 / 進入条件 / 描写合成 を不変条件・アーキテクチャに追記
- README.md: Viteテンプレートの雛形を置換 — プロジェクト概要 (KP向けCoCシナリオエディタ)、設計思想 (v5仕様へのリンク)、使い方、開発コマンド、デプロイURL

### Task D2: 通し検証 (オーケストレーターが実施)

- preview で: 新規シナリオ作成 → テンプレートで場所/NPC/PC/アイテム作成 → カテゴリ・描写・アクション・トリガー執筆 → セッション: 移動/アクション発火/行為者選択/待機トリガー付与/情報共有/ログコピー → エクスポート/インポート復元 → undo
- 発見した問題は個別タスク化して修正

### Task D3: リリース

- 全テスト + build + push → GitHub Pages デプロイ確認 → 完了報告
