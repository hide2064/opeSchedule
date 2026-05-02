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

export default function GanttChart({ tasks, project, config, projectTitle, isMultiMode, currentPid, onTasksChange, historySnap, onShowHistory, onExitHistory, pendingChanges, onMutation, onVersionUp }) {
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
  const [showAddModal, setShowAddModal]         = useState(false);

  const [showHistory, setShowHistory]     = useState(false);
  const [annotations, setAnnotations]     = useState([]);
  // ダブルクリック時のインラインエディタ表示位置（gantt-rows 内の絶対座標）
  const [newAnnotationPos, setNewAnnotationPos] = useState(null);
  const [searchQuery, setSearchQuery]     = useState('');
  const [shiftDays, setShiftDays]         = useState('');

  // 履歴モード: historySnap が設定されている場合は編集不可
  const isHistoryMode = !!historySnap;
  // 表示するタスク: 履歴モードの場合はスナップショットのタスクを使用
  const baseTasks = isHistoryMode ? (historySnap.tasks ?? []) : tasks;
  // 検索クエリによるフィルタリング（セパレーター行は保持）
  const displayTasks = useMemo(() => {
    if (!searchQuery.trim()) return baseTasks;
    const q = searchQuery.toLowerCase();
    return baseTasks.filter(t =>
      t._isSep ||
      (t.name            || '').toLowerCase().includes(q) ||
      (t.category_large  || '').toLowerCase().includes(q) ||
      (t.category_medium || '').toLowerCase().includes(q) ||
      (t.notes           || '').toLowerCase().includes(q)
    );
  }, [baseTasks, searchQuery]);

  // viewMode を config/project から初期化
  useEffect(() => {
    if (project?.view_mode)              setViewMode(project.view_mode);
    else if (config?.default_view_mode)  setViewMode(config.default_view_mode);
  }, [project, config]);

  // ユーザー操作でビューモードが変わった場合のみ DB に保存
  useEffect(() => {
    if (!userChangedView.current) return;
    userChangedView.current = false;
    if (!pid || isMultiMode) return;
    api.updateProject(pid, { view_mode: viewMode }).catch(() => {});
  }, [viewMode]);

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

  const handleDragEnd = useCallback(async (task, dayShift) => {
    if (isHistoryMode) return;
    const newStart = fmtDate(addDays(parseDate(task.start_date), dayShift));
    const newEnd   = fmtDate(addDays(parseDate(task.end_date),   dayShift));
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
    if (!window.confirm(`全タスクの日程を ${d > 0 ? '+' : ''}${d} 日シフトしますか？`)) return;
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
        {/* 操作ボタン (単体モード・現在表示のみ) */}
        {!isMultiMode && !isHistoryMode && (
          <>
            <button className="btn btn--primary" onClick={() => setShowAddModal(true)}>+ Add Task</button>
            <button className="btn btn--secondary" onClick={() => handleExport('json')}>JSON</button>
            <button className="btn btn--secondary" onClick={() => handleExport('csv')}>CSV</button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => window.print()}
              title="ガントチャートを印刷 / PDF 保存"
            >🖨 印刷</button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setShowWeeklyReport(true)}
              title="週次サマリーレポートを表示"
            >📋 週報</button>
            <span className="shift-dates-group">
              <input
                type="number"
                className="shift-days-input"
                value={shiftDays}
                onChange={e => setShiftDays(e.target.value)}
                placeholder="日数"
                title="正: 後ろ倒し, 負: 前倒し"
              />
              <button
                className="btn btn--secondary"
                onClick={handleShiftDates}
                disabled={!shiftDays || isNaN(parseInt(shiftDays, 10))}
                title="全タスクの日程を一括シフト"
              >日程シフト</button>
            </span>
          </>
        )}
        {/* 履歴ボタン (単体モードのみ) */}
        {!isMultiMode && (
          <button
            className={`btn btn--secondary history-btn${showHistory ? ' active' : ''}`}
            onClick={() => setShowHistory(v => !v)}
            title="履歴を表示"
          >
            📋 履歴
            {pendingChanges?.length > 0 && (
              <span className="history-btn__badge">{pendingChanges.length}</span>
            )}
          </button>
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

      {showWeeklyReport && (
        <WeeklyReportModal
          tasks={displayTasks}
          project={project}
          config={config}
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
