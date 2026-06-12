# CoC TRPG Scenario Editor

ペトリネット意味論に基づく、KP向けのCoCシナリオエディタです。
場面中心でシナリオを扱い、PLへ渡す「描写」を成果物として残すことを重視しています。

設計思想とデータモデルは [docs/spec/trpg_scenario_editor_v5.md](docs/spec/trpg_scenario_editor_v5.md) を参照してください。
実装計画や検証メモは [docs/plans/](docs/plans/) にあります。

## 機能概要

### 執筆

- エンティティテンプレート: 場所 / NPC / PC / アイテム / 空
- カテゴリ定義と現在値編集
- アクション、トリガー、表示条件、ロール条件のインライン編集
- 付与 / 除去 / 移動の効果GUI編集
- カテゴリ値ごとの描写編集

### セッション

- パーティ移動と行為者選択
- 待機中トリガーの通知とワンクリック付与
- 描写ログの記録とコピー
- PC間の情報共有
- undo
- JSON保存: シナリオのみ / セッション込み

## 開発

```bash
npm install
npm run dev
npm test -- --run
npm run build
npm run lint
```

## デプロイ

GitHub Pages へのデプロイは `.github/workflows/deploy.yml` で行います。

公開URL: https://wangespyai.github.io/coc_editor/
