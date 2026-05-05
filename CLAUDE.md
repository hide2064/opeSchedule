# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`opeSchedule` は Web ベースの開発スケジュール管理ツール（ガントチャート）。Python/FastAPI バックエンド、Vanilla JS + Frappe Gantt フロントエンド。

## Development Commands

起動は **Docker のみ**。PowerShell から実行する。

```powershell
# 通常起動（repo root で実行）
.\start.ps1
# → http://localhost:8000       フロントエンド
# → http://localhost:8000/api/docs  Swagger UI

# デバッグ起動（debugpy port 5678 で VSCode アタッチ）
.\start_debug.ps1

# コンテナ停止
docker compose down

# ログ確認
docker compose logs -f

# コンテナ内でテスト実行
docker compose run --rm app python -m pytest tests/ -v

# 単一テストファイル
docker compose run --rm app python -m pytest tests/test_tasks.py -v

# 単一テスト
docker compose run --rm app python -m pytest tests/test_tasks.py::test_create_task -v

# DB migration（本番環境向け）
docker compose run --rm app python -m alembic upgrade head
docker compose run --rm app python -m alembic revision --autogenerate -m "description"
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
│   ├── src/                 # React ソース
│   ├── dist/                # Vite ビルド成果物（Docker イメージに含まれる）
│   └── package.json
├── Dockerfile               # マルチステージビルド (Node build → Python slim runtime)
├── docker-compose.yml       # ローカル開発: hot-reload + SQLite volume mount
├── docker-compose.debug.yml # デバッグ用オーバーライド (debugpy port 5678)
├── .dockerignore
├── start.ps1                # 通常起動スクリプト（PowerShell）
├── start_debug.ps1          # デバッグ起動スクリプト（PowerShell）
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
GET                         /api/v1/projects/stats
GET                         /api/manual
GET                         /api/v1/projects/{id}/export?format=json|csv
POST                        /api/v1/projects/import
GET                         /health
```

### Startup Flow
`start.ps1` → `docker compose up --build` → Dockerfile でフロントエンドビルド → uvicorn 起動。
開発環境（`APP_ENV=development`）では `Base.metadata.create_all()` でテーブルも自動生成。
SQLite DB は `./backend/opeschedule.db`（ホスト側にそのまま永続化）。

デバッグ時は `start_debug.ps1` → Docker コンテナが debugpy で待機 → VSCode で `FastAPI: Attach to Docker (port 5678)` を選択してアタッチ。

### CI (GitHub Actions)
`.github/workflows/ci.yml` — push/PR で `ruff check` → `pytest` を実行。

### Environment Variables
`.env.example` 参照。主要: `DATABASE_URL`, `APP_ENV`, `CORS_ORIGINS`, `LOG_LEVEL`, `APP_WORKERS`。

## Maintenance Rules

### 設計書の更新・commit・push
コードに変更を加えた場合、以下を必ず実施すること。

1. **`docs/design.md` を最新の実装に合わせて更新する**
   - 変更したファイル・API・DB・設計判断が設計書に反映されているか確認
   - 変更内容に応じて該当セクションを修正する

2. **commit する**
   - 変更ファイル（コード + 設計書）をまとめてステージングし、コミットする

3. **`origin main` へ push する**
   - コミット後、`git push origin main` を実行する
