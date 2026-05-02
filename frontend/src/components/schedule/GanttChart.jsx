import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as api from '../../api.js';
import { parseDate, addDays, fmtDate, diffDays, mondayOf } from '../../utils.js';
import { VIEW_PX, ROW_H, HDR_H, HOLIDAYS } from '../../constants.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import HierarchyPane from './HierarchyPane.jsx';
import DateHeader from './DateHeader.jsx';
import GanttBars from './GanttBars.jsx';
import DependencyArrows from './DependencyArrows.jsx';
import TaskDetailPanel from './TaskDetailPanel.jsx';
import CommentPopover from './CommentPopover.jsx';
import HelpModal from '../common/HelpModal.jsx';
import WeeklyReportModal from './WeeklyReportModal.jsx';
import AddTaskModal from './AddTaskModal.jsx';
import HistoryPanel from './HistoryPanel.jsx';
import GanttAnnotations, { AnnotationEditor } from './GanttAnnotations.jsx';

// ── グループ化 ──────────────────────────────────────────────────────────────
export function groupTasks(tasks) {
  const largeOrder = [];
  const largeMap   = new Map();
  for (const t of tasks) {
    const lg = t.category_large  ?? '';
    const md = t.category_medium ?? '';
    if (!largeMap.has(lg)) { largeOrder.push(lg); largeMap.set(lg, { medOrder: [], medMap: new Map() }); }
    const grp = largeMap.get(lg);
    if (!grp.medMap.has(md)) { grp.medOrder.push(md); grp.medMap.set(md, []); }
    grp.medMap.get(md).push(t);
  }
  return { largeOrder, largeMap };
}

// ── クリティカルパス ────────────────────────────────────────────────────────
function calculateCriticalPath(tasks) {
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const criticalTaskIds  = new Set();
  const criticalDepPairs = new Set();
  for (const task of tasks) {
    if (!task.dependencies?.length) continue;
    for (const dep of task.dependencies) {
      const pred = taskMap.get(dep.depends_on_id);
      if (!pred) continue;
      const slack = diffDays(parseDate(pred.end_date), parseDate(task.start_date)) - 1;
      if (slack <= 0) {
        criticalTaskIds.add(task.id);
        criticalTaskIds.add(pred.id);
        criticalDepPairs.add(`${pred.id}__${task.id}`);
      }
    }
  }
  return { criticalTaskIds, criticalDepPairs };
}

// ── 行インデックスマップ ────────────────────────────────────────────────────
function buildRowIndexMap(groupedTasks) {
  const map = new Map();
  let idx = 0;
  const { largeOrder, largeMap } = groupedTasks;
  for (const lg of largeOrder) {
    const { medOrder, medMap } = largeMap.get(lg);
    for (const md of medOrder) {
      for (const t of medMap.get(md)) {
        map.set(t.id, idx++);
      }
    }
  }
  return map;
}

