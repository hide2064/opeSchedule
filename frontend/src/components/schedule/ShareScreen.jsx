/**
 * ShareScreen — 読み取り専用の共有ガントチャートビュー (D-2)
 *
 * URL: /share/:token
 * トークンが無効な場合は 404 エラーを表示する。
 * 編集操作（タスク追加・更新・ドラッグ等）はすべて無効化する。
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import * as api from '../../api.js';
import { parseDate, fmtDate, diffDays } from '../../utils.js';
import { ROW_H, HOLIDAYS } from '../../constants.js';
import GanttChart from './GanttChart.jsx';

// ── 読み取り専用ガントチャートラッパー ─────────────────────────────────────
export default function ShareScreen() {
  const { token } = useParams();
  const [status, setStatus]   = useState('loading'); // 'loading' | 'ok' | 'error'
  const [project, setProject] = useState(null);
  const [tasks,   setTasks]   = useState([]);

  useEffect(() => {
    if (!token) { setStatus('error'); return; }
    api.getSharedProject(token)
      .then(data => {
        setProject({
          id:          data.project_id,
          name:        data.project_name,
          color:       data.color,
          model_name:  data.model_name,
          client_name: data.client_name,
        });
        setTasks(data.tasks);
        setStatus('ok');
      })
      .catch(() => setStatus('error'));
  }, [token]);

  if (status === 'loading') {
    return (
      <div className="share-loading">
        <div className="share-loading__spinner">⌛</div>
        <p>読み込み中...</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="share-error">
        <div className="share-error__icon">🔒</div>
        <h2>共有ページが見つかりません</h2>
        <p>リンクが無効か、共有が停止されています。</p>
        <a href="/" className="btn btn--secondary" style={{ marginTop: 16 }}>← トップへ戻る</a>
      </div>
    );
  }

  return (
    <div className="share-screen">
      {/* 読み取り専用バナー */}
      <div className="share-banner">
        <span className="share-banner__icon">👁</span>
        <span className="share-banner__label">読み取り専用プレビュー</span>
        <span className="share-banner__project">{project.name}</span>
        {project.model_name && <span className="share-banner__model">{project.model_name}</span>}
      </div>

      {/* GanttChart に isReadOnly モードとして渡す */}
      <GanttChart
        tasks={tasks}
        project={project}
        config={{}}
        projectTitle={project.name}
        isMultiMode={true}       /* 編集UI を非表示にする */
        currentPid={project.id}
        onTasksChange={() => {}} /* 読み取り専用: 何もしない */
        historySnap={null}
        onShowHistory={null}
        onExitHistory={null}
        pendingChanges={[]}
        onMutation={null}
        onVersionUp={null}
        members={[]}
        onMembersChange={null}
      />
    </div>
  );
}
