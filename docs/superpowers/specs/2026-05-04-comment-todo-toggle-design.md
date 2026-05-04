# コメント Todo トグル機能 設計書

**日付**: 2026-05-04  
**対象画面**: チャート画面（schedule.html）

---

## 概要

タスク詳細パネル（ガントバークリックで開くポップオーバー）の末尾にコメントセクションを追加する。
各コメントに Todo トグルボタンを設け、On のとき ToDo 案件、Off のとき通常コメントとして扱う。
ToDo が On のコメントには「完了」ボタンが追加表示され、完了済みのコメントはテキストに打ち消し線が入る。

---

## 前提・既存実装

- `TaskComment` ORM モデルに `is_todo` / `is_done` フィールドが既に存在
- コメント CRUD API (`GET/POST/PATCH/DELETE /api/v1/projects/{id}/tasks/{task_id}/comments`) が実装済み
- フロントエンドにはコメントセクションが未実装（`api.js` にも未定義）

---

## データフロー

1. タスク詳細パネルを開くたびに `GET /comments` でコメント一覧を取得
2. 各コメント操作は個別 API を呼び、レスポンスで UI をその場で更新（再フェッチなし）
   - 追加: POST → 返却オブジェクトをリスト末尾に追加
   - 更新（テキスト / is_todo / is_done）: PATCH → 対象コメントのみ差し替え
   - 削除: DELETE → 対象コメントをリストから除去

---

## UI 構造

### コメント行（既存コメントごとに 1 行）

| 要素 | 詳細 |
|---|---|
| テキスト | クリックで `<textarea>` に切り替え → Enter（Shift+Enter は改行）or フォーカス外れで PATCH（text 更新）。Esc または空テキストでフォーカス外れた場合は元のテキストに戻してキャンセル |
| Todo ボタン | `[Todo]` / `[Todo ✓]` トグル。PATCH で `is_todo` を切り替え |
| 完了ボタン | `is_todo=true` のときのみ表示。`[完了]` / `[完了済]` トグル。PATCH で `is_done` を切り替え |
| is_done=true | テキストに CSS で打ち消し線 |
| × ボタン | DELETE |

### 新規入力欄（リスト末尾に固定）

- テキスト `<textarea>` (placeholder: "コメントを追加...")
- `[ ] ToDo として追加` チェックボックス
- `追加` ボタン（空テキストは不可）

---

## 変更ファイル

| ファイル | 変更内容 |
|---|---|
| `frontend/js/api.js` | `listComments` / `createComment` / `updateComment` / `deleteComment` の 4 関数を追加 |
| `frontend/schedule.html` | `task-detail-panel` 内 `</form>` 直後にコメントセクション HTML を追加 |
| `frontend/js/schedule-screen.js` | `openTaskDetail()` でコメント取得・描画ロジックを追加。コメント操作ハンドラを追加 |
| `frontend/css/main.css` | コメント行・Todo/完了ボタンのスタイルを追加 |

---

## API 呼び出し仕様

```js
// api.js に追加する 4 関数
listComments(pid, tid)                          // GET
createComment(pid, tid, { text, is_todo })      // POST
updateComment(pid, tid, cid, { text?, is_todo?, is_done? })  // PATCH
deleteComment(pid, tid, cid)                    // DELETE
```

---

## スコープ外

- コメント並び替え（作成日昇順で固定）
- 比較モード（isMultiMode）ではコメントセクション自体を非表示にする（既存の読み取り専用制御と統一）
- コメント数バッジ（ガントバー上の表示）
