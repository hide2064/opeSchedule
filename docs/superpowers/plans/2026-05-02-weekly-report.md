# 週次サマリーレポート (B-2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** スケジュール画面から現在のプロジェクトの週次サマリーレポートをモーダル表示し、Markdownコピーと印刷に対応する。

**Architecture:** フロントエンドのみで完結。GanttChart が保持する `tasks`・`project`・`config` を `WeeklyReportModal` に渡し、クライアント側で集計・レンダリングする。APIコールなし。

**Tech Stack:** React/JSX, Vite, navigator.clipboard API, CSS @media print

---

## ファイルマップ

| 操作 | ファイル |
|------|---------|
| Create | `frontend/src/components/schedule/WeeklyReportModal.jsx` |
| Modify | `frontend/src/components/schedule/GanttChart.jsx` |
| Modify | `frontend/src/styles/app.css` |

---

## Task 1: WeeklyReportModal コンポーネント作成

**Files:**
- Create: `frontend/src/components/schedule/WeeklyReportModal.jsx`

- [ ] **Step 1: WeeklyReportModal.jsx を作成する**

新規ファイル `frontend/src/components/schedule/WeeklyReportModal.jsx` を以下の内容で作成:

```jsx
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../contexts/ToastContext.jsx';

// ── 週の境界を計算 ─────────────────────────────────────────
function getWeekBounds(today, weekStartDay) {
  const dowMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const startDow = dowMap[weekStartDay] ?? 1;
  const todayDow = today.getDay();
  const diffToStart = (todayDow - startDow + 7) % 7;
  const ms1d = 86400000;
  const weekStart = new Date(today.getTime() - diffToStart * ms1d);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart.getTime() + 6 * ms1d);
  weekEnd.setHours(23, 59, 59, 999);
  const nextWeekStart = new Date(weekStart.getTime() + 7 * ms1d);
  const nextWeekEnd   = new Date(weekStart.getTime() + 13 * ms1d);
  nextWeekEnd.setHours(23, 59, 59, 999);
  return { weekStart, weekEnd, nextWeekStart, nextWeekEnd };
}

function parseDate(iso) {
  // "2026-05-02" → Date (local midnight)
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fmtDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ── レポートデータを集計 ────────────────────────────────────
function computeReport(tasks, project, config) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekStartDay = config?.week_start_day ?? 'Mon';
  const { weekStart, weekEnd, nextWeekStart, nextWeekEnd } = getWeekBounds(today, weekStartDay);
  const in90Days = new Date(today.getTime() + 90 * 86400000);

  // セパレーター行・マルチモード用名前空間付きタスクを除外
  const real = tasks.filter(t => !t._isSep);

  // 全体進捗 (task_type='task' のみ)
  const taskOnly = real.filter(t => t.task_type === 'task');
  const total = taskOnly.length;
  const completed = taskOnly.filter(t => t.progress >= 1.0).length;
  const progressPct = total > 0 ? Math.round(taskOnly.reduce((s, t) => s + t.progress, 0) / total * 100) : 0;

  // 今週完了: end_date が今週内かつ progress >= 1.0
  const doneThisWeek = real.filter(t => {
    const ed = parseDate(t.end_date);
    return t.progress >= 1.0 && ed >= weekStart && ed <= weekEnd;
  });

  // 遅延中: end_date < today かつ progress < 1.0 (task・milestone 両方)
  const delayed = real.filter(t => {
    const ed = parseDate(t.end_date);
    return ed < today && t.progress < 1.0;
  });

  // 来週完了予定: end_date が来週内かつ progress < 1.0
  const nextWeek = real.filter(t => {
    const ed = parseDate(t.end_date);
    return t.progress < 1.0 && ed >= nextWeekStart && ed <= nextWeekEnd;
  });

  // 今後3ヶ月マイルストーン: task_type='milestone' かつ end_date が today〜+90日
  const milestones = real
    .filter(t => t.task_type === 'milestone' && parseDate(t.end_date) >= today && parseDate(t.end_date) <= in90Days)
    .sort((a, b) => a.end_date.localeCompare(b.end_date));

  return {
    projectName: project?.name ?? '',
    weekStart: fmtDate(weekStart),
    weekEnd: fmtDate(weekEnd),
    nextWeekStart: fmtDate(nextWeekStart),
    nextWeekEnd: fmtDate(nextWeekEnd),
    today: fmtDate(today),
    progressPct,
    total,
    completed,
    doneThisWeek,
    delayed,
    nextWeek,
    milestones,
  };
}

// ── Markdown 生成 ───────────────────────────────────────────
function buildMarkdown(r) {
  const none = '_（なし）_';
  const taskTable = (rows, cols) => {
    if (rows.length === 0) return none + '\n';
    const headers = cols.map(c => c.label);
    const sep = cols.map(() => '---');
    const lines = rows.map(t => cols.map(c => c.fn(t)).join(' | '));
    return [
      '| ' + headers.join(' | ') + ' |',
      '| ' + sep.join(' | ') + ' |',
      ...lines.map(l => '| ' + l + ' |'),
    ].join('\n') + '\n';
  };

  const doneCols = [
    { label: 'タスク名', fn: t => t.name },
    { label: '大項目',   fn: t => t.category_large  ?? '' },
    { label: '中項目',   fn: t => t.category_medium ?? '' },
    { label: '完了日',   fn: t => t.end_date },
  ];
  const delayedCols = [
    { label: 'タスク名', fn: t => t.name },
    { label: '大項目',   fn: t => t.category_large  ?? '' },
    { label: '中項目',   fn: t => t.category_medium ?? '' },
    { label: '期限',     fn: t => t.end_date },
    { label: '進捗',     fn: t => Math.round(t.progress * 100) + '%' },
  ];
  const nextCols = [
    { label: 'タスク名', fn: t => t.name },
    { label: '大項目',   fn: t => t.category_large  ?? '' },
    { label: '中項目',   fn: t => t.category_medium ?? '' },
    { label: '期限',     fn: t => t.end_date },
    { label: '進捗',     fn: t => Math.round(t.progress * 100) + '%' },
  ];
  const msCols = [
    { label: 'マイルストーン名', fn: t => t.name },
    { label: '大項目',          fn: t => t.category_large ?? '' },
    { label: '日付',            fn: t => t.end_date },
    { label: '残り日数',        fn: t => {
      const diff = Math.ceil((parseDate(t.end_date) - new Date()) / 86400000);
      return diff >= 0 ? `${diff}日後` : `${Math.abs(diff)}日前`;
    }},
  ];

  return [
    `# 週次レポート: ${r.projectName}`,
    '',
    `**対象期間:** ${r.weekStart} 〜 ${r.weekEnd}`,
    `**作成日:** ${r.today}`,
    `**全体進捗:** ${r.progressPct}% (${r.completed}/${r.total} タスク)`,
    '',
    '---',
    '',
    `## ✅ 今週完了 (${r.doneThisWeek.length}件)`,
    '',
    taskTable(r.doneThisWeek, doneCols),
    '',
    `## ⚠ 遅延中 (${r.delayed.length}件)`,
    '',
    taskTable(r.delayed, delayedCols),
    '',
    `## 📅 来週完了予定 (${r.nextWeek.length}件)`,
    `> 来週期間: ${r.nextWeekStart} 〜 ${r.nextWeekEnd}`,
    '',
    taskTable(r.nextWeek, nextCols),
    '',
    `## ◆ 今後3ヶ月マイルストーン (${r.milestones.length}件)`,
    '',
    taskTable(r.milestones, msCols),
  ].join('\n');
}

