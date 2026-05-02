# ツールバー Menu ドロップダウン Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** スケジュール画面のツールバーを `[+ Add Task] [☰ Menu ▾] [?]` に整理し、JSON〜履歴をドロップダウンメニューに統合する。日程シフトは専用ダイアログで入力する。

**Architecture:** `GanttChart.jsx` のみ変更。新規ファイルなし。state 3つ（showMenu, showShiftDialog, menuRef）を追加し、既存ボタン群を削除してドロップダウンと日程シフトダイアログを追加する。`handleShiftDates` から `window.confirm` を除去しダイアログが確認ステップとなる。

**Tech Stack:** React/JSX, CSS (app.css), Vite

---

## ファイルマップ

| 操作 | ファイル |
|------|---------|
| Modify | `frontend/src/components/schedule/GanttChart.jsx` |
| Modify | `frontend/src/styles/app.css` |

---

## Task 1: CSS 追加（ドロップダウン + 日程シフトダイアログ）

**Files:**
- Modify: `frontend/src/styles/app.css`

- [ ] **Step 1: app.css 末尾に追記**

```css
/* ── Toolbar Menu Dropdown ───────────────────────────────── */
.toolbar-menu-wrap { position: relative; }
.toolbar-menu-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 190px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--panel-radius);
  box-shadow: var(--shadow-md);
  z-index: 400;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.toolbar-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  font-size: 13px;
  cursor: pointer;
  background: none;
  border: none;
  color: var(--color-text);
  text-align: left;
  width: 100%;
  transition: background 0.1s;
}
.toolbar-menu-item:hover { background: var(--color-selected-bg); }
.toolbar-menu-item:disabled { color: var(--color-text-muted); cursor: default; }
.toolbar-menu-divider { height: 1px; background: var(--color-border); margin: 4px 0; }
.toolbar-menu-badge {
  margin-left: auto;
  background: var(--color-primary);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  border-radius: 10px;
  padding: 1px 6px;
  min-width: 18px;
  text-align: center;
}
/* ── Shift Dialog ────────────────────────────────────────── */
.shift-dialog {
  background: var(--color-surface);
  border-radius: var(--panel-radius);
  width: min(360px, 90vw);
  box-shadow: 0 8px 32px rgba(0,0,0,.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.shift-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--color-border);
  font-weight: 700;
  font-size: 15px;
}
.shift-dialog__body { padding: 20px 18px; display: flex; flex-direction: column; gap: 12px; }
.shift-dialog__hint { font-size: 12px; color: var(--color-text-muted); }
.shift-dialog__input { font-size: 15px; padding: 8px 10px; border: 1px solid var(--color-border); border-radius: 4px; background: var(--color-bg); color: var(--color-text); width: 100%; }
.shift-dialog__input:focus { outline: none; border-color: var(--color-primary); }
.shift-dialog__actions { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 18px; border-top: 1px solid var(--color-border); }
```

- [ ] **Step 2: ビルドが通ることを確認**

```
cd frontend
npm run build
```

Expected: ビルド成功

---

## Task 2: GanttChart — state・ref・effect・handleShiftDates 修正

**Files:**
- Modify: `frontend/src/components/schedule/GanttChart.jsx`

- [ ] **Step 1: useRef import に追加されていることを確認**

GanttChart.jsx の先頭 import を確認:
```jsx
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
```
`useRef` はすでに import されているので変更不要。

- [ ] **Step 2: state と ref を追加**

`showWeeklyReport` state の直後に追記:

```jsx
  const [showMenu, setShowMenu]               = useState(false);
  const [showShiftDialog, setShowShiftDialog] = useState(false);
  const menuRef = useRef(null);
```

- [ ] **Step 3: メニュー外クリックで閉じる useEffect を追加**

キーボードショートカット useEffect の直前に追加:

```jsx
  // メニュー外クリックで閉じる
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);
```

- [ ] **Step 4: Escape ハンドラに showMenu・showShiftDialog を追加**

既存の Escape ハンドラ（`if (e.key === 'Escape') {` ブロック）を以下に変更:

