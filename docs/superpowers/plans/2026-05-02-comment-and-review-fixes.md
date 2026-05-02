# コメント機能実装 + コードレビュー修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** タスクへの時系列コメント機能を追加し、コードレビューで指摘された4件の不具合を修正する。

**Architecture:** DB/ORM/スキーマ/フロントコンポーネント/CSS はすでに存在する。今回追加するのはバックエンドAPIルート3本とフロントエンド配線のみ。コードレビュー修正は start.bat・create_sample_data.py・top-screen.js の計4箇所。

**Tech Stack:** Python/FastAPI, SQLAlchemy, pytest, React/JSX, Vite

---

## ファイルマップ

| 操作 | ファイル |
|------|---------|
| Modify | `backend/app/routers/tasks.py` — コメント3エンドポイント追加 |
| Modify | `backend/tests/test_tasks.py` — コメントCRUDテスト追加 |
| Modify | `frontend/src/components/schedule/TaskDetailPanel.jsx` — 💬ボタン追加 |
| Modify | `frontend/src/components/schedule/GanttChart.jsx` — CommentPopover 配線 |
| Modify | `start.bat` — ファイアウォール失敗メッセージ + 172.x範囲修正 |
| Modify | `docs/create_sample_data.py` — セッション管理修正 |
| Modify | `frontend/js/top-screen.js` — 二重セミコロン修正 |

---

## Task 1: コードレビュー修正（start.bat / create_sample_data.py / top-screen.js）

**Files:**
- Modify: `start.bat`
- Modify: `docs/create_sample_data.py`
- Modify: `frontend/js/top-screen.js`

- [ ] **Step 1: start.bat — ファイアウォール失敗時のメッセージ追加**

`start.bat` の該当ブロックを以下に置き換える（管理者権限なしで失敗したときに
「NOTE: run as Admin...」を表示する）:

```bat
rem -- Open port 8000 in Windows Firewall (silently, requires admin rights) --
netsh advfirewall firewall show rule name="opeSchedule port 8000" >nul 2>&1
if errorlevel 1 (
    netsh advfirewall firewall add rule name="opeSchedule port 8000" ^
        dir=in action=allow protocol=TCP localport=8000 >nul 2>&1
    if not errorlevel 1 (
        echo  Firewall rule added for port 8000.
    ) else (
        echo  NOTE: Could not add firewall rule ^(run as Admin to allow LAN access^).
    )
)
```

- [ ] **Step 2: start.bat — 172.x IP 範囲を RFC 1918 に絞る**

172.x の `for /f` 行を以下に置き換え（Docker/WSL2 の 172.17.x.x 等を除外）:

```bat
for /f "tokens=2 delims=:" %%I in ('ipconfig ^| findstr "172.16. 172.17. 172.18. 172.19. 172.20. 172.21. 172.22. 172.23. 172.24. 172.25. 172.26. 172.27. 172.28. 172.29. 172.30. 172.31." 2^>nul') do (
    set "LAN_IP=%%I"
    goto :got_ip
)
```

- [ ] **Step 3: create_sample_data.py — セッション管理をコンテキストマネージャに変更**

グローバル `db = SessionLocal()` を削除し、全コードを `with SessionLocal() as db:` ブロックで囲む。
例外発生時に自動ロールバックされるよう `try/except` を追加する:

```python
with SessionLocal() as db:
    try:
        # ... (既存のプロジェクト/タスク作成コード全体) ...
        db.commit()
        print("\n✅ サンプルデータ作成完了!")
        # ... print statements ...
    except Exception:
        db.rollback()
        raise
```

- [ ] **Step 4: top-screen.js — 二重セミコロン修正**

`frontend/js/top-screen.js` の25行目 `});;` を `});` に変更する。

- [ ] **Step 5: コミット**

```bash
git add start.bat docs/create_sample_data.py frontend/js/top-screen.js
git commit -m "fix: code review issues (firewall msg, 172.x range, sample data session, double semicolon)"
```

---

## Task 2: バックエンド — コメントAPIエンドポイント

**Files:**
- Modify: `backend/app/routers/tasks.py`

- [ ] **Step 1: 失敗するテストを先に書く**

