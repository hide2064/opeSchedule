# opeSchedule 設計資料

> 作成日: 2026-03-19
> 最終更新: 2026-03-19
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
| 表現形式 | カスタムガントチャート（Vanilla JS 実装） |
| 1日イベント | ダイヤモンド ◆（マイルストーン） |
| 期間イベント | 横バー（進捗率プログレスバー付き） |
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
│   │   │   ├── config.py    # ConfigUpdate / ConfigResponse スキーマ
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
│   ├── index.html           # Top画面（Projects + Global Config + 左サイドバー）
│   ├── schedule.html        # Schedule画面（Ganttチャート）
│   ├── css/
│   │   ├── main.css         # レイアウト・フォーム・モーダル・サイドバー・ダークモード
│   │   └── gantt-overrides.css  # Ganttチャート専用スタイル（ペイン・バー・矢印等）
│   └── js/
│       ├── app.js           # index.html 用エントリポイント（キーボードショートカット）
│       ├── api.js           # 全 API エンドポイント fetch ラッパー・エラー正規化
│       ├── top-screen.js    # ProjectList / ConfigPanel / ProjectModal /
│       │                    # CompareSidebar / CatfilterSidebar
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

**2ページ構成**（index.html / schedule.html）。

```
【index.html — Top 画面】
┌──────────────────────────────────────────────────────────┐
│  📅 opeSchedule                              ヘッダー    │
├────────────────┬─────────────────┬───────────────────────┤
│ 左サイドバー   │   Projects      │   Global Config       │
│ ─────────────  │  ─────────────  │  ─────────────        │
│ ▶ 比較表示     │  [プロジェクト  │  週の開始曜日         │
│   (折りたたみ) │   一覧]         │  デフォルト表示       │
│                │                 │  テーマ etc.          │
│ ▶ 大項目       │  [アーカイブ済  │                       │
│   フィルター   │   みを表示 □]  │                       │
│   (折りたたみ) │                 │                       │
└────────────────┴─────────────────┴───────────────────────┘
         │「プロジェクト名」クリックで画面遷移
         ▼ schedule.html?project=<id>

【schedule.html — Schedule 画面】
┌──────────────────────────────────────────────────────────┐
│ ← Top  📅 opeSchedule  プロジェクト名                   │
│         [Day][Week][Month][Quarter]                      │
│         Import  Export JSON  Export CSV  +Add            │
├──────────────────────────────────────────────────────────┤
│  ┌───────────── Gantt チャート ─────────────────────────┐ │
│  │ 大項目 │ 中項目 │ 小項目 ║  日付ヘッダー              │ │
│  │        │        │        ║  ████████                  │ │
│  │        │        │ ◆ MS  ║  ◆                        │ │
│  └────────────────────────── ──────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### 4.2 画面遷移

| 操作 | 遷移先 |
|------|--------|
| プロジェクト名クリック | `schedule.html?project=<id>` |
| 「まとめて表示」ボタン（比較モード） | `schedule.html?projects=1,2,3` |
| 「フィルター表示」ボタン（大項目フィルター） | `schedule.html?projects=1&projects=2&catfilter=大項目名` |
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
| `app.js` | index.html | エントリポイント。キーボードショートカット・initTopScreen() 呼び出し |
| `api.js` | 両ページ | 全 API エンドポイント fetch ラッパー・エラー正規化 |
| `top-screen.js` | index.html | プロジェクト一覧・Config フォーム・プロジェクト作成/編集モーダル・比較サイドバー・大項目フィルターサイドバー |
| `schedule-screen.js` | schedule.html | URL から表示モード判定・Config/Project/Tasks 読み込み・Gantt 描画・タスク追加/編集/削除・ドラッグ&ドロップ・Import/Export |

### 4.4 左サイドバー（比較表示 / 大項目フィルター）

index.html の左端に配置された `<aside class="compare-sidebar">`。2つのセクションを持ち、それぞれデフォルトで折りたたまれた状態（`hidden` 属性）。ヘッダークリックでトグル。

#### 比較表示セクション

- プロジェクトを 2つ以上チェックして「まとめて表示」ボタン押下
- URL: `schedule.html?projects=1,2,3`（カンマ区切りで 1つの `projects` パラメータ）
- schedule-screen.js 側で isMultiMode = true として処理される

#### 大項目フィルターセクション

- 全プロジェクトのタスクから `category_large` を収集して表示（Promise.all で並列取得）
- 1つ以上チェックして「フィルター表示」ボタン押下
- URL: `schedule.html?projects=1&projects=2&catfilter=大項目A&catfilter=大項目B`（複数パラメータ形式）
- schedule-screen.js 側で isCatfilterMode = true + isMultiMode = true として処理される

#### サイドバートグルの実装方針

```javascript
// header の id（例: "compare-toggle-header"）から body の id（"compare-section-body"）を
// 命名規則 "toggle-header" → "section-body" で自動導出
header.id.replace('toggle-header', 'section-body')
```

### 4.5 Gantt チャート（カスタム実装）

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
└──────────┴──────────┴──────────────┴────────────────────────────────────┘
```

