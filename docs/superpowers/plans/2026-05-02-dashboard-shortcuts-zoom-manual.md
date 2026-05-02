# Dashboard・ショートカット・ズーム記憶・マニュアルモーダル Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 進捗ダッシュボードタブ・キーボードショートカット・ズームレベルDB保存・マニュアルモーダルの4機能を実装する。

**Architecture:** バックエンドに `/projects/stats` と `/api/manual` の2エンドポイントを追加。フロントエンドに `DashboardPanel.jsx`・`HelpModal.jsx` を新規作成し、`TopScreen.jsx`・`GanttChart.jsx` に統合する。ズーム保存はユーザーが明示的にビューボタンを押したときのみ `PATCH /projects/{id}` を呼ぶ。

**Tech Stack:** Python/FastAPI, SQLAlchemy, pytest, React/JSX, Vite, marked (npm)

---

## ファイルマップ

| 操作 | ファイル | 内容 |
|------|---------|------|
| Modify | `backend/app/schemas/project.py` | `ProjectStats` スキーマ追加 |
| Modify | `backend/app/routers/projects.py` | `/projects/stats` エンドポイント追加 |
| Modify | `backend/app/main.py` | `/api/manual` エンドポイント追加 |
| Modify | `backend/tests/test_projects.py` | stats テスト追加 |
| Modify | `frontend/src/api.js` | `getProjectStats()` 追加 |
| Create | `frontend/src/components/top/DashboardPanel.jsx` | ダッシュボードパネル |
| Create | `frontend/src/components/common/HelpModal.jsx` | マニュアルモーダル |
| Modify | `frontend/src/components/top/TopScreen.jsx` | Dashboard タブ・`?` ボタン追加 |
| Modify | `frontend/src/components/schedule/GanttChart.jsx` | ショートカット・ズーム保存・`?` ボタン追加 |
| Modify | `frontend/src/styles/app.css` | Dashboard・HelpModal CSS 追加 |
| Modify | `docs/user_manual.md` | キーボードショートカット章追加 |

---

## Task 1: バックエンド — ProjectStats エンドポイント

**Files:**
- Modify: `backend/app/schemas/project.py`
- Modify: `backend/app/routers/projects.py`
- Modify: `backend/tests/test_projects.py`

- [ ] **Step 1: 失敗するテストを書く**

`backend/tests/test_projects.py` の末尾に追記:

```python
# ── /projects/stats tests ──────────────────────────────────

def test_project_stats_empty_project(client):
    pid = client.post("/api/v1/projects", json={"name": "P1"}).json()["id"]
    res = client.get("/api/v1/projects/stats")
    assert res.status_code == 200
    stats = res.json()
    assert len(stats) == 1
    s = stats[0]
    assert s["id"] == pid
    assert s["progress_pct"] == 0.0
    assert s["total_tasks"] == 0
    assert s["delayed_task_count"] == 0
    assert s["next_milestone_name"] is None


def test_project_stats_progress(client):
    pid = client.post("/api/v1/projects", json={"name": "P2"}).json()["id"]
    client.post(f"/api/v1/projects/{pid}/tasks", json={
        "name": "T1", "start_date": "2026-04-01", "end_date": "2026-04-10", "progress": 1.0
    })
    client.post(f"/api/v1/projects/{pid}/tasks", json={
        "name": "T2", "start_date": "2026-04-11", "end_date": "2026-04-20", "progress": 0.0
    })
    res = client.get("/api/v1/projects/stats")
    assert res.status_code == 200
    s = next(x for x in res.json() if x["id"] == pid)
    assert s["total_tasks"] == 2
    assert s["completed_tasks"] == 1
    assert abs(s["progress_pct"] - 0.5) < 0.01


def test_project_stats_delayed(client):
    from datetime import date, timedelta
    pid = client.post("/api/v1/projects", json={"name": "P3"}).json()["id"]
    past = (date.today() - timedelta(days=5)).isoformat()
    client.post(f"/api/v1/projects/{pid}/tasks", json={
        "name": "Late", "start_date": past, "end_date": past, "progress": 0.0
    })
    res = client.get("/api/v1/projects/stats")
    s = next(x for x in res.json() if x["id"] == pid)
    assert s["delayed_task_count"] == 1


def test_project_stats_next_milestone(client):
    from datetime import date, timedelta
    pid = client.post("/api/v1/projects", json={"name": "P4"}).json()["id"]
    future = (date.today() + timedelta(days=10)).isoformat()
    client.post(f"/api/v1/projects/{pid}/tasks", json={
        "name": "M1", "start_date": future, "end_date": future, "task_type": "milestone"
    })
    res = client.get("/api/v1/projects/stats")
    s = next(x for x in res.json() if x["id"] == pid)
    assert s["next_milestone_name"] == "M1"
    assert s["next_milestone_date"] == future


def test_project_stats_excludes_archived(client):
    pid_a = client.post("/api/v1/projects", json={"name": "Active"}).json()["id"]
    pid_b = client.post("/api/v1/projects", json={"name": "Archived"}).json()["id"]
    client.patch(f"/api/v1/projects/{pid_b}", json={"status": "archived"})
    res = client.get("/api/v1/projects/stats")
    ids = [s["id"] for s in res.json()]
    assert pid_a in ids
    assert pid_b not in ids
```

