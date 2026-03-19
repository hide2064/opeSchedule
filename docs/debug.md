# デバッグ作業ガイド

## 目次

1. [デバッグ環境の構成](#1-デバッグ環境の構成)
2. [バックエンド (Python) のデバッグ](#2-バックエンド-python-のデバッグ)
3. [フロントエンド (JavaScript) のデバッグ](#3-フロントエンド-javascript-のデバッグ)
4. [テストのデバッグ](#4-テストのデバッグ)
5. [DB の確認・操作](#5-db-の確認操作)
6. [よく使う作業フロー](#6-よく使う作業フロー)
7. [トラブルシューティング](#7-トラブルシューティング)

---

## 1. デバッグ環境の構成

```
opeSchedule/
├── .vscode/
│   ├── launch.json    # デバッグ起動設定（F5 メニュー）
│   ├── settings.json  # ワークスペース設定（インタープリター・Lint等）
│   └── tasks.json     # タスク定義（Ctrl+Shift+B でサーバー起動等）
├── start.bat          # 通常起動（デバッガなし）
└── start_debug.bat    # デバッグ起動（debugpy ポート5678待機）
```

### 必要な VSCode 拡張機能

| 拡張機能 | 用途 |
|---|---|
| **Python** (ms-python.python) | Python デバッガ・IntelliSense |
| **Pylance** (ms-python.vscode-pylance) | 型チェック・補完強化 |
| **Ruff** (charliermarsh.ruff) | Lint / Format（保存時自動修正） |

---

## 2. バックエンド (Python) のデバッグ

### 方法 A: VSCode から直接起動（推奨）

1. VSCode の左サイドバーから「**実行とデバッグ**」(Ctrl+Shift+D) を開く
2. ドロップダウンで **`FastAPI: Debug Server`** を選択
3. **F5** で起動
4. ブレークポイントを設定したい行番号の左をクリック（赤丸●が表示される）
5. ブラウザで `http://localhost:8000` を操作すると、該当行で停止する

```
使用できるデバッグ操作:
  F5        : 続行（次のブレークポイントまで進む）
  F10       : ステップオーバー（次の行へ、関数内に入らない）
  F11       : ステップイン（関数の中に入る）
  Shift+F11 : ステップアウト（現在の関数から抜ける）
  Shift+F5  : デバッグ停止
```

### 方法 B: ターミナルから起動 → VSCode でアタッチ

Docker や外部プロセスとして起動している場合、または `--reload` が必要な場合に使用する。

**ステップ 1: デバッグモードで起動**

```bat
start_debug.bat
```

ターミナルに以下が表示されて待機状態になる:
```
Waiting for debugger to attach...
```

**ステップ 2: VSCode からアタッチ**

1. 「実行とデバッグ」→ **`FastAPI: Attach to Remote (port 5678)`** を選択
2. **F5** でアタッチ
3. ターミナルで uvicorn が起動し `Application startup complete` が表示される

### ブレークポイントの活用例

```python
# routers/tasks.py の PATCH エンドポイントで止める例
@router.patch("/{task_id}")
async def update_task(task_id: int, payload: TaskUpdate, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    # ← ここにブレークポイント → task の内容・payload を変数ペインで確認できる
    ...
```

### ログレベルの変更

`start_debug.bat` または `launch.json` の環境変数で制御する:

```
LOG_LEVEL=debug   → 全ログ（SQL クエリも含む）
LOG_LEVEL=info    → 通常運用レベル
LOG_LEVEL=warning → 警告以上のみ
```

SQLAlchemy のクエリログを出力するには `database.py` の engine 設定に `echo=True` を追加する:

```python
engine = create_engine(DATABASE_URL, echo=True, ...)  # SQL が全て出力される
```

---

## 3. フロントエンド (JavaScript) のデバッグ

フロントエンドは Vanilla JS（ES Modules）のため、**ブラウザの DevTools** を主なデバッグツールとして使用する。

### Chrome DevTools の使い方

```
F12 / Ctrl+Shift+I : DevTools を開く

主要タブ:
  Console  → console.log / エラー確認
  Sources  → JS ファイルのブレークポイント設定
  Network  → API 通信の確認（Request / Response）
  Application → LocalStorage / SessionStorage
```

### Sources タブでのブレークポイント

1. DevTools → **Sources** タブを開く
2. 左ペインの `js/` フォルダを展開
3. デバッグしたい `.js` ファイルをクリック
4. 行番号をクリックしてブレークポイントを設定
5. 画面操作でその行が実行されると停止する

### アプリ内デバッグログパネル

アプリ上部ナビの **`🪲 Debug Log`** タブで `console.log` の出力を確認できる。

```javascript
// schedule-screen.js 内で確認したい値を出力する例
console.log('tasks loaded:', tasks);
console.log('gantt range:', { start: viewStart, end: viewEnd });
```

### Network タブで API 通信を確認

1. DevTools → **Network** タブ
2. **`Fetch/XHR`** フィルターをクリック
3. 画面操作を行うと API リクエストが一覧表示される
4. 各リクエストをクリックすると Request/Response の詳細が確認できる

```
確認ポイント:
  Headers  → リクエストメソッド・URL・ステータスコード
  Payload  → 送信した JSON ボディ
  Response → サーバーが返した JSON
```

### Swagger UI での API 単体テスト

`http://localhost:8000/api/docs` を開くと全エンドポイントを GUI から実行できる。

フロントエンドを経由せず API 単体の挙動を確認したい場合に有効。

---

## 4. テストのデバッグ

### VSCode Testing パネル（推奨）

1. 左サイドバーの **テストアイコン（フラスコ）** をクリック
2. テスト一覧が表示される（初回は少し時間がかかる）
3. 各テストの右の ▶ で単体実行、虫アイコンでデバッグ実行

### F5 からテスト実行

「実行とデバッグ」で以下を選択:

| 設定名 | 内容 |
|---|---|
| `pytest: Run All Tests` | `tests/` 配下の全テスト |
| `pytest: Current Test File` | エディタで開いているファイルのみ |

### Ctrl+Shift+B タスクから実行

`Ctrl+Shift+B` → `test: run all` を選択するとターミナルでテストが走る。

### コマンドラインで実行

```bash
cd backend

# 全テスト
pytest tests/ -v

# 特定ファイル
pytest tests/test_tasks.py -v

# 特定テスト関数
pytest tests/test_tasks.py::test_create_task -v

# ログ出力あり（print/logging が見える）
pytest tests/ -v -s

# 失敗時に詳細スタックトレース
pytest tests/ -v --tb=long
```

### テストにブレークポイントを使う

```python
# tests/test_tasks.py
def test_create_task(client):
    resp = client.post("/api/v1/projects/1/tasks", json={...})
    # ← ここにブレークポイント → resp.json() をデバッガで確認できる
    assert resp.status_code == 201
```

`pytest: Current Test File` 設定で F5 を押すと、テストコード内のブレークポイントで止まる。

---

## 5. DB の確認・操作

### SQLite ブラウザ（推奨ツール）

**DB Browser for SQLite**（無料）を使うと GUI でテーブルを確認できる。

```
ファイルパス: backend/opeschedule.db
```

> ⚠️ サーバー起動中は WAL モードで動作中のため、DB Browser で開く際は「読み取り専用」にするか、サーバーを止めてから開くこと。

### SQLite CLI で直接クエリ

```bash
cd backend
sqlite3 opeschedule.db

# よく使うクエリ
.tables                           # テーブル一覧
.schema projects                  # テーブル定義確認
SELECT * FROM projects;
SELECT * FROM tasks WHERE project_id = 1;
SELECT * FROM task_dependencies;
.quit
```

### Alembic マイグレーション操作

```bash
cd backend

# 現在のリビジョン確認
alembic current

# 最新へ適用
alembic upgrade head

# 1つ前へ戻す
alembic downgrade -1

# マイグレーションファイル生成（models/ 変更後）
alembic revision --autogenerate -m "add_column_foo"
```

---

## 6. よく使う作業フロー

### フロー 1: バックエンド API のバグ調査

```
1. start_debug.bat を起動（またはF5で "FastAPI: Debug Server"）
2. 怪しいルーター関数にブレークポイントを設定
3. ブラウザ or Swagger UI で該当 API を呼び出す
4. ブレークポイントで停止したら変数ペインで値を確認
5. F10/F11 でステップ実行して問題箇所を特定
```

### フロー 2: フロントエンド + API の連携確認

```
1. start.bat でサーバーを通常起動
2. ブラウザの DevTools → Network タブを開く
3. 画面を操作して API 通信を確認
4. 想定外のリクエスト/レスポンスがあれば Sources タブで JS をデバッグ
5. API 側が問題なら start_debug.bat に切り替えて Python をデバッグ
```

### フロー 3: 新機能開発後のテスト

```
1. 対応するテストを tests/ に追加
2. "pytest: Current Test File" (F5) でデバッグ実行
3. テスト通過を確認後、pytest: Run All Tests で全体を確認
4. ruff check でコードスタイルを検証
```

### フロー 4: DB スキーマ変更

```
1. backend/app/models/ 内のモデルを修正
2. タスク "db: generate migration" を実行
3. alembic/versions/ に生成されたファイルを確認
4. タスク "db: migrate (alembic upgrade head)" を実行
5. backend/opeschedule.db をリセットしたい場合は削除して再起動
```

---

## 7. トラブルシューティング

### debugpy に接続できない

```
原因: start_debug.bat が "Waiting for debugger..." で止まっている
対処: VSCode で "FastAPI: Attach to Remote (port 5678)" を実行する
```

```
原因: ポート 5678 が使用中
対処: タスクマネージャーで python.exe を終了するか、
      launch.json / start_debug.bat のポート番号を変更する
```

### ブレークポイントがグレーアウトして止まらない

```
原因: justMyCode=true になっている（ライブラリ内は止まらない）
対処: launch.json の "justMyCode": false を確認する

原因: --reload によってファイルが再読み込みされた
対処: サーバーを再起動し、再アタッチする
```

### テストが全て失敗する

```
原因: conftest.py の DB セットアップが失敗している
対処: pytest tests/conftest.py -v -s で単体確認する
     "APP_ENV=development" 環境変数が設定されているか確認する
```

### `opeschedule.db` が壊れた場合

```bash
# サーバーを停止してから実行
cd backend
rm opeschedule.db opeschedule.db-shm opeschedule.db-wal
alembic upgrade head
# → 空の DB が再作成される
```