- **左ペイン** (`hier-pane`): 3列（`.hier-col--large` / `--medium` / `--small`）
  - 大項目・中項目セルは子タスク数 × ROW_H (36px) の高さで rowspan 相当を実現
  - `align-items: flex-start` 設定により列がコンテンツ高さになり縦スクロール同期が機能する
  - スクロールバーは非表示（`scrollbar-width: none`）だが `overflow-y: scroll` で JS スクロール同期は有効
  - 小項目セル（height=36px）クリック → タスク詳細パネルを要素の右隣に表示
- **右ペイン** (`gantt-pane`): 日付ヘッダー + タスクバー行
  - バー位置: `left = diffDays(chartStart, taskStart) × pxPerDay`（絶対配置）
  - バー幅: `(diffDays(startD, endD) + 1) × pxPerDay`
  - 縦スクロールを左右ペイン間で同期（`scrollTop` 双方向バインド）

#### スクロール同期の仕組み

```
hierPane.scrollTop ←→ ganttPane.scrollTop
（scrollSyncing フラグで再帰発火を防止）

重要: hierPane の align-items: flex-start がないと
  列が stretch でコンテナ高さに伸び、overflow が発生せず scrollTop が無効になる
```

#### バー操作

- **クリック** → タスク詳細パネルを要素の右隣に表示（`getBoundingClientRect()` + `requestAnimationFrame` で正確な位置計算）
- **水平ドラッグ** → `mousedown/mousemove/mouseup` で日程シフト → `PATCH /dates` API
- **マイルストーン** → ◆（45° 回転した 14px 正方形）、ドラッグ無効

#### タスク詳細パネルの位置決め

```javascript
// 1. まず -9999px に仮配置 → ブラウザがレイアウト計算
// 2. requestAnimationFrame 後に offsetWidth/Height を計測
// 3. anchorEl.getBoundingClientRect() を基準に右隣へ配置
// 4. 右端からはみ出す場合は左隣へ折り返し
```

#### 日付ヘッダー

| viewMode | pxPerDay | 上段 | 下段 |
|----------|----------|------|------|
| Day      | 40       | 年/月 | 日(曜) |
| Week     | 8        | 年/月 | 週開始日 |
| Month    | 2.5      | 年   | 月 |
| Quarter  | 0.8      | 年   | Q1〜Q4 |

#### クリティカルパス

依存関係のある先行タスクの `end_date` と後続タスクの `start_date` の差（slack）が 0 以下の連鎖をクリティカルパスとみなす。

```
slack = (後続 start) - (先行 end) - 1日  ≦ 0 → クリティカル
```

クリティカルパス上のタスクバー・小項目ラベル・依存矢印を赤色でハイライト。

比較モード（isMultiMode）ではクリティカルパス計算・依存矢印は非表示。

#### Tooltip

ホバーで `.gantt-tooltip` を `position:fixed` で表示（ウィンドウ端を避けて自動配置）。

### 4.6 表示モード（URL 別）

| URL 形式 | モード | 挙動 |
|---------|--------|------|
| `?project=<id>` | 単一プロジェクト | 通常の編集可能 Gantt |
| `?projects=1,2,3` | 比較モード | 複数 PJ の読み取り専用 Gantt。大項目に `[PJ名]` プレフィックス |
| `?projects=1&projects=2&catfilter=大項目A` | フィルターモード | 比較モード + 指定大項目のみ表示 |

