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

  const real = tasks.filter(t => !t._isSep);

  const taskOnly = real.filter(t => t.task_type === 'task');
  const total = taskOnly.length;
  const completed = taskOnly.filter(t => t.progress >= 1.0).length;
  const progressPct = total > 0
    ? Math.round(taskOnly.reduce((s, t) => s + t.progress, 0) / total * 100)
    : 0;

  const doneThisWeek = real.filter(t => {
    const ed = parseDate(t.end_date);
    return t.progress >= 1.0 && ed >= weekStart && ed <= weekEnd;
  });

  const delayed = real.filter(t => {
    const ed = parseDate(t.end_date);
    return ed < today && t.progress < 1.0;
  });

  const nextWeek = real.filter(t => {
    const ed = parseDate(t.end_date);
    return t.progress < 1.0 && ed >= nextWeekStart && ed <= nextWeekEnd;
  });

  const milestones = real
    .filter(t => {
      const ed = parseDate(t.end_date);
      return t.task_type === 'milestone' && ed >= today && ed <= in90Days;
    })
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

  const table = (rows, cols) => {
    if (rows.length === 0) return none + '\n';
    const header = '| ' + cols.map(c => c.label).join(' | ') + ' |';
    const sep    = '| ' + cols.map(() => '---').join(' | ') + ' |';
    const body   = rows.map(t => '| ' + cols.map(c => c.fn(t)).join(' | ') + ' |');
    return [header, sep, ...body].join('\n') + '\n';
  };

  const daysLabel = (iso) => {
    const diff = Math.ceil((parseDate(iso) - new Date()) / 86400000);
    return diff >= 0 ? `${diff}日後` : `${Math.abs(diff)}日前`;
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
    { label: '残り日数',        fn: t => daysLabel(t.end_date) },
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
    table(r.doneThisWeek, doneCols),
    '',
    `## ⚠ 遅延中 (${r.delayed.length}件)`,
    '',
    table(r.delayed, delayedCols),
    '',
    `## 📅 来週完了予定 (${r.nextWeek.length}件)`,
    `> 来週期間: ${r.nextWeekStart} 〜 ${r.nextWeekEnd}`,
    '',
    table(r.nextWeek, nextCols),
    '',
    `## ◆ 今後3ヶ月マイルストーン (${r.milestones.length}件)`,
    '',
    table(r.milestones, msCols),
  ].join('\n');
}

// ── コンポーネント ──────────────────────────────────────────
export default function WeeklyReportModal({ tasks, project, config, onClose }) {
  const showToast = useToast();
  const [copied, setCopied] = useState(false);
  const report   = computeReport(tasks, project, config);
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

  const daysLabel = (iso) => {
    const diff = Math.ceil((parseDate(iso) - new Date()) / 86400000);
    return diff >= 0 ? `${diff}日後` : `${Math.abs(diff)}日前(遅延)`;
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
    { label: '残り日数',        fn: t => daysLabel(t.end_date) },
  ];

  const renderSection = (title, rows, cols, subNote) => (
    <section className="wr-section">
      <h3 className="wr-section__title">
        {title} <span className="wr-count">({rows.length}件)</span>
      </h3>
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
                  {cols.map(c => <td key={c.label} title={String(c.fn(t))}>{c.fn(t)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )
      }
    </section>
  );

  const pct = report.progressPct;

  return (
    <div className="modal-overlay wr-overlay" onClick={onClose}>
      <div className="weekly-report-modal" onClick={e => e.stopPropagation()}>

        <div className="weekly-report-modal__header">
          <span>📋 週次レポート: {report.projectName}</span>
          <button className="btn-icon" onClick={onClose} title="閉じる (Escape)">✕</button>
        </div>

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

        <div className="weekly-report-modal__body">
          {renderSection('✅ 今週完了', report.doneThisWeek, doneCols)}
          {renderSection('⚠ 遅延中', report.delayed, delayedCols)}
          {renderSection(
            '📅 来週完了予定', report.nextWeek, nextCols,
            `来週期間: ${report.nextWeekStart} 〜 ${report.nextWeekEnd}`
          )}
          {renderSection('◆ 今後3ヶ月マイルストーン', report.milestones, msCols)}
        </div>

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