```jsx
      if (e.key === 'Escape') {
        setDetailTask(null);
        setCommentTask(null);
        setShowAddModal(false);
        setShowHistory(false);
        setShowHelp(false);
        setShowMenu(false);
        setShowShiftDialog(false);
        return;
      }
```

- [ ] **Step 5: handleShiftDates から window.confirm を除去**

現在の `handleShiftDates`（276行目付近）を以下に変更（ダイアログが確認ステップになるため confirm 不要）:

```jsx
  const handleShiftDates = useCallback(async () => {
    const d = parseInt(shiftDays, 10);
    if (isNaN(d) || d === 0) return;
    setShowShiftDialog(false);
    try {
      const result = await api.shiftTaskDates(currentPid, d);
      showToast(`${result.shifted}件のタスクを ${d > 0 ? '+' : ''}${d}日シフトしました`, 'success');
      setShiftDays('');
      const updated = await api.listTasks(currentPid);
      onTasksChange(updated);
      onMutation?.({ operation: '日程一括シフト', task_name: null, detail: `${d > 0 ? '+' : ''}${d}日` });
    } catch (ex) {
      showToast('シフト失敗: ' + ex.message, 'error');
    }
  }, [shiftDays, currentPid, showToast, onTasksChange, onMutation]);
```

- [ ] **Step 6: ビルドが通ることを確認**

```
cd frontend
npm run build
```

Expected: ビルド成功

---

## Task 3: GanttChart — ツールバーの JSX を置き換え

**Files:**
- Modify: `frontend/src/components/schedule/GanttChart.jsx`

- [ ] **Step 1: 既存ボタン群を Menu ドロップダウンに置き換え**

以下のブロックを**丸ごと**置き換える。

**削除するブロック（この範囲全体）:**
```jsx
        {/* 操作ボタン (単体モード・現在表示のみ) */}
        {!isMultiMode && !isHistoryMode && (
          <>
            <button className="btn btn--primary" onClick={() => setShowAddModal(true)}>+ Add Task</button>
            <button className="btn btn--secondary" onClick={() => handleExport('json')}>JSON</button>
            <button className="btn btn--secondary" onClick={() => handleExport('csv')}>CSV</button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => window.print()}
              title="ガントチャートを印刷 / PDF 保存"
            >🖨 印刷</button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setShowWeeklyReport(true)}
              title="週次サマリーレポートを表示"
            >📋 週報</button>
            <span className="shift-dates-group">
              <input
                type="number"
                className="shift-days-input"
                value={shiftDays}
                onChange={e => setShiftDays(e.target.value)}
                placeholder="日数"
                title="正: 後ろ倒し, 負: 前倒し"
              />
              <button
                className="btn btn--secondary"
                onClick={handleShiftDates}
                disabled={!shiftDays || isNaN(parseInt(shiftDays, 10))}
                title="全タスクの日程を一括シフト"
              >日程シフト</button>
            </span>
          </>
        )}
        {/* 履歴ボタン (単体モードのみ) */}
        {!isMultiMode && (
          <button
            className={`btn btn--secondary history-btn${showHistory ? ' active' : ''}`}
            onClick={() => setShowHistory(v => !v)}
            title="履歴を表示"
          >
            📋 履歴
            {pendingChanges?.length > 0 && (
              <span className="history-btn__badge">{pendingChanges.length}</span>
            )}
          </button>
        )}
```