- [ ] **Step 2: テストが失敗することを確認**

```
cd backend
py -m pytest tests/test_projects.py::test_project_stats_empty_project -v
```

Expected: FAILED (404 or connection error)

- [ ] **Step 3: ProjectStats スキーマを追加**

`backend/app/schemas/project.py` の先頭 import に `date as date_type` を追加し、ファイル末尾に追記:

```python
# schemas/project.py の先頭 import を以下に変更:
from datetime import datetime
from datetime import date as date_type

# ファイル末尾に追加:
class ProjectStats(BaseModel):
    id: int
    progress_pct: float
    total_tasks: int
    completed_tasks: int
    delayed_task_count: int
    next_milestone_name: str | None
    next_milestone_date: date_type | None
```

- [ ] **Step 4: /projects/stats エンドポイントを追加**

`backend/app/routers/projects.py` の import に追加:

```python
from datetime import date as date_type
from app.models.task import Task
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectStats, ProjectUpdate
```

`@router.get("/projects/{project_id}", ...)` の直前（`@router.post("/projects", ...)` の直後）に追加:

```python
@router.get("/projects/stats", response_model=list[ProjectStats])
def list_project_stats(db: Session = Depends(get_db)) -> list[dict]:
    """全アクティブプロジェクトの進捗集計を返す。/projects/{id} より先に登録必須。"""
    projects = (
        db.query(Project)
        .filter(Project.status == "active")
        .order_by(Project.sort_order, Project.created_at)
        .all()
    )
    today = date_type.today()
    result = []
    for p in projects:
        tasks = (
            db.query(Task)
            .filter(Task.project_id == p.id, Task.task_type == "task")
            .all()
        )
        total = len(tasks)
        completed = sum(1 for t in tasks if t.progress >= 1.0)
        delayed = sum(1 for t in tasks if t.end_date < today and t.progress < 1.0)
        progress_pct = sum(t.progress for t in tasks) / total if total > 0 else 0.0

        milestone = (
            db.query(Task)
            .filter(
                Task.project_id == p.id,
                Task.task_type == "milestone",
                Task.end_date >= today,
            )
            .order_by(Task.end_date)
            .first()
        )
        result.append({
            "id": p.id,
            "progress_pct": round(progress_pct, 4),
            "total_tasks": total,
            "completed_tasks": completed,
            "delayed_task_count": delayed,
            "next_milestone_name": milestone.name if milestone else None,
            "next_milestone_date": milestone.end_date if milestone else None,
        })
    return result
```

- [ ] **Step 5: テストがパスすることを確認**

```
cd backend
py -m pytest tests/test_projects.py -v -k "stats"
```

Expected: 5件 PASSED

- [ ] **Step 6: 全テストを確認**