```javascript
// URL パース: 2 形式に対応
const _rawProjects = _urlParams.getAll('projects');
const _pidsMulti = (_rawProjects.length === 1 && _rawProjects[0].includes(','))
  ? _rawProjects[0].split(',').map(Number).filter(n => n > 0)  // カンマ区切り形式
  : _rawProjects.map(Number).filter(n => n > 0);               // 複数パラメータ形式

const isCatfilterMode = _urlParams.getAll('catfilter').length > 0;
const isMultiMode = _pidsMulti.length >= 2 || (_pidsMulti.length >= 1 && isCatfilterMode);
```

**比較/フィルターモードの制限（isMultiMode = true 時）:**
- タスク追加・Export ボタン非表示
- タスク詳細パネルの入力は disabled（読み取り専用）
- ドラッグ無効
- クリティカルパス・依存矢印非表示（プロジェクト間で task ID が衝突する可能性があるため）

### 4.7 アーカイブ機能

| project_status | 自動設定される status |
|------------|----------------------|
| 未開始・作業中 | active |
| 中断・終了 | archived |

- フロントエンド（Edit モーダルの submit 処理）で自動導出してバックエンドに送信
- Top 画面のプロジェクト一覧: archived は非表示（デフォルト）
- 「アーカイブ済みを表示」チェックボックスで表示切替
- archived プロジェクト行はグレーアウト（opacity: 0.55）+ `archived` バッジ表示

### 4.8 テーマ

CSS カスタムプロパティ (`--color-*`) でライト/ダーク切替。
`body.theme-dark` クラスで上書き。Config の `theme` フィールドと連動。

---

## 5. バックエンド設計

### 5.1 アプリケーション起動フロー

```
lifespan (起動時)
  └── APP_ENV == "development"
        → Base.metadata.create_all()  // 開発時のみ ORM でテーブル自動作成
  └── APP_ENV == "production"
        → Alembic が担当 (docker-entrypoint.sh で実行)

ルーター登録（/api/v1 プレフィックス）
  /api/v1/config
  /api/v1/projects
  /api/v1/projects/{id}/tasks
  /api/v1/projects/{id}/export
  /api/v1/projects/import

静的ファイル（API より後に登録: 先に登録すると API リクエストを横取りする）
  / → frontend/ ディレクトリ (html=True でルートアクセスを index.html に転送)
```

### 5.2 DB セッション管理

```python
# database.py
def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()  # エラー時も必ずクローズ
```

FastAPI の `Depends` で各エンドポイントにセッションを注入。

SQLite では WAL モードを有効化し、並行読み取りパフォーマンスを向上。

### 5.3 バリデーション戦略

スキーマ（Pydantic v2）と DB（SQLAlchemy CHECK 制約）の二重保護。

| ルール | スキーマ | DB |
|--------|----------|----|
| end_date >= start_date | ✓ | ✓ |
| progress: 0.0〜1.0 | ✓ | ✓ |
| マイルストーン: start == end | ✓ | ✓ |
| Config: id = 1 のみ | — | ✓ |
| status: active or archived | ✓ | — |
| project_status: 4値のいずれか | ✓ | — |

### 5.4 テスト

```bash
# 全テスト実行 (backend/ ディレクトリから)
pytest tests/ -v
```

| テストファイル | 内容 |
|--------------|------|
| `test_config.py` | Config GET/PATCH |
| `test_projects.py` | プロジェクト CRUD・アーカイブ |
| `test_tasks.py` | タスク CRUD・マイルストーン制約 |
| `test_import_export.py` | JSON/CSV Import/Export・循環依存チェック |
| `test_reorder.py` | タスク並び替え |

**テスト DB**: SQLite in-memory + `StaticPool`
（`StaticPool` により全コネクションが同一 in-memory DB を共有）

---

## 6. データベース設計

### 6.1 ER 図

```
config (シングルトン id=1)
  ├── week_start_day / date_format / timezone
  ├── default_view_mode / highlight_weekends / holiday_dates (JSON)
  ├── auto_scroll_today / theme
  └── updated_at

projects ──< tasks ──< task_dependencies
  id              id              id
  name            project_id ─── task_id
  description     category_large  depends_on_id
  color           category_medium
  status          name
  project_status  start_date
  client_name     end_date
  base_project    task_type
  view_mode       progress
  sort_order      parent_id ─── tasks.id (自己参照)
  created_at      sort_order
  updated_at      color / notes
                  created_at / updated_at
```

