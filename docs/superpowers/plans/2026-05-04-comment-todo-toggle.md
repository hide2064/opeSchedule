# コメント Todo トグル機能 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** タスク詳細パネルにコメントセクションを追加し、各コメントに Todo トグル・完了トグル・インライン編集・削除を実装する

**Architecture:** バックエンドの `TaskComment` モデル・API は既存実装を利用。`TaskCommentUpdate` スキーマに `is_todo` を追加してフロントの Todo トグルに対応させる。フロントエンドは `api.js` にコメント fetch ラッパー、`schedule.html` にコメントセクション HTML、`schedule-screen.js` に描画・操作ロジック、`main.css` にスタイルを追加する。

**Tech Stack:** Python/FastAPI (backend), Vanilla JS ES modules (frontend), SQLite/PostgreSQL

---

## ファイルマップ

| ファイル | 変更種別 | 内容 |
|---|---|---|
| `backend/app/schemas/task.py` | 修正 | `TaskCommentUpdate` に `is_todo: bool | None = None` を追加 |
| `backend/app/routers/comments.py` | 修正 | `update_comment` で `is_todo` を処理 |
| `backend/tests/test_tasks.py` | 修正 | `is_todo` PATCH テストを追加 |
| `frontend/js/api.js` | 修正 | コメント CRUD の 4 関数を追加 |
| `frontend/schedule.html` | 修正 | `task-detail-panel` にコメントセクション HTML を追加 |
| `frontend/css/main.css` | 修正 | コメント行・ボタンのスタイルを追加 |
| `frontend/js/schedule-screen.js` | 修正 | コメント読み込み・描画・操作ロジックを追加 |

---

## Task 1: バックエンド — `is_todo` PATCH 対応

**Files:**
- Modify: `backend/app/schemas/task.py:134-137`
- Modify: `backend/app/routers/comments.py:68-93`
- Modify: `backend/tests/test_tasks.py` (末尾に追加)

- [ ] **Step 1: `TaskCommentUpdate` に `is_todo` フィールドを追加**

`backend/app/schemas/task.py` の `TaskCommentUpdate` を以下に変更:

```python
class TaskCommentUpdate(BaseModel):
    """PATCH 用: is_todo / is_done トグル・text 更新に使用する。"""
    is_todo: bool | None = None
    is_done: bool | None = None
    text: str | None = None
```

- [ ] **Step 2: ルーターで `is_todo` を処理**

`backend/app/routers/comments.py` の `update_comment` 関数を以下に変更:

```python
@router.patch(
    "/projects/{project_id}/tasks/{task_id}/comments/{comment_id}",
    response_model=TaskCommentResponse,
)
def update_comment(
    project_id: int,
    task_id: int,
    comment_id: int,
    payload: TaskCommentUpdate,
    db: Session = Depends(get_db),
) -> TaskComment:
    """コメントの is_todo / is_done / text を部分更新する。"""
    get_or_404(db, Project, project_id, "Project not found")
    task = get_or_404(db, Task, task_id, "Task not found")
    _check_task_in_project(task, project_id)
    comment = get_or_404(db, TaskComment, comment_id, "Comment not found")
    if comment.task_id != task_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    if payload.is_todo is not None:
        comment.is_todo = payload.is_todo
    if payload.is_done is not None:
        comment.is_done = payload.is_done
    if payload.text is not None:
        stripped = payload.text.strip()
        if not stripped:
            raise HTTPException(status_code=400, detail="Comment text cannot be empty")
        comment.text = stripped
    return commit_and_refresh(db, comment)
```

- [ ] **Step 3: テストを追加**

`backend/tests/test_tasks.py` の末尾に追加:

```python
def test_update_comment_toggle_is_todo(client, project, task):
    pid, tid = project["id"], task["id"]
    cid = client.post(
        f"/api/v1/projects/{pid}/tasks/{tid}/comments",
        json={"text": "Need todo", "is_todo": False},
    ).json()["id"]

    res = client.patch(
        f"/api/v1/projects/{pid}/tasks/{tid}/comments/{cid}",
        json={"is_todo": True},
    )
    assert res.status_code == 200
    assert res.json()["is_todo"] is True

    res2 = client.patch(
        f"/api/v1/projects/{pid}/tasks/{tid}/comments/{cid}",
        json={"is_todo": False},
    )
    assert res2.status_code == 200
    assert res2.json()["is_todo"] is False
```

