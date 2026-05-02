# opeSchedule 機能追加提案一覧

> 作成日: 2026-05-02  
> ステータス: 検討中（未実装）

本ドキュメントは今後の実装候補となる機能提案をまとめたものです。  
B-1・C-1・C-2・M-1 は別途設計書 `docs/superpowers/specs/2026-05-02-dashboard-shortcuts-zoom-manual-design.md` に詳細を記載済みです。

---

## 一覧

| ID | カテゴリ | 機能名 | 価値 | コスト | 優先度 |
|----|---------|--------|------|--------|--------|
| A-1 | プロジェクト管理 | 担当者（アサイン）管理 | ★★★ | ★★☆ | ○ 次のステップ |
| A-2 | プロジェクト管理 | ベースライン比較（計画 vs 実績） | ★★★ | ★★★ | △ 後で検討 |
| A-3 | プロジェクト管理 | タスクテンプレート | ★★☆ | ★★☆ | △ 必要に応じて |
| B-2 | 可視化・レポート | 週次サマリーレポート出力 | ★★☆ | ★★☆ | ○ 次のステップ |
| B-3 | 可視化・レポート | カテゴリ別バーンダウンチャート | ★★☆ | ★★★ | △ 後で検討 |
| C-3 | UX改善 | タスク一括CSVインポート（追加用） | ★★☆ | ★★☆ | ○ 次のステップ |
| D-1 | 通知・連携 | 遅延タスクのメール通知 | ★★☆ | ★★☆ | △ 運用フェーズで |
| D-2 | 通知・連携 | 読み取り専用共有URL | ★★☆ | ★★☆ | △ チーム規模次第 |

---

## 詳細

### A-1: 担当者（アサイン）管理

**目的:** タスクに担当者を割り当て、誰が何をいつまでやるかを可視化する。

**主な仕様:**

- DB: `members` テーブル（id, project_id, name, color, email）を新設
- `tasks.assignee_id` FK を追加
- UI: タスク詳細パネルにドロップダウンで担当者を選択
- ガントバーの右端に担当者のイニシャルを小さく表示
- スケジュール画面ヘッダーに「担当者フィルター」を追加（自分のタスクのみ表示）
- プロジェクト設定（ProjectModal）でメンバーを管理（追加・削除）

**DB変更:**

```sql
CREATE TABLE members (
  id INTEGER PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(7) DEFAULT '#888888',
  email VARCHAR(200)
);

ALTER TABLE tasks ADD COLUMN assignee_id INTEGER REFERENCES members(id) ON DELETE SET NULL;
```

**API追加:**
```
GET/POST        /api/v1/projects/{id}/members
PATCH/DELETE    /api/v1/projects/{id}/members/{mid}
```

**考慮事項:**
- マルチプロジェクト比較ビューでは担当者フィルター対象プロジェクトが複数になるため、担当者名（文字列）で横断フィルターする
- Import/Export（JSON）でメンバー情報も含める

---

### A-2: ベースライン比較（計画 vs 実績）

**目的:** 計画時のスケジュールと現在の日程をガント上に重ねて表示し、遅れ・前倒しを視覚的に把握する。

**主な仕様:**

- 既存の `project_snapshots` テーブルを活用（追加DB変更最小限）
- `snapshots.is_baseline` フラグを追加（BOOLEAN, DEFAULT FALSE）
- ガントバーの背後に半透明の「計画バー」を薄い色で重ねる
- Config タブまたは履歴パネルで「このスナップショットをベースラインに設定」ボタン
- ベースラインが設定されている場合、スケジュール画面ツールバーに「計画比較: ON/OFF」トグルを表示

**画面イメージ:**
```
|████████████░░░░| ← 現在（72%完了）
|░░░░░░░░░░░░░░░░| ← ベースライン（薄く）
```

**DB変更:**
```sql
ALTER TABLE project_snapshots ADD COLUMN is_baseline BOOLEAN DEFAULT FALSE;
```

**考慮事項:**
- ベースラインはプロジェクト単位で1つのみ（設定時に既存のフラグをリセット）
- ベースラインのタスクIDが現在のタスクIDと一致しない場合（タスク追加・削除後）はマッチングをタスク名で補完

---

### A-3: タスクテンプレート

**目的:** よく使う工程構成（例：「基本設計フェーズ」一式）をテンプレートとして保存し、新規プロジェクトに一括展開する。

**主な仕様:**

- DB: `task_templates` テーブル（id, name, description, tasks_json）
- `tasks_json`: タスク定義の配列（relative_start_days, duration_days, category_large, category_medium, name, task_type）
- タスク追加モーダルに「テンプレートから展開」タブを追加
- 展開時の開始日をカレンダーで指定 → 全タスクの日程を相対日数で計算して一括作成
- 既存プロジェクトのタスク群を選択 → テンプレートとして保存する機能

