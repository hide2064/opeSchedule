# Dashboard・キーボードショートカット・ズーム記憶・マニュアル設計書

> 作成日: 2026-05-02

---

## 概要

本仕様書は以下4機能の設計を定義する。

| ID | 機能 | 優先度 |
|----|------|--------|
| B-1 | 進捗ダッシュボード | ◎ |
| C-1 | キーボードショートカット（マニュアル統合） | ◎ |
| C-2 | ズームレベル記憶（DB保存） | ◎ |
| M-1 | マニュアルモーダル（画面内表示） | ◎ |

---

## B-1: 進捗ダッシュボード

### 目的

トップ画面で全プロジェクトの進捗・遅延・次回マイルストーンを一覧把握できる。

### 画面構成

トップナビゲーションに `[📊 Dashboard]` タブを追加（Projects・Config と並列）。

```
[📁 Projects] [📊 Dashboard] [⚙️ Config]
```

Dashboard タブを開くと `GET /api/v1/projects/stats` を呼び出し、プロジェクトカードをグリッド表示する。

```
┌─ ECサイトリニューアル (WebApp) ──────────────────────┐
│  作業中  👤 株式会社サンプル商事                      │
│  ██████████░░░ 72%  (50/69 タスク)                   │
│  ⚠ 遅延 3件     ◆ 基本設計完了  6/12 (41日後)        │
│                                        [→ 開く]       │
└─────────────────────────────────────────────────────┘
```

カードのクリック / [→ 開く] でスケジュール画面へ遷移。

### バックエンド

**新エンドポイント:** `GET /api/v1/projects/stats`

レスポンス（`list[ProjectStats]`）:

```json
[
  {
    "id": 1,
    "progress_pct": 0.72,
    "total_tasks": 69,
    "completed_tasks": 50,
    "delayed_task_count": 3,
    "next_milestone_name": "基本設計完了",
    "next_milestone_date": "2026-06-12"
  }
]
```

集計ロジック（SQLAlchemy で1クエリ）:
- `progress_pct` = `AVG(progress)` （マイルストーン・セパレーターを除く `task_type='task'` のみ）
- `delayed_task_count` = `end_date < today AND progress < 1.0` のカウント
- `next_milestone` = `task_type='milestone' AND end_date >= today ORDER BY end_date LIMIT 1`

**新スキーマ:** `backend/app/schemas/project.py` に `ProjectStats` を追加。

**ルーター:** `backend/app/routers/projects.py` に `list_project_stats()` を追加。`/projects/stats` は `/projects/{id}` より先にルーティングされるよう順序に注意。

### フロントエンド

**新ファイル:** `frontend/src/components/top/DashboardPanel.jsx`

- Dashboard タブがアクティブになった時点で `api.getProjectStats()` を呼び出す
- `projects`（既存一覧）と `stats`（集計値）を `id` でマージして表示
- 遅延タスクがある場合は遅延数を赤バッジで強調
- 次回マイルストーンは「名前 日付 (N日後)」形式で表示。過去日の場合は「(N日前)」と赤字

**変更ファイル:**
- `frontend/src/api.js`: `getProjectStats()` 追加
- `frontend/src/components/top/TopScreen.jsx`: Dashboard タブ追加、DashboardPanel レンダリング

---

## C-1: キーボードショートカット

### 目的

よく使う操作をキーボードで素早く実行できる。一覧はマニュアルモーダルで確認できる。

### ショートカット一覧（スケジュール画面）

| キー | 動作 | 条件 |
|------|------|------|
| `N` | 新規タスク追加モーダルを開く | input/textarea フォーカス外 |
| `Escape` | 開いているパネル/モーダルをすべて閉じる | 常時 |
| `Ctrl+F` | タスク検索フィールドにフォーカス | 常時 |
| `Ctrl+P` | 印刷ダイアログを開く | 常時 |
| `?` | マニュアルモーダルを開く | input/textarea フォーカス外 |

### 実装方針

- `GanttChart.jsx` の `useEffect` に `document.addEventListener('keydown', handler)` を追加
- `isInputFocused()` ヘルパー: `document.activeElement.tagName` が `INPUT`/`TEXTAREA`/`SELECT` の場合はショートカットをスキップ
- `Escape` のみ常時有効（モーダル・パネルを閉じるため）
- クリーンアップで `removeEventListener`

---

## M-1: マニュアルモーダル

### 目的