```
cd backend
py -m pytest tests/ -v
```

Expected: 全件 PASSED

- [ ] **Step 7: コミット**

```
git add backend/app/schemas/project.py backend/app/routers/projects.py backend/tests/test_projects.py
git commit -m "feat: add /projects/stats endpoint for dashboard aggregation"
```

---

## Task 2: バックエンド — /api/manual エンドポイント

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: /api/manual エンドポイントを追加**

`backend/app/main.py` の import 部分（ファイル冒頭の `from fastapi import FastAPI` の行）に追加:

```python
from fastapi.responses import FileResponse, PlainTextResponse
```

`# ── Health check ───` ブロックの直後、`# ── API routers ────` ブロックの直前に追加:

```python
# ── Manual endpoint ────────────────────────────────────────────────────────
_manual_path = Path(__file__).parent.parent.parent / "docs" / "user_manual.md"

@app.get("/api/manual", response_class=PlainTextResponse, tags=["system"])
def get_manual() -> str:
    """docs/user_manual.md をMarkdown文字列で返す。フロントのHelpModalが利用する。"""
    if not _manual_path.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Manual not found")
    return _manual_path.read_text(encoding="utf-8")
```

- [ ] **Step 2: 動作確認（サーバー起動不要・テストで確認）**

```
cd backend
py -m pytest tests/test_health.py -v
```

Expected: PASSED（既存テストが壊れていないことを確認）

- [ ] **Step 3: コミット**

```
git add backend/app/main.py
git commit -m "feat: add /api/manual endpoint serving user_manual.md"
```

---

## Task 3: フロントエンド — DashboardPanel + CSS + TopScreen

**Files:**
- Modify: `frontend/package.json` (marked インストール)
- Modify: `frontend/src/api.js`
- Create: `frontend/src/components/top/DashboardPanel.jsx`
- Modify: `frontend/src/styles/app.css`
- Modify: `frontend/src/components/top/TopScreen.jsx`

- [ ] **Step 1: marked をインストール**

```
cd frontend
npm install marked
```

Expected: `marked` が `node_modules` に追加される

- [ ] **Step 2: getProjectStats を api.js に追加**

`frontend/src/api.js` の `// ── Projects ─` セクション末尾に追加:

```js
export const getProjectStats = () => request('GET', '/projects/stats');
```

- [ ] **Step 3: DashboardPanel.jsx を作成**

新規ファイル `frontend/src/components/top/DashboardPanel.jsx`:

