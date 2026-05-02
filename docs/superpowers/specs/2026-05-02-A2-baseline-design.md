# A-2: ベースライン比較（計画 vs 実績）設計書

> 作成日: 2026-05-02

## 概要
既存スナップショットを「ベースライン」に指定し、ガント上に半透明の計画バーを重ねて遅れを可視化する。

## DB変更
```sql
ALTER TABLE project_snapshots ADD COLUMN is_baseline BOOLEAN NOT NULL DEFAULT FALSE;
```
Alembic: `0012_add_snapshot_baseline.py`（A-1 が 0012 を使う場合は 0013）

## API
```
POST   /api/v1/projects/{id}/snapshots/{snap_id}/baseline  # 設定（他をリセット）
DELETE /api/v1/projects/{id}/snapshots/{snap_id}/baseline  # 解除
GET    /api/v1/projects/{id}/snapshots                     # 既存（is_baseline フィールド追加）
```

## ファイル変更
| ファイル | 変更 |
|---------|------|
| `backend/alembic/versions/0013_add_snapshot_baseline.py` | 新規 migration |
| `backend/app/models/snapshot.py` | `is_baseline` フィールド追加 |
| `backend/app/routers/snapshots.py` | baseline 設定・解除エンドポイント追加 |
| `backend/app/schemas/snapshot.py` | `is_baseline` フィールド追加 |
| `frontend/src/api.js` | setBaseline / unsetBaseline 追加 |
| `frontend/src/components/schedule/HistoryPanel.jsx` | 各スナップに「ベースラインに設定」ボタン追加 |
| `frontend/src/components/schedule/GanttBars.jsx` | ベースラインバー（半透明）描画追加 |
| `frontend/src/components/schedule/GanttChart.jsx` | `showBaseline` state、ベースラインデータ fetch・切替トグル |
| `frontend/src/styles/app.css` | ベースラインバースタイル |

## ベースラインバーの表示仕様
- 通常バーの背後に `opacity: 0.35`、ストライプハッチング、同じ位置に描画
- `tasks_json` をパースし、タスク名でマッチング（ID が変わっていても名前が同じなら対応）
- ツールバー Menu に「📊 ベースライン比較: ON/OFF」トグル追加（ベースライン設定時のみ表示）
- タスクが追加された場合（ベースラインにない）: ベースラインバーなし
- タスクが削除された場合（現在にない）: ベースラインバーのみ薄く表示

## HistoryPanel UI
- 各スナップショット行に「📌 ベースライン設定」ボタン追加
- 設定済みの行は「📌 解除」表示
