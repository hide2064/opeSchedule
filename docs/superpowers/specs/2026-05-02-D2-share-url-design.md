# D-2: 読み取り専用共有URL設計書

> 作成日: 2026-05-02

## 概要
UUIDトークン付きURLでガントチャートを外部に閲覧共有する。認証不要、編集不可。

## DB変更
```sql
ALTER TABLE projects ADD COLUMN share_token VARCHAR(36) UNIQUE;
```
Alembic: `0016_add_project_share_token.py`

## API
```
POST    /api/v1/projects/{id}/share     # トークン生成（uuid4）
DELETE  /api/v1/projects/{id}/share     # トークン無効化（NULL に）
GET     /api/v1/share/{token}           # プロジェクト情報 + タスク一覧（認証不要）
```
- `POST /share` → `{share_url: "http://host/share/{token}", token: "..."}`
- `GET /share/{token}` → `{project: ProjectResponse, tasks: list[TaskResponse]}`

## フロントエンド
### ルーティング
- `/share/{token}` → `ShareScreen.jsx`（新規コンポーネント）
- `App.jsx` に Route 追加

### ShareScreen
- `GET /api/v1/share/{token}` でデータ取得
- `GanttChart` を `isReadOnly=true` prop で表示
- ヘッダーに「🔒 読み取り専用」バナー表示
- `+ Add Task`・Menu ボタン・`?` ボタン非表示

### GanttChart の isReadOnly 対応
- `isReadOnly` prop を追加（デフォルト false）
- `isReadOnly=true` 時: タスク詳細パネルの Save/Delete/複製ボタン非表示、ドラッグ無効

### 共有ボタン UI
- ProjectModal の「編集」ダイアログに「🔗 共有リンク」セクション追加
- 「リンク生成」ボタン → URL 表示 + クリップボードコピー
- 「リンク無効化」ボタン

## ファイル変更
| ファイル | 変更 |
|---------|------|
| `backend/alembic/versions/0016_add_project_share_token.py` | 新規 migration |
| `backend/app/models/project.py` | `share_token` フィールド追加 |
| `backend/app/schemas/project.py` | `share_token` フィールド追加 |
| `backend/app/routers/share.py` | 新規: share エンドポイント |
| `backend/app/main.py` | share router 登録 |
| `backend/app/routers/__init__.py` | share 追加 |
| `frontend/src/App.jsx` | `/share/:token` Route 追加 |
| `frontend/src/components/share/ShareScreen.jsx` | 新規: 読み取り専用ガント |
| `frontend/src/components/top/ProjectModal.jsx` | 共有リンク UI 追加 |
| `frontend/src/components/schedule/GanttChart.jsx` | `isReadOnly` prop 追加 |
| `frontend/src/components/schedule/TaskDetailPanel.jsx` | `isReadOnly` 対応 |
| `frontend/src/api.js` | generateShareLink / revokeShareLink / getSharedProject 追加 |
| `frontend/src/styles/app.css` | 共有バナースタイル |
