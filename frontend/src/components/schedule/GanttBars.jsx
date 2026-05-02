import { useState, useRef, useCallback } from 'react';
import { parseDate, addDays, fmtDate, diffDays } from '../../utils.js';
import { ROW_H, HOLIDAYS } from '../../constants.js';

// ── Tooltip ───────────────────────────────────────────────────────────────
function Tooltip({ task, x, y }) {
  const pct  = Math.round(task.progress * 100);
  const type = task.task_type === 'milestone' ? '◆ マイルストーン' : 'タスク';
  const dur  = task.start_date === task.end_date
    ? task.start_date
    : `${task.start_date} → ${task.end_date}`;
  const catLine = [task.category_large, task.category_medium].filter(Boolean).join(' › ');

  return (
    <div className="gantt-tooltip" style={{ left: x, top: y, position: 'fixed', display: 'block' }}>
      {catLine && <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>{catLine}</div>}
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{task.name}</div>
      <div style={{ fontSize: 11, color: '#666' }}>{type}</div>
      <div style={{ fontSize: 11 }}>{dur}</div>
      <div style={{ fontSize: 11, marginTop: 4 }}>
        進捗: <span style={{ display: 'inline-block', width: 60, background: '#eee', borderRadius: 3, height: 6, verticalAlign: 'middle' }}>
          <span style={{ display: 'block', width: `${pct}%`, background: '#4A90D9', height: 6, borderRadius: 3 }} />
        </span> {pct}%
      </div>
      {task.notes && <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{task.notes}</div>}
    </div>
  );
}

// タスクバーの色を進捗・期限超過に応じて決定する。
function getBarColor(task, todayStr) {
  if (task.task_type === 'milestone') return null;
  if (task.progress >= 1.0) return '#9e9e9e';
  if (task.end_date < todayStr && task.progress < 1.0) return '#e53935';
  return task.color || null;
}

