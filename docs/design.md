# opeSchedule 設計資料

> 作成日: 2026-03-19
> バージョン: 0.1.0

---

## 目次

1. [システム概要](#1-システム概要)
2. [アーキテクチャ概要](#2-アーキテクチャ概要)
3. [ディレクトリ構成](#3-ディレクトリ構成)
4. [フロントエンド設計](#4-フロントエンド設計)
5. [バックエンド設計](#5-バックエンド設計)
6. [データベース設計](#6-データベース設計)
7. [API 仕様](#7-api-仕様)
8. [Import / Export 仕様](#8-import--export-仕様)
9. [インフラ・運用](#9-インフラ運用)
10. [環境変数](#10-環境変数)
11. [開発・起動手順](#11-開発起動手順)

---

## 1. システム概要

**opeSchedule** は Web ベースの開発スケジュール管理ツール（ガントチャート）。

| 項目 | 内容 |
|------|------|
| 目的 | 開発スケジュールの作成・管理・共有 |
| 表現形式 | ガントチャート（Frappe Gantt） |
| 1日イベント | ダイヤモンド ◆（マイルストーン） |
| 期間イベント | 横バー |
| データ永続化 | SQLite（開発）/ PostgreSQL（Docker・本番） |
| Import/Export | JSON / CSV |

---

## 2. アーキテクチャ概要

```
ブラウザ
  │  HTTP (同一オリジン)
  ▼
FastAPI (uvicorn)  ポート 8000
  ├── /api/v1/*        REST API (JSON)
  ├── /api/docs        Swagger UI
  ├── /health          ヘルスチェック
  └── /                静的ファイル配信 (frontend/)
       │
       ▼
    SQLAlchemy ORM
       │
  ┌────┴────┐
SQLite     PostgreSQL
(ローカル)  (Docker/本番)
```

### 技術スタック

| 層 | 技術 | バージョン |
|----|------|-----------|
| フロントエンド | Vanilla JS (ES Modules) | — |
| ガントチャート | Frappe Gantt (CDN) | 0.6.1 |
| バックエンド | FastAPI | 0.115.5 |
| ASGI サーバー | uvicorn | 0.32.1 |
| ORM | SQLAlchemy | 2.0.36 |
| DB マイグレーション | Alembic | 1.14.0 |
| バリデーション | Pydantic v2 | 2.10.3 |
| DB (開発) | SQLite | — |
| DB (Docker) | PostgreSQL | 16 |
| コンテナ | Docker / Docker Compose | — |
| CI | GitHub Actions | — |

---

## 3. ディレクトリ構成

```
opeSchedule/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI アプリ、lifespan、ルーター登録、静的ファイル配信
│   │   ├── config.py        # pydantic-settings による設定管理 (.env 読み込み)
│   │   ├── database.py      # SQLAlchemy engine / SessionLocal / Base / get_db
│   │   ├── models/
│   │   │   ├── config.py    # Config ORM (シングルトン id=1)
│   │   │   ├── project.py   # Project ORM
│   │   │   └── task.py      # Task / TaskDependency ORM
│   │   ├── schemas/
│   │   │   ├── config.py    # ConfigRead / ConfigUpdate スキーマ
│   │   │   ├── project.py   # ProjectCreate / ProjectUpdate / ProjectResponse
│   │   │   └── task.py      # TaskCreate / TaskUpdate / TaskDateUpdate /
│   │   │                    # TaskReorderItem / TaskResponse
│   │   └── routers/
│   │       ├── config.py        # GET/PATCH /api/v1/config
│   │       ├── projects.py      # CRUD /api/v1/projects
│   │       ├── tasks.py         # CRUD + reorder /api/v1/projects/{id}/tasks
│   │       └── import_export.py # GET export / POST import
│   ├── alembic/
│   │   └── versions/
│   │       └── 0001_initial.py  # 初回マイグレーション
│   ├── tests/
│   │   ├── conftest.py      # SQLite in-memory (StaticPool) テスト DB
│   │   ├── test_config.py
│   │   ├── test_projects.py
│   │   ├── test_tasks.py
│   │   ├── test_import_export.py
│   │   └── test_reorder.py
│   ├── alembic.ini
│   ├── pyproject.toml       # ruff 設定
│   └── requirements.txt
├── frontend/
│   ├── index.html           # Top画面（Projects + Global Config）
│   ├── schedule.html        # Schedule画面（Ganttチャート、?project=<id>）
│   ├── css/
│   │   ├── main.css         # レイアウト・フォーム・モーダル・ダークモード
│   │   └── gantt-overrides.css  # Frappe Gantt カスタマイズ
│   └── js/
│       ├── app.js           # index.html 用エントリポイント（Toast・テーマ）
│       ├── api.js           # 全 API エンドポイント fetch ラッパー
│       ├── top-screen.js    # ProjectList / ConfigPanel / ProjectModal
│       └── schedule-screen.js  # schedule.html 専用スタンドアロン（Gantt全機能）
├── docs/
│   └── design.md            # 本資料
├── Dockerfile               # マルチステージビルド (builder → runtime)
├── docker-compose.yml       # app(hot-reload) + postgres
├── docker-entrypoint.sh     # alembic upgrade head → uvicorn 起動
├── start.bat                # Windows ローカル開発用起動スクリプト
└── .github/workflows/
    └── ci.yml               # push/PR: ruff lint → pytest → docker build
```

---

## 4. フロントエンド設計

### 4.1 画面構成

タブ構成を廃止し、**2ページ構成**に変更（2026-03-19）。

```
【index.html — Top 画面】
┌─────────────────────────────────────────────────┐
│  📅 opeSchedule                        ヘッダー  │
├─────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌────────────────────┐    │
│  │   Projects      │  │   Global Config    │    │
│  │  ─────────────  │  │  ─────────────     │    │
│  │  ▶ 開く  Edit  │  │  週の開始曜日      │    │
│  │   Del  Del      │  │  デフォルト表示    │    │
│  │  ...            │  │  テーマ etc.       │    │
│  └─────────────────┘  └────────────────────┘    │
└─────────────────────────────────────────────────┘
         │「▶ 開く」クリックで画面遷移
         ▼ schedule.html?project=<id>

【schedule.html — Schedule 画面】
┌─────────────────────────────────────────────────┐
│ ← Top  📅 opeSchedule  プロジェクト名           │
│         [Day][Week][Month][Quarter]              │
│         Import  Export JSON  Export CSV  +Add   │
├─────────────────────────────────────────────────┤
│  ┌─────────────── Gantt チャート ──────────────┐  │
│  │  タスク名  ████████████                     │  │
│  │  マイル    ◆                                │  │
│  └─────────────────────────────────────────────┘  │
│  ┌──────── Task Detail Panel ─────────────────┐   │
│  │  タスク名 / 日付 / 進捗 / 色 / メモ        │   │
│  └────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### 4.2 画面遷移

| 操作 | 遷移先 |
|------|--------|
| `index.html` → 「▶ 開く」ボタン | `schedule.html?project=<id>` |
| `schedule.html` → 「← Top」ボタン | `index.html` (/) |
| Import 完了後 | `schedule.html?project=<新id>` |

### 4.3 モジュール構成

```
【index.html】                    【schedule.html】
app.js                            schedule-screen.js (スタンドアロン)
  └── top-screen.js                 └── api.js
        └── api.js
```

| モジュール | 対象ページ | 責務 |
|-----------|----------|------|
| `app.js` | index.html | Toast・テーマ適用・Top画面初期化 |
| `api.js` | 両ページ | 全 API エンドポイント fetch ラッパー・エラー正規化 |
| `top-screen.js` | index.html | プロジェクト一覧・Config フォーム・プロジェクト作成/編集モーダル |
| `schedule-screen.js` | schedule.html | URL から project ID 取得・Config 読み込み・Gantt 描画・タスク追加/編集/削除・ドラッグ&ドロップ・Import/Export |

### 4.4 Gantt チャート（カスタム実装）

Frappe Gantt を廃止し、完全カスタムの Gantt チャートを実装。

#### レイアウト

```
┌──────────┬──────────┬──────────────┬────────────────────────────────────┐
│ 大項目   │ 中項目   │ 小項目       │  4月        │  5月        │ 6月    │
├──────────┼──────────┼──────────────┼─────────────────────────────────────┤
│          │          │ 市場調査     │ ██████      │             │        │
│ Phase1   │ 調査・   │ ヒアリング   │       ████  │             │        │
│ 要件定義 │ 要件整理 │ 要件書作成   │         ██████████       │        │
│(span n行)│(span n行)│ 要件定義完了 │                    ◆     │        │
├──────────┼──────────┼──────────────┤                                     │
│ Phase2   │ 設計     │ 基本設計     │                  ████████│        │
│ ...      │ ...      │ ...          │ ...                                 │
└──────────┴──────────┴──────────────┴────────────────────────────────────┘
```

- 左ペイン: `hier-pane`（3列: `.hier-col--large` / `--medium` / `--small`）
  - 大項目・中項目セルは子タスク数 × ROW_H の高さで `rowspan` 相当を実現
  - 小項目セル（height=36px）をクリック → タスク詳細パネルを開く
- 右ペイン: `gantt-pane`（日付ヘッダー + タスクバー行）
  - バー位置: `left = diffDays(chartStart, taskStart) × pxPerDay`
  - バー幅: `(diffDays(startD, endD) + 1) × pxPerDay`
  - 縦スクロールを左右ペイン間で同期（`scrollTop` 双方向バインド）

#### バー操作
- **クリック** → タスク詳細パネルを開く
- **水平ドラッグ** → `mousedown/mousemove/mouseup` で日程シフト → `PATCH /dates` API
- **マイルストーン** → ◆（45° 回転した 14px 正方形）

#### 日付ヘッダー
| viewMode | pxPerDay | 上段 | 下段 |
|----------|----------|------|------|
| Day      | 40       | 年/月 | 日(曜) |
| Week     | 8        | 年/月 | 週開始日 |
| Month    | 2.5      | 年   | 月 |
| Quarter  | 0.8      | 年   | Q1〜Q4 |

#### Tooltip
ホバーで `.gantt-tooltip` を `position:fixed` で表示（ウィンドウ端を避けて自動配置）。

### 4.5 テーマ

CSS カスタムプロパティ (`--color-*`) でライト/ダーク切替。
`body.theme-dark` クラスで上書き。Config の `theme` フィールドと連動。

---

## 5. バックエンド設計

### 5.1 アプリケーション起動フロー

```
lifespan (起動時)
  └── APP_ENV == "development"
        → Base.metadata.create_all()  // 開発時のみ自動テーブル作成
  └── APP_ENV == "production"
        → Alembic が担当 (docker-entrypoint.sh で実行)

ルーター登録
  /api/v1/config
  /api/v1/projects
  /api/v1/projects/{id}/tasks
  /api/v1/projects/{id}/export
  /api/v1/projects/import

静的ファイル
  / → frontend/ ディレクトリ (html=True でSPA対応)
```

### 5.2 DB セッション管理

```python
# database.py
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

FastAPI の Depends で各エンドポイントにセッションを注入。

### 5.3 バリデーション戦略

- **スキーマレベル** (Pydantic v2): フィールドバリデーター + `model_validator`
- **DBレベル** (SQLAlchemy CHECK 制約): 二重保護

| ルール | スキーマ | DB |
|--------|----------|----|
| end_date >= start_date | ✓ | ✓ |
| progress: 0.0〜1.0 | ✓ | ✓ |
| マイルストーン: start == end | ✓ | ✓ |
| Config: id = 1 のみ | — | ✓ |

### 5.4 テスト

```bash
# 全テスト実行 (backend/ ディレクトリから)
pytest tests/ -v
```

| テストファイル | 内容 |
|--------------|------|
| `test_config.py` | Config GET/PATCH |
| `test_projects.py` | プロジェクト CRUD |
| `test_tasks.py` | タスク CRUD・マイルストーン制約 |
| `test_import_export.py` | JSON/CSV Import/Export・循環依存チェック |
| `test_reorder.py` | タスク並び替え |

**テスト DB**: SQLite in-memory + `StaticPool`
（`StaticPool` により全コネクションが同一 in-memory DB を共有）

---

## 6. データベース設計

### 6.1 ER 図

```
config (シングルトン)
  id = 1 (固定)
  week_start_day
  date_format
  timezone
  default_view_mode
  highlight_weekends
  holiday_dates (JSON text)
  auto_scroll_today
  theme

projects ──< tasks ──< task_dependencies
  id              id              id
  name            project_id ─── task_id
  description     name            depends_on_id
  color           start_date
  status          end_date
  view_mode       task_type
  sort_order      progress
  created_at      parent_id ─── tasks.id (自己参照)
  updated_at      sort_order
                  color
                  notes
                  created_at
                  updated_at
```

### 6.2 テーブル定義

#### config

| カラム | 型 | デフォルト | 説明 |
|--------|-----|-----------|------|
| id | INTEGER PK | 1 | 常に 1 (CHECK 制約) |
| week_start_day | VARCHAR(3) | 'Mon' | Mon / Sun / Sat |
| date_format | VARCHAR(20) | 'YYYY-MM-DD' | 表示フォーマット |
| timezone | VARCHAR(50) | 'Asia/Tokyo' | タイムゾーン |
| default_view_mode | VARCHAR(20) | 'Week' | Day/Week/Month/Quarter |
| highlight_weekends | BOOLEAN | true | 週末ハイライト |
| holiday_dates | TEXT | '[]' | 祝日 JSON 配列 |
| auto_scroll_today | BOOLEAN | true | 今日へ自動スクロール |
| theme | VARCHAR(20) | 'light' | light / dark |
| updated_at | DATETIME | now() | 最終更新日時 |

#### projects

| カラム | 型 | デフォルト | 説明 |
|--------|-----|-----------|------|
| id | INTEGER PK | auto | — |
| name | VARCHAR(255) NOT NULL | — | プロジェクト名 |
| description | TEXT | NULL | 説明 |
| color | VARCHAR(7) | '#4A90D9' | 表示色 (HEX) |
| status | VARCHAR(20) | 'active' | active / archived |
| view_mode | VARCHAR(20) | NULL | NULL = グローバル設定を継承 |
| sort_order | INTEGER | 0 | 表示順 |
| created_at | DATETIME | now() | 作成日時 |
| updated_at | DATETIME | now() | 更新日時 |

#### tasks

| カラム | 型 | デフォルト | 説明 |
|--------|-----|-----------|------|
| id | INTEGER PK | auto | — |
| project_id | INTEGER FK | — | projects.id (CASCADE DELETE) |
| name | VARCHAR(255) NOT NULL | — | タスク名 |
| start_date | DATE NOT NULL | — | 開始日 |
| end_date | DATE NOT NULL | — | 終了日 |
| task_type | VARCHAR(20) | 'task' | task / milestone |
| progress | FLOAT | 0.0 | 進捗率 (0.0〜1.0) |
| parent_id | INTEGER FK | NULL | 親タスク ID (自己参照) |
| sort_order | INTEGER | 0 | 表示順 |
| color | VARCHAR(7) | NULL | 表示色 (HEX) |
| notes | TEXT | NULL | メモ |
| created_at | DATETIME | now() | 作成日時 |
| updated_at | DATETIME | now() | 更新日時 |

**CHECK 制約:**
- `end_date >= start_date`
- `progress >= 0.0 AND progress <= 1.0`
- `task_type != 'milestone' OR start_date = end_date`

#### task_dependencies

| カラム | 型 | 説明 |
|--------|-----|------|
| id | INTEGER PK | — |
| task_id | INTEGER FK | 依存元タスク (CASCADE DELETE) |
| depends_on_id | INTEGER FK | 依存先タスク (CASCADE DELETE) |

**ユニーク制約**: `(task_id, depends_on_id)`

---

## 7. API 仕様

### 7.1 エンドポイント一覧

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/health` | ヘルスチェック |
| GET | `/api/v1/config` | グローバル設定取得 |
| PATCH | `/api/v1/config` | グローバル設定更新 |
| GET | `/api/v1/projects` | プロジェクト一覧 |
| POST | `/api/v1/projects` | プロジェクト作成 |
| GET | `/api/v1/projects/{id}` | プロジェクト取得 |
| PATCH | `/api/v1/projects/{id}` | プロジェクト更新 |
| DELETE | `/api/v1/projects/{id}` | プロジェクト削除 |
| GET | `/api/v1/projects/{id}/tasks` | タスク一覧 |
| POST | `/api/v1/projects/{id}/tasks` | タスク作成 |
| PATCH | `/api/v1/projects/{id}/tasks/{tid}` | タスク更新 |
| DELETE | `/api/v1/projects/{id}/tasks/{tid}` | タスク削除 |
| PATCH | `/api/v1/projects/{id}/tasks/{tid}/dates` | 日付のみ更新（D&D専用） |
| POST | `/api/v1/projects/{id}/tasks/reorder` | タスク並び替え |
| GET | `/api/v1/projects/{id}/export` | エクスポート (json/csv) |
| POST | `/api/v1/projects/import` | インポート |

### 7.2 主要リクエスト/レスポンス

#### タスク作成 `POST /api/v1/projects/{id}/tasks`

```json
// Request Body
{
  "name": "機能A実装",
  "start_date": "2026-04-01",
  "end_date": "2026-04-10",
  "task_type": "task",
  "progress": 0.0,
  "color": "#4A90D9",
  "notes": "メモ",
  "sort_order": 0,
  "dependency_ids": []
}

// Response 201
{
  "id": 1,
  "project_id": 1,
  "name": "機能A実装",
  "start_date": "2026-04-01",
  "end_date": "2026-04-10",
  "task_type": "task",
  "progress": 0.0,
  "parent_id": null,
  "sort_order": 0,
  "color": "#4A90D9",
  "notes": "メモ",
  "dependencies": [],
  "created_at": "2026-04-01T00:00:00",
  "updated_at": "2026-04-01T00:00:00"
}
```

#### 日付更新（ドラッグ&ドロップ専用）`PATCH /api/v1/projects/{id}/tasks/{tid}/dates`

```json
// Request Body
{
  "start_date": "2026-04-05",
  "end_date": "2026-04-15"
}
```

#### タスク並び替え `POST /api/v1/projects/{id}/tasks/reorder`

```json
// Request Body (204 No Content を返す)
[
  {"id": 3, "sort_order": 0},
  {"id": 1, "sort_order": 1},
  {"id": 2, "sort_order": 2}
]
```

#### ヘルスチェック `GET /health`

```json
{
  "status": "ok",
  "db": "ok",
  "timestamp": "2026-04-01T00:00:00+00:00",
  "version": "0.1.0"
}
```

### 7.3 エラーレスポンス

| ステータス | 原因 | detail の型 |
|-----------|------|------------|
| 400 | ビジネスロジックエラー | string |
| 404 | リソース未存在 | string |
| 422 | バリデーションエラー | array `[{loc, msg, type}]` |

---

## 8. Import / Export 仕様

### 8.0 サンプルデータ

`docs/sample_schedule.json` にインポート用サンプルスケジュールを同梱。

| 項目 | 内容 |
|------|------|
| プロジェクト名 | Webアプリケーション開発プロジェクト 2026 |
| 期間 | 2026-04-01 〜 2026-09-25 |
| タスク数 | 53件（通常タスク 47 + マイルストーン 6） |
| フェーズ | Phase1 要件定義 / Phase2 設計 / Phase3 開発 / Phase4 テスト / Phase5 リリース |

インポート手順: Schedule 画面 → Import ボタン → `sample_schedule.json` を選択

### 8.1 JSON エクスポート形式

```json
{
  "version": "1.0",
  "exported_at": "2026-04-01T00:00:00+00:00",
  "project": {
    "name": "プロジェクト名",
    "description": "説明",
    "color": "#4A90D9",
    "view_mode": null
  },
  "tasks": [
    {
      "id": 1,
      "name": "タスク名",
      "start_date": "2026-04-01",
      "end_date": "2026-04-10",
      "task_type": "task",
      "progress": 0.5,
      "parent_id": null,
      "sort_order": 0,
      "color": "#4A90D9",
      "notes": null,
      "dependencies": [2, 3]
    }
  ]
}
```

### 8.2 CSV エクスポート形式

```csv
name,start_date,end_date,task_type,progress,color,notes,dependencies,sort_order
機能A実装,2026-04-01,2026-04-10,task,0.5,#4A90D9,,2,0
リリース,2026-04-15,2026-04-15,milestone,0.0,,,1,1
```

### 8.3 インポート処理フロー

```
ファイル受信 (JSON or CSV)
  │
  ├── JSON: json.loads() → project + tasks データ抽出
  └── CSV: DictReader → tasks のみ (プロジェクト名はファイル名から)
  │
  ├── 循環依存チェック (DFS)
  │     検出時 → HTTP 400
  │
  ├── Project レコード作成
  │
  ├── Task レコード作成 (旧 ID → 新 DB ID のマッピング)
  │
  └── TaskDependency 作成 (新 ID でリマップ)
        │
        db.commit() ← すべて成功時のみ (all-or-nothing)
```

---

## 9. インフラ・運用

### 9.1 Dockerfile（マルチステージビルド）

```
Stage 1: builder
  python:3.12-slim
  gcc / libpq-dev インストール
  pip install requirements.txt

Stage 2: runtime
  python:3.12-slim
  libpq5 のみ (開発ツール除外)
  非 root ユーザー appuser で実行
  WORKDIR /app
```

### 9.2 Docker Compose 構成

```
services:
  app  ポート 8000  (FastAPI + uvicorn --reload)
       volumes: ./backend, ./frontend をマウント (ホットリロード対応)
       depends_on: db (healthcheck 通過後に起動)

  db   ポート 5432  (PostgreSQL 16-alpine)
       volumes: postgres_data (永続化)
       healthcheck: pg_isready
```

### 9.3 起動エントリーポイント（本番）

```bash
# docker-entrypoint.sh
alembic upgrade head   # マイグレーション自動実行
uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --workers ${APP_WORKERS:-1} \
  --log-level ${LOG_LEVEL:-info}
```

### 9.4 CI（GitHub Actions）

トリガー: `main` / `develop` ブランチへの push、`main` への PR

```
Job 1: Lint & Test
  1. Python 3.12 セットアップ
  2. pip install -r requirements.txt + ruff + pytest
  3. ruff check .      (Lint)
  4. pytest tests/ -v  (テスト)

Job 2: Docker Build Check (Job1 成功後)
  1. docker build -t opeschedule:ci .
```

---

## 10. 環境変数

| 変数名 | デフォルト | 説明 |
|--------|-----------|------|
| `DATABASE_URL` | `sqlite:///./opeschedule.db` | DB 接続文字列 |
| `APP_ENV` | `development` | `development` / `production` |
| `APP_HOST` | `0.0.0.0` | リッスンホスト |
| `APP_PORT` | `8000` | リッスンポート |
| `CORS_ORIGINS` | `http://localhost:8000` | CORS 許可オリジン (カンマ区切り) |
| `LOG_LEVEL` | `info` | ログレベル |
| `APP_WORKERS` | `1` | uvicorn ワーカー数 |

設定ファイル: `backend/.env`（`.env.example` を参照）

---

## 11. 開発・起動手順

### 11.1 ローカル開発（Windows）

```bat
REM start.bat をダブルクリック or コマンドプロンプトから実行
start.bat
```

起動後: http://localhost:8000 でアクセス

### 11.2 手動起動

```bash
# 初回のみ
cd backend
pip install -r requirements.txt
alembic upgrade head

# 起動
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 11.3 Docker 起動（PostgreSQL 込み）

```bash
docker-compose up
```

### 11.4 テスト実行

```bash
cd backend
pytest tests/ -v              # 全テスト
pytest tests/test_tasks.py -v # 特定ファイル
```

### 11.5 DB マイグレーション

```bash
cd backend
alembic upgrade head                             # 最新に適用
alembic revision --autogenerate -m "説明"        # 新規マイグレーション作成
```

### 11.6 画面操作手順

1. **Top 画面** でプロジェクトを選択または新規作成
2. プロジェクト行の **「▶ 開く」** を押して Schedule 画面へ移動
3. **「+ Add Task」** でタスクを追加
4. タスクバーをクリックで詳細編集、ドラッグで日程変更
5. **Export JSON / Export CSV** でデータ出力
6. **Import** で既存データを取り込み（新規プロジェクトとして登録）