```jsx
import { useState, useEffect } from 'react';
import * as api from '../../api.js';

export default function DashboardPanel({ projects }) {
  const [stats, setStats]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getProjectStats()
      .then(data => { setStats(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 24 }}>読み込み中...</div>;

  const statsMap = Object.fromEntries(stats.map(s => [s.id, s]));
  const active = projects.filter(p => p.status === 'active');

  if (active.length === 0) {
    return <div className="empty-msg">プロジェクトがありません。</div>;
  }

  return (
    <div className="dashboard-grid">
      {active.map(p => {
        const s = statsMap[p.id] ?? {};
        const pct = Math.round((s.progress_pct ?? 0) * 100);
        const today = new Date();
        const nextDate = s.next_milestone_date ? new Date(s.next_milestone_date) : null;
        const daysUntil = nextDate
          ? Math.ceil((nextDate - today) / 86400000)
          : null;

        return (
          <div
            key={p.id}
            className="dashboard-card"
            onClick={() => { window.location.href = `/schedule?project=${p.id}`; }}
            title={`${p.name} を開く`}
          >
            <div className="dashboard-card__header">
              <span className="dashboard-card__dot" style={{ background: p.color }} />
              <span className="dashboard-card__title">
                {p.model_name && (
                  <span className="dashboard-card__model">{p.model_name} / </span>
                )}
                {p.name}
              </span>
              <span className={`project-pstatus project-pstatus--${p.project_status}`}>
                {p.project_status}
              </span>
            </div>

            {p.client_name && (
              <div className="dashboard-card__client">👤 {p.client_name}</div>
            )}

            <div className="dashboard-card__progress-row">
              <div className="dashboard-card__bar-wrap">
                <div
                  className="dashboard-card__bar-fill"
                  style={{ width: `${pct}%`, background: p.color }}
                />
              </div>
              <span className="dashboard-card__pct">
                {pct}%
                <span className="dashboard-card__tasks">
                  　({s.completed_tasks ?? 0}/{s.total_tasks ?? 0} タスク)
                </span>
              </span>
            </div>

            <div className="dashboard-card__footer">
              {(s.delayed_task_count ?? 0) > 0 && (
                <span className="dashboard-card__delay">⚠ 遅延 {s.delayed_task_count}件</span>
              )}
              {s.next_milestone_name && daysUntil !== null && (
                <span className={`dashboard-card__ms${daysUntil < 0 ? ' is-overdue' : ''}`}>
                  ◆ {s.next_milestone_name}　{s.next_milestone_date}
                  {daysUntil >= 0
                    ? ` (${daysUntil}日後)`
                    : ` (${Math.abs(daysUntil)}日前・遅延)`}
                </span>
              )}
              {!(s.delayed_task_count ?? 0) && !s.next_milestone_name && (
                <span className="dashboard-card__ok">✓ 遅延なし</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Dashboard CSS を app.css に追加**

`frontend/src/styles/app.css` の末尾に追加:

```css
/* ── Dashboard ───────────────────────────────────────────── */
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
  padding: 16px;
  align-content: start;
}
.dashboard-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--panel-radius);
  padding: 16px;
  cursor: pointer;
  transition: box-shadow 0.15s, border-color 0.15s;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.dashboard-card:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--color-primary);
}
.dashboard-card__header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.dashboard-card__dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dashboard-card__title {
  flex: 1;
  font-weight: 600;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.dashboard-card__model {
  color: var(--color-text-muted);
  font-weight: 400;
}
.dashboard-card__client {
  font-size: 12px;
  color: var(--color-text-muted);
}
.dashboard-card__progress-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dashboard-card__bar-wrap {
  height: 8px;
  background: var(--color-border);
  border-radius: 4px;
  overflow: hidden;
}
.dashboard-card__bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s;
}
.dashboard-card__pct {
  font-size: 13px;
  font-weight: 600;
}
.dashboard-card__tasks {
  font-weight: 400;
  color: var(--color-text-muted);
  font-size: 12px;
}
.dashboard-card__footer {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  min-height: 18px;
}
.dashboard-card__delay {
  color: var(--color-danger);
  font-weight: 600;
}
.dashboard-card__ms {
  color: var(--color-text-muted);
}
.dashboard-card__ms.is-overdue {
  color: var(--color-danger);
}
.dashboard-card__ok {
  color: var(--color-success);
}
```

- [ ] **Step 5: TopScreen.jsx に Dashboard タブを追加**

`frontend/src/components/top/TopScreen.jsx` の import に追加:

```jsx
import DashboardPanel from './DashboardPanel.jsx';
```

`activePanel` の初期値はそのまま `'projects'`。

ナビゲーション部分（`<nav className="top-nav">` ブロック）の Config ボタンの前に追加:

```jsx
<button
  className={`top-nav__item${activePanel === 'dashboard' ? ' active' : ''}`}
  onClick={() => setActivePanel('dashboard')}
>
  <span className="top-nav__icon">📊</span>
  <span className="top-nav__text">
    <span className="top-nav__label">Dashboard</span>
    <span className="top-nav__desc">進捗サマリー</span>
  </span>
