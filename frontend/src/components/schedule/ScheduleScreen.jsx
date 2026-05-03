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
  // 親プロジェクトモード: ?parent=ID で親＋子を上下に並べて表示
  const parentId = parseInt(searchParams.get('parent'), 10) || null;
  const isParentMode = !!parentId && !isNaN(parentId);
  return { pid, pidsMulti, catfilter, isCatfilterMode, isMultiMode, parentId, isParentMode };
}

/**
 * プロジェクト配列をセパレーター行込みのフラット taskList に変換する。
 * ScheduleScreen の multiMode と同じ形式を利用する。
 */
function buildMultiTaskList(projectTaskPairs) {
  const allTasks = [];
  for (const [proj, taskList] of projectTaskPairs) {
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
    for (const t of taskList) {
      allTasks.push({
        ...t,
        category_large: `\x00${proj.id}:${t.category_large ?? ''}`,
        _project_id: proj.id,
      });
    }
  }
  return allTasks;
}

export default function ScheduleScreen() {
  const showToast = useToast();
  const [searchParams] = useSearchParams();
  const { pid, pidsMulti, catfilter, isCatfilterMode, isMultiMode, parentId, isParentMode } = parseUrlParams(searchParams);

  const [tasks, setTasks]         = useState([]);
  const [members, setMembers]     = useState([]);
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
    if (!isMultiMode && !isParentMode && !pid) {
      window.location.href = '/';
      return;
    }
    (async () => {
      try {
        const cfg = await api.getConfig().catch(() => null);
        if (cfg) { setConfig(cfg); applyTheme(cfg.theme); }

        if (isParentMode) {
          // ── 親プロジェクトモード ──────────────────────────────────────
          // 1) 全プロジェクト一覧を取得して親＋子 ID リストを構築
          const allProjects = await api.listProjects(false);
          const parentProj  = allProjects.find(p => p.id === parentId);
          if (!parentProj) throw new Error(`プロジェクト ID:${parentId} が見つかりません`);

          // 直接の子（孫以下は除く）を取得。sort_order → created_at 昇順
          const childProjs = allProjects
            .filter(p => p.parent_project_id === parentId)
            .sort((a, b) => a.sort_order - b.sort_order || new Date(a.created_at) - new Date(b.created_at));

          // 2) 親＋子のタスクを並列取得
          const projectList = [parentProj, ...childProjs];
          const taskResults = await Promise.all(
            projectList.map(p => api.listTasks(p.id).then(tasks => [p, tasks]))
          );

          const allTasks = buildMultiTaskList(taskResults);
          const names    = projectList.map(p => p.name);

          setTasks(allTasks);
          setProject(parentProj); // ヘッダーのサムネイル等に使用
          setProjectTitle(`📂 ${parentProj.name}（+ 子 ${childProjs.length}件）`);
          document.title = `${parentProj.name} - opeSchedule`;

        } else if (isMultiMode) {
          // ── 既存の比較モード ─────────────────────────────────────────
          const results = await Promise.all(
            pidsMulti.map(id => Promise.all([api.getProject(id), api.listTasks(id)]))
          );
          const allTasks = [];
          for (const [proj, taskList] of results) {
            const filtered = isCatfilterMode
              ? taskList.filter(t => catfilter.includes(t.category_large ?? ''))
              : taskList;
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
          // ── 単体モード ───────────────────────────────────────────────
          const [proj, taskList, memberList] = await Promise.all([
            api.getProject(pid), api.listTasks(pid), api.listMembers(pid).catch(() => []),
          ]);
          setProject(proj);
          setTasks(taskList);
          setMembers(memberList);
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

  // 親プロジェクトモードは isMultiMode と同等の表示（読み取り専用ヘッダー）
  // ただし付箋アノテーションは親プロジェクトIDに紐付けて有効化するため
  // isParentMode を個別に渡す
  const effectiveMultiMode = isMultiMode || isParentMode;
  const effectivePid = isParentMode ? parentId : pid;

  return (
    <GanttChart
      tasks={tasks}
      project={project}
      config={config}
      projectTitle={projectTitle}
      isMultiMode={effectiveMultiMode}
      isParentMode={isParentMode}
      currentPid={effectivePid}
      onTasksChange={handleTasksChange}
      historySnap={historySnap}
      onShowHistory={(snap) => setHistorySnap(snap)}
      onExitHistory={() => setHistorySnap(null)}
      pendingChanges={pendingChanges}
      onMutation={handleMutation}
      onVersionUp={handleVersionUp}
      members={members}
      onMembersChange={setMembers}
    />
  );
}
