import { useState, useEffect } from 'react';
import * as api from '../../api.js';
import { applyTheme } from '../../utils.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import ProjectList from './ProjectList.jsx';
import ProjectModal from './ProjectModal.jsx';
import ConfigPanel from './ConfigPanel.jsx';
import Sidebar from './Sidebar.jsx';

export default function TopScreen() {
  const showToast = useToast();
  const [projects, setProjects] = useState([]);
  const [config, setConfig] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [activePanel, setActivePanel] = useState('projects'); // 'projects' | 'config'
  const [modalProject, setModalProject] = useState(undefined); // undefined=closed, null=new, obj=edit

  const loadProjects = async (archived = showArchived) => {
    try {
      const list = await api.listProjects(archived);
      setProjects(list);
    } catch (e) { showToast(e.message, 'error'); }
  };

  const loadConfig = async () => {
    try {
      const cfg = await api.getConfig();
      setConfig(cfg);
      applyTheme(cfg.theme);
    } catch (e) { showToast('Config読み込みエラー: ' + e.message, 'error'); }
  };

  useEffect(() => {
    Promise.all([loadProjects(), loadConfig()]);
  }, []);

  const handleArchiveToggle = (checked) => {
    setShowArchived(checked);
    loadProjects(checked);
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const result = await api.importProject(file);
      showToast(`インポート完了 (${result.task_count} タスク)`, 'success');
      window.location.href = `/schedule?project=${result.project_id}`;
    } catch (ex) { showToast('インポートエラー: ' + ex.message, 'error'); }
    e.target.value = '';
  };

  return (
    <>
      <header className="app-header">
        <div className="app-header__brand">
          <span className="app-header__logo">📅</span>
          <span className="app-header__title">opeSchedule</span>
        </div>
      </header>

      <nav className="top-nav">
        <button
          className={`top-nav__item${activePanel === 'projects' ? ' active' : ''}`}
          onClick={() => setActivePanel('projects')}
        >
          <span className="top-nav__icon">📁</span>
          <span className="top-nav__text">
            <span className="top-nav__label">Projects</span>
            <span className="top-nav__desc">プロジェクト一覧</span>
          </span>
        </button>
        <button
          className={`top-nav__item${activePanel === 'config' ? ' active' : ''}`}
          onClick={() => setActivePanel('config')}
        >
          <span className="top-nav__icon">⚙️</span>
          <span className="top-nav__text">
            <span className="top-nav__label">Global Config</span>
            <span className="top-nav__desc">表示・テーマ設定</span>
          </span>
        </button>
      </nav>

      <main className="screen top-screen">
        <Sidebar projects={projects} />

        {activePanel === 'projects' && (
          <section className="panel" style={{ flex: 1, minWidth: 0 }}>
            <div className="panel__header">
              <h2 className="panel__title">Projects</h2>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label className="btn btn--secondary btn--file">
                  Import
                  <input type="file" accept=".json,.csv" hidden onChange={handleImport} />
                </label>
                <button className="btn btn--primary" onClick={() => setModalProject(null)}>
                  + New Project
                </button>
              </div>
            </div>
            <ProjectList
              projects={projects}
              onEdit={(p) => setModalProject(p)}
              onDelete={async (id) => {
                const p = projects.find(p => p.id === id);
                if (!confirm(`「${p?.name}」を削除しますか？\nタスクもすべて削除されます。`)) return;
                try {
                  await api.deleteProject(id);
                  await loadProjects();
                  showToast('プロジェクトを削除しました', 'success');
                } catch (e) { showToast(e.message, 'error'); }
              }}
            />
            <label className="toggle-archived">
              <input type="checkbox" checked={showArchived} onChange={e => handleArchiveToggle(e.target.checked)} />
              アーカイブ済みを表示
            </label>
          </section>
        )}

        {activePanel === 'config' && (
          <section className="panel top-panel--narrow" style={{ flex: 1, minWidth: 0 }}>
            <div className="panel__header">
              <h2 className="panel__title">Global Config</h2>
            </div>
            <ConfigPanel
              config={config}
              onSaved={(cfg) => { setConfig(cfg); applyTheme(cfg.theme); }}
            />
          </section>
        )}
      </main>

      {modalProject !== undefined && (
        <ProjectModal
          project={modalProject}
          projects={projects}
          onClose={() => setModalProject(undefined)}
          onSaved={async (created) => {
            setModalProject(undefined);
            if (created?.project_id) {
              window.location.href = `/schedule?project=${created.project_id}`;
            } else {
              await loadProjects();
            }
          }}
        />
      )}
    </>
  );
}