- [ ] **Step 4: テストを実行して PASS を確認**

```bash
cd backend
pytest tests/test_tasks.py -v -k "comment"
```

期待: 全 comment テストが PASS。`test_update_comment_toggle_is_todo` が PASS になること。

- [ ] **Step 5: コミット**

```bash
git add backend/app/schemas/task.py backend/app/routers/comments.py backend/tests/test_tasks.py
git commit -m "feat: TaskCommentUpdate に is_todo フィールドを追加"
```

---

## Task 2: `api.js` — コメント API ラッパー追加

**Files:**
- Modify: `frontend/js/api.js`（末尾に追加）

- [ ] **Step 1: 4 関数を追加**

`frontend/js/api.js` の末尾（`importProject` 関数の後）に追加:

```js
// ── Comments ─────────────────────────────────────────────
export const listComments   = (pid, tid)           => request('GET',    `/projects/${pid}/tasks/${tid}/comments`);
export const createComment  = (pid, tid, data)     => request('POST',   `/projects/${pid}/tasks/${tid}/comments`, data);
export const updateComment  = (pid, tid, cid, data)=> request('PATCH',  `/projects/${pid}/tasks/${tid}/comments/${cid}`, data);
export const deleteComment  = (pid, tid, cid)      => request('DELETE', `/projects/${pid}/tasks/${tid}/comments/${cid}`);
```

- [ ] **Step 2: コミット**

```bash
git add frontend/js/api.js
git commit -m "feat: コメント API ラッパー (listComments/createComment/updateComment/deleteComment) を追加"
```

---

## Task 3: `schedule.html` — コメントセクション HTML 追加

**Files:**
- Modify: `frontend/schedule.html`

- [ ] **Step 1: コメントセクションを `task-detail-panel` 内の `</form>` 直後に追加**

`frontend/schedule.html` の `</form>` タグ（`<!-- ── Add Task モーダル` の直前）の直後に以下を挿入:

```html
  <!-- ── コメントセクション ──────────────────────────────── -->
  <div id="task-comments-section" class="comment-section">
    <h4 class="comment-section__title">コメント</h4>
    <div id="comment-list" class="comment-list"></div>
    <div class="comment-new">
      <textarea id="comment-new-text" class="comment-textarea" placeholder="コメントを追加..." rows="2"></textarea>
      <div class="comment-new__footer">
        <label class="comment-new__todo-label">
          <input type="checkbox" id="comment-new-is-todo"> ToDo として追加
        </label>
        <button type="button" id="btn-add-comment" class="btn btn--primary btn--sm">追加</button>
      </div>
    </div>
  </div>
```

- [ ] **Step 2: コミット**

```bash
git add frontend/schedule.html
git commit -m "feat: タスク詳細パネルにコメントセクション HTML を追加"
```

---

## Task 4: `main.css` — コメントスタイル追加

**Files:**
- Modify: `frontend/css/main.css`（末尾に追加）

- [ ] **Step 1: スタイルを追加**

`frontend/css/main.css` の末尾に追加:

```css
/* ── Comment Section ─────────────────────────────────────── */
.comment-section {
  border-top: 1px solid var(--color-border);
  margin-top: 12px;
  padding: 12px 16px 16px;
}

.comment-section__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-muted);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: .04em;
}

.comment-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}

.comment-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 6px 8px;
}

.comment-row__text {
  flex: 1;
  font-size: 13px;
  line-height: 1.5;
  cursor: pointer;
  word-break: break-word;
  color: var(--color-text);
  min-height: 20px;
}

.comment-row__text.is-done {
  text-decoration: line-through;
  color: var(--color-text-muted);
}

.comment-edit-textarea {
  width: 100%;
  font-size: 13px;
  font-family: var(--font-sans);
  border: 1px solid var(--color-primary);
  border-radius: 4px;
  padding: 4px 6px;
  resize: vertical;
  background: var(--color-surface);
  color: var(--color-text);
}

.comment-row__actions {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-shrink: 0;
}

.btn-comment-todo,
.btn-comment-done {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-muted);
  cursor: pointer;
  white-space: nowrap;
  line-height: 1.6;
}

.btn-comment-todo.is-active {
  background: #fff3cd;
  border-color: #f0ad4e;
  color: #856404;
}

.btn-comment-done.is-done {
  background: #d4edda;
  border-color: var(--color-success);
  color: var(--color-success);
}

/* ── New Comment Input ────────────────────────────────────── */
.comment-new {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.comment-textarea {
  width: 100%;
  font-size: 13px;
  font-family: var(--font-sans);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 6px 8px;
  resize: vertical;
  background: var(--color-surface);
  color: var(--color-text);
}

.comment-textarea:focus {
  outline: none;
  border-color: var(--color-primary);
}

.comment-new__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.comment-new__todo-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  color: var(--color-text-muted);
  cursor: pointer;
}

.btn--sm {
  font-size: 12px;
  padding: 4px 10px;
}
```