### 6.2 テーブル定義

#### config

| カラム | 型 | デフォルト | 説明 |
|--------|-----|-----------|------|
| id | INTEGER PK | 1 | 常に 1（CHECK 制約でシングルトン強制） |
| week_start_day | VARCHAR(3) | 'Mon' | Mon / Sun / Sat |
| date_format | VARCHAR(20) | 'YYYY-MM-DD' | 表示フォーマット |
| timezone | VARCHAR(50) | 'Asia/Tokyo' | タイムゾーン |
| default_view_mode | VARCHAR(20) | 'Week' | Day/Week/Month/Quarter |
| highlight_weekends | BOOLEAN | true | 週末ハイライト |
| holiday_dates | TEXT | '[]' | カスタム祝日 JSON 配列（ISO 日付文字列） |
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
| status | VARCHAR(20) | 'active' | active / archived（アーカイブフラグ） |
| project_status | VARCHAR(20) | '未開始' | 未開始 / 作業中 / 中断 / 終了（業務ステータス） |
| client_name | VARCHAR(255) | NULL | 客先名 |
| base_project | VARCHAR(255) | NULL | ベースプロジェクト名 |
| view_mode | VARCHAR(20) | NULL | NULL = グローバル設定を継承 |
| sort_order | INTEGER | 0 | 表示順 |
| created_at | DATETIME | now() | 作成日時 |
| updated_at | DATETIME | now() | 更新日時 |

> **アーカイブルール（フロントエンド実装）**: Edit 保存時に project_status が「中断」または「終了」の場合 status = archived を自動設定。「未開始」または「作業中」の場合 status = active。

#### tasks

| カラム | 型 | デフォルト | 説明 |
|--------|-----|-----------|------|
| id | INTEGER PK | auto | — |
| project_id | INTEGER FK | — | projects.id（CASCADE DELETE） |
| category_large | VARCHAR(200) | NULL | 大項目（Gantt 左ペイン 1列目） |
| category_medium | VARCHAR(200) | NULL | 中項目（Gantt 左ペイン 2列目） |
| name | VARCHAR(255) NOT NULL | — | タスク名（小項目） |
| start_date | DATE NOT NULL | — | 開始日 |
| end_date | DATE NOT NULL | — | 終了日 |
| task_type | VARCHAR(20) | 'task' | task / milestone |
| progress | FLOAT | 0.0 | 進捗率（0.0〜1.0） |
| parent_id | INTEGER FK | NULL | 親タスク ID（自己参照、SET NULL） |
| sort_order | INTEGER | 0 | 表示順 |
| color | VARCHAR(7) | NULL | 表示色 (HEX) |
| notes | TEXT | NULL | メモ |
| created_at | DATETIME | now() | 作成日時 |
| updated_at | DATETIME | now() | 更新日時 |

**CHECK 制約:**
- `end_date >= start_date`
- `progress >= 0.0 AND progress <= 1.0`
- `task_type != 'milestone' OR start_date = end_date`（マイルストーンは 1日のみ）

#### task_dependencies

| カラム | 型 | 説明 |
|--------|-----|------|
| id | INTEGER PK | — |
| task_id | INTEGER FK | 依存元タスク（CASCADE DELETE） |
| depends_on_id | INTEGER FK | 依存先タスク（CASCADE DELETE） |

**ユニーク制約**: `(task_id, depends_on_id)`

---

## 7. API 仕様