// ── GanttBar (single bar) ─────────────────────────────────────────────────
function GanttBar({ task, left, width, isCritical, isMultiMode, pxPerDay, onDragEnd, onTaskClick, todayStr, member }) {
  const [dragMode, setDragMode]   = useState(null); // null | 'move' | 'resize-start' | 'resize-end'
  const [dragDx,   setDragDx]     = useState(0);
  const [tooltip,  setTooltip]    = useState(null);
  const wasDragged  = useRef(false);
  const startX      = useRef(0);
  const isResizeRef = useRef(false); // resize ハンドル経由の mousedown か

  // ドラッグ中のビジュアル計算
  let visualLeft  = left;
  let visualWidth = width;
  if (dragMode === 'move')         { visualLeft = left + dragDx; }
  if (dragMode === 'resize-start') { visualLeft = left + dragDx; visualWidth = Math.max(pxPerDay, width - dragDx); }
  if (dragMode === 'resize-end')   { visualWidth = Math.max(pxPerDay, width + dragDx); }

  const startDrag = useCallback((e, mode) => {
    if (isMultiMode) return;
    e.preventDefault();
    startX.current     = e.clientX;
    wasDragged.current = false;
    setDragMode(mode);
    setDragDx(0);

    const onMove = (ev) => {
      const dx = ev.clientX - startX.current;
      if (Math.abs(dx) > 3) wasDragged.current = true;
      setDragDx(dx);
    };
    const onUp = async (ev) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      setDragMode(null);
      setDragDx(0);
      const dayShift = Math.round((ev.clientX - startX.current) / pxPerDay);
      if (wasDragged.current && Math.abs(dayShift) > 0) {
        await onDragEnd(task, dayShift, mode);
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = mode === 'move' ? 'grabbing' : 'ew-resize';
  }, [isMultiMode, pxPerDay, task, onDragEnd]);

  const handleBarMouseDown = useCallback((e) => {
    if (isResizeRef.current) return; // resize ハンドルが処理済み
    startDrag(e, 'move');
  }, [startDrag]);

  const handleResizeMouseDown = useCallback((e, side) => {
    e.stopPropagation();
    isResizeRef.current = true;
    startDrag(e, side === 'left' ? 'resize-start' : 'resize-end');
    // 次の mousedown サイクルまでフラグをリセット
    const reset = () => { isResizeRef.current = false; };
    document.addEventListener('mouseup', reset, { once: true });
  }, [startDrag]);

  const handleClick = useCallback((e) => {
    if (!wasDragged.current && !isResizeRef.current) onTaskClick(task, e.currentTarget);
  }, [task, onTaskClick]);

  const handleMouseEnter = useCallback((e) => {
    setTooltip({ x: e.clientX + 10, y: e.clientY + 10 });
  }, []);
  const handleMouseMove = useCallback((e) => {
    setTooltip({ x: Math.min(e.clientX + 10, window.innerWidth - 220), y: Math.min(e.clientY + 10, window.innerHeight - 120) });
  }, []);
  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  const isDragging  = dragMode !== null;
  const showHandles = !isMultiMode && width >= 20;

  return (
    <>
      <div
        className={['gantt-bar', isCritical ? 'is-critical' : '', isDragging ? 'is-dragging' : ''].filter(Boolean).join(' ')}
        style={{ left: visualLeft, width: visualWidth, position: 'absolute', top: 5, height: 17 }}
        onMouseDown={handleBarMouseDown}
        onClick={handleClick}
        onDoubleClick={(e) => e.stopPropagation()}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <div className="gantt-bar__bg" style={{ ...(getBarColor(task, todayStr) ? { background: getBarColor(task, todayStr) } : {}) }} />
        <div className="gantt-bar__progress" style={{ width: `${Math.round(task.progress * 100)}%` }} />
        <div className="gantt-bar__label">{task.name}</div>
        {member && width >= 24 && (
          <div
            className="gantt-bar__assignee"
            style={{ background: member.color }}
            title={member.name}
          >
            {member.name.charAt(0)}
          </div>
        )}
        {showHandles && (
          <>
            <div
              className="gantt-bar__resize-handle gantt-bar__resize-handle--left"
              onMouseDown={(e) => handleResizeMouseDown(e, 'left')}
              onClick={(e) => e.stopPropagation()}
            />
            <div
              className="gantt-bar__resize-handle gantt-bar__resize-handle--right"
              onMouseDown={(e) => handleResizeMouseDown(e, 'right')}
              onClick={(e) => e.stopPropagation()}
            />
          </>
        )}
      </div>
      {!isDragging && tooltip && <Tooltip task={task} x={tooltip.x} y={tooltip.y} />}
    </>
  );
}

// ── Milestone ─────────────────────────────────────────────────────────────
function Milestone({ task, left, isCritical, onTaskClick }) {
  const [tooltip, setTooltip] = useState(null);

  return (
    <>
      <div
        className={['gantt-milestone', isCritical ? 'is-critical' : ''].filter(Boolean).join(' ')}
        style={{ left: left - 7, position: 'absolute' }}
        title={task.name}
        onClick={(e) => onTaskClick(task, e.currentTarget)}
        onDoubleClick={(e) => e.stopPropagation()}
        onMouseEnter={(e) => setTooltip({ x: e.clientX + 10, y: e.clientY + 10 })}
        onMouseMove={(e)  => setTooltip({ x: Math.min(e.clientX+10, window.innerWidth-220), y: Math.min(e.clientY+10, window.innerHeight-120) })}
        onMouseLeave={() => setTooltip(null)}
      />
      {tooltip && <Tooltip task={task} x={tooltip.x} y={tooltip.y} />}
    </>
  );
}

// ── GanttBars (main) ──────────────────────────────────────────────────────
export default function GanttBars({ tasks, groupedTasks, criticalTaskIds, chartStart, pxPerDay, isMultiMode, onTaskClick, onDragEnd, members = [] }) {
  const today      = fmtDate(new Date());
  const membersMap = Object.fromEntries(members.map(m => [m.id, m]));
  const { largeOrder, largeMap } = groupedTasks;

  // Weekend/holiday stripes
  const stripes = [];
  const realTasksForStripe = tasks.filter(t => !t._isSep);
  if (pxPerDay >= 2.5) {
    let cur = new Date(chartStart);
    const chartEnd = addDays(chartStart, Math.ceil(realTasksForStripe.length > 0
      ? diffDays(chartStart, parseDate(realTasksForStripe.reduce((a,b) => a.end_date > b.end_date ? a : b).end_date)) + 28
      : 60));
    while (cur <= chartEnd) {
      const iso    = fmtDate(cur);
      const dow    = cur.getDay();
      const isWknd = dow === 0 || dow === 6;
      const isHol  = HOLIDAYS.has(iso);
      if (isWknd || isHol) {
        stripes.push(
          <div
            key={iso}
            className={isHol ? 'gantt-holiday-stripe' : 'gantt-weekend-stripe'}
            style={{ position: 'absolute', top: 0, bottom: 0, left: diffDays(chartStart, cur) * pxPerDay, width: pxPerDay }}
          />
        );
      }
      cur = addDays(cur, 1);
    }
  }

  // Today line
  const todayPx = diffDays(chartStart, parseDate(today)) * pxPerDay;
  const rows    = [];
  let rowIndex  = 0;

  for (let li = 0; li < largeOrder.length; li++) {
    const grp = largeMap.get(largeOrder[li]);
    const { medOrder, medMap } = grp;
    const isLastLarge = li === largeOrder.length - 1;

    for (let mi = 0; mi < medOrder.length; mi++) {
      const medTasks  = medMap.get(medOrder[mi]);
      const isLastMed = mi === medOrder.length - 1;

      for (let ti = 0; ti < medTasks.length; ti++) {
        const t          = medTasks[ti];
        const isLastRow  = ti === medTasks.length - 1 && isLastMed;

        if (t._isSep) {
          rows.push(
            <div
              key={t.id}
              className="gantt-row gantt-row--sep"
              style={{ position: 'relative', height: ROW_H }}
            />
          );
          rowIndex++;
          continue;
        }

        const isCritical = criticalTaskIds.has(t.id);
        const startD     = parseDate(t.start_date);
        const endD       = parseDate(t.end_date);
        const left       = diffDays(chartStart, startD) * pxPerDay;

        rows.push(
          <div
            key={t.id}
            className={['gantt-row', isLastRow && isLastLarge ? 'grp-end' : ''].filter(Boolean).join(' ')}
            style={{
              position: 'relative', height: ROW_H,
              ...(isLastRow && !isLastLarge ? { borderBottom: '2px solid var(--color-border)' } : {}),
            }}
          >
            {t.task_type === 'milestone'
              ? <Milestone task={t} left={left} isCritical={isCritical} onTaskClick={onTaskClick} />
              : <GanttBar
                  task={t}
                  left={left}
                  width={Math.max(pxPerDay, (diffDays(startD, endD) + 1) * pxPerDay)}
                  isCritical={isCritical}
                  isMultiMode={isMultiMode}
                  pxPerDay={pxPerDay}
                  onDragEnd={onDragEnd}
                  onTaskClick={onTaskClick}
                  todayStr={today}
                  member={t.assignee_id ? membersMap[t.assignee_id] : null}
                />
            }
          </div>
        );
        rowIndex++;
      }
    }
  }

  return (
    <>
      {stripes}
      {todayPx >= 0 && <div className="gantt-today-line" style={{ left: todayPx }} />}
      {rows}
    </>
  );
}