- [ ] **Step 2: コミット**

```bash
git add frontend/css/main.css
git commit -m "feat: コメントセクションのスタイルを追加"
```

---

## Task 5: `schedule-screen.js` — コメントロジック追加

**Files:**
- Modify: `frontend/js/schedule-screen.js`

### Step 1-4: import / 状態変数 / ヘルパー関数 追加

- [ ] **Step 1: `api.js` の import に 4 関数を追加**

`schedule-screen.js` の先頭 `import * as api from './api.js';` はすでに全エクスポートをインポートしているため変更不要。

- [ ] **Step 2: ファイルの状態変数宣言ブロック（`let currentPid` 等のある箇所）の後に、コメント用状態変数を追加**

`let currentCriticalTaskIds = new Set();` の直後に挿入:

```js
// ── コメント状態 ──────────────────────────────────────────────────────────────
let _currentComments = [];
let _commentTaskId   = null;
```

- [ ] **Step 3: コメント描画ヘルパー関数群を追加**

`// ── Helpers ───────────────────────────────────────────────────────────────` セクションの直前に追加:

```js
// ── コメント ──────────────────────────────────────────────────────────────────
async function loadComments(tid) {
  _commentTaskId = tid;
  try {
    _currentComments = await api.listComments(currentPid, tid);
  } catch (ex) {
    _currentComments = [];
    LOG.warn('コメント読み込みエラー:', ex.message);
  }
  renderComments();
}

function renderComments() {
  const list = document.getElementById('comment-list');
  list.innerHTML = '';
  for (const c of _currentComments) {
    list.appendChild(buildCommentRow(c));
  }
}

function buildCommentRow(c) {
  const row = document.createElement('div');
  row.className = 'comment-row';
  row.dataset.commentId = c.id;

  // テキスト（クリックでインライン編集）
  const textEl = document.createElement('div');
  textEl.className = 'comment-row__text' + (c.is_done ? ' is-done' : '');
  textEl.textContent = c.text;
  textEl.addEventListener('click', () => startEditComment(textEl, c));
  row.appendChild(textEl);

  // アクションボタン群
  const actions = document.createElement('div');
  actions.className = 'comment-row__actions';

  // Todo トグル
  const btnTodo = document.createElement('button');
  btnTodo.className = 'btn-comment-todo' + (c.is_todo ? ' is-active' : '');
  btnTodo.textContent = c.is_todo ? 'Todo ✓' : 'Todo';
  btnTodo.addEventListener('click', () => patchComment(c.id, { is_todo: !c.is_todo }));
  actions.appendChild(btnTodo);

  // 完了トグル（is_todo=true のときのみ表示）
  const btnDone = document.createElement('button');
  btnDone.className = 'btn-comment-done' + (c.is_done ? ' is-done' : '');
  btnDone.textContent = c.is_done ? '完了済' : '完了';
  btnDone.hidden = !c.is_todo;
  btnDone.addEventListener('click', () => patchComment(c.id, { is_done: !c.is_done }));
  actions.appendChild(btnDone);

  // 削除
  const btnDel = document.createElement('button');
  btnDel.className = 'btn-icon';
  btnDel.textContent = '×';
  btnDel.title = '削除';
  btnDel.addEventListener('click', () => removeComment(c.id));
  actions.appendChild(btnDel);

  row.appendChild(actions);
  return row;
}

function startEditComment(textEl, c) {
  if (textEl.querySelector('textarea')) return; // 編集中は二重起動しない
  const original = c.text;

  const ta = document.createElement('textarea');
  ta.className = 'comment-edit-textarea';
  ta.value = original;
  ta.rows = 2;
  textEl.textContent = '';
  textEl.appendChild(ta);
  ta.focus();

  let saved = false;

  const save = async () => {
    if (saved) return;
    saved = true;
    const newText = ta.value.trim();
    if (!newText || newText === original) {
      textEl.textContent = original;
      return;
    }
    await patchComment(c.id, { text: newText });
  };

  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ta.blur(); }
    if (e.key === 'Escape') { saved = true; textEl.textContent = original; }
  });
  ta.addEventListener('blur', save);
}

async function patchComment(cid, data) {
  try {
    const updated = await api.updateComment(currentPid, _commentTaskId, cid, data);
    const idx = _currentComments.findIndex(c => c.id === cid);
    if (idx !== -1) _currentComments[idx] = updated;
    renderComments();
  } catch (ex) {
    showToast('コメント更新エラー: ' + ex.message, 'error');
  }
}

async function removeComment(cid) {
  try {
    await api.deleteComment(currentPid, _commentTaskId, cid);
    _currentComments = _currentComments.filter(c => c.id !== cid);
    renderComments();
  } catch (ex) {
    showToast('コメント削除エラー: ' + ex.message, 'error');
  }
}
```