</button>
```

`{activePanel === 'config' && ...}` ブロックの直前に追加:

```jsx
{activePanel === 'dashboard' && (
  <section className="panel" style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
    <div className="panel__header">
      <h2 className="panel__title">Dashboard</h2>
    </div>
    <DashboardPanel projects={projects} />
  </section>
)}
```

- [ ] **Step 6: ビルド確認**

```
cd frontend
npm run build
```

Expected: ビルド成功（エラーなし）

- [ ] **Step 7: コミット**

```
git add frontend/src/api.js frontend/src/components/top/DashboardPanel.jsx frontend/src/styles/app.css frontend/src/components/top/TopScreen.jsx frontend/package.json frontend/package-lock.json
git commit -m "feat: add Dashboard tab with per-project progress/delay/milestone summary"
```

---

## Task 4: マニュアルモーダル (HelpModal) + manual 更新

**Files:**
- Modify: `docs/user_manual.md`
- Create: `frontend/src/components/common/HelpModal.jsx`
- Modify: `frontend/src/styles/app.css`
- Modify: `frontend/src/components/top/TopScreen.jsx`
- Modify: `frontend/src/components/schedule/GanttChart.jsx`

- [ ] **Step 1: user_manual.md にキーボードショートカット章を追記**

`docs/user_manual.md` の末尾（`## 7. トラブルシューティング` の後）に追記:

```markdown

---

## 8. キーボードショートカット

スケジュール画面で使えるキーボードショートカットです。

| キー | 動作 |
|------|------|
| `N` | 新規タスク追加モーダルを開く |
| `Escape` | 開いているパネル / モーダルを閉じる |
| `Ctrl + F` | タスク検索フィールドにフォーカス |
| `Ctrl + P` | 印刷ダイアログを開く |
| `?` | このマニュアルを開く / 閉じる |

> **注意:** テキスト入力中（タスク名・メモ等）はショートカットが無効になります。`Escape` のみ常時有効です。
```

- [ ] **Step 2: HelpModal.jsx を作成**

新規ファイル `frontend/src/components/common/HelpModal.jsx`:

```jsx
import { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';

export default function HelpModal({ onClose }) {
  const [html, setHtml]   = useState('');
  const [toc, setToc]     = useState([]);
  const [loading, setLoading] = useState(true);
  const contentRef = useRef(null);

  useEffect(() => {
    fetch('/api/manual')
      .then(r => r.text())
      .then(md => {
        const headings = [];
        md.split('\n').forEach(line => {
          const m = line.match(/^## (.+)/);
          if (m) headings.push(m[1].replace(/^[\d]+\.\s*/, '').trim());
        });
        setToc(headings);
        setHtml(marked.parse(md));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const scrollTo = (heading) => {
    if (!contentRef.current) return;
    const h2s = contentRef.current.querySelectorAll('h2');
    for (const el of h2s) {
      if (el.textContent.includes(heading)) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      }
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="help-modal" onClick={e => e.stopPropagation()}>
        <div className="help-modal__header">
          <span>📖 opeSchedule マニュアル</span>
          <button className="btn-icon" onClick={onClose} title="閉じる">✕</button>
        </div>
        <div className="help-modal__body">
          <nav className="help-modal__toc">
            {toc.map((h, i) => (
              <button key={i} className="help-toc__item" onClick={() => scrollTo(h)}>
                {h}
              </button>
            ))}
          </nav>
          <div
            ref={contentRef}
            className="help-modal__content markdown-body"
            dangerouslySetInnerHTML={{ __html: loading ? '読み込み中...' : html }}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: HelpModal CSS を app.css に追加**

`frontend/src/styles/app.css` の末尾（dashboard CSS の後）に追加:

```css
/* ── Help Modal ──────────────────────────────────────────── */
.help-modal {
  background: var(--color-surface);
  border-radius: var(--panel-radius);
  width: min(900px, 92vw);
  height: min(700px, 88vh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0,0,0,.18);
}
.help-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--color-border);
  font-weight: 700;
  font-size: 15px;
  flex-shrink: 0;
}
.help-modal__body {
  display: flex;
  flex: 1;
  overflow: hidden;
}
.help-modal__toc {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--color-border);
  overflow-y: auto;
  padding: 12px 0;
  display: flex;
  flex-direction: column;
}
.help-toc__item {
  text-align: left;
  padding: 7px 16px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 13px;
  color: var(--color-text-muted);
  transition: color 0.1s, background 0.1s;
}
.help-toc__item:hover {
  color: var(--color-primary);
  background: var(--color-selected-bg);
}
.help-modal__content {
  flex: 1;
  overflow-y: auto;
  padding: 20px 28px;
  line-height: 1.75;
}
/* markdown-body */
.markdown-body h1 { font-size: 20px; margin: 0 0 16px; padding-bottom: 8px; border-bottom: 2px solid var(--color-border); }
.markdown-body h2 { font-size: 16px; margin: 24px 0 10px; padding-bottom: 4px; border-bottom: 1px solid var(--color-border); }
.markdown-body h3 { font-size: 14px; margin: 18px 0 8px; }
.markdown-body p  { margin: 0 0 10px; }
.markdown-body ul, .markdown-body ol { margin: 0 0 10px 20px; }
.markdown-body li { margin-bottom: 4px; }
.markdown-body table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 13px; }
.markdown-body th, .markdown-body td { border: 1px solid var(--color-border); padding: 6px 10px; text-align: left; }
.markdown-body th { background: var(--color-bg); font-weight: 600; }
.markdown-body code { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 3px; padding: 1px 5px; font-size: 12px; font-family: monospace; }
.markdown-body pre { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 4px; padding: 12px; overflow-x: auto; margin: 0 0 12px; }
.markdown-body pre code { background: none; border: none; padding: 0; }
.markdown-body blockquote { border-left: 3px solid var(--color-primary); margin: 0 0 10px; padding: 4px 12px; color: var(--color-text-muted); }
.markdown-body hr { border: none; border-top: 1px solid var(--color-border); margin: 20px 0; }