### 7.1 エンドポイント一覧

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/health` | ヘルスチェック（DB 接続確認含む） |
| GET | `/api/v1/config` | グローバル設定取得 |
| PATCH | `/api/v1/config` | グローバル設定更新 |
| GET | `/api/v1/projects?include_archived=false` | プロジェクト一覧（アーカイブ除外がデフォルト） |
| POST | `/api/v1/projects` | プロジェクト作成 |
| GET | `/api/v1/projects/{id}` | プロジェクト取得 |
| PATCH | `/api/v1/projects/{id}` | プロジェクト更新（部分更新） |
| DELETE | `/api/v1/projects/{id}` | プロジェクト削除（タスクも CASCADE） |
| GET | `/api/v1/projects/{id}/tasks` | タスク一覧（sort_order 順） |
| POST | `/api/v1/projects/{id}/tasks` | タスク作成 |
| PATCH | `/api/v1/projects/{id}/tasks/{tid}` | タスク更新（部分更新） |
| DELETE | `/api/v1/projects/{id}/tasks/{tid}` | タスク削除 |
| PATCH | `/api/v1/projects/{id}/tasks/{tid}/dates` | 日付のみ更新（D&D 専用軽量エンドポイント） |
| POST | `/api/v1/projects/{id}/tasks/reorder` | タスク並び替え（sort_order 一括更新） |
| GET | `/api/v1/projects/{id}/export?format=json\|csv` | エクスポート |
| POST | `/api/v1/projects/import` | インポート（JSON/CSV） |

### 7.2 主要リクエスト/レスポンス

#### プロジェクト作成 `POST /api/v1/projects`

```json
// Request Body
{
  "name": "ECサイトリニューアル",
  "color": "#4A90D9",
  "project_status": "作業中",
  "status": "active",
  "client_name": "株式会社○○",
  "base_project": null,
  "view_mode": null
}

// Response 201
{
  "id": 1,
  "name": "ECサイトリニューアル",
  "description": null,
  "color": "#4A90D9",
  "status": "active",
  "project_status": "作業中",
  "client_name": "株式会社○○",
  "base_project": null,
  "view_mode": null,
  "sort_order": 0,
  "created_at": "2026-03-19T00:00:00",
  "updated_at": "2026-03-19T00:00:00"
}
```

#### タスク作成 `POST /api/v1/projects/{id}/tasks`

```json
// Request Body
{
  "category_large": "Phase1 要件定義",
  "category_medium": "調査・要件整理",
  "name": "市場調査",
  "start_date": "2026-04-01",
  "end_date": "2026-04-10",
  "task_type": "task",
  "progress": 0.0,
  "color": null,
  "notes": null,
  "sort_order": 0,
  "dependency_ids": []
}

// Response 201
{
  "id": 1,
  "project_id": 1,
  "category_large": "Phase1 要件定義",
  "category_medium": "調査・要件整理",
  "name": "市場調査",
  "start_date": "2026-04-01",
  "end_date": "2026-04-10",
  "task_type": "task",
  "progress": 0.0,
  "parent_id": null,
  "sort_order": 0,
  "color": null,
  "notes": null,
  "dependencies": [],
  "created_at": "2026-03-19T00:00:00",
  "updated_at": "2026-03-19T00:00:00"
}
```

#### 日付更新（ドラッグ&ドロップ専用）`PATCH /api/v1/projects/{id}/tasks/{tid}/dates`

```json
// Request Body（start/end のみ。他フィールドは変更しない）
{
  "start_date": "2026-04-05",
  "end_date": "2026-04-15"
}
```

#### タスク並び替え `POST /api/v1/projects/{id}/tasks/reorder`

```json
// Request Body（204 No Content を返す）
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
| 400 | ビジネスロジックエラー（循環依存など） | string |
| 404 | リソース未存在 | string |
| 422 | バリデーションエラー | array `[{loc, msg, type}]` |

---

## 8. Import / Export 仕様

### 8.0 サンプルデータ

`docs/` にインポート用サンプルスケジュールを複数同梱。

| ファイル名 | プロジェクト内容 |
|----------|---------------|
| sample_schedule.json | Webアプリケーション開発（53タスク） |
| sample_ai_chatbot.json | AI チャットボット開発 |
| sample_cloud_migration.json | クラウド移行 |
| sample_mobile_app.json | モバイルアプリ開発 |
| その他 | dx_promotion / ec_site / erp_renewal / office_relocation / security_audit など |

インポート手順: Schedule 画面 → Import ボタン → JSON/CSV ファイルを選択

### 8.1 JSON エクスポート形式