操作に迷ったときにアプリ内で即座にマニュアルを参照できる。

### 画面構成

全画面の共通ヘッダー右端に `[?]` ボタンを配置（TopScreen・GanttChart 両方のヘッダー）。

モーダル内レイアウト:

```
┌── opeSchedule マニュアル ──────────────────────────┐
│  目次                │  ## 3. Top 画面の操作        │
│  1. はじめに         │                              │
│  2. 起動方法         │  ### プロジェクト一覧         │
│  3. Top 画面 ◀      │  プロジェクト行をクリック...   │
│  4. Schedule 画面    │                              │
│  5. 比較表示         │                              │
│  6. マスター操作     │                              │
│  7. キーボード操作   │                              │
│  8. トラブル対応     │                   [閉じる]   │
└───────────────────────────────────────────────────┘
```

### バックエンド

**新エンドポイント:** `GET /api/manual`

`docs/user_manual.md` を読み込み、`text/plain` で返す。ファイルパスはアプリルートからの相対パスで解決。

### フロントエンド

**新ファイル:** `frontend/src/components/common/HelpModal.jsx`

- `marked` ライブラリ（npm）でMarkdown → HTML に変換
- 左カラム: `## ` 見出しを抽出して目次を生成、クリックでスクロール
- 右カラム: `dangerouslySetInnerHTML` でHTMLを描画（XSSリスクなし: 自前のmarkdownファイルのみ読む）
- `Escape` キーで閉じる
- マニュアルの末尾に「キーボードショートカット」章を追加

**変更ファイル:**
- `frontend/src/components/top/TopScreen.jsx`: ヘッダーに `[?]` ボタン追加
- `frontend/src/components/schedule/GanttChart.jsx`: ツールバーに `[?]` ボタン追加、`?` キーで開く
- `frontend/src/main.jsx` または `App.jsx`: `HelpModal` の state 管理（グローバルに開閉）
- `backend/app/main.py`: `/api/manual` エンドポイント追加
- `docs/user_manual.md`: キーボードショートカット章を追記

---

## C-2: ズームレベル記憶

### 目的

ユーザーが選択したガント表示モード（Day/Week/Month）をプロジェクトごとに DB へ保存し、次回アクセス時に自動復元する。

### 実装方針

- `GanttChart.jsx` に `isInitialLoad` フラグ（`useRef(true)`）を追加
- 初期ロード完了後に `false` にセット
- `viewMode` の `useEffect` で `isInitialLoad.current === false` のときのみ `api.updateProject(pid, { view_mode: viewMode })` を呼ぶ
- `isMultiMode === true` のとき（複数プロジェクト比較）は保存をスキップ
- 既存の初期ロードロジック（`project.view_mode → config.default_view_mode → 'Week'` の優先順位）はそのまま維持

**変更ファイル:**
- `frontend/src/components/schedule/GanttChart.jsx` のみ（数行追加）

---

## その他仕様の資料化

先ほど提案した残り7機能は `docs/feature-proposals.md` に記載する（本仕様書とは独立したファイル）。

---

## ファイル変更一覧

### 新規作成

| ファイル | 説明 |
|---------|------|
| `backend/app/schemas/project.py` の `ProjectStats` | 集計レスポンス型 |
| `frontend/src/components/top/DashboardPanel.jsx` | ダッシュボードパネル |
| `frontend/src/components/common/HelpModal.jsx` | マニュアルモーダル |

### 変更

| ファイル | 変更内容 |
|---------|---------|
| `backend/app/routers/projects.py` | `/projects/stats` エンドポイント追加 |
| `backend/app/main.py` | `/api/manual` エンドポイント追加 |
| `frontend/src/api.js` | `getProjectStats()` 追加 |
| `frontend/src/components/top/TopScreen.jsx` | Dashboard タブ・`[?]` ボタン追加 |
| `frontend/src/components/schedule/GanttChart.jsx` | ショートカット・ズーム保存・`[?]` ボタン追加 |
| `frontend/src/App.jsx` | `HelpModal` state 追加 |
| `docs/user_manual.md` | キーボードショートカット章追記 |
| `package.json` | `marked` 追加 |

---

## テスト方針

- `test_projects.py`: `/projects/stats` の集計値が正しいことを検証（遅延なし・あり・マイルストーンあり・なし の各ケース）
- フロントエンド: ビルド成功確認、目視でダッシュボードカード・マニュアルモーダル・ショートカット動作を確認
