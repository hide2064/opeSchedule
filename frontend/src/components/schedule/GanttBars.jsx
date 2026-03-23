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

// ── GanttBar (single bar) ─────────────────────────────────────────────────
function GanttBar({ task, left, width, isCritical, isMultiMode, pxPerDay, onDragEnd, onTaskClick }) {
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [tooltip, setTooltip]       = useState(null);
  const wasDragged = useRef(false);
  const startX     = useRef(0);

  const handleMouseDown = useCallback((e) => {
    if (isMultiMode) return;
    e.preventDefault();
    startX.current   = e.clientX;
    wasDragged.current = false;
    setIsDragging(true);

    const onMove = (ev) => {
      const dx = ev.clientX - startX.current;
      if (Math.abs(dx) > 3) wasDragged.current = true;
      setDragOffset(dx);
    };
    const onUp = async (ev) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setIsDragging(false);
      setDragOffset(0);
      const dayShift = Math.round((ev.clientX - startX.current) / pxPerDay);
      if (wasDragged.current && Math.abs(dayShift) > 0) await onDragEnd(task, dayShift);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [isMultiMode, pxPerDay, task, onDragEnd]);

  const handleClick = useCallback((e) => {
    if (!wasDragged.current) onTaskClick(task, e.currentTarget);
  }, [task, onTaskClick]);

  const handleMouseEnter = useCallback((e) => {
    const margin = 10;
    setTooltip({ x: e.clientX + margin, y: e.clientY + margin });
  }, []);
  const handleMouseMove  = useCallback((e) => {
    const margin = 10;
    const x = e.clientX + margin;
    const y = e.clientY + margin;
    setTooltip({ x: Math.min(x, window.innerWidth - 220), y: Math.min(y, window.innerHeight - 120) });
  }, []);
  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  return (
    <>
      <div
        className={['gantt-bar', isCritical ? 'is-critical' : '', isDragging ? 'is-dragging' : ''].filter(Boolean).join(' ')}
        style={{ left: left + dragOffset, width, position: 'absolute', top: 5, height: 17 }}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        onDoubleClick={(e) => e.stopPropagation()}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <div className="gantt-bar__bg" style={task.color ? { background: task.color } : {}} />
        <div className="gantt-bar__progress" style={{ width: `${Math.round(task.progress * 100)}%` }} />
        <div className="gantt-bar__label">{task.name}</div>
      </div>
      {tooltip && <Tooltip task={task} x={tooltip.x} y={tooltip.y} />}
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
export default function GanttBars({ tasks, groupedTasks, criticalTaskIds, chartStart, pxPerDay, isMultiMode, onTaskClick, onDragEnd }) {
  const today    = fmtDate(new Date());
  const { largeOrder, largeMap } = groupedTasks;

  // Weekend/holiday stripes
  const stripes = [];
  if (pxPerDay >= 2.5) { // Day/Week モードのみ
    let cur = new Date(chartStart);
    const chartEnd = addDays(chartStart, Math.ceil(tasks.length > 0
      ? diffDays(chartStart, parseDate(tasks.reduce((a,b) => a.end_date > b.end_date ? a : b).end_date)) + 28
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
