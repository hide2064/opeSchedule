export default function ProjectList({ projects, onEdit, onDelete }) {
  if (projects.length === 0) {
    return <div className="empty-msg">プロジェクトがありません。「+ New Project」から作成してください。</div>;
  }

  return (
    <div className="project-list">
      {projects.map(p => (
        <div key={p.id} className={`project-row${p.status === 'archived' ? ' is-archived' : ''}`}>
          <span className="project-row__color-dot" style={{ background: p.color }} />
          <span className="project-row__thumbnail">
            {p.image_data
              ? <img src={p.image_data} alt="" className="project-row__thumb-img" />
              : <span className="project-row__thumb-placeholder" style={{ background: p.color + '22' }} />
            }
          </span>
          <span
            className="project-row__name project-row__name--link"
            title={p.name}
            onClick={() => { window.location.href = `/schedule?project=${p.id}`; }}
          >
            {p.name}
          </span>
          <span className="project-row__col project-row__col--status">
            <span className={`project-pstatus project-pstatus--${p.project_status}`}>{p.project_status}</span>
            {p.status === 'archived' && <span className="project-row__archived-badge">archived</span>}
          </span>
          <span className="project-row__col project-row__col--client">
            {p.client_name && <span className="project-meta-chip project-meta-chip--client" title={p.client_name}>👤 {p.client_name}</span>}
          </span>
          <span className="project-row__col project-row__col--base">
            {p.base_project && <span className="project-meta-chip project-meta-chip--base" title={p.base_project}>🔗 {p.base_project}</span>}
          </span>
          <span className="project-row__col project-row__col--version">
            {p.latest_version != null
              ? <span className="project-version-badge">v{p.latest_version}</span>
              : <span className="project-version-badge project-version-badge--none">—</span>
            }
          </span>
          <span className="project-row__col project-row__col--activity">
            {p.last_activity_at
              ? <span className="project-activity-date" title={formatFull(p.last_activity_at)}>{formatShort(p.last_activity_at)}</span>
              : <span className="project-activity-date project-activity-date--none">—</span>
            }
          </span>
          <div className="project-row__actions">
            <button className="btn btn--secondary" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => onEdit(p)}>Edit</button>
            <button className="btn btn--danger"    style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => onDelete(p.id)}>Del</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatShort(isoStr) {
  const d = new Date(isoStr);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function formatFull(isoStr) {
  const d = new Date(isoStr);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
