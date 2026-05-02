import { useState, useEffect } from 'react';
import * as api from '../../api.js';

export default function DashboardPanel({ projects }) {
  const [stats, setStats]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getProjectStats()
      .then(data => { setStats(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 24, color: 'var(--color-text-muted)' }}>読み込み中...</div>;

  const statsMap = Object.fromEntries(stats.map(s => [s.id, s]));
  const active = projects.filter(p => p.status === 'active');

  if (active.length === 0) {
    return <div className="empty-msg">プロジェクトがありません。「+ New Project」から作成してください。</div>;
  }

  return (
    <div className="dashboard-grid">
      {active.map(p => {
        const s = statsMap[p.id] ?? {};
        const pct = Math.round((s.progress_pct ?? 0) * 100);
        const today = new Date();
        const nextDate = s.next_milestone_date ? new Date(s.next_milestone_date) : null;
        const daysUntil = nextDate ? Math.ceil((nextDate - today) / 86400000) : null;

        return (
          <div
            key={p.id}
            className="dashboard-card"
            onClick={() => { window.location.href = `/schedule?project=${p.id}`; }}
            title={`${p.name} を開く`}
          >
            <div className="dashboard-card__header">
              <span className="dashboard-card__dot" style={{ background: p.color }} />
              <span className="dashboard-card__title">
                {p.model_name && <span className="dashboard-card__model">{p.model_name} / </span>}
                {p.name}
              </span>
              <span className={`project-pstatus project-pstatus--${p.project_status}`}>
                {p.project_status}
              </span>
            </div>

            {p.client_name && (
              <div className="dashboard-card__client">👤 {p.client_name}</div>
            )}

            <div className="dashboard-card__progress-row">
              <div className="dashboard-card__bar-wrap">
                <div
                  className="dashboard-card__bar-fill"
                  style={{ width: `${pct}%`, background: p.color }}
                />
              </div>
              <span className="dashboard-card__pct">
                {pct}%
                <span className="dashboard-card__tasks">　({s.completed_tasks ?? 0}/{s.total_tasks ?? 0} タスク)</span>
              </span>
            </div>

            <div className="dashboard-card__footer">
              {(s.delayed_task_count ?? 0) > 0 && (
                <span className="dashboard-card__delay">⚠ 遅延 {s.delayed_task_count}件</span>
              )}
              {s.next_milestone_name && daysUntil !== null && (
                <span className={`dashboard-card__ms${daysUntil < 0 ? ' is-overdue' : ''}`}>
                  ◆ {s.next_milestone_name}　{s.next_milestone_date}
                  {daysUntil >= 0 ? ` (${daysUntil}日後)` : ` (${Math.abs(daysUntil)}日前・遅延)`}
                </span>
              )}
              {!(s.delayed_task_count ?? 0) && !s.next_milestone_name && (
                <span className="dashboard-card__ok">✓ 遅延なし</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
