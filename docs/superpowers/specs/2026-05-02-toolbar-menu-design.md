# ツールバー Menu ドロップダウン設計書

> 作成日: 2026-05-02

---

## 概要

スケジュール画面のツールバーに並ぶ操作ボタン群（JSON〜履歴）を `☰ Menu` ドロップダウンボタンに統合する。ツールバーをすっきりさせ、画面幅が狭い環境でも操作しやすくする。

---

## 変更範囲

| ファイル | 変更内容 |
|---------|---------|
| `frontend/src/components/schedule/GanttChart.jsx` | Menuボタン・ドロップダウン・シフトダイアログを追加。既存ボタン群を削除 |
| `frontend/src/styles/app.css` | ドロップダウン・シフトダイアログ CSS を追加 |

新規ファイルなし。

---

## ツールバー構成

### 変更前

```
[+ Add Task] [JSON] [CSV] [🖨印刷] [📋週報] [日数][日程シフト] [📋履歴●N] [?]
```

### 変更後

```
[+ Add Task] [☰ Menu ▾] [?]
```

`+ Add Task`（主操作）と `?`（マニュアル）は常時表示のまま残す。

---

## Menu ドロップダウン

### 開閉挙動

| 操作 | 動作 |
|------|------|
| `☰ Menu ▾` ボタン押下 | 開閉トグル |
| メニュー外クリック | 閉じる |
| `Escape` キー | 閉じる（既存ショートカットで処理済み） |
| メニューアイテム選択 | アクション実行後に自動で閉じる |

### メニュー項目

```
┌──────────────────────┐
│ JSON 出力            │
│ CSV 出力             │
│ 🖨 印刷              │
│ 📋 週報              │
│ ─────────────────── │
│ 📅 日程シフト...     │
│ 📋 履歴  ● N        │  ← N = pendingChanges.length（0のとき非表示）
└──────────────────────┘
```

**表示条件:** 単体モード（`!isMultiMode`）かつ現在表示（`!isHistoryMode`）のときのみ Menu ボタンを表示。履歴モード中は非表示。

### 位置・スタイル

- ボタンの直下に絶対配置（`position: absolute`、`top: 100%`、右寄せ）
- `z-index: 400`
- 最小幅 `180px`
- 背景 `var(--color-surface)`、枠線 `var(--color-border)`、角丸 `var(--panel-radius)`
- shadow: `var(--shadow-md)`

---

## 日程シフトダイアログ

`📅 日程シフト...` を選択するとメニューを閉じ、シフトダイアログを開く。

```
┌─────────────────────────────────┐
│ 📅 日程シフト              ✕   │
│ 全タスクの日程をシフトします    │
│                                 │
│  シフト日数: [          ]       │
│  正の値: 後ろ倒し / 負の値: 前倒し │
│                                 │
│         [キャンセル]  [実行]    │
└─────────────────────────────────┘
```

**挙動:**
- `[実行]` → `api.shiftTaskDates(currentPid, days)` → 成功時にダイアログを閉じてタスク再読み込み
- `[キャンセル]` / `✕` / `Escape` → ダイアログを閉じる
- 入力が空または非数値の場合は `[実行]` を disabled にする
- オーバーレイ（`.modal-overlay`）クリックでも閉じる

---

## 実装方針

### 状態管理（GanttChart 内）

```jsx
const [showMenu, setShowMenu]             = useState(false);  // ドロップダウン開閉
const [showShiftDialog, setShowShiftDialog] = useState(false); // 日程シフトダイアログ
const menuRef = useRef(null);  // 外側クリック検出用
```

既存の `shiftDays` state はそのまま流用する。

### 外側クリック検出

```jsx
useEffect(() => {
  if (!showMenu) return;
  const handler = (e) => {
    if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false);
  };
  document.addEventListener('mousedown', handler);
  return () => document.removeEventListener('mousedown', handler);
}, [showMenu]);
```

### Escape キー対応

既存のキーボードショートカット useEffect の `Escape` ハンドラに `setShowMenu(false)` と `setShowShiftDialog(false)` を追加する。

---

## テスト方針

バックエンド変更なし。目視確認のみ:

1. `☰ Menu ▾` ボタンが単体モード・現在表示でのみ表示される
2. 押下でドロップダウンが開き、再押下・外側クリック・Escape で閉じる
3. JSON / CSV / 印刷 / 週報 が正常に動作し、実行後メニューが閉じる
4. 日程シフトダイアログが開き、数値入力後に実行でシフトが反映される
5. 履歴アイテムが履歴パネルをトグルする
6. 履歴バッジ（●N）が未コミット変更数を反映する
