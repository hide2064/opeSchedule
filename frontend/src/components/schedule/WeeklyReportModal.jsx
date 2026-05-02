import { useState, useMemo } from 'react';
import { parseDate, addDays, fmtDate } from '../../utils.js';

function getWeekStart(date, weekStartDay) {
  const d = new Date(date);
  const dow = d.getDay(); // 0: Sun, 1: Mon, ..., 6: Sat
  let diff = 0;
  if (weekStartDay === 'Sun') {
    diff = dow;
  } else if (weekStartDay === 'Sat') {
    diff = dow === 6 ? 0 : dow + 1;
  } else {
    // Mon default
    diff = dow === 0 ? 6 : dow - 1;
  }
  return addDays(d, -diff);
}

export default function WeeklyReportModal({ tasks, project, config, members, onClose }) {
  const [comments, setComments] = useState('');
  const [selectedAssignee, setSelectedAssignee] = useState(null);
  const [copyStatus, setCopyStatus] = useState('');

  const reportData = useMemo(() => {
    const today = parseDate(fmtDate(new Date()));
    const todayStr = fmtDate(today);

    const wsd = config?.week_start_day || 'Mon';
    const weekStart = getWeekStart(today, wsd);
    const weekEnd = addDays(weekStart, 6);
    const nextWeekStart = addDays(weekStart, 7);
    const nextWeekEnd = addDays(nextWeekStart, 6);
    const threeMonthsLater = addDays(today, 90);

    const weekStartStr = fmtDate(weekStart);
    const weekEndStr = fmtDate(weekEnd);
    const nextWeekStartStr = fmtDate(nextWeekStart);
    const nextWeekEndStr = fmtDate(nextWeekEnd);
    const threeMonthsLaterStr = fmtDate(threeMonthsLater);

    // Filter valid tasks
    let validTasks = tasks.filter(t => !t._isSep);
    if (selectedAssignee !== null) {
      validTasks = validTasks.filter(t => t.assignee_id === selectedAssignee);
    }

    const isTask = t => t.task_type === 'task' || !t.task_type;
    const allTaskTasks = validTasks.filter(isTask);
    const totalDuration = allTaskTasks.reduce((acc, t) => {
      const days = (new Date(parseDate(t.end_date)).getTime() - new Date(parseDate(t.start_date)).getTime()) / 86400000 + 1;
      return acc + (days > 0 ? days : 1);
    }, 0);
    const completedDuration = allTaskTasks.reduce((acc, t) => {
      const days = (new Date(parseDate(t.end_date)).getTime() - new Date(parseDate(t.start_date)).getTime()) / 86400000 + 1;
      return acc + (days > 0 ? days : 1) * (t.progress || 0);
    }, 0);
    
    const pct = totalDuration > 0 ? Math.round((completedDuration / totalDuration) * 100) : 0;
    const completedCount = allTaskTasks.filter(t => (t.progress || 0) >= 1.0).length;
    const totalCount = allTaskTasks.length;

    // Categories
    const thisWeekCompleted = [];
    const delayed = [];
    const nextWeekPlanned = [];
    const upcomingMilestones = [];
    const newlyAdded = [];

    for (const t of validTasks) {
      const large = t.category_large || '';
      const medium = t.category_medium || '';
      const prog = t.progress || 0;
      const endDtStr = t.end_date || '';

      // Newly added this week (using created_at)
      if (t.created_at) {
        // created_at is usually a full ISO string
        const createdDtStr = fmtDate(new Date(t.created_at));
        if (createdDtStr >= weekStartStr && createdDtStr <= weekEndStr) {
          newlyAdded.push({ ...t, large, medium });
        }
      }

      // Milestones
      if (t.task_type === 'milestone') {
        if (endDtStr >= todayStr && endDtStr <= threeMonthsLaterStr) {
          upcomingMilestones.push({ ...t, large, medium });
        }
        if (prog < 1.0 && endDtStr < todayStr) {
          delayed.push({ ...t, large, medium });
        }
        continue;
      }

      // Tasks
      if (prog >= 1.0) {
        if (endDtStr >= weekStartStr && endDtStr <= weekEndStr) {
          thisWeekCompleted.push({ ...t, large, medium });
        }
      } else {
        if (endDtStr < todayStr) {
          delayed.push({ ...t, large, medium });
        } else if (endDtStr >= nextWeekStartStr && endDtStr <= nextWeekEndStr) {
          nextWeekPlanned.push({ ...t, large, medium });
        }
      }
    }

    // Sort appropriately
    thisWeekCompleted.sort((a, b) => a.end_date.localeCompare(b.end_date));
    delayed.sort((a, b) => a.end_date.localeCompare(b.end_date));
    nextWeekPlanned.sort((a, b) => a.end_date.localeCompare(b.end_date));
    upcomingMilestones.sort((a, b) => a.end_date.localeCompare(b.end_date));
    newlyAdded.sort((a, b) => a.created_at.localeCompare(b.created_at));

    return {
      todayStr, weekStartStr, weekEndStr,
      pct, completedCount, totalCount,
      thisWeekCompleted, delayed, nextWeekPlanned, upcomingMilestones, newlyAdded
    };
  }, [tasks, config, selectedAssignee]);

  const assigneeName = useMemo(() => {
    if (selectedAssignee === null) return '';
    return members?.find(m => m.id === selectedAssignee)?.name || '担当者';
  }, [selectedAssignee, members]);

  const projectNameDisplay = assigneeName ? `${project?.name} (${assigneeName})` : project?.name;

  const generateMarkdown = () => {
    const {
      todayStr, weekStartStr, weekEndStr, pct, completedCount, totalCount,
      thisWeekCompleted, delayed, nextWeekPlanned, upcomingMilestones, newlyAdded
    } = reportData;

    let md = `# 週次レポート: ${projectNameDisplay}\n\n`;
    md += `**対象期間:** ${weekStartStr} 〜 ${weekEndStr}\n`;
    md += `**作成日:** ${todayStr}\n`;
    md += `**全体進捗:** ${pct}% (${completedCount}/${totalCount} タスク)\n\n`;

    if (comments.trim()) {
      md += `## 📝 今週のトピックス・課題\n\n${comments.trim()}\n\n`;
    }

    md += `---\n\n`;

    md += `## ✅ 今週完了 (${thisWeekCompleted.length}件)\n\n`;
    if (thisWeekCompleted.length === 0) {
      md += `_（なし）_\n\n`;
    } else {
      md += `| タスク名 | 大項目 | 中項目 | 完了日 |\n|---|---|---|---|\n`;
      thisWeekCompleted.forEach(t => {
        md += `| ${t.name} | ${t.large} | ${t.medium} | ${t.end_date} |\n`;
      });
      md += `\n`;
    }

    md += `## ⚠ 遅延中 (${delayed.length}件)\n\n`;
    if (delayed.length === 0) {
      md += `_（なし）_\n\n`;
    } else {
      md += `| タスク名 | 大項目 | 中項目 | 期限 | 進捗 |\n|---|---|---|---|---|\n`;
      delayed.forEach(t => {
        const p = Math.round((t.progress || 0) * 100);
        md += `| ${t.name} | ${t.large} | ${t.medium} | ${t.end_date} | ${p}% |\n`;
      });
      md += `\n`;
    }

    md += `## 📅 来週完了予定 (${nextWeekPlanned.length}件)\n\n`;
    if (nextWeekPlanned.length === 0) {
      md += `_（なし）_\n\n`;
    } else {
      md += `| タスク名 | 大項目 | 中項目 | 期限 | 進捗 |\n|---|---|---|---|---|\n`;
      nextWeekPlanned.forEach(t => {
        const p = Math.round((t.progress || 0) * 100);
        md += `| ${t.name} | ${t.large} | ${t.medium} | ${t.end_date} | ${p}% |\n`;
      });
      md += `\n`;
    }

    if (newlyAdded.length > 0) {
      md += `## 📥 今週追加されたタスク (${newlyAdded.length}件)\n\n`;
      md += `| タスク名 | 大項目 | 中項目 | 期限 |\n|---|---|---|---|\n`;
      newlyAdded.forEach(t => {
        md += `| ${t.name} | ${t.large} | ${t.medium} | ${t.end_date} |\n`;
      });
      md += `\n`;
    }

    md += `## ◆ 今後3ヶ月マイルストーン (${upcomingMilestones.length}件)\n\n`;
    if (upcomingMilestones.length === 0) {
      md += `_（なし）_\n\n`;
    } else {
      md += `| マイルストーン名 | 大項目 | 日付 | 残り日数 |\n|---|---|---|---|\n`;
      upcomingMilestones.forEach(t => {
        const remain = Math.round((new Date(t.end_date) - new Date(todayStr)) / 86400000);
        md += `| ${t.name} | ${t.large} | ${t.end_date} | ${remain}日 |\n`;
      });
      md += `\n`;
    }

    return md;
  };

  const generateHTML = () => {
    const {
      todayStr, weekStartStr, weekEndStr, pct, completedCount, totalCount,
      thisWeekCompleted, delayed, nextWeekPlanned, upcomingMilestones, newlyAdded
    } = reportData;

    let html = `<h1>週次レポート: ${projectNameDisplay}</h1>`;
    html += `<p><strong>対象期間:</strong> ${weekStartStr} 〜 ${weekEndStr}<br/>`;
    html += `<strong>作成日:</strong> ${todayStr}<br/>`;
    html += `<strong>全体進捗:</strong> ${pct}% (${completedCount}/${totalCount} タスク)</p>`;

    if (comments.trim()) {
      html += `<h2>📝 今週のトピックス・課題</h2><p>${comments.trim().replace(/\\n/g, '<br/>')}</p>`;
    }
    
    html += `<hr/>`;

    const renderTable = (items, cols, rowFn) => {
      if (items.length === 0) return `<p><em>（なし）</em></p>`;
      let t = `<table border="1" style="border-collapse: collapse; width: 100%;"><thead><tr>`;
      cols.forEach(c => t += `<th style="padding: 4px; text-align: left; background: #f0f0f0;">${c}</th>`);
      t += `</tr></thead><tbody>`;
      items.forEach(item => {
        t += `<tr>`;
        rowFn(item).forEach(td => t += `<td style="padding: 4px;">${td}</td>`);
        t += `</tr>`;
      });
      t += `</tbody></table>`;
      return t;
    };

    html += `<h2>✅ 今週完了 (${thisWeekCompleted.length}件)</h2>`;
    html += renderTable(thisWeekCompleted, ['タスク名', '大項目', '中項目', '完了日'], t => [t.name, t.large, t.medium, t.end_date]);

    html += `<h2>⚠ 遅延中 (${delayed.length}件)</h2>`;
    html += renderTable(delayed, ['タスク名', '大項目', '中項目', '期限', '進捗'], t => [t.name, t.large, t.medium, t.end_date, `${Math.round((t.progress || 0) * 100)}%`]);

    html += `<h2>📅 来週完了予定 (${nextWeekPlanned.length}件)</h2>`;
    html += renderTable(nextWeekPlanned, ['タスク名', '大項目', '中項目', '期限', '進捗'], t => [t.name, t.large, t.medium, t.end_date, `${Math.round((t.progress || 0) * 100)}%`]);

    if (newlyAdded.length > 0) {
      html += `<h2>📥 今週追加されたタスク (${newlyAdded.length}件)</h2>`;
      html += renderTable(newlyAdded, ['タスク名', '大項目', '中項目', '期限'], t => [t.name, t.large, t.medium, t.end_date]);
    }

    html += `<h2>◆ 今後3ヶ月マイルストーン (${upcomingMilestones.length}件)</h2>`;
    html += renderTable(upcomingMilestones, ['マイルストーン名', '大項目', '日付', '残り日数'], t => {
      const remain = Math.round((new Date(t.end_date) - new Date(todayStr)) / 86400000);
      return [t.name, t.large, t.end_date, `${remain}日`];
    });

    return html;
  };

  const handleCopyMarkdown = () => {
    navigator.clipboard.writeText(generateMarkdown()).then(() => {
      setCopyStatus('markdown');
      setTimeout(() => setCopyStatus(''), 1500);
    });
  };

  const handleCopyHTML = () => {
    const html = generateHTML();
    const blobHtml = new Blob([html], { type: "text/html" });
    const blobText = new Blob([generateMarkdown()], { type: "text/plain" });
    const item = new window.ClipboardItem({ "text/html": blobHtml, "text/plain": blobText });
    navigator.clipboard.write([item]).then(() => {
      setCopyStatus('html');
      setTimeout(() => setCopyStatus(''), 1500);
    }).catch(err => {
      console.error(err);
      alert('クリップボードへのHTML書き込みに失敗しました。');
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const PreviewTable = ({ title, count, items, renderRow, cols, isDanger }) => (
    <div className="weekly-report-section">
      <h3>{title} ({count}件)</h3>
      {items.length === 0 ? (
        <p className="text-muted">（なし）</p>
      ) : (
        <table className="weekly-report-table">
          <thead>
            <tr>
              {cols.map(c => <th key={c}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className={isDanger ? 'text-danger' : ''}>
                {renderRow(item).map((col, j) => <td key={j}>{col}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal weekly-report-modal" onClick={e => e.stopPropagation()}>
        <div className="modal__header">
          <h2>週次レポート: {projectNameDisplay}</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="weekly-report-modal__filters">
          <div className="form-group" style={{ display: 'flex', gap: '1rem', alignItems: 'center', margin: 0, padding: '0 1.5rem' }}>
            <label style={{ margin: 0, fontWeight: 'bold' }}>担当者絞り込み:</label>
            <select 
              value={selectedAssignee === null ? '' : selectedAssignee} 
              onChange={e => setSelectedAssignee(e.target.value === '' ? null : Number(e.target.value))}
              className="form-control"
              style={{ width: '200px' }}
            >
              <option value="">全員</option>
              {members?.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="modal__body weekly-report-modal__body">
          <div className="weekly-report-modal__editor">
            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>📝 今週のトピックス・課題 (Markdown出力に反映されます)</label>
            <textarea 
              className="form-control" 
              rows="3" 
              placeholder="例: API連携で遅延が発生していますが、来週水曜までにリカバリ予定です。"
              value={comments}
              onChange={e => setComments(e.target.value)}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>

          <div className="weekly-report-modal__preview">
            <div className="weekly-report-header-info" style={{ background: '#f8f9fa', padding: '16px', borderRadius: '4px', marginBottom: '16px' }}>
              <p style={{ margin: '0 0 8px 0' }}><strong>対象期間:</strong> {reportData.weekStartStr} 〜 {reportData.weekEndStr}</p>
              <p style={{ margin: 0 }}>
                <strong>全体進捗:</strong> 
                <span style={{ display: 'inline-block', width: '100px', height: '12px', background: '#e0e0e0', margin: '0 8px', verticalAlign: 'middle', borderRadius: '6px', overflow: 'hidden' }}>
                  <span style={{ display: 'block', width: `${reportData.pct}%`, height: '100%', background: '#4CAF50' }}></span>
                </span>
                {reportData.pct}% ({reportData.completedCount}/{reportData.totalCount} タスク)
              </p>
            </div>

            <PreviewTable 
              title="✅ 今週完了" 
              count={reportData.thisWeekCompleted.length} 
              items={reportData.thisWeekCompleted}
              cols={['タスク名', '大項目', '中項目', '完了日']}
              renderRow={t => [t.name, t.large, t.medium, t.end_date]}
            />

            <PreviewTable 
              title="⚠ 遅延中" 
              count={reportData.delayed.length} 
              items={reportData.delayed}
              cols={['タスク名', '大項目', '中項目', '期限', '進捗']}
              isDanger={true}
              renderRow={t => [t.name, t.large, t.medium, t.end_date, `${Math.round((t.progress || 0) * 100)}%`]}
            />

            <PreviewTable 
              title="📅 来週完了予定" 
              count={reportData.nextWeekPlanned.length} 
              items={reportData.nextWeekPlanned}
              cols={['タスク名', '大項目', '中項目', '期限', '進捗']}
              renderRow={t => [t.name, t.large, t.medium, t.end_date, `${Math.round((t.progress || 0) * 100)}%`]}
            />

            {reportData.newlyAdded.length > 0 && (
              <PreviewTable 
                title="📥 今週追加されたタスク" 
                count={reportData.newlyAdded.length} 
                items={reportData.newlyAdded}
                cols={['タスク名', '大項目', '中項目', '期限']}
                renderRow={t => [t.name, t.large, t.medium, t.end_date]}
              />
            )}

            <PreviewTable 
              title="◆ 今後3ヶ月マイルストーン" 
              count={reportData.upcomingMilestones.length} 
              items={reportData.upcomingMilestones}
              cols={['マイルストーン名', '大項目', '日付', '残り日数']}
              renderRow={t => {
                const remain = Math.round((new Date(t.end_date) - new Date(reportData.todayStr)) / 86400000);
                return [t.name, t.large, t.end_date, `${remain}日`];
              }}
            />
          </div>
        </div>

        <div className="modal__footer weekly-report-modal__actions">
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn--secondary" onClick={handleCopyMarkdown}>
              {copyStatus === 'markdown' ? '✅ コピー済み' : '📋 Markdownコピー'}
            </button>
            <button className="btn btn--secondary" onClick={handleCopyHTML} title="表形式でWordやメールに貼り付けられます">
              {copyStatus === 'html' ? '✅ コピー済み' : '📋 表形式(HTML)コピー'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn--primary" onClick={handlePrint}>🖨 印刷</button>
            <button className="btn btn--secondary" onClick={onClose}>閉じる</button>
          </div>
        </div>
      </div>
    </div>
  );
}