**置き換え後（このブロックで完全に置き換え）:**
```jsx
        {/* Menu ドロップダウン (単体モード・現在表示のみ) */}
        {!isMultiMode && !isHistoryMode && (
          <>
            <button className="btn btn--primary" onClick={() => setShowAddModal(true)}>+ Add Task</button>
            <div className="toolbar-menu-wrap" ref={menuRef}>
              <button
                className={`btn btn--secondary${showMenu ? ' active' : ''}`}
                onClick={() => setShowMenu(v => !v)}
                title="操作メニューを開く"
              >☰ Menu {showMenu ? '▲' : '▾'}</button>
              {showMenu && (
                <div className="toolbar-menu-dropdown">
                  <button className="toolbar-menu-item" onClick={() => { setShowMenu(false); handleExport('json'); }}>
                    📄 JSON 出力
                  </button>
                  <button className="toolbar-menu-item" onClick={() => { setShowMenu(false); handleExport('csv'); }}>
                    📊 CSV 出力
                  </button>
                  <button className="toolbar-menu-item" onClick={() => { setShowMenu(false); window.print(); }}>
                    🖨 印刷
                  </button>
                  <button className="toolbar-menu-item" onClick={() => { setShowMenu(false); setShowWeeklyReport(true); }}>
                    📋 週報
                  </button>
                  <div className="toolbar-menu-divider" />
                  <button className="toolbar-menu-item" onClick={() => { setShowMenu(false); setShiftDays(''); setShowShiftDialog(true); }}>
                    📅 日程シフト...
                  </button>
                  <button
                    className="toolbar-menu-item"
                    onClick={() => { setShowMenu(false); setShowHistory(v => !v); }}
                  >
                    📋 履歴
                    {(pendingChanges?.length ?? 0) > 0 && (
                      <span className="toolbar-menu-badge">{pendingChanges.length}</span>
                    )}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
```

- [ ] **Step 2: 日程シフトダイアログを HelpModal の直後に追加**

`{showHelp && <HelpModal onClose={() => setShowHelp(false)} />}` の直後に追加:

```jsx
      {showShiftDialog && (
        <div className="modal-overlay" onClick={() => setShowShiftDialog(false)}>
          <div className="shift-dialog" onClick={e => e.stopPropagation()}>
            <div className="shift-dialog__header">
              <span>📅 日程シフト</span>
              <button className="btn-icon" onClick={() => setShowShiftDialog(false)}>✕</button>
            </div>
            <div className="shift-dialog__body">
              <p className="shift-dialog__hint">全タスクの日程をシフトします。<br/>正の値: 後ろ倒し　／　負の値: 前倒し</p>
              <input
                type="number"
                className="shift-dialog__input"
                value={shiftDays}
                onChange={e => setShiftDays(e.target.value)}
                placeholder="シフト日数（例: 7 または -3）"
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter' && shiftDays && !isNaN(parseInt(shiftDays, 10))) handleShiftDates();
                  if (e.key === 'Escape') setShowShiftDialog(false);
                }}
              />
            </div>
            <div className="shift-dialog__actions">
              <button className="btn btn--secondary" onClick={() => setShowShiftDialog(false)}>キャンセル</button>
              <button
                className="btn btn--primary"
                onClick={handleShiftDates}
                disabled={!shiftDays || isNaN(parseInt(shiftDays, 10)) || parseInt(shiftDays, 10) === 0}
              >実行</button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 3: ビルド確認**

```
cd frontend
npm run build
```

Expected: ビルド成功（エラーなし）

- [ ] **Step 4: コミット**

```
git add frontend/src/components/schedule/GanttChart.jsx frontend/src/styles/app.css
git commit -m "feat: replace toolbar buttons with Menu dropdown and shift dialog"
```

---

## Task 4: push

- [ ] **Step 1: バックエンドテストを確認**

```
cd backend
pytest tests/ -v
```

Expected: 全テスト PASSED（フロントエンドのみの変更なので回帰なし）

- [ ] **Step 2: push**

```
git push origin main
```

---

## セルフレビュー

**Spec coverage:**
- `☰ Menu ▾` ボタン（単体モード・現在表示のみ） ✅ Task 3 Step 1
- ドロップダウン: JSON / CSV / 印刷 / 週報 / 日程シフト... / 履歴 ✅ Task 3 Step 1
- 外側クリックで閉じる ✅ Task 2 Step 3
- Escape で閉じる ✅ Task 2 Step 4
- 日程シフトダイアログ（Cancel / Enter / Escape 対応） ✅ Task 3 Step 2
- 履歴バッジ（●N）表示 ✅ Task 3 Step 1
- `window.confirm` 除去 ✅ Task 2 Step 5

**Placeholder scan:** なし ✅

**Type consistency:**
- `showMenu`・`showShiftDialog`・`menuRef` は Task 2 で追加、Task 3 で参照 ✅
- `handleShiftDates` は Task 2 Step 5 で修正、Task 3 Step 2 で呼び出し ✅
