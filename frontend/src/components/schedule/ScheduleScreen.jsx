import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as api from '../../api.js';
import { applyTheme } from '../../utils.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import GanttChart from './GanttChart.jsx';

function parseUrlParams(searchParams) {
  const rawProjects = searchParams.getAll('projects');
  const pidsMulti = (rawProjects.length === 1 && rawProjects[0].includes(','))
    ? rawProjects[0].split(',').map(Number).filter(n => n > 0)
    : rawProjects.map(Number).filter(n => n > 0);
  const catfilter = searchParams.getAll('catfilter');
  const isCatfilterMode = catfilter.length > 0;
  const isMultiMode = pidsMulti.length >= 2 || (pidsMulti.length >= 1 && isCatfilterMode);
  const pid = isMultiMode ? pidsMulti[0] : parseInt(searchParams.get('project'), 10);
  return { pid, pidsMulti, catfilter, isCatfilterMode, isMultiMode };
}

export default function ScheduleScreen() {
  const showToast = useToast();
  const [searchParams] = useSearchParams();
  const { pid, pidsMulti, catfilter, isCatfilterMode, isMultiMode } = parseUrlParams(searchParams);

  const [tasks, setTasks]         = useState([]);
  const [project, setProject]     = useState(null);
  const [config, setConfig]       = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [projectTitle, setProjectTitle] = useState('');
  // 履歴モード: null = 現在表示、object = スナップショット表示
  const [historySnap, setHistorySnap] = useState(null);
  // 未コミット変更ログ（バージョンUP まで蓄積、実行時にリセット）
  const [pendingChanges, setPendingChanges] = useState([]);

  useEffect(() => {
    if (!isMultiMode && !pid) {
      window.location.href = '/';
      return;
    }
    (async () => {
      try {
        const cfg = await api.getConfig().catch(() => null);
        if (cfg) { setConfig(cfg); applyTheme(cfg.theme); }

        if (isMultiMode) {
          const results = await Promise.all(
            pidsMulti.map(id => Promise.all([api.getProject(id), api.listTasks(id)]))
          );
          const allTasks = [];
          for (const [proj, taskList] of results) {
            const filtered = isCatfilterMode
              ? taskList.filter(t => catfilter.includes(t.category_large ?? ''))
              : taskList;
            // プロジェクト名セパレーター行を挿入
            allTasks.push({
              id: `\x00sep:${proj.id}`,
              _isSep: true,
              _projName: proj.name,
              _projColor: proj.color,
              category_large: `\x00sep:${proj.id}`,
              category_medium: '',
              name: proj.name,
              start_date: '2000-01-01',
              end_date: '2000-01-01',
              task_type: 'task',
              progress: 0,
              color: proj.color,
              dependencies: [],
              sort_order: -1,
              _project_id: proj.id,
            });
            for (const t of filtered) {
              allTasks.push({
                ...t,
                // category_large をプロジェクトIDで名前空間化（異なるプロジェクトの同名大項目が混在しないよう）
                category_large: `\x00${proj.id}:${t.category_large ?? ''}`,
                _project_id: proj.id,
              });
            }
          }
          const names = results.map(([p]) => p.name);
          if (isCatfilterMode) {
            const label = catfilter.slice(0, 2).join('・') + (catfilter.length > 2 ? '…' : '');
            setProjectTitle(`🔍 ${label}`);
            document.title = `フィルター: ${label} - opeSchedule`;
          } else {
            setProjectTitle('📊 ' + names.join('  ＋  '));
            document.title = `比較: ${names.slice(0,2).join(' / ')}${names.length>2?'…':''} - opeSchedule`;
          }
          setTasks(allTasks);
        } else {
          const [proj, taskList] = await Promise.all([api.getProject(pid), api.listTasks(pid)]);
          setProject(proj);
          setTasks(taskList);
          setProjectTitle(proj.name);
          document.title = `${proj.name} - opeSchedule`;
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleTasksChange = (newTasks) => setTasks(newTasks);
  const handleMutation = (change) => setPendingChanges(prev => [...prev, change]);
  const handleVersionUp = () => setPendingChanges([]);

  if (loading) return <div className="loading" style={{ padding: 40 }}>読み込み中...</div>;
  if (error)   return <div className="no-project-msg">{`読み込みエラー: ${error}`}</div>;

  return (
    <GanttChart
      tasks={tasks}
      project={project}
      config={config}
      projectTitle={projectTitle}
      isMultiMode={isMultiMode}
      currentPid={pid}
      onTasksChange={handleTasksChange}
      historySnap={historySnap}
      onShowHistory={(snap) => setHistorySnap(snap)}
      onExitHistory={() => setHistorySnap(null)}
      pendingChanges={pendingChanges}
      onMutation={handleMutation}
      onVersionUp={handleVersionUp}
    />
  );
}
