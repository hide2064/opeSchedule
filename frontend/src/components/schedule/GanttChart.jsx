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
import AddTaskModal from './AddTaskModal.jsx';
import HistoryPanel from './HistoryPanel.jsx';

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

export default function GanttChart({ tasks, project, config, projectTitle, isMultiMode, currentPid, onTasksChange, historySnap, onShowHistory, onExitHistory }) {
  const showToast   = useToast();
  const ganttRef    = useRef(null);
  const hierRef     = useRef(null);
  const [viewMode, setViewMode]           = useState('Week');
  const [detailTask, setDetailTask]       = useState(null);
  const [detailAnchor, setDetailAnchor]   = useState(null);
  const [showAddModal, setShowAddModal]   = useState(false);
  const [showHistory, setShowHistory]     = useState(false);

  // 履歴モード: historySnap が設定されている場合は編集不可
  const isHistoryMode = !!historySnap;
  // 表示するタスク: 履歴モードの場合はスナップショットのタスクを使用
  const displayTasks = isHistoryMode ? (historySnap.tasks ?? []) : tasks;

  // viewMode を config/project から初期化
  useEffect(() => {
    if (project?.view_mode)              setViewMode(project.view_mode);
    else if (config?.default_view_mode)  setViewMode(config.default_view_mode);
  }, [project, config]);

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
    if (!displayTasks.length) {
      const now = new Date();
      return { chartStart: addDays(now, -7), chartEnd: addDays(now, 30), pxPerDay: VIEW_PX['Week'] };
    }
    const allDates = displayTasks.flatMap(t => [t.start_date, t.end_date]);
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
    } catch (ex) {
      showToast('日程更新エラー: ' + ex.message, 'error');
    }
  }, [tasks, currentPid, onTasksChange, showToast, isHistoryMode]);

  const handleTaskClick = useCallback((task, anchorEl) => {
    setDetailTask(task);
    setDetailAnchor(anchorEl);
  }, []);

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
        <span className="schedule-header__project-name">{projectTitle}</span>
        <div style={{ flex: 1 }} />
        {/* ビューモード */}
        <div className="view-mode-btns">
          {['Day','Week','Month','Quarter'].map(m => (
            <button
              key={m}
              className={`view-btn${viewMode === m ? ' active' : ''}`}
              onClick={() => setViewMode(m)}
            >{m}</button>
          ))}
        </div>
        {/* 操作ボタン (単体モード・現在表示のみ) */}
        {!isMultiMode && !isHistoryMode && (
          <>
            <button className="btn btn--primary" onClick={() => setShowAddModal(true)}>+ Add Task</button>
            <button className="btn btn--secondary" onClick={() => handleExport('json')}>JSON</button>
            <button className="btn btn--secondary" onClick={() => handleExport('csv')}>CSV</button>
          </>
        )}
        {/* 履歴ボタン (単体モードのみ) */}
        {!isMultiMode && (
          <button
            className={`btn btn--secondary${showHistory ? ' active' : ''}`}
            onClick={() => setShowHistory(v => !v)}
            title="履歴を表示"
          >📋 履歴</button>
        )}
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
            <div className="gantt-rows" style={{ minHeight: displayTasks.length * ROW_H, position: 'relative' }}>
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
            </div>
          </div>
        </div>

        {/* 履歴パネル (単体モードのみ) */}
        {showHistory && !isMultiMode && (
          <HistoryPanel
            projectId={currentPid}
            currentSnapId={historySnap?.id ?? null}
            onSelectSnap={(snap) => {
              if (onShowHistory) onShowHistory(snap);
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
            setDetailTask(null);
          }}
          onDeleted={(id) => {
            if (isHistoryMode) return;
            onTasksChange(tasks.filter(t => t.id !== id));
            setDetailTask(null);
          }}
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
            setShowAddModal(false);
          }}
        />
      )}
    </div>
  );
}