/* Help button */
.btn--help {
  padding: 5px 10px;
  font-size: 14px;
  line-height: 1;
}
```

- [ ] **Step 4: TopScreen ヘッダーに `?` ボタンを追加**

`frontend/src/components/top/TopScreen.jsx` に追加:

import 追加:
```jsx
import HelpModal from '../common/HelpModal.jsx';
```

`const [modalProject, setModalProject]` の後に state 追加:
```jsx
const [showHelp, setShowHelp] = useState(false);
```

`<header className="app-header">` 内の `</header>` 直前に追加:
```jsx
<button
  className="btn btn--secondary btn--help"
  onClick={() => setShowHelp(true)}
  title="マニュアルを開く (?)"
>?</button>
```

`{modalProject !== undefined && ...}` の後に追加:
```jsx
{showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
```

- [ ] **Step 5: GanttChart ツールバーに `?` ボタンを追加**

`frontend/src/components/schedule/GanttChart.jsx` に追加:

import 追加:
```jsx
import HelpModal from '../common/HelpModal.jsx';
```

`showHistory` state の後に追加:
```jsx
const [showHelp, setShowHelp]           = useState(false);
```

ツールバーの `📋 履歴` ボタンの後（`</div>` の直前）に追加:
```jsx
<button
  className="btn btn--secondary btn--help"
  onClick={() => setShowHelp(v => !v)}
  title="マニュアルを開く (?)"
>?</button>
```

`{commentTask && ...}` ブロックの後に追加:
```jsx
{showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
```

- [ ] **Step 6: ビルド確認**

```
cd frontend
npm run build
```

Expected: ビルド成功（エラーなし）

- [ ] **Step 7: コミット**

```
git add docs/user_manual.md frontend/src/components/common/HelpModal.jsx frontend/src/styles/app.css frontend/src/components/top/TopScreen.jsx frontend/src/components/schedule/GanttChart.jsx
git commit -m "feat: add HelpModal (? button) with markdown manual rendering"
```

---

## Task 5: キーボードショートカット (GanttChart)

**Files:**
- Modify: `frontend/src/components/schedule/GanttChart.jsx`

- [ ] **Step 1: キーボードショートカット useEffect を追加**

`GanttChart.jsx` の `showHelp` state 宣言の後に追加:

```jsx
// キーボードショートカット
useEffect(() => {
  const isInputActive = () => {
    const tag = document.activeElement?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  };

  const handler = (e) => {
    // Escape: 常時有効 — 開いているパネルを全て閉じる
    if (e.key === 'Escape') {
      setDetailTask(null);
      setCommentTask(null);
      setShowAddModal(false);
      setShowHistory(false);
      setShowHelp(false);
      return;
    }
    // 以下は input/textarea フォーカス中は無効
    if (isInputActive()) return;
    if (e.key === 'n' || e.key === 'N') {
      if (!isHistoryMode && !isMultiMode) setShowAddModal(true);
      return;
    }
    if (e.key === '?') {
      setShowHelp(v => !v);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      document.querySelector('.gantt-search')?.focus();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
      e.preventDefault();
      window.print();
    }
  };

  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}, [isHistoryMode, isMultiMode]);
```

- [ ] **Step 2: ビルド確認**

```
cd frontend
npm run build
```

Expected: ビルド成功

- [ ] **Step 3: コミット**

```
git add frontend/src/components/schedule/GanttChart.jsx
git commit -m "feat: add keyboard shortcuts (N/Escape/Ctrl+F/Ctrl+P/?) to GanttChart"
```

---

## Task 6: ズームレベル DB 保存 (C-2)

**Files:**
- Modify: `frontend/src/components/schedule/GanttChart.jsx`

- [ ] **Step 1: userChangedView ref と保存 effect を追加**

`GanttChart.jsx` の `viewMode` state 宣言の直後に追加:

```jsx
const userChangedView = useRef(false);
```

`viewMode を config/project から初期化` の useEffect の後に追加:

```jsx
// ユーザー操作でビューモードが変わった場合のみ DB に保存
useEffect(() => {
  if (!userChangedView.current) return;
  userChangedView.current = false;
  if (!pid || isMultiMode) return;
  api.updateProject(pid, { view_mode: viewMode }).catch(() => {});
}, [viewMode]);
```

- [ ] **Step 2: ビューボタンの onClick を更新**

`GanttChart.jsx` の `view-mode-btns` 内のボタン `onClick` を変更:

変更前:
```jsx
onClick={() => setViewMode(m)}
```

変更後:
```jsx
onClick={() => { userChangedView.current = true; setViewMode(m); }}
```

- [ ] **Step 3: ビルド確認**

```
cd frontend
npm run build
```

Expected: ビルド成功

- [ ] **Step 4: コミット**

```
git add frontend/src/components/schedule/GanttChart.jsx
git commit -m "feat: persist view mode (Day/Week/Month/Quarter) to DB on user selection"
```

---

## Task 7: design.md 更新 & push

**Files:**
- Modify: `docs/design.md` または `CLAUDE.md`

- [ ] **Step 1: CLAUDE.md の API Summary を更新**

`CLAUDE.md` の API Summary に追記:

```
GET                         /api/v1/projects/stats
GET                         /api/manual
```

- [ ] **Step 2: コミット & push**

```
git add CLAUDE.md
git commit -m "docs: update API summary with /projects/stats and /api/manual"
git push origin main
```

---

## セルフレビュー

**Spec coverage:**
- B-1 ダッシュボード: Task 1 (backend) + Task 3 (frontend) ✅
- C-1 ショートカット: Task 5 ✅ + マニュアル掲載 Task 4 Step 1 ✅
- C-2 ズーム記憶: Task 6 ✅
- M-1 マニュアルモーダル: Task 2 (backend) + Task 4 (frontend) ✅
- 仕様書の「`?` キーでマニュアル開閉」: Task 5 の handler に含む ✅

**Placeholder scan:** なし ✅

**Type consistency:**
- `ProjectStats` は Task 1 Step 3 で定義 → Task 1 Step 4 で使用 ✅
- `getProjectStats()` は Task 3 Step 2 で定義 → Step 3 で使用 ✅
- `showHelp` state は Task 4 Step 4/5 で追加 → Task 5 Step 1 の handler で参照 ✅
- `userChangedView` ref は Task 6 Step 1 で追加 → Step 2 で参照 ✅
