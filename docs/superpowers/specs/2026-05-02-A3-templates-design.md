# A-3: タスクテンプレート設計書

> 作成日: 2026-05-02

## 概要
よく使う工程構成をテンプレートとして保存・展開する。AddTaskModal にタブを追加。

## DB変更
```sql
CREATE TABLE task_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  tasks_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```
Alembic: `0014_add_task_templates.py`

## tasks_json 形式
```json
[
  {
    "name": "要件定義",
    "category_large": "Phase1",
    "category_medium": "要件",
    "relative_start_days": 0,
    "duration_days": 5,
    "task_type": "task"
  },
  ...
]
```

## API
```
GET/POST       /api/v1/templates
GET/DELETE     /api/v1/templates/{id}
POST           /api/v1/projects/{id}/tasks/apply_template
```
- `apply_template` body: `{template_id, base_date}` → テンプレートのタスクを base_date 基準で一括作成
- レスポンス: 作成されたタスク一覧

## UI フロー
1. AddTaskModal に「📋 テンプレート」タブ追加
2. テンプレート一覧を表示（名前・タスク数・説明）
3. テンプレート選択 → 開始日を指定 → 「展開」ボタン
4. 展開後: 作成件数をトーストで表示

### テンプレート保存機能
- Config タブ（または Top 画面）に「現在のプロジェクトをテンプレートとして保存」ボタン
- 名前・説明を入力して保存

## ファイル変更
| ファイル | 変更 |
|---------|------|
| `backend/app/models/template.py` | 新規: TaskTemplate ORM |
| `backend/app/schemas/template.py` | 新規: スキーマ |
| `backend/app/routers/templates.py` | 新規: CRUD + apply |
| `backend/app/main.py` | router 登録 |
| `backend/app/routers/__init__.py` | templates 追加 |
| `backend/tests/test_templates.py` | 新規: テスト |
| `frontend/src/api.js` | テンプレート API 追加 |
| `frontend/src/components/schedule/AddTaskModal.jsx` | テンプレートタブ追加 |
| `frontend/src/components/top/ConfigPanel.jsx` | テンプレート保存ボタン追加 |
| `frontend/src/styles/app.css` | テンプレートリストスタイル |