export default function GanttChart({ tasks, project, config, projectTitle, isMultiMode, currentPid, onTasksChange, historySnap, onShowHistory, onExitHistory, pendingChanges, onMutation, onVersionUp, members = [], onMembersChange }) {
  const showToast   = useToast();
  const ganttRef    = useRef(null);
  const hierRef     = useRef(null);
  const [viewMode, setViewMode]           = useState('Week');
  const userChangedView = useRef(false);
  const [detailTask, setDetailTask]       = useState(null);
  const [detailAnchor, setDetailAnchor]   = useState(null);
  const [commentTask, setCommentTask]     = useState(null);
  const [commentCounts, setCommentCounts] = useState({});
  const [showHelp, setShowHelp]               = useState(false);
  const [showWeeklyReport, setShowWeeklyReport] = useState(false);
  const [showMenu, setShowMenu]               = useState(false);
  const [showShiftDialog, setShowShiftDialog] = useState(false);
  const [filterAssignee, setFilterAssignee]   = useState(null);
  const menuRef = useRef(null);
  const [showAddModal, setShowAddModal]         = useState(false);

  const [showHistory, setShowHistory]     = useState(false);
  const [annotations, setAnnotations]     = useState([]);
  // ベースライン比較
  const [baselineSnapId, setBaselineSnapId] = useState(null);
  const [baselineTasks, setBaselineTasks]   = useState([]);
  const [showBaseline, setShowBaseline]     = useState(false);
  // ダブルクリック時のインラインエディタ表示位置（gantt-rows 内の絶対座標）
  const [newAnnotationPos, setNewAnnotationPos] = useState(null);
  const [searchQuery, setSearchQuery]     = useState('');
  const [shiftDays, setShiftDays]         = useState('');

  // 履歴モード: historySnap が設定されている場合は編集不可
  const isHistoryMode = !!historySnap;
  // 表示するタスク: 履歴モードの場合はスナップショットのタスクを使用
  const baseTasks = isHistoryMode ? (historySnap.tasks ?? []) : tasks;
  // 検索クエリ + 担当者によるフィルタリング（セパレーター行は保持）
  const displayTasks = useMemo(() => {
    let result = baseTasks;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t =>
        t._isSep ||
        (t.name            || '').toLowerCase().includes(q) ||
        (t.category_large  || '').toLowerCase().includes(q) ||
        (t.category_medium || '').toLowerCase().includes(q) ||
        (t.notes           || '').toLowerCase().includes(q)
      );
    }
    if (filterAssignee !== null) {
      result = result.filter(t => t._isSep || t.assignee_id === filterAssignee);
    }
    return result;
  }, [baseTasks, searchQuery, filterAssignee]);

  // viewMode を config/project から初期化
  useEffect(() => {
    if (project?.view_mode)              setViewMode(project.view_mode);
    else if (config?.default_view_mode)  setViewMode(config.default_view_mode);
  }, [project, config]);

  // ユーザー操作でビューモードが変わった場合のみ DB に保存
  useEffect(() => {
    if (!userChangedView.current) return;
    userChangedView.current = false;
    if (!currentPid || isMultiMode) return;
    api.updateProject(currentPid, { view_mode: viewMode }).catch(() => {});
  }, [viewMode]);

  // メニュー外クリックで閉じる
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  // キーボードショートカット
  useEffect(() => {
    const isInputActive = () => {
      const tag = document.activeElement?.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    };
    const handler = (e) => {
      if (e.key === 'Escape') {
        setDetailTask(null);
        setCommentTask(null);
        setShowAddModal(false);
        setShowHistory(false);
        setShowHelp(false);
        setShowMenu(false);
        setShowShiftDialog(false);
        return;
      }
      if (isInputActive()) return;
      if (e.key === 'n' || e.key === 'N') {
        if (!isHistoryMode && !isMultiMode) setShowAddModal(true);
        return;
      }
      if (e.key === '?') {
        setShowHelp(v => !v);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        document.querySelector('.gantt-search')?.focus();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        window.print();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isHistoryMode, isMultiMode]);

  // スクロール同期
  useEffect(() => {
    const gp = ganttRef.current;
    const hp = hierRef.current;
    if (!gp || !hp) return;
    let syncing = false;
    const onGantt = () => { if (syncing) return; syncing = true; hp.scrollTop = gp.scrollTop; syncing = false; };
    const onHier  = () => { if (syncing) return; syncing = true; gp.scrollTop = hp.scrollTop; syncing = false; };
    gp.addEventListener('scroll', onGantt);
    hp.addEventListener('scroll', onHier);
    return () => { gp.removeEventListener('scroll', onGantt); hp.removeEventListener('scroll', onHier); };
  }, []);

  // チャート範囲 (useMemo で displayTasks/viewMode 変化時に再計算)
  const { chartStart, chartEnd, pxPerDay } = useMemo(() => {
    const realTasks = displayTasks.filter(t => !t._isSep);
    if (!realTasks.length) {
      const now = new Date();
      return { chartStart: addDays(now, -7), chartEnd: addDays(now, 30), pxPerDay: VIEW_PX['Week'] };
    }
    const allDates = realTasks.flatMap(t => [t.start_date, t.end_date]);
    const minDate  = allDates.reduce((a, b) => a < b ? a : b);
    const maxDate  = allDates.reduce((a, b) => a > b ? a : b);
    const ppd = VIEW_PX[viewMode] ?? 8;
    return {
      chartStart: addDays(mondayOf(parseDate(minDate)), -7),
      chartEnd:   addDays(parseDate(maxDate), 21),
      pxPerDay:   ppd,
    };
  }, [displayTasks, viewMode]);

  // 今日スクロール
  useEffect(() => {
    if (!ganttRef.current || !displayTasks.length) return;
    if (config?.auto_scroll_today === false) return;
    const todayPx = diffDays(chartStart, parseDate(fmtDate(new Date()))) * pxPerDay;
    if (todayPx > 0) {
      setTimeout(() => { if (ganttRef.current) ganttRef.current.scrollLeft = Math.max(0, todayPx - 200); }, 80);
    }
  }, [displayTasks, chartStart, pxPerDay, config]);

  const { criticalTaskIds, criticalDepPairs } = useMemo(() => {
    if (isMultiMode || isHistoryMode || !displayTasks.length) return { criticalTaskIds: new Set(), criticalDepPairs: new Set() };
    return calculateCriticalPath(displayTasks);
  }, [displayTasks, isMultiMode, isHistoryMode]);

  const groupedTasks    = useMemo(() => groupTasks(displayTasks), [displayTasks]);
  const taskRowIndexMap = useMemo(() => buildRowIndexMap(groupedTasks), [groupedTasks]);
  const totalWidth = (diffDays(chartStart, chartEnd) + 1) * pxPerDay;

  const handleDragEnd = useCallback(async (task, dayShift, mode = 'move') => {
    if (isHistoryMode) return;
    let newStart = task.start_date;
    let newEnd   = task.end_date;
    if (mode === 'move') {
      newStart = fmtDate(addDays(parseDate(task.start_date), dayShift));
      newEnd   = fmtDate(addDays(parseDate(task.end_date),   dayShift));
    } else if (mode === 'resize-start') {
      newStart = fmtDate(addDays(parseDate(task.start_date), dayShift));
      if (newStart > newEnd) newStart = newEnd; // 開始日が終了日を超えないよう制約
    } else if (mode === 'resize-end') {
      newEnd = fmtDate(addDays(parseDate(task.end_date), dayShift));
      if (newEnd < newStart) newEnd = newStart; // 終了日が開始日を下回らないよう制約
    }
    try {
      const updated = await api.updateDates(currentPid, task.id, { start_date: newStart, end_date: newEnd });
      onTasksChange(tasks.map(t => t.id === task.id ? updated : t));
      onMutation?.({ operation: '日程変更', task_name: task.name, detail: `${newStart}〜${newEnd}` });
    } catch (ex) {
      showToast('日程更新エラー: ' + ex.message, 'error');
    }
  }, [tasks, currentPid, onTasksChange, showToast, isHistoryMode, onMutation]);

  // アノテーション初期ロード
  useEffect(() => {
    if (!currentPid || isMultiMode) return;
    api.listAnnotations(currentPid).then(setAnnotations).catch(() => {});
  }, [currentPid, isMultiMode]);

  // ベースラインの初期ロード（プロジェクト切り替え時に再取得）
  useEffect(() => {
    if (!currentPid || isMultiMode) return;
    api.getBaseline(currentPid)
      .then(snap => {
        if (snap) {
          setBaselineSnapId(snap.id);
          try { setBaselineTasks(JSON.parse(snap.tasks_json)); } catch { setBaselineTasks([]); }
        } else {
          setBaselineSnapId(null);
          setBaselineTasks([]);
        }
      })
      .catch(() => {});
  }, [currentPid, isMultiMode]);

  // ベースライン変更時にタスクをロード
  const handleBaselineChange = useCallback(async (snapId) => {
    setBaselineSnapId(snapId);
    if (!snapId) {
      setBaselineTasks([]);
      setShowBaseline(false);
      return;
    }
    try {
      const detail = await api.getSnapshot(currentPid, snapId);
      setBaselineTasks(JSON.parse(detail.tasks_json));
      setShowBaseline(true);
    } catch {
      setBaselineTasks([]);
    }
  }, [currentPid]);

  const handleTaskClick = useCallback((task, anchorEl) => {
    setDetailTask(task);
    setDetailAnchor(anchorEl);
  }, []);

  // gantt-rows 上のダブルクリック → 付箋エディタを表示
  const handleRowsDblClick = useCallback((e) => {
    if (isMultiMode || isHistoryMode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    // getBoundingClientRect はスクロールを考慮した viewport 座標を返すため、
    // そのまま引き算すれば gantt-rows の絶対座標（position:absolute の left/top）になる。
    const xInRows = e.clientX - rect.left;
    const yInRows = e.clientY - rect.top;
    const dayOffset = Math.max(0, Math.floor(xInRows / pxPerDay));
    const date = fmtDate(addDays(chartStart, dayOffset));
    setNewAnnotationPos({ x: xInRows, y: yInRows, date });
  }, [isMultiMode, isHistoryMode, pxPerDay, chartStart]);

  const handleSaveAnnotation = useCallback(async ({ text, text_color, font_size }) => {
    if (!newAnnotationPos) return;
    setNewAnnotationPos(null);
    try {
      const created = await api.createAnnotation(currentPid, {
        text,
        anno_date: newAnnotationPos.date,
        y_offset: Math.round(newAnnotationPos.y),
        text_color,
        font_size,
      });
      setAnnotations(prev => [...prev, created]);
    } catch (ex) { showToast(ex.message, 'error'); }
  }, [newAnnotationPos, currentPid, showToast]);

  const handleDeleteAnnotation = useCallback(async (id) => {
    try {
      await api.deleteAnnotation(currentPid, id);
      setAnnotations(prev => prev.filter(a => a.id !== id));
    } catch (ex) { showToast(ex.message, 'error'); }
  }, [currentPid, showToast]);

  const handleUpdateAnnotation = useCallback(async (id, data) => {
    try {
      const updated = await api.updateAnnotation(currentPid, id, data);
      setAnnotations(prev => prev.map(a => a.id === id ? updated : a));
    } catch (ex) { showToast(ex.message, 'error'); }
  }, [currentPid, showToast]);

  const handleShiftDates = useCallback(async () => {
    const d = parseInt(shiftDays, 10);
    if (isNaN(d) || d === 0) return;
    setShowShiftDialog(false);
    try {
      const result = await api.shiftTaskDates(currentPid, d);
      showToast(`${result.shifted}件のタスクを ${d > 0 ? '+' : ''}${d}日シフトしました`, 'success');
      setShiftDays('');
      const updated = await api.listTasks(currentPid);
      onTasksChange(updated);
      onMutation?.({ operation: '日程一括シフト', task_name: null, detail: `${d > 0 ? '+' : ''}${d}日` });
    } catch (ex) {
      showToast('シフト失敗: ' + ex.message, 'error');
    }
  }, [shiftDays, currentPid, showToast, onTasksChange, onMutation]);

  const handleExport = async (format) => {
    try {
      const res = await api.exportProject(currentPid, format);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement('a'), { href: url, download: `project_${currentPid}.${format}` });
      a.click();
      URL.revokeObjectURL(url);
    } catch (ex) { showToast('エクスポートエラー: ' + ex.message, 'error'); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* ヘッダー */}
      <header className="app-header">
        <div className="app-header__brand">
          <span className="app-header__logo">📅</span>
          <span className="app-header__title">opeSchedule</span>
        </div>
        <a href="/" className="btn btn--secondary btn--back">← Top</a>
        <span className="schedule-header__project-name">
          {!isMultiMode && project?.image_data && (
            <img src={project.image_data} alt="" className="schedule-header__project-thumb" />
          )}
          {!isMultiMode && project?.model_name && (
            <><span className="schedule-header__model-name">{project.model_name}</span><span className="schedule-header__name-sep"> / </span></>
          )}
          {projectTitle}
        </span>
        <div style={{ flex: 1 }} />
        {/* ビューモード */}
        <div className="view-mode-btns">
          {['Day','Week','Month','Quarter'].map(m => (
            <button
              key={m}
              className={`view-btn${viewMode === m ? ' active' : ''}`}
              onClick={() => { userChangedView.current = true; setViewMode(m); }}
            >{m}</button>
          ))}
        </div>
        {/* 検索 (比較・履歴モード以外) */}
        {!isMultiMode && (
          <input
            type="search"
            className="gantt-search"
            placeholder="タスクを検索..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        )}
        {/* 担当者フィルター */}
        {!isMultiMode && members.length > 0 && (
          <select
            className="gantt-assignee-filter"
            value={filterAssignee ?? ''}
            onChange={e => setFilterAssignee(e.target.value === '' ? null : Number(e.target.value))}
            title="担当者フィルター"
          >
            <option value="">全員</option>
            {members.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        )}
        {/* Menu ドロップダウン (単体モード・現在表示のみ) */}
        {!isMultiMode && !isHistoryMode && (
          <>
            <button className="btn btn--primary" onClick={() => setShowAddModal(true)}>+ Add Task</button>
            <div className="toolbar-menu-wrap" ref={menuRef}>
              <button
                className={`btn btn--secondary${showMenu ? ' active' : ''}`}
                onClick={() => setShowMenu(v => !v)}
                title="操作メニューを開く"
              >☰ Menu {showMenu ? '▲' : '▾'}</button>
              {showMenu && (
                <div className="toolbar-menu-dropdown">
                  <button className="toolbar-menu-item" onClick={() => { setShowMenu(false); handleExport('json'); }}>
                    📄 JSON 出力
                  </button>
                  <button className="toolbar-menu-item" onClick={() => { setShowMenu(false); handleExport('csv'); }}>
                    📊 CSV 出力
                  </button>
                  <button className="toolbar-menu-item" onClick={() => { setShowMenu(false); window.print(); }}>
                    🖨 印刷
                  </button>
                  <button className="toolbar-menu-item" onClick={() => { setShowMenu(false); setShowWeeklyReport(true); }}>
                    📋 週報
                  </button>
                  <div className="toolbar-menu-divider" />
                  {baselineSnapId && (
                    <button
                      className={`toolbar-menu-item${showBaseline ? ' is-active' : ''}`}
                      onClick={() => { setShowMenu(false); setShowBaseline(v => !v); }}
                    >
                      📊 ベースライン比較: {showBaseline ? 'ON' : 'OFF'}
                    </button>
                  )}
                  <button className="toolbar-menu-item" onClick={() => { setShowMenu(false); setShiftDays(''); setShowShiftDialog(true); }}>
                    📅 日程シフト...
                  </button>
                  <button
                    className="toolbar-menu-item"
                    onClick={() => { setShowMenu(false); setShowHistory(v => !v); }}
                  >
                    📋 履歴
                    {(pendingChanges?.length ?? 0) > 0 && (
                      <span className="toolbar-menu-badge">{pendingChanges.length}</span>
                    )}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
        <button
          className="btn btn--secondary btn--help"
          onClick={() => setShowHelp(v => !v)}
          title="マニュアルを開く (?)"
        >?</button>
      </header>

      {/* 履歴モードバナー */}
      {isHistoryMode && (
        <div className="history-mode-banner">
          <span>📜 履歴表示: <strong>v{historySnap.version_number} — {historySnap.label}</strong>（読み取り専用）</span>
          <button className="btn btn--primary" onClick={onExitHistory}>現在に戻る</button>
        </div>
      )}

      {/* チャートボディ */}
      <div className="schedule-body" style={{ flex: 1, overflow: 'hidden' }}>
        {/* 左ペイン */}
        <div className="hier-pane" ref={hierRef}>
          <HierarchyPane
            groupedTasks={groupedTasks}
            criticalTaskIds={criticalTaskIds}
            onTaskClick={handleTaskClick}
          />
        </div>

        {/* 右ペイン (Gantt) */}
        <div className="gantt-pane" ref={ganttRef}>
          <div className="gantt-inner" style={{ width: totalWidth }}>
            <DateHeader
              viewMode={viewMode}
              chartStart={chartStart}
              chartEnd={chartEnd}
              pxPerDay={pxPerDay}
            />
            <div
              className="gantt-rows"
              style={{ minHeight: displayTasks.length * ROW_H, position: 'relative' }}
              onDoubleClick={handleRowsDblClick}
            >
              <GanttBars
                tasks={displayTasks}
                groupedTasks={groupedTasks}
                criticalTaskIds={criticalTaskIds}
                chartStart={chartStart}
                pxPerDay={pxPerDay}
                isMultiMode={isMultiMode || isHistoryMode}
                onTaskClick={handleTaskClick}
                onDragEnd={isHistoryMode ? null : handleDragEnd}
                members={members}
                baselineTasks={showBaseline ? baselineTasks : []}
              />
              <DependencyArrows
                tasks={displayTasks}
                criticalDepPairs={criticalDepPairs}
                taskRowIndexMap={taskRowIndexMap}
                chartStart={chartStart}
                pxPerDay={pxPerDay}
                isMultiMode={isMultiMode || isHistoryMode}
                totalWidth={totalWidth}
                totalRows={displayTasks.length}
              />
              {/* 付箋アノテーション */}
              <GanttAnnotations
                annotations={annotations}
                chartStart={chartStart}
                pxPerDay={pxPerDay}
                onDelete={handleDeleteAnnotation}
                onUpdate={handleUpdateAnnotation}
              />
              {/* 今日ライン */}
              {(() => {
                const today = new Date(); today.setHours(0, 0, 0, 0);
                const off = diffDays(chartStart, today) * pxPerDay;
                return (off >= 0 && off <= totalWidth)
                  ? <div className="today-line" style={{ left: off }} />
                  : null;
              })()}
              {/* ダブルクリック直後のインラインエディタ */}
              {newAnnotationPos && (
                <AnnotationEditor
                  x={newAnnotationPos.x}
                  y={newAnnotationPos.y}
                  onSave={handleSaveAnnotation}
                  onCancel={() => setNewAnnotationPos(null)}
                />
              )}
            </div>
          </div>
        </div>

        {/* 履歴パネル (単体モードのみ) */}
        {showHistory && !isMultiMode && (
          <HistoryPanel
            projectId={currentPid}
            pendingChanges={pendingChanges ?? []}
            currentSnapId={historySnap?.id ?? null}
            onSelectSnap={(snap) => {
              if (onShowHistory) onShowHistory(snap);
            }}
            onVersionUp={() => {
              if (onVersionUp) onVersionUp();
            }}
            onClose={() => setShowHistory(false)}
            baselineSnapId={baselineSnapId}
            onBaselineChange={handleBaselineChange}
          />
        )}
      </div>

      {/* タスク詳細パネル (履歴モードでは読み取り専用表示) */}
      {detailTask && (
        <TaskDetailPanel
          task={detailTask}
          allTasks={displayTasks}
          currentPid={currentPid}
          criticalTaskIds={criticalTaskIds}
          isMultiMode={isMultiMode || isHistoryMode}
          anchorEl={detailAnchor}
          onClose={() => setDetailTask(null)}
          onUpdated={(updated) => {
            if (isHistoryMode) return;
            onTasksChange(tasks.map(t => t.id === updated.id ? updated : t));
            onMutation?.({ operation: 'タスク更新', task_name: updated.name });
            setDetailTask(null);
          }}
          onDeleted={(id) => {
            if (isHistoryMode) return;
            const taskName = tasks.find(t => t.id === id)?.name;
            onTasksChange(tasks.filter(t => t.id !== id));
            onMutation?.({ operation: 'タスク削除', task_name: taskName });
            setDetailTask(null);
          }}
          onOpenComments={(t) => setCommentTask(t)}
          commentCount={commentCounts[detailTask?.id] ?? 0}
          members={members}
        />
      )}

      {commentTask && (
        <CommentPopover
          task={commentTask}
          currentPid={commentTask._project_id ?? currentPid}
          anchorEl={detailAnchor}
          onClose={() => setCommentTask(null)}
          onCountChange={(tid, count) =>
            setCommentCounts(prev => ({ ...prev, [tid]: count }))
          }
        />
      )}

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

      {showShiftDialog && (
        <div className="modal-overlay" onClick={() => setShowShiftDialog(false)}>
          <div className="shift-dialog" onClick={e => e.stopPropagation()}>
            <div className="shift-dialog__header">
              <span>📅 日程シフト</span>
              <button className="btn-icon" onClick={() => setShowShiftDialog(false)}>✕</button>
            </div>
            <div className="shift-dialog__body">
              <p className="shift-dialog__hint">
                全タスクの日程をシフトします。<br/>
                正の値: 後ろ倒し　／　負の値: 前倒し
              </p>
              <input
                type="number"
                className="shift-dialog__input"
                value={shiftDays}
                onChange={e => setShiftDays(e.target.value)}
                placeholder="シフト日数（例: 7 または -3）"
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter' && shiftDays && !isNaN(parseInt(shiftDays, 10)) && parseInt(shiftDays, 10) !== 0) handleShiftDates();
                  if (e.key === 'Escape') setShowShiftDialog(false);
                }}
              />
            </div>
            <div className="shift-dialog__actions">
              <button className="btn btn--secondary" onClick={() => setShowShiftDialog(false)}>キャンセル</button>
              <button
                className="btn btn--primary"
                onClick={handleShiftDates}
                disabled={!shiftDays || isNaN(parseInt(shiftDays, 10)) || parseInt(shiftDays, 10) === 0}
              >実行</button>
            </div>
          </div>
        </div>
      )}

      {showWeeklyReport && (
        <WeeklyReportModal
          tasks={baseTasks}
          project={project}
          config={config}
          members={members}
          onClose={() => setShowWeeklyReport(false)}
        />
      )}

      {/* タスク追加モーダル */}
      {showAddModal && (
        <AddTaskModal
          currentPid={currentPid}
          taskCount={tasks.length}
          onClose={() => setShowAddModal(false)}
          onCreated={(created) => {
            onTasksChange([...tasks, created]);
            onMutation?.({ operation: 'タスク追加', task_name: created.name });
            setShowAddModal(false);
          }}
        />
      )}
    </div>
  );
}
