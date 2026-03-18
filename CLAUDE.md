# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`opeSchedule` は Web ベースの開発スケジュール管理ツール（ガントチャート）。Python/FastAPI バックエンド、Vanilla JS + Frappe Gantt フロントエンド。

## Development Commands

```bash
# Setup (from backend/)
pip install -r requirements.txt

# Run dev server (from backend/)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
# → http://localhost:8000       フロントエンド
# → http://localhost:8000/api/docs  Swagger UI

# Run all tests (from backend/)
pytest tests/ -v

# Run a single test file
pytest tests/test_tasks.py -v

# Run a single test
pytest tests/test_tasks.py::test_create_task -v

# DB migration (from backend/)
alembic upgrade head
alembic revision --autogenerate -m "description"

# Docker (from repo root) ── PostgreSQL + app のフルスタック起動
docker-compose up
```

## Architecture

### Directory Structure
```
opeSchedule/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app, lifespan, /health, router登録, static mount
│   │   ├── config.py        # Settings via pydantic-settings (.env)
│   │   ├── database.py      # SQLAlchemy engine, SessionLocal, Base, get_db
│   │   ├── models/          # ORM models (Config, Project, Task, TaskDependency)
│   │   ├── schemas/         # Pydantic request/response schemas
│   │   └── routers/         # config, projects, tasks, import_export
│   ├── alembic/             # DB migrations
│   └── tests/               # pytest (in-memory SQLite via StaticPool)
├── frontend/
│   ├── index.html           # タブシェル（Top / Schedule）、全モーダル定義
│   ├── css/
│   │   ├── main.css         # レイアウト・タブ・フォーム・モーダルスタイル
│   │   └── gantt-overrides.css  # Frappe Gantt カスタマイズ（マイルストーン◆等）
│   └── js/
│       ├── app.js           # AppState + URL-param 状態管理 + Toast
│       ├── api.js           # 全 API エンドポイントの fetch ラッパー
│       ├── top-screen.js    # ProjectList + ConfigPanel + ProjectModal
│       └── schedule-screen.js  # GanttWrapper + TaskDetailPanel + AddTaskModal + Import/Export
├── Dockerfile               # マルチステージビルド (builder → slim runtime、非rootユーザー)
├── docker-compose.yml       # ローカル開発: app(hot-reload) + postgres
├── docker-entrypoint.sh     # 起動時 alembic upgrade head → uvicorn
└── .github/workflows/
    └── ci.yml               # push/PR で ruff lint → pytest → docker build
```

### Key Design Decisions

**DB**: SQLite for local dev（`DATABASE_URL` デフォルト）、PostgreSQL on Docker/本番。`Config` テーブルはシングルトン（id 常に 1）。

**Task types**: `task_type='milestone'` は `start_date == end_date` を DB レベル（CHECK 制約）とスキーマレベルの両方で強制。Frappe Gantt では `custom_class: 'bar-milestone'` でダイヤモンド◆表示。

**Frontend state**: URL search params（`?tab=top&project=2`）が single source of truth。ブックマーク・共有・ブラウザ戻るに対応。`AppState` (`app.js`) がコーディネーター、`window._loadGanttProject(pid)` が `app.js` → `schedule-screen.js` のブリッジ。

**Drag & drop**: `PATCH /api/v1/projects/{id}/tasks/{task_id}/dates` はドラッグ専用の軽量エンドポイント（start/end のみ受け付ける）。

### API Summary
```
GET/PATCH                   /api/v1/config
GET/POST                    /api/v1/projects
GET/PATCH/DELETE            /api/v1/projects/{id}
GET/POST                    /api/v1/projects/{id}/tasks
PATCH/DELETE                /api/v1/projects/{id}/tasks/{task_id}
PATCH                       /api/v1/projects/{id}/tasks/{task_id}/dates
GET                         /api/v1/projects/{id}/export?format=json|csv
POST                        /api/v1/projects/import
GET                         /health
```

### Startup Flow (Docker)
`docker-entrypoint.sh` → `alembic upgrade head` → `uvicorn`。
開発環境（`APP_ENV=development`）では `Base.metadata.create_all()` でテーブルも自動生成。

### CI (GitHub Actions)
`.github/workflows/ci.yml` — push/PR で `ruff check` → `pytest` → `docker build` を実行。

### Environment Variables
`.env.example` 参照。主要: `DATABASE_URL`, `APP_ENV`, `CORS_ORIGINS`, `LOG_LEVEL`, `APP_WORKERS`。
