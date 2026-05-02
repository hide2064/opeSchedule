# 週次サマリーレポート (B-2) 設計書

> 作成日: 2026-05-02

---

## 概要

スケジュール画面から現在開いているプロジェクトの週次サマリーレポートをワンクリックで生成・出力する機能。フロントエンドのみで完結し、APIコールは不要。

---

## アーキテクチャ

### 方針

GanttChart がすでに保持する `tasks`・`project`・`config` の state からレポートを計算する。サーバーへの追加リクエストは行わない。

### ファイル構成

| 操作 | ファイル | 内容 |
|------|---------|------|
| 新規作成 | `frontend/src/components/schedule/WeeklyReportModal.jsx` | レポート生成・表示・出力 |
| 変更 | `frontend/src/components/schedule/GanttChart.jsx` | 「週報」ボタン追加・モーダルマウント |
| 変更 | `frontend/src/styles/app.css` | モーダル・印刷用スタイル追加 |

### データフロー

```
GanttChart
  props: tasks, project, config
  └─ [📋 週報] ボタン
        → showWeeklyReport = true
        → <WeeklyReportModal tasks project config onClose />
              ├─ computeReport(tasks, config) → ReportData
              ├─ モーダル内 HTML 表示
              ├─ [📋 Markdownコピー] → navigator.clipboard.writeText(markdown)
              └─ [🖨 印刷] → window.print()
```

---

## レポート集計ロジック

### 週の起点

`config.week_start_day`（`"Mon"` / `"Sun"` / `"Sat"`）に従って今週・来週の範囲を計算する。

```
today = 2026-05-02 (金)  ※ week_start_day = "Mon" の場合
今週: 2026-04-27 (月) 〜 2026-05-03 (日)
来週: 2026-05-04 (月) 〜 2026-05-10 (日)
```

### 集計対象

| セクション | フィルター条件 |
|-----------|-------------|
| ヘッダー | project.name, 全タスク（task_type='task'）の progress 加重平均 |
| ✅ 今週完了 | `progress >= 1.0` かつ `end_date` が今週の範囲内 |
| ⚠ 遅延中 | `end_date < today` かつ `progress < 1.0`（task・milestone 両方） |
| 📅 来週完了予定 | `end_date` が来週の範囲内 かつ `progress < 1.0` |
| ◆ 今後3ヶ月マイルストーン | `task_type === 'milestone'` かつ `end_date` が today 〜 today+90日 |

セパレーター行（`_isSep === true`）はすべての集計から除外する。

---

## UI 仕様

### ボタン配置

GanttChart ツールバーの「🖨 印刷」ボタンの隣に追加。**単体モード・現在表示（非履歴モード）のみ**表示する。

```jsx
{!isMultiMode && !isHistoryMode && (
  <button onClick={() => setShowWeeklyReport(true)}>📋 週報</button>
)}
```

### モーダルレイアウト

```
┌── 週次レポート: ECサイトリニューアル ─────── ✕ ┐
│  2026-04-28 〜 2026-05-04                      │
│  全体進捗: ████████░░ 72%  (50/69 タスク)       │
│  ──────────────────────────────────────────   │
│  ✅ 今週完了 (3件)                             │
│    UIデザイン（PC版）  Phase2基本設計  5/01    │
│    ...                                         │
│  ⚠ 遅延中 (2件)                               │
│    ...                                         │
│  📅 来週完了予定 (5件)                          │
│    ...                                         │
│  ◆ 今後3ヶ月マイルストーン                      │
│    ...                                         │
│  ──────────────────────────────────────────   │
│       [📋 Markdownコピー]  [🖨 印刷]  [閉じる]  │
└───────────────────────────────────────────── ┘
```

モーダルサイズ: `width: min(760px, 92vw)`, `height: min(680px, 88vh)`

### インタラクション

| 操作 | 挙動 |
|------|------|
| `✕` または `Escape` | モーダルを閉じる |
| オーバーレイクリック | モーダルを閉じる |
| `📋 Markdownコピー` | `navigator.clipboard.writeText(markdown)` 後、ボタンラベルを「✅ コピー済み」に 1.5 秒変更 |
| `🖨 印刷` | `window.print()` を呼ぶ。印刷ダイアログ後は自動で元に戻る |

---

## Markdown 出力フォーマット

```markdown
# 週次レポート: {project.name}

**対象期間:** {weekStart} 〜 {weekEnd}
**作成日:** {today}
**全体進捗:** {pct}% ({completed}/{total} タスク)

---

## ✅ 今週完了 ({n}件)

| タスク名 | 大項目 | 中項目 | 完了日 |
|---------|-------|-------|-------|
| ...     | ...   | ...   | ...   |

## ⚠ 遅延中 ({n}件)

| タスク名 | 大項目 | 中項目 | 期限 | 進捗 |
|---------|-------|-------|-----|-----|
| ...     | ...   | ...   | ... | ... |

## 📅 来週完了予定 ({n}件)

| タスク名 | 大項目 | 中項目 | 期限 | 進捗 |
|---------|-------|-------|-----|-----|
| ...     | ...   | ...   | ... | ... |

## ◆ 今後3ヶ月マイルストーン ({n}件)

| マイルストーン名 | 大項目 | 日付 | 残り日数 |
|--------------|-------|-----|--------|
| ...          | ...   | ... | ...    |
```

各セクションに該当タスクが0件の場合は「_（なし）_」と表示する。

---

## 印刷スタイル

`@media print` で以下を適用:
- `.modal-overlay` → `background: none`（背景暗転を除去）
- `.weekly-report-modal__actions` → `display: none`（ボタン行を非表示）
- `.app-header`, `.top-nav`, `.schedule-header` → `display: none`（アプリUIを非表示）
- ページ余白: `margin: 20mm`
- フォントサイズ: `12pt`

---

## テスト方針

フロントエンドのみの実装のためバックエンドテストは不要。

ビルド成功確認と以下の目視確認:
1. 「週報」ボタンが単体モード・現在表示でのみ表示される
2. ボタンクリックでモーダルが開く
3. 各セクションの件数が tasks state と一致する
4. Markdownコピーでクリップボードに正しい内容が入る
5. 印刷でレポート本体のみが出力される
6. `Escape` キーでモーダルが閉じる
