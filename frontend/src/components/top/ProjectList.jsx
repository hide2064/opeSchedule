export default function ProjectList({ projects, onEdit, onDelete }) {
  if (projects.length === 0) {
    return <div className="empty-msg">プロジェクトがありません。「+ New Project」から作成してください。</div>;
  }

  return (
    <div className="project-list">
      {projects.map(p => (
        <div key={p.id} className={`project-row${p.status === 'archived' ? ' is-archived' : ''}`}>
          <span className="project-row__color-dot" style={{ background: p.color }} />
          <span
            className="project-row__name project-row__name--link"
            onClick={() => { window.location.href = `/schedule?project=${p.id}`; }}
          >
            {p.name}
          </span>
          <span className="project-row__meta">
            {p.client_name  && <span className="project-meta-chip project-meta-chip--client">👤 {p.client_name}</span>}
            {p.base_project && <span className="project-meta-chip project-meta-chip--base">🔗 {p.base_project}</span>}
          </span>
          <span className={`project-pstatus project-pstatus--${p.project_status}`}>{p.project_status}</span>
          {p.status === 'archived' && <span className="project-row__archived-badge">archived</span>}
          <div className="project-row__actions">
            <button className="btn btn--secondary" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => onEdit(p)}>Edit</button>
            <button className="btn btn--danger"    style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => onDelete(p.id)}>Del</button>
          </div>
        </div>
      ))}
    </div>
  );
}