**DB変更:**
```sql
CREATE TABLE task_templates (
  id INTEGER PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  tasks_json TEXT NOT NULL,  -- JSON array
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**API追加:**
```
GET/POST        /api/v1/templates
GET/DELETE      /api/v1/templates/{id}
POST            /api/v1/projects/{id}/tasks/apply_template
```

---

### B-2: 週次サマリーレポート出力

**目的:** プロジェクトの今週の状況を1枚のHTMLまたはMarkdownで出力し、会議資料・メール転送に活用する。

**主な仕様:**

- スケジュール画面ツールバーに「週次レポート」ボタンを追加
- レポート内容:
  - プロジェクト名・期間・全体進捗
  - 今週完了したタスク一覧
  - 来週予定のタスク一覧
  - 現在遅延中のタスク一覧（赤字）
  - 直近3ヶ月のマイルストーン一覧
- 出力方法: ブラウザの印刷（Ctrl+P）またはクリップボードへMarkdownコピー
- 実装: フロントエンドのみ（現在の tasks state から計算、APIコール不要）

**考慮事項:**
- 「今週」の定義はConfigの `week_start_day` に従う（月曜or日曜始まり）

---

### B-3: カテゴリ別バーンダウンチャート

**目的:** 大項目ごとの進捗推移を折れ線グラフで可視化し、フェーズ別の遅れを定量把握する。

**主な仕様:**

- スケジュール画面に「チャート」タブ（または切替ボタン）を追加
- X軸: スナップショット日時（時系列）
- Y軸: 各大項目の完了タスク数 or 進捗率
- 現在値は実データから、過去値はスナップショットの `tasks_snapshot` JSONから計算
- Chart.js または Recharts を使用

**DB変更:** なし（既存スナップショットを活用）

**考慮事項:**
- スナップショットが少ない初期段階では現在値1点のみのグラフになる
- 大項目の追加・削除があった場合は系列の連続性が途切れる

---

### C-3: タスク一括CSVインポート（既存プロジェクトへの追加）

**目的:** Excelで作成したタスク一覧を既存プロジェクトへ追加インポートできる。現在の全件置換インポートとは別の「追加」機能。

**主な仕様:**

- タスク追加モーダルに「CSVから一括追加」タブを追加
- CSVフォーマット（ヘッダー行必須）:

```csv
name,start_date,end_date,category_large,category_medium,progress,task_type
設計書作成,2026-06-01,2026-06-10,Phase1,設計,0.0,task
設計完了,2026-06-10,2026-06-10,Phase1,マイルストーン,0.0,milestone
```

- プレビュー表示（インポート前に行数・エラーを確認）
- エラー行（日付フォーマット不正・マイルストーンで開始≠終了等）は赤字でスキップ確認
- バックエンドは既存の `POST /projects/{id}/tasks` を繰り返し呼ぶ（新APIなし）

---

### D-1: 遅延タスクのメール通知

**目的:** 毎日決まった時刻に遅延タスクをまとめてメールで通知する。

**主な仕様:**

- Config タブに通知設定を追加:
  - 送信先メールアドレス（複数可）
  - 送信時刻（例: 08:00）
  - 通知対象（遅延タスクのみ / 当日期限タスクも含む）
- バックエンド: `APScheduler` でスケジューラを実装、`smtplib` でSMTP送信
- SMTP設定は `.env` で管理（SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD）
- メール本文: プロジェクト別に遅延タスクをリスト化したHTMLメール

**DB変更:**
```sql
ALTER TABLE config ADD COLUMN notify_emails TEXT DEFAULT '[]';  -- JSON array
ALTER TABLE config ADD COLUMN notify_time VARCHAR(5) DEFAULT '08:00';
ALTER TABLE config ADD COLUMN notify_enabled BOOLEAN DEFAULT FALSE;
```

**考慮事項:**
- Docker環境では `docker-compose.yml` に SMTP 関連の環境変数を追加
- ローカル開発環境では Mailtrap 等のSMTPモックを推奨

---

### D-2: 読み取り専用共有URL

**目的:** プロジェクトをトークン付きURLで外部共有できる。閲覧のみ可能でログイン不要。

**主な仕様:**

- `projects.share_token` カラム（UUID、NULL で無効）を追加
- Config タブ or プロジェクト設定に「共有リンク生成/無効化」ボタン
- 共有URL: `http://ホスト:8000/share/{token}`
- 共有URLにアクセスすると読み取り専用のスケジュール画面を表示（編集操作UI非表示）
- バックエンド: `GET /api/v1/share/{token}` でプロジェクト情報 + タスク一覧を返す（認証不要）

**DB変更:**
```sql
ALTER TABLE projects ADD COLUMN share_token VARCHAR(36) UNIQUE;  -- UUID
```

**API追加:**
```
POST    /api/v1/projects/{id}/share        # トークン生成
DELETE  /api/v1/projects/{id}/share        # トークン無効化
GET     /api/v1/share/{token}              # 共有データ取得（認証不要）
```

**考慮事項:**
- トークンはUUIDv4で生成（推測困難）
- 共有URLの有効期限は設けない（無効化は手動）
- 読み取り専用UIは通常のスケジュール画面と同じコンポーネントを `isReadOnly=true` prop で制御

---

## 実装ロードマップ案

```
Phase 1（済）: 基本機能・今回の3機能
Phase 2（推奨）: A-1担当者管理、B-2週次レポート、C-3CSVインポート
Phase 3: A-2ベースライン比較、B-3バーンダウンチャート
Phase 4: D-1メール通知、D-2共有URL
Phase 5: A-3テンプレート
```