```json
{
  "version": "1.0",
  "exported_at": "2026-04-01T00:00:00+00:00",
  "project": {
    "name": "プロジェクト名",
    "description": "説明",
    "color": "#4A90D9",
    "project_status": "作業中",
    "client_name": null,
    "base_project": null,
    "view_mode": null
  },
  "tasks": [
    {
      "id": 1,
      "category_large": "Phase1 要件定義",
      "category_medium": "調査",
      "name": "市場調査",
      "start_date": "2026-04-01",
      "end_date": "2026-04-10",
      "task_type": "task",
      "progress": 0.5,
      "parent_id": null,
      "sort_order": 0,
      "color": null,
      "notes": null,
      "dependencies": [2, 3]
    }
  ]
}
```

### 8.2 CSV エクスポート形式

```csv
category_large,category_medium,name,start_date,end_date,task_type,progress,color,notes,dependencies,sort_order
Phase1 要件定義,調査,市場調査,2026-04-01,2026-04-10,task,0.5,,,,0
Phase1 要件定義,調査,要件定義完了,2026-04-15,2026-04-15,milestone,0.0,,,1,1
```

### 8.3 インポート処理フロー

```
ファイル受信 (JSON or CSV)
  │
  ├── JSON: json.loads() → project + tasks データ抽出
  └── CSV:  DictReader → tasks のみ（プロジェクト名はファイル名から）
  │
  ├── _assign_local_ids(): id が無い場合はローカル連番を付与（循環チェックより先に実行）
  │
  ├── _validate_no_circular(): DFS で循環依存チェック
  │     検出時 → HTTP 400
  │
  ├── Project レコード作成
  │
  ├── Pass 1: Task レコード作成（旧 ID → 新 DB ID のマッピング構築）
  │
  └── Pass 2: TaskDependency 作成（新 ID でリマップ）
        │
        db.commit() ← 全成功時のみ (all-or-nothing)
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
  libpq5 のみ (開発ツール除外 → イメージ軽量化)
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
| `APP_ENV` | `development` | `development` / `production`（開発時は ORM でテーブル自動作成） |
| `APP_HOST` | `0.0.0.0` | リッスンホスト |
| `APP_PORT` | `8000` | リッスンポート |
| `CORS_ORIGINS` | `http://localhost:8000` | CORS 許可オリジン（カンマ区切りで複数指定可） |
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
2. プロジェクト名をクリックして Schedule 画面へ移動
3. **「+ Add Task」** でタスクを追加（大項目・中項目・小項目・日程・種別）
4. タスクバーをクリックで詳細編集、ドラッグで日程変更
5. **Export JSON / Export CSV** でデータ出力
6. **Import** で既存データを取り込み（新規プロジェクトとして登録）
7. 左サイドバーの **「比較表示」** で複数プロジェクトを重ねて閲覧
8. 左サイドバーの **「大項目フィルター」** で横断的な大項目比較を閲覧
9. プロジェクト Edit で project_status を「中断」/「終了」に設定するとアーカイブ化

---

## 12. 主要な設計判断

| 判断事項 | 採用内容 | 理由 |
|---------|---------|------|
| Gantt ライブラリ | Frappe Gantt を廃止しカスタム実装 | 大項目・中項目の rowspan 表示や縦スクロール同期など独自レイアウトに対応するため |
| スクロール同期 | `align-items: flex-start` + `overflow-y: scroll` + 非表示スクロールバー | flex の stretch でコンテナ高さと一致すると overflow が発生せず scrollTop が効かないため |
| タスク詳細ポップオーバー位置 | クリック座標ではなく `getBoundingClientRect()` で要素右隣に配置 | クリック位置に依存せず安定した配置のため |
| アーカイブ自動化 | フロントエンドが project_status から status を自動導出 | ユーザーに「アーカイブする」という操作を意識させず、ステータス変更だけで完結するため |
| 比較モード URL 形式 | `?projects=1,2,3`（カンマ区切り単一パラメータ） | 比較サイドバーからの遷移で生成。フィルターモードとは別形式 |
| フィルターモード URL 形式 | `?projects=1&projects=2&catfilter=大項目` | URLSearchParams.append で複数パラメータ形式を使用。getAll() で受け取る |
| Config シングルトン | id = 1 固定 + CHECK 制約 | アプリ全体設定は 1レコードのみ。get_or_create_config() で初回自動作成 |
| Import 2パス処理 | Pass1: タスク作成 + ID マップ構築 → Pass2: 依存関係登録 | Pass1 で全タスクの DB ID が確定してから依存関係を張るため |