`backend/tests/test_tasks.py` の末尾に追記:

```python
# ── Comment tests ──────────────────────────────────────────────────────────

@pytest.fixture
def task(client, project):
    pid = project["id"]
    r = client.post(
        f"/api/v1/projects/{pid}/tasks",
        json={"name": "Task A", "start_date": "2026-06-01", "end_date": "2026-06-05"},
    )
    return r.json()


def test_list_comments_empty(client, project, task):
    pid, tid = project["id"], task["id"]
    res = client.get(f"/api/v1/projects/{pid}/tasks/{tid}/comments")
    assert res.status_code == 200
    assert res.json() == []


def test_create_and_list_comment(client, project, task):
    pid, tid = project["id"], task["id"]
    res = client.post(
        f"/api/v1/projects/{pid}/tasks/{tid}/comments",
        json={"text": "Hello comment"},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["text"] == "Hello comment"
    assert data["task_id"] == tid

    lst = client.get(f"/api/v1/projects/{pid}/tasks/{tid}/comments").json()
    assert len(lst) == 1
    assert lst[0]["id"] == data["id"]


def test_delete_comment(client, project, task):
    pid, tid = project["id"], task["id"]
    cid = client.post(
        f"/api/v1/projects/{pid}/tasks/{tid}/comments",
        json={"text": "to delete"},
    ).json()["id"]

    res = client.delete(f"/api/v1/projects/{pid}/tasks/{tid}/comments/{cid}")
    assert res.status_code == 204

    lst = client.get(f"/api/v1/projects/{pid}/tasks/{tid}/comments").json()
    assert lst == []


def test_delete_comment_not_found(client, project, task):
    pid, tid = project["id"], task["id"]
    res = client.delete(f"/api/v1/projects/{pid}/tasks/{tid}/comments/99999")
    assert res.status_code == 404


def test_create_comment_blank_text(client, project, task):
    pid, tid = project["id"], task["id"]
    res = client.post(
        f"/api/v1/projects/{pid}/tasks/{tid}/comments",
        json={"text": "   "},
    )
    assert res.status_code == 422
```

- [ ] **Step 2: テストが失敗することを確認**

```
cd backend
pytest tests/test_tasks.py::test_list_comments_empty -v
```

Expected: `FAILED` — 404 or connection error (route does not exist yet)

- [ ] **Step 3: tasks.py にコメントエンドポイントを追加**

`backend/app/routers/tasks.py` の先頭 import を更新:

```python
from app.models.task import Task, TaskComment, TaskDependency
from app.schemas.task import (
    TaskCreate, TaskCommentCreate, TaskCommentResponse,
    TaskDateUpdate, TaskReorderItem, TaskResponse, TaskUpdate,
)
```

ファイル末尾（`delete_task` の後）に以下を追記:

```python
# ── Comments ──────────────────────────────────────────────────────────────

@router.get(
    "/projects/{project_id}/tasks/{task_id}/comments",
    response_model=list[TaskCommentResponse],
)
def list_comments(project_id: int, task_id: int, db: Session = Depends(get_db)) -> list[TaskComment]:
    get_or_404(db, Project, project_id, "Project not found")
    task = get_or_404(db, Task, task_id, "Task not found")
    _check_task_in_project(task, project_id)
    return db.query(TaskComment).filter(TaskComment.task_id == task_id).order_by(TaskComment.created_at).all()


@router.post(
    "/projects/{project_id}/tasks/{task_id}/comments",
    response_model=TaskCommentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_comment(
    project_id: int, task_id: int, payload: TaskCommentCreate, db: Session = Depends(get_db)
) -> TaskComment:
    if not payload.text.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="text must not be blank")
    get_or_404(db, Project, project_id, "Project not found")
    task = get_or_404(db, Task, task_id, "Task not found")
    _check_task_in_project(task, project_id)
    comment = TaskComment(task_id=task_id, text=payload.text.strip())
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


@router.delete(
    "/projects/{project_id}/tasks/{task_id}/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_comment(
    project_id: int, task_id: int, comment_id: int, db: Session = Depends(get_db)
) -> None:
    get_or_404(db, Project, project_id, "Project not found")
    task = get_or_404(db, Task, task_id, "Task not found")
    _check_task_in_project(task, project_id)
    comment = get_or_404(db, TaskComment, comment_id, "Comment not found")
    if comment.task_id != task_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    db.delete(comment)
    db.commit()
```

