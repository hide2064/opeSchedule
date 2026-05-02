# A-1: 担当者（アサイン）管理 設計書

> 作成日: 2026-05-02

## 概要
タスクに担当者を割り当て、ガントバーにイニシャル表示・担当者フィルターを提供する。

## DB変更
```sql
CREATE TABLE members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(7) NOT NULL DEFAULT '#888888',
  email VARCHAR(200)
);
CREATE INDEX ix_members_project_id ON members(project_id);
ALTER TABLE tasks ADD COLUMN assignee_id INTEGER REFERENCES members(id) ON DELETE SET NULL;
```
Alembic: `0012_add_members_and_task_assignee.py`

## API
```
GET/POST       /api/v1/projects/{id}/members
PATCH/DELETE   /api/v1/projects/{id}/members/{mid}
```
- `GET /members` → `list[MemberResponse]`
- `POST /members` body: `{name, color?, email?}`
- `PATCH /members/{mid}` body: `{name?, color?, email?}`
- `DELETE /members/{mid}` → 204（担当タスクの assignee_id は SET NULL）
- `GET/PATCH /tasks` に `assignee_id` フィールドを追加

## ファイル変更
| ファイル | 変更 |
|---------|------|
| `backend/app/models/member.py` | 新規: Member ORM |
| `backend/app/schemas/member.py` | 新規: MemberCreate/Update/Response |
| `backend/app/routers/members.py` | 新規: CRUD エンドポイント |
| `backend/app/schemas/task.py` | TaskResponse に `assignee_id`, `assignee` フィールド追加 |
| `backend/app/routers/tasks.py` | import に Member 追加 |
| `backend/app/main.py` | members router 登録 |
| `backend/app/routers/__init__.py` | members 追加 |
| `backend/tests/test_members.py` | 新規: CRUD テスト |
| `frontend/src/api.js` | listMembers/createMember/updateMember/deleteMember 追加 |
| `frontend/src/components/top/ProjectModal.jsx` | メンバー管理 UI（追加・削除・色変更）追加 |
| `frontend/src/components/schedule/TaskDetailPanel.jsx` | 担当者ドロップダウン追加 |
| `frontend/src/components/schedule/GanttBars.jsx` | バー右端にイニシャル表示 |
| `frontend/src/components/schedule/ScheduleScreen.jsx` | メンバー一覧を fetch して GanttChart へ渡す |
| `frontend/src/components/schedule/GanttChart.jsx` | 担当者フィルター UI 追加 |
| `frontend/src/styles/app.css` | メンバーバッジ・フィルタースタイル |

## 担当者フィルター
- ヘッダー検索欄の隣に「担当者▾」ドロップダウンを配置
- 選択するとそのメンバーのタスクのみ表示（category_large グループは維持）
- `isMultiMode` のときはフィルター非表示

## イニシャル表示
- `member.name` の先頭1文字（英字は大文字、日本語はそのまま）
- バーの右端に 16px の円形バッジ（`member.color` 背景）
- バーの幅が 20px 未満の場合は非表示

## Import/Export
- JSON export に `members` 配列を追加
- import 時にメンバーも復元（name で重複チェック）