- [ ] **Step 4: 「追加」ボタンのイベントリスナーを `// ── Boot` セクションの直前に追加**

```js
// ── コメント追加ボタン ────────────────────────────────────────────────────────
document.getElementById('btn-add-comment').addEventListener('click', async () => {
  const text = document.getElementById('comment-new-text').value.trim();
  if (!text) return;
  const is_todo = document.getElementById('comment-new-is-todo').checked;
  try {
    const created = await api.createComment(currentPid, _commentTaskId, { text, is_todo });
    _currentComments.push(created);
    renderComments();
    document.getElementById('comment-new-text').value = '';
    document.getElementById('comment-new-is-todo').checked = false;
  } catch (ex) {
    showToast('コメント追加エラー: ' + ex.message, 'error');
  }
});
```

- [ ] **Step 5: `openTaskDetail()` にコメント読み込みと isMultiMode 制御を追加**

`openTaskDetail` 関数の `taskDetailPanel.hidden = false;` の直前に追加:

```js
  // コメントセクション: 比較モードでは非表示、通常モードではロード
  const commentSection = document.getElementById('task-comments-section');
  commentSection.hidden = isMultiMode;
  if (!isMultiMode) {
    document.getElementById('comment-new-text').value = '';
    document.getElementById('comment-new-is-todo').checked = false;
    loadComments(task.id);
  }
```

- [ ] **Step 6: コミット**

```bash
git add frontend/js/schedule-screen.js
git commit -m "feat: タスク詳細パネルにコメント Todo トグル機能を追加"
```

---

## Task 6: 動作確認

- [ ] **Step 1: バックエンドを起動**

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- [ ] **Step 2: ブラウザで確認**

`http://localhost:8000` を開き、プロジェクトのスケジュール画面へ移動。
ガントバーをクリック → タスク詳細パネルにコメントセクションが表示されること。

確認項目:
1. コメントを追加できる（通常 / ToDo として追加）
2. Todo ボタンが On/Off トグルする（`Todo` ↔ `Todo ✓`）
3. ToDo=On のコメントに「完了」ボタンが表示される
4. 完了ボタンが On/Off トグルする（`完了` ↔ `完了済`）
5. 完了済みコメントのテキストに打ち消し線が入る
6. テキストをクリックするとインライン編集できる（Enter で保存、Esc でキャンセル）
7. × ボタンでコメントが削除される
8. 比較モード（?projects=1,2）でコメントセクションが非表示になる

- [ ] **Step 3: `docs/design.md` を更新してコミット**

`docs/design.md` の API サマリーに以下を追記（既存の comments 行を更新）:

```
GET/POST                    /api/v1/projects/{id}/tasks/{task_id}/comments
PATCH/DELETE                /api/v1/projects/{id}/tasks/{task_id}/comments/{cid}
```

（PATCH が追加されたことを確認して既存の記述と統合する）

```bash
git add docs/design.md
git commit -m "docs: design.md をコメント Todo トグル機能に合わせて更新"
```

- [ ] **Step 4: origin main へ push**

```bash
git push origin main
```