- [ ] **Step 4: テストがパスすることを確認**

```
cd backend
pytest tests/test_tasks.py -v -k "comment"
```

Expected: 全テスト PASSED

- [ ] **Step 5: 全テストがパスすることを確認**

```
cd backend
pytest tests/ -v
```

Expected: 全テスト PASSED（既存テストへの回帰なし）

- [ ] **Step 6: コミット**

```bash
git add backend/app/routers/tasks.py backend/tests/test_tasks.py
git commit -m "feat: add comment CRUD API endpoints (list/create/delete)"
```

---

## Task 3: フロントエンド — CommentPopover を GanttChart に配線

**Files:**
- Modify: `frontend/src/components/schedule/TaskDetailPanel.jsx`
- Modify: `frontend/src/components/schedule/GanttChart.jsx`

- [ ] **Step 1: TaskDetailPanel に「💬 コメント」ボタンを追加**

`TaskDetailPanel.jsx` の props に `onOpenComments` を追加し、form-actions の中にボタンを追加する。

props 行を変更:
```jsx
export default function TaskDetailPanel({ task, allTasks, currentPid, criticalTaskIds, isMultiMode, anchorEl, onClose, onUpdated, onDeleted, onOpenComments, commentCount }) {
```

`form-actions` ブロック（`!isMultiMode` の条件内）を以下に変更:
```jsx
{!isMultiMode && (
  <div className="form-actions">
    <button type="submit" className="btn btn--primary">Save</button>
    <button type="button" className="btn btn--secondary" onClick={handleDuplicate}>複製</button>
    <button
      type="button"
      className="btn btn--secondary"
      onClick={() => onOpenComments?.(task)}
      title="コメントを表示/追加"
    >
      💬{commentCount > 0 ? ` (${commentCount})` : ''}
    </button>
    <button type="button" className="btn btn--danger" onClick={handleDelete}>Delete</button>
  </div>
)}
```

- [ ] **Step 2: GanttChart.jsx に CommentPopover 配線を追加**

ファイル先頭の import に追加:
```jsx
import CommentPopover from './CommentPopover.jsx';
```

`GanttChart` コンポーネント内の state 宣言部に追加（`detailTask` の近く）:
```jsx
const [commentTask, setCommentTask]   = useState(null);
const [commentCounts, setCommentCounts] = useState({});
```

`TaskDetailPanel` の props に追加:
```jsx
onOpenComments={(t) => setCommentTask(t)}
commentCount={commentCounts[detailTask?.id] ?? 0}
```

`TaskDetailPanel` の直後（`</div>` の前）に追加:
```jsx
{commentTask && (
  <CommentPopover
    task={commentTask}
    currentPid={currentPid}
    anchorEl={detailAnchor}
    onClose={() => setCommentTask(null)}
    onCountChange={(tid, count) =>
      setCommentCounts(prev => ({ ...prev, [tid]: count }))
    }
  />
)}
```

- [ ] **Step 3: フロントエンドをビルド**

```
cd frontend
npm run build
```

Expected: ビルド成功（エラーなし）

- [ ] **Step 4: コミット**

```bash
git add frontend/src/components/schedule/TaskDetailPanel.jsx
git add frontend/src/components/schedule/GanttChart.jsx
git add frontend/dist
git commit -m "feat: wire CommentPopover into GanttChart via TaskDetailPanel button"
```

---

## Task 4: design.md 更新 & push

- [ ] **Step 1: docs/design.md のAPI Summaryを更新**

`docs/design.md` の API Summary セクションにコメントエンドポイントを追記:
```
GET/POST                    /api/v1/projects/{id}/tasks/{task_id}/comments
DELETE                      /api/v1/projects/{id}/tasks/{task_id}/comments/{comment_id}
```

- [ ] **Step 2: コミット & push**

```bash
git add docs/design.md
git commit -m "docs: update design.md with comment API endpoints"
git push origin main
```
