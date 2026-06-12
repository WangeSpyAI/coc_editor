# TRPGシナリオエディタ: プロトタイプTS化 + コンポーネント分割

## スコープ

プロトタイプv8b（640行JSX単一ファイル）を、TypeScript化しコンポーネント分割する。機能追加なし。見た目・動作はプロトタイプと同一。

## 技術スタック

- React 19 + TypeScript 5.8 + Vite 6（既存）
- Zustand（状態管理、新規追加）
- スタイリング: インラインスタイル維持、カラー定数を theme.ts に切り出し

## ディレクトリ構成

```
src/
  types/
    model.ts          — Entity, Category, Action, Trigger, Party, Effect, Condition等
  engine/
    tree.ts           — getChildren, getDescendants, findPCs
    conditions.ts     — entityHasValue, evaluateCondition, isActionAvailable, isLocationAccessible
    effects.ts        — applyEffect, wouldChange
    stabilize.ts      — runStabilize
    projection.ts     — computeProjection, computeFullProjection
    pending.ts        — computePending
  store/
    scenarioStore.ts  — entities, parties, history, descLog + 全アクション
  theme.ts            — カラー定数C, フォント, 共通スタイル
  data/
    sampleScenario.ts — createScenario, createInitialParties, templates
  components/
    TreePane.tsx       — TreeNode + ツリーペイン全体(追加UI含む)
    PartyBar.tsx       — パーティ選択・分割・合流
    SceneView.tsx      — 場面描写 + ナビゲーション + アクションボタン + 状態 + 編集パネル
    EditPanel.tsx      — EditEntityPanel, CatEditor, CatAdder
    ActionEditor.tsx   — ActionEditor, ActionAdder, CondAdder, TriggerAdder
    LogPane.tsx        — ミニログ + LogPanel
    PendingPanel.tsx   — 待機中トリガー
    HistoryPanel.tsx   — 実行履歴 + undo
    common/
      AddRow.tsx       — 汎用追加行コンポーネント
  App.tsx              — 3ペインレイアウトのみ
```

## データフロー

```
ユーザー操作 → コンポーネント → store アクション → engine 純粋関数 → state 更新 → 再レンダリング
```

## 方針

- engine/ はUI非依存。React import なし。純粋関数 + 型のみ。
- store は1つ。scenarioStore.ts に全状態集約。
- App.tsx はレイアウトシェルのみ。ロジックはストアに委譲。
- プロトタイプと見た目・動作は同一。リグレッションなし。

## 元ファイルとの対応

| プロトタイプ行 | 分割先 |
|---|---|
| L8-18 (C, font, clone, uid) | theme.ts, engine内ユーティリティ |
| L22-71 (ENGINE) | engine/*.ts |
| L74-76 (SCENARIO) | data/sampleScenario.ts |
| L78-83 (STYLES) | theme.ts |
| L85-92 (AddRow) | components/common/AddRow.tsx |
| L95-193 (EditEntityPanel) | components/EditPanel.tsx |
| L195-331 (CatEditor等) | components/EditPanel.tsx, ActionEditor.tsx |
| L334-349 (TreeNode) | components/TreePane.tsx |
| L351-473 (MainPanel) | components/SceneView.tsx |
| L475-511 (Pending/Log/History) | components/PendingPanel.tsx, LogPane.tsx, HistoryPanel.tsx |
| L514-639 (App) | store/scenarioStore.ts + App.tsx |