// ── コンポーネント ──────────────────────────────────────────
export default function WeeklyReportModal({ tasks, project, config, onClose }) {
  const showToast = useToast();
  const [copied, setCopied] = useState(false);
  const report = computeReport(tasks, project, config);
  const markdown = buildMarkdown(report);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      showToast('クリップボードへのコピーに失敗しました', 'error');
    }
  }, [markdown, showToast]);

  const pct = report.progressPct;

  const renderSection = (title, rows, cols, subNote) => (
    <section className="wr-section">
      <h3 className="wr-section__title">{title} <span className="wr-count">({rows.length}件)</span></h3>
      {subNote && <p className="wr-subnote">{subNote}</p>}
      {rows.length === 0
        ? <p className="wr-empty">（なし）</p>
        : (
          <table className="wr-table">
            <thead>
              <tr>{cols.map(c => <th key={c.label}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map(t => (
                <tr key={t.id}>
                  {cols.map(c => <td key={c.label}>{c.fn(t)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )
      }
    </section>
  );

  const doneCols    = [
    { label: 'タスク名', fn: t => t.name },
    { label: '大項目',   fn: t => t.category_large  ?? '' },
    { label: '中項目',   fn: t => t.category_medium ?? '' },
    { label: '完了日',   fn: t => t.end_date },
  ];
  const delayedCols = [
    { label: 'タスク名', fn: t => t.name },
    { label: '大項目',   fn: t => t.category_large  ?? '' },
    { label: '中項目',   fn: t => t.category_medium ?? '' },
    { label: '期限',     fn: t => t.end_date },
    { label: '進捗',     fn: t => Math.round(t.progress * 100) + '%' },
  ];
  const nextCols    = [
    { label: 'タスク名', fn: t => t.name },
    { label: '大項目',   fn: t => t.category_large  ?? '' },
    { label: '中項目',   fn: t => t.category_medium ?? '' },
    { label: '期限',     fn: t => t.end_date },
    { label: '進捗',     fn: t => Math.round(t.progress * 100) + '%' },
  ];
  const msCols      = [
    { label: 'マイルストーン名', fn: t => t.name },
    { label: '大項目',          fn: t => t.category_large ?? '' },
    { label: '日付',            fn: t => t.end_date },
    { label: '残り日数', fn: t => {
      const diff = Math.ceil((parseDate(t.end_date) - new Date()) / 86400000);
      return diff >= 0 ? `${diff}日後` : `${Math.abs(diff)}日前(遅延)`;
    }},
  ];

  return (
    <div className="modal-overlay wr-overlay" onClick={onClose}>
      <div className="weekly-report-modal" onClick={e => e.stopPropagation()}>

        {/* ヘッダー */}
        <div className="weekly-report-modal__header">
          <span>📋 週次レポート: {report.projectName}</span>
          <button className="btn-icon" onClick={onClose} title="閉じる (Escape)">✕</button>
        </div>

        {/* サマリー */}
        <div className="wr-summary">
          <span className="wr-summary__period">📅 {report.weekStart} 〜 {report.weekEnd}</span>
          <span className="wr-summary__progress">
            <span className="wr-summary__pct">{pct}%</span>
            <span className="wr-summary__bar-wrap">
              <span className="wr-summary__bar-fill" style={{ width: `${pct}%` }} />
            </span>
            <span className="wr-summary__label">({report.completed}/{report.total} タスク)</span>
          </span>
        </div>

        {/* 本文 */}
        <div className="weekly-report-modal__body">
          {renderSection('✅ 今週完了', report.doneThisWeek, doneCols)}
          {renderSection('⚠ 遅延中', report.delayed, delayedCols)}
          {renderSection(
            '📅 来週完了予定', report.nextWeek, nextCols,
            `来週期間: ${report.nextWeekStart} 〜 ${report.nextWeekEnd}`
          )}
          {renderSection('◆ 今後3ヶ月マイルストーン', report.milestones, msCols)}
        </div>

        {/* アクション */}
        <div className="weekly-report-modal__actions">
          <button className="btn btn--secondary" onClick={handleCopy}>
            {copied ? '✅ コピー済み' : '📋 Markdownコピー'}
          </button>
          <button className="btn btn--secondary" onClick={() => window.print()}>🖨 印刷</button>
          <button className="btn btn--secondary" onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: ビルドが通ることを確認**

```
cd frontend
npm run build
```

Expected: ビルド成功（エラーなし）

---

## Task 2: CSS 追加

**Files:**
- Modify: `frontend/src/styles/app.css`

- [ ] **Step 1: WeeklyReportModal の CSS を app.css 末尾に追加**

`frontend/src/styles/app.css` の末尾に追記:

```css
/* ── Weekly Report Modal ─────────────────────────────────── */
.weekly-report-modal {
  background: var(--color-surface);
  border-radius: var(--panel-radius);
  width: min(760px, 94vw);
  height: min(680px, 90vh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0,0,0,.18);
}
.weekly-report-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--color-border);
  font-weight: 700;
  font-size: 15px;
  flex-shrink: 0;
}
.wr-summary {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 18px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg);
  flex-shrink: 0;
  flex-wrap: wrap;
}
.wr-summary__period { font-size: 13px; color: var(--color-text-muted); }
.wr-summary__progress { display: flex; align-items: center; gap: 8px; }
.wr-summary__pct { font-weight: 700; font-size: 16px; min-width: 36px; }
.wr-summary__bar-wrap { width: 120px; height: 8px; background: var(--color-border); border-radius: 4px; overflow: hidden; }
.wr-summary__bar-fill { height: 100%; background: var(--color-primary); border-radius: 4px; }
.wr-summary__label { font-size: 12px; color: var(--color-text-muted); }
.weekly-report-modal__body { flex: 1; overflow-y: auto; padding: 16px 18px; display: flex; flex-direction: column; gap: 20px; }
.weekly-report-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}
/* sections */
.wr-section { display: flex; flex-direction: column; gap: 8px; }
.wr-section__title { font-size: 14px; font-weight: 700; display: flex; align-items: center; gap: 6px; }
.wr-count { font-weight: 400; font-size: 12px; color: var(--color-text-muted); }
.wr-subnote { font-size: 12px; color: var(--color-text-muted); margin: 0; }
.wr-empty { font-size: 13px; color: var(--color-text-muted); margin: 0; padding: 4px 0; }
.wr-table { border-collapse: collapse; width: 100%; font-size: 12px; }
.wr-table th, .wr-table td { border: 1px solid var(--color-border); padding: 5px 8px; text-align: left; }
.wr-table th { background: var(--color-bg); font-weight: 600; white-space: nowrap; }
.wr-table td { max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 印刷: レポート本体のみ印刷、UIは非表示 */
@media print {
  .wr-overlay { background: none !important; position: static !important; }
  .weekly-report-modal {
    width: 100% !important;
    height: auto !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    overflow: visible !important;
  }
  .weekly-report-modal__actions { display: none !important; }
  .weekly-report-modal__body { overflow: visible !important; height: auto !important; }
  .app-header, .top-nav, .schedule-header, .gantt-container { display: none !important; }
  body > *:not(.modal-overlay) { display: none !important; }
  .modal-overlay { display: block !important; }
}
```

- [ ] **Step 2: ビルドが通ることを確認**

```
cd frontend
npm run build
```

Expected: ビルド成功

---

## Task 3: GanttChart に統合

**Files:**
- Modify: `frontend/src/components/schedule/GanttChart.jsx`

- [ ] **Step 1: import と state を追加**

`GanttChart.jsx` のファイル先頭 import 群（`HelpModal` の直後）に追加:

```jsx
import WeeklyReportModal from './WeeklyReportModal.jsx';
```

`showHelp` state の直後に追加:

```jsx
const [showWeeklyReport, setShowWeeklyReport] = useState(false);
```

- [ ] **Step 2: ツールバーに「週報」ボタンを追加**

`🖨 印刷` ボタンの直後に追加:

変更前:
```jsx
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => window.print()}
              title="ガントチャートを印刷 / PDF 保存"
            >🖨 印刷</button>
```

変更後:
```jsx
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
```

- [ ] **Step 3: WeeklyReportModal をマウント**

`{showHelp && <HelpModal ... />}` の直後に追加:

```jsx
      {showWeeklyReport && (
        <WeeklyReportModal
          tasks={displayTasks}
          project={project}
          config={config}
          onClose={() => setShowWeeklyReport(false)}
        />
      )}
```

- [ ] **Step 4: ビルド確認**

```
cd frontend
npm run build
```

Expected: ビルド成功（エラーなし）

- [ ] **Step 5: コミット**

```
git add frontend/src/components/schedule/WeeklyReportModal.jsx \
        frontend/src/styles/app.css \
        frontend/src/components/schedule/GanttChart.jsx
git commit -m "feat: add weekly report modal (B-2) with markdown copy and print"
```

---

## Task 4: design.md 更新 & push

**Files:**
- Modify: `docs/user_manual.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: user_manual.md に週報操作を追記**

`docs/user_manual.md` の「4. Schedule 画面の操作」セクション内（印刷の説明の後）に以下を追記:

```markdown
### 週次レポート

ツールバーの「📋 週報」ボタンをクリックすると、現在のプロジェクトの週次サマリーレポートがモーダルで表示されます。

| ボタン | 動作 |
|-------|------|
| 📋 Markdownコピー | レポートをMarkdown形式でクリップボードにコピー |
| 🖨 印刷 | レポートを印刷（PDF保存も可） |

**レポートの内容:**
- ✅ 今週完了したタスク
- ⚠ 遅延中のタスク（期限超過・未完了）
- 📅 来週中に完了予定のタスク
- ◆ 今後3ヶ月以内のマイルストーン
```

- [ ] **Step 2: コミット & push**

```
git add docs/user_manual.md
git commit -m "docs: add weekly report instructions to user manual"
git push origin main
```

---

## セルフレビュー

**Spec coverage:**
- 単一プロジェクト対象（GanttChart から props 経由） ✅
- モーダル表示 ✅
- Markdownコピー（clipboard API + 「✅ コピー済み」フィードバック） ✅
- 印刷ボタン（window.print()） ✅
- 今週完了・遅延中・来週予定・マイルストーン の4セクション ✅
- `config.week_start_day` で週の起点を決定 ✅
- 来週予定は `end_date` が来週内かつ未完了 ✅
- セパレーター行 (`_isSep`) の除外 ✅
- 単体モード・現在表示のみボタン表示 ✅
- `@media print` でUI非表示 ✅
- `Escape` でモーダルを閉じる ✅

**Placeholder scan:** なし ✅

**Type consistency:**
- `computeReport` は Task 1 で定義し、Task 1 内の `renderSection` と `buildMarkdown` で使用 ✅
- `parseDate` は Task 1 内で定義し、Task 1 内の `computeReport` と `msCols` 内で使用 ✅
- `displayTasks` は GanttChart に既存の変数 ✅
