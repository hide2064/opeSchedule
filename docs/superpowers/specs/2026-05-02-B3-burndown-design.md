# B-3: カテゴリ別バーンダウンチャート設計書

> 作成日: 2026-05-02

## 概要
スナップショット履歴と現在データから大項目別の進捗推移を折れ線グラフで表示する。

## DB変更
なし（既存 `project_snapshots.tasks_json` を活用）

## ライブラリ
- `recharts`（npm）: react-native 対応、軽量、TypeScript不要
- `npm install recharts`

## API
既存の `GET /api/v1/projects/{id}/snapshots` を利用。`tasks_json` から進捗を計算。

## UI
- GanttChart ツールバー Menu に「📈 進捗チャート」アイテムを追加
- クリックで `BurndownModal.jsx` を開く（モーダル表示）
- X軸: スナップショット作成日（+現在）
- Y軸: 各大項目の完了率（%）
- 凡例: 大項目名（色はプロジェクトカラーのバリエーション）
- スナップショットが0件の場合: 「スナップショットがまだありません。バージョンUPを行うと履歴が蓄積されます。」

## データ計算
各スナップショットの `tasks_json` をパース:
```js
const snap_progress = tasks
  .filter(t => t.task_type === 'task')
  .reduce((acc, t) => {
    const lg = t.category_large || '未分類';
    if (!acc[lg]) acc[lg] = { total: 0, done: 0 };
    acc[lg].total++;
    if (t.progress >= 1.0) acc[lg].done++;
    return acc;
  }, {});
// 各大項目の完了率 = done/total * 100
```
現在値は tasks state から同じ計算で算出。

## ファイル変更
| ファイル | 変更 |
|---------|------|
| `frontend/src/components/schedule/BurndownModal.jsx` | 新規: チャートモーダル |
| `frontend/src/components/schedule/GanttChart.jsx` | Menu に「📈 進捗チャート」追加、showBurndown state |
| `frontend/src/styles/app.css` | BurndownModal スタイル |
