# C-3: タスク一括CSVインポート（追加用）設計書

> 作成日: 2026-05-02

## 概要
AddTaskModal にタブを追加し、CSVから既存プロジェクトへタスクを一括追加する。バックエンド変更なし。

## CSVフォーマット
```csv
name,start_date,end_date,category_large,category_medium,progress,task_type,notes
設計書作成,2026-06-01,2026-06-10,Phase1,設計,0.0,task,
設計完了,2026-06-10,2026-06-10,Phase1,マイルストーン,0.0,milestone,
```
- ヘッダー行必須（順序は任意、大文字小文字問わず）
- `name`, `start_date`, `end_date` は必須。その他任意（未指定はデフォルト値）
- `task_type` は `task`/`milestone`（デフォルト: `task`）

## UI フロー
1. AddTaskModal に「📋 CSV一括」タブを追加（既存の「フォーム入力」タブと並立）
2. テキストエリアに CSV を貼り付け OR ファイル選択
3. プレビューテーブルを表示（バリデーションエラー行は赤背景）
4. 「インポート実行」ボタン → 有効行のみ `POST /projects/{id}/tasks` を順次呼ぶ
5. 完了後に成功件数・スキップ件数をトースト表示

## バリデーション（クライアント側）
| ルール | エラーメッセージ |
|--------|----------------|
| `name` が空 | 「タスク名は必須です」 |
| `start_date` / `end_date` が YYYY-MM-DD 形式でない | 「日付フォーマット不正」 |
| `end_date < start_date` | 「終了日が開始日より前」 |
| `task_type=milestone` かつ `start_date ≠ end_date` | 「マイルストーンは1日イベント」 |
| `progress` が 0〜1 の範囲外 | 「進捗は0〜1で指定」 |

## ファイル変更
| ファイル | 変更 |
|---------|------|
| `frontend/src/components/schedule/AddTaskModal.jsx` | タブ切り替え + CSV パーサー + プレビュー + インポート |
| `frontend/src/styles/app.css` | CSVプレビューテーブルスタイル |
