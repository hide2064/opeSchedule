/**
 * schedule-screen.js — schedule.html 専用スタンドアロン
 * URL: schedule.html?project=<id>
 *
 * Frappe Gantt を使わないカスタム実装。
 * 縦軸: 大項目 | 中項目 | 小項目 の 3 列階層ラベル
 * 横軸: 日付バー（pxPerDay ベースの絶対配置）
 */

import * as api from './api.js';

const LOG = {
  info:  (...a) => console.log ('[SCH]',  ...a),
  warn:  (...a) => console.warn('[SCH]',  ...a),
  error: (...a) => console.error('[SCH]', ...a),
};

LOG.info('schedule-screen.js モジュール評価開始');

// ── Toast ──────────────────────────────────────────────────────────────────
const toastEl  = document.getElementById('toast');
let toastTimer = null;

function showToast(msg, type = 'info') {
  if (toastTimer) clearTimeout(toastTimer);
  toastEl.textContent = msg;
  toastEl.className   = `toast ${type}`;
  toastEl.hidden      = false;
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3000);
}

function applyTheme(theme) {
  document.body.classList.toggle('theme-dark', theme === 'dark');
}

// ── 状態 ──────────────────────────────────────────────────────────────────
let currentPid   = null;
let currentTasks = [];
let viewMode     = 'Week';
let cachedConfig = null;

// チャート描画状態（renderSchedule で更新）
let chartStart = null;   // Date
let chartEnd   = null;   // Date
let pxPerDay   = 8;

// ビューモード別 px/day
const VIEW_PX = { Day: 40, Week: 8, Month: 2.5, Quarter: 0.8 };
const ROW_H   = 36;   // px（タスク行の高さ）

// ── プロジェクト ID を URL から取得 ────────────────────────────────────────
const pid = parseInt(new URLSearchParams(location.search).get('project'), 10);
LOG.info('URL から取得した pid:', pid);
if (!pid) {
  LOG.error('pid が無効のため / へリダイレクト');
  location.href = '/';
}
currentPid = pid;

// ── DOM 参照 ──────────────────────────────────────────────────────────────
const projectNameEl    = document.getElementById('schedule-project-name');
const viewModeBtns     = document.getElementById('view-mode-btns');
const taskDetailPanel  = document.getElementById('task-detail-panel');
const taskDetailForm   = document.getElementById('task-detail-form');
const btnCloseDetail   = document.getElementById('btn-close-detail');
const btnDeleteTask    = document.getElementById('btn-delete-task');
const detailProgressVal = document.getElementById('detail-progress-val');
const addTaskModal     = document.getElementById('add-task-modal');
const addTaskForm      = document.getElementById('add-task-form');
const btnAddTask       = document.getElementById('btn-add-task');
const btnCloseAddTask  = document.getElementById('btn-close-add-task-modal');
const importFileEl     = document.getElementById('import-file');
const btnExportJson    = document.getElementById('btn-export-json');
const btnExportCsv     = document.getElementById('btn-export-csv');

// 階層ペイン DOM
const hierPane      = document.getElementById('hier-pane');
const colLarge      = document.getElementById('col-large');
const colMedium     = document.getElementById('col-medium');
const colSmall      = document.getElementById('col-small');

// Gantt ペイン DOM
const ganttPane     = document.getElementById('gantt-pane');
const ganttInner    = document.getElementById('gantt-inner');
const dateHeaderEl  = document.getElementById('gantt-date-header');
const ganttRowsEl   = document.getElementById('gantt-rows');

LOG.info('DOM 参照確認:', {
  hierPane: !!hierPane, colLarge: !!colLarge, colMedium: !!colMedium,
  colSmall: !!colSmall, ganttPane: !!ganttPane, ganttRowsEl: !!ganttRowsEl,
});

// ── 日付ユーティリティ ──────────────────────────────────────────────────────
function parseDate(s) {
  return new Date(s + 'T00:00:00');
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function fmtDate(d) {
  if (typeof d === 'string') return d.slice(0, 10);
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function diffDays(a, b) {
  return Math.round((b - a) / 86400000);
}

function mondayOf(d) {
  const r = new Date(d);
  const dow = r.getDay();
  r.setDate(r.getDate() - (dow === 0 ? 6 : dow - 1));
  return r;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── グループ化ヘルパー ────────────────────────────────────────────────────
// tasks を category_large → category_medium の順序付き Map で返す
function groupTasks(tasks) {
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

// ── 日付ヘッダー描画 ──────────────────────────────────────────────────────
const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

function buildDateHeader() {
  dateHeaderEl.innerHTML = '';
  const today = fmtDate(new Date());

  if (viewMode === 'Day') {
    buildDayHeader(today);
  } else if (viewMode === 'Week') {
    buildWeekHeader(today);
  } else if (viewMode === 'Month') {
    buildMonthHeader(today);
  } else {
    buildQuarterHeader(today);
  }
}

function makeHeaderCell(text, widthPx, heightPx, extra = '') {
  const el = document.createElement('div');
  el.className = 'gantt-date-cell' + (extra ? ' ' + extra : '');
  el.style.width  = widthPx  + 'px';
  el.style.height = heightPx + 'px';
  el.textContent  = text;
  return el;
}

function buildWeekHeader(today) {
  const upperRow = document.createElement('div'); upperRow.className = 'gantt-date-row';
  const lowerRow = document.createElement('div'); lowerRow.className = 'gantt-date-row';

  let cur = mondayOf(chartStart);
  let prevMonth = -1;
  let monthCell = null;
  let monthPx   = 0;
  const weekPx  = 7 * pxPerDay;

  while (cur <= chartEnd) {
    const mon = cur.getMonth();
    if (mon !== prevMonth) {
      if (monthCell) monthCell.style.width = monthPx + 'px';
      monthCell = makeHeaderCell(`${cur.getFullYear()}/${MONTHS[mon]}`, 0, 25);
      upperRow.appendChild(monthCell);
      monthPx   = 0;
      prevMonth = mon;
    }
    monthPx += weekPx;

    const iso = fmtDate(cur);
    const cls = iso === today ? 'is-today' : '';
    lowerRow.appendChild(makeHeaderCell(`${cur.getMonth()+1}/${cur.getDate()}`, weekPx, 25, cls));
    cur = addDays(cur, 7);
  }
  if (monthCell) monthCell.style.width = monthPx + 'px';

  dateHeaderEl.appendChild(upperRow);
  dateHeaderEl.appendChild(lowerRow);
}

function buildDayHeader(today) {
  const upperRow = document.createElement('div'); upperRow.className = 'gantt-date-row';
  const lowerRow = document.createElement('div'); lowerRow.className = 'gantt-date-row';

  let cur = new Date(chartStart);
  let prevMonth = -1;
  let monthCell = null;
  let monthPx   = 0;
  const DAYS = ['日','月','火','水','木','金','土'];

  while (cur <= chartEnd) {
    const mon = cur.getMonth();
    if (mon !== prevMonth) {
      if (monthCell) monthCell.style.width = monthPx + 'px';
      monthCell = makeHeaderCell(`${cur.getFullYear()}/${MONTHS[mon]}`, 0, 25);
      upperRow.appendChild(monthCell);
      monthPx   = 0;
      prevMonth = mon;
    }
    monthPx += pxPerDay;

    const dow = cur.getDay();
    const iso = fmtDate(cur);
    const cls = (dow === 0 || dow === 6) ? 'is-weekend' : iso === today ? 'is-today' : '';
    lowerRow.appendChild(makeHeaderCell(`${cur.getDate()}${DAYS[dow]}`, pxPerDay, 25, cls));
    cur = addDays(cur, 1);
  }
  if (monthCell) monthCell.style.width = monthPx + 'px';

  dateHeaderEl.appendChild(upperRow);
  dateHeaderEl.appendChild(lowerRow);
}

function buildMonthHeader(today) {
  const upperRow = document.createElement('div'); upperRow.className = 'gantt-date-row';
  const lowerRow = document.createElement('div'); lowerRow.className = 'gantt-date-row';

  let cur = new Date(chartStart.getFullYear(), chartStart.getMonth(), 1);
  let prevYear = -1;
  let yearCell = null;
  let yearPx   = 0;

  while (cur <= addDays(chartEnd, 31)) {
    const yr = cur.getFullYear();
    const daysInMonth = new Date(yr, cur.getMonth() + 1, 0).getDate();
    const colPx = daysInMonth * pxPerDay;

    if (yr !== prevYear) {
      if (yearCell) yearCell.style.width = yearPx + 'px';
      yearCell = makeHeaderCell(`${yr}年`, 0, 25);
      upperRow.appendChild(yearCell);
      yearPx   = 0;
      prevYear = yr;
    }
    yearPx += colPx;

    lowerRow.appendChild(makeHeaderCell(MONTHS[cur.getMonth()], colPx, 25));

    cur = new Date(yr, cur.getMonth() + 1, 1);
    if (cur > addDays(chartEnd, 60)) break;
  }
  if (yearCell) yearCell.style.width = yearPx + 'px';

  dateHeaderEl.appendChild(upperRow);
  dateHeaderEl.appendChild(lowerRow);
}

function buildQuarterHeader(today) {
  const upperRow = document.createElement('div'); upperRow.className = 'gantt-date-row';
  const lowerRow = document.createElement('div'); lowerRow.className = 'gantt-date-row';

  const startQ = Math.floor(chartStart.getMonth() / 3);
  let cur = new Date(chartStart.getFullYear(), startQ * 3, 1);
  let prevYear = -1;
  let yearCell = null;
  let yearPx   = 0;

  while (cur <= addDays(chartEnd, 90)) {
    const yr = cur.getFullYear();
    const q  = Math.floor(cur.getMonth() / 3);
    const qEndDate = new Date(yr, (q + 1) * 3, 0);
    const daysInQ  = diffDays(cur, qEndDate) + 1;
    const colPx    = daysInQ * pxPerDay;

    if (yr !== prevYear) {
      if (yearCell) yearCell.style.width = yearPx + 'px';
      yearCell = makeHeaderCell(`${yr}年`, 0, 25);
      upperRow.appendChild(yearCell);
      yearPx   = 0;
      prevYear = yr;
    }
    yearPx += colPx;

    lowerRow.appendChild(makeHeaderCell(`Q${q + 1}`, colPx, 25));

    cur = new Date(yr, (q + 1) * 3, 1);
    if (cur > addDays(chartEnd, 120)) break;
  }
  if (yearCell) yearCell.style.width = yearPx + 'px';

  dateHeaderEl.appendChild(upperRow);
  dateHeaderEl.appendChild(lowerRow);
}

// ── 階層ラベルペイン描画 ──────────────────────────────────────────────────
function buildHierarchyPane(tasks) {
  // ヘッダー行（index 0）を残してクリア
  while (colLarge.children.length  > 1) colLarge.removeChild(colLarge.lastChild);
  while (colMedium.children.length > 1) colMedium.removeChild(colMedium.lastChild);
  while (colSmall.children.length  > 1) colSmall.removeChild(colSmall.lastChild);

  if (tasks.length === 0) return;

  const { largeOrder, largeMap } = groupTasks(tasks);

  for (let li = 0; li < largeOrder.length; li++) {
    const largeName  = largeOrder[li];
    const grp        = largeMap.get(largeName);
    const { medOrder, medMap } = grp;
    const isLastLarge = li === largeOrder.length - 1;

    // 大項目に属す全タスク数
    const largeTotalRows = medOrder.reduce((s, m) => s + medMap.get(m).length, 0);

    // 大項目セル
    const lCell = document.createElement('div');
    lCell.className = 'hier-cell-large' + (isLastLarge ? ' grp-end' : '');
    lCell.style.height = (largeTotalRows * ROW_H) + 'px';
    lCell.textContent  = largeName || '(未分類)';
    colLarge.appendChild(lCell);

    for (let mi = 0; mi < medOrder.length; mi++) {
      const medName  = medOrder[mi];
      const medTasks = medMap.get(medName);
      const isLastMed = (mi === medOrder.length - 1);

      // 中項目セル
      const mCell = document.createElement('div');
      mCell.className = 'hier-cell-medium' + ((isLastMed && isLastLarge) ? ' grp-end' : '');
      if (isLastMed && !isLastLarge) mCell.style.borderBottom = '2px solid var(--color-border)';
      mCell.style.height = (medTasks.length * ROW_H) + 'px';
      mCell.textContent  = medName || '(未分類)';
      colMedium.appendChild(mCell);

      // 小項目セル
      for (let ti = 0; ti < medTasks.length; ti++) {
        const t = medTasks[ti];
        const isLastRow = (ti === medTasks.length - 1) && isLastMed;

        const sCell = document.createElement('div');
        sCell.className = 'hier-cell-small'
          + (t.task_type === 'milestone' ? ' is-milestone' : '')
          + ((isLastRow && isLastLarge) ? ' grp-end' : '');
        if (isLastRow && !isLastLarge) sCell.style.borderBottom = '2px solid var(--color-border)';

        if (t.task_type === 'milestone') {
          sCell.innerHTML = `<span class="ms-icon">◆</span>${escHtml(t.name)}`;
        } else {
          sCell.textContent = t.name;
        }
        sCell.title = t.name;
        sCell.addEventListener('click', () => openTaskDetail(t));
        colSmall.appendChild(sCell);
      }
    }
  }
}

// ── Ganttバー・行描画 ──────────────────────────────────────────────────────
function buildGanttBars(tasks) {
  ganttRowsEl.innerHTML = '';

  if (tasks.length === 0) {
    ganttRowsEl.innerHTML =
      '<div class="no-project-msg">タスクがありません。「+ Add Task」から追加してください。</div>';
    return;
  }

  const today = fmtDate(new Date());
  const totalPx = (diffDays(chartStart, chartEnd) + 1) * pxPerDay;

  // 週末ストライプ（Week / Day モードのみ）
  if (viewMode === 'Week' || viewMode === 'Day') {
    const step = viewMode === 'Week' ? 7 : 1;
    let cur = new Date(chartStart);
    while (cur <= chartEnd) {
      const dow = cur.getDay();
      if (dow === 0 || dow === 6) {
        const stripe = document.createElement('div');
        stripe.className = 'gantt-weekend-stripe';
        stripe.style.left  = diffDays(chartStart, cur) * pxPerDay + 'px';
        stripe.style.width = (viewMode === 'Week' ? 2 : 1) * pxPerDay + 'px';
        ganttRowsEl.appendChild(stripe);
      }
      cur = addDays(cur, step);
    }
  }

  // 今日ライン
  const todayPx = diffDays(chartStart, parseDate(today)) * pxPerDay;
  if (todayPx >= 0 && todayPx <= totalPx) {
    const todayLine = document.createElement('div');
    todayLine.className = 'gantt-today-line';
    todayLine.style.left = todayPx + 'px';
    ganttRowsEl.appendChild(todayLine);
  }

  const { largeOrder, largeMap } = groupTasks(tasks);

  for (let li = 0; li < largeOrder.length; li++) {
    const grp = largeMap.get(largeOrder[li]);
    const { medOrder, medMap } = grp;
    const isLastLarge = li === largeOrder.length - 1;

    for (let mi = 0; mi < medOrder.length; mi++) {
      const medTasks  = medMap.get(medOrder[mi]);
      const isLastMed = mi === medOrder.length - 1;

      for (let ti = 0; ti < medTasks.length; ti++) {
        const t = medTasks[ti];
        const isLastRow = (ti === medTasks.length - 1) && isLastMed;

        const row = document.createElement('div');
        row.className = 'gantt-row'
          + ((isLastRow && isLastLarge) ? ' grp-end' : '');
        if (isLastRow && !isLastLarge) row.style.borderBottom = '2px solid var(--color-border)';
        ganttRowsEl.appendChild(row);

        const startD = parseDate(t.start_date);
        const endD   = parseDate(t.end_date);
        const left   = diffDays(chartStart, startD) * pxPerDay;

        if (t.task_type === 'milestone') {
          const ms = document.createElement('div');
          ms.className = 'gantt-milestone';
          ms.style.left = (left - 7) + 'px';
          ms.title = t.name;
          ms.addEventListener('click', () => openTaskDetail(t));
          addTooltip(ms, t);
          row.appendChild(ms);
        } else {
          const width = Math.max(pxPerDay, (diffDays(startD, endD) + 1) * pxPerDay);

          const bar = document.createElement('div');
          bar.className = 'gantt-bar';
          bar.style.left  = left + 'px';
          bar.style.width = width + 'px';

          const bg = document.createElement('div');
          bg.className = 'gantt-bar__bg';
          if (t.color) bg.style.background = t.color;
          bar.appendChild(bg);

          const prog = document.createElement('div');
          prog.className = 'gantt-bar__progress';
          prog.style.width = Math.round(t.progress * 100) + '%';
          bar.appendChild(prog);

          const lbl = document.createElement('div');
          lbl.className = 'gantt-bar__label';
          lbl.textContent = t.name;
          bar.appendChild(lbl);

          bar.addEventListener('click', (e) => {
            if (!bar.classList.contains('is-dragging')) openTaskDetail(t);
          });

          attachDrag(bar, t);
          addTooltip(bar, t);
          row.appendChild(bar);
        }
      }
    }
  }

  ganttRowsEl.style.minHeight = (tasks.length * ROW_H) + 'px';
}

// ── ドラッグ（水平方向のみ：日程変更） ───────────────────────────────────
function attachDrag(bar, task) {
  bar.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const startX  = e.clientX;
    const origLeft = parseInt(bar.style.left, 10);
    bar.classList.add('is-dragging');

    const onMove = (ev) => {
      bar.style.left = (origLeft + ev.clientX - startX) + 'px';
    };

    const onUp = async (ev) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      bar.classList.remove('is-dragging');

      const dx       = ev.clientX - startX;
      const dayShift = Math.round(dx / pxPerDay);
      if (Math.abs(dayShift) === 0) return;

      const newStart = fmtDate(addDays(parseDate(task.start_date), dayShift));
      const newEnd   = fmtDate(addDays(parseDate(task.end_date),   dayShift));

      try {
        const updated = await api.updateDates(currentPid, task.id, {
          start_date: newStart,
          end_date:   newEnd,
        });
        const idx = currentTasks.findIndex(t => t.id === task.id);
        if (idx !== -1) currentTasks[idx] = updated;
        renderSchedule(currentTasks);
      } catch (ex) {
        showToast('日程更新エラー: ' + ex.message, 'error');
        renderSchedule(currentTasks);
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });
}

// ── Tooltip ──────────────────────────────────────────────────────────────
let tooltipEl = null;

function addTooltip(el, task) {
  el.addEventListener('mouseenter', (e) => {
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.className = 'gantt-tooltip';
      document.body.appendChild(tooltipEl);
    }
    const pct  = Math.round(task.progress * 100);
    const type = task.task_type === 'milestone' ? '◆ マイルストーン' : 'タスク';
    const dur  = task.start_date === task.end_date
      ? task.start_date
      : `${task.start_date} → ${task.end_date}`;
    const catLine = [task.category_large, task.category_medium]
      .filter(Boolean).map(escHtml).join(' › ');

    tooltipEl.innerHTML = `
      ${catLine ? `<div style="font-size:11px;color:#888;margin-bottom:2px">${catLine}</div>` : ''}
      <div style="font-weight:600;margin-bottom:4px">${escHtml(task.name)}</div>
      <div style="font-size:11px;color:#666">${type}</div>
      <div style="font-size:11px">${dur}</div>
      <div style="font-size:11px;margin-top:4px">
        進捗: <span style="display:inline-block;width:60px;background:#eee;border-radius:3px;height:6px;vertical-align:middle">
          <span style="display:block;width:${pct}%;background:#4A90D9;height:6px;border-radius:3px"></span>
        </span> ${pct}%
      </div>
      ${task.notes ? `<div style="font-size:11px;color:#888;margin-top:4px">${escHtml(task.notes)}</div>` : ''}
    `;
    tooltipEl.style.display = 'block';
    positionTooltip(e);
  });

  el.addEventListener('mousemove', positionTooltip);

  el.addEventListener('mouseleave', () => {
    if (tooltipEl) tooltipEl.style.display = 'none';
  });
}

function positionTooltip(e) {
  if (!tooltipEl) return;
  const margin = 10;
  let x = e.clientX + margin;
  let y = e.clientY + margin;
  const tw = tooltipEl.offsetWidth  || 200;
  const th = tooltipEl.offsetHeight || 100;
  if (x + tw > window.innerWidth)  x = e.clientX - tw - margin;
  if (y + th > window.innerHeight) y = e.clientY - th - margin;
  tooltipEl.style.left = x + 'px';
  tooltipEl.style.top  = y + 'px';
}

// ── スクロール同期 ────────────────────────────────────────────────────────
let scrollSyncing = false;

function initScrollSync() {
  ganttPane.addEventListener('scroll', () => {
    if (scrollSyncing) return;
    scrollSyncing = true;
    hierPane.scrollTop = ganttPane.scrollTop;
    scrollSyncing = false;
  });
  hierPane.addEventListener('scroll', () => {
    if (scrollSyncing) return;
    scrollSyncing = true;
    ganttPane.scrollTop = hierPane.scrollTop;
    scrollSyncing = false;
  });
}

// ── View Mode ─────────────────────────────────────────────────────────────
function updateViewModeBtns() {
  viewModeBtns.querySelectorAll('.view-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === viewMode);
  });
}

viewModeBtns.addEventListener('click', e => {
  const btn = e.target.closest('.view-btn');
  if (!btn) return;
  viewMode = btn.dataset.mode;
  updateViewModeBtns();
  renderSchedule(currentTasks);
});

// ── メイン描画 ────────────────────────────────────────────────────────────
function renderSchedule(tasks) {
  LOG.info('renderSchedule() タスク数:', tasks.length);

  if (tasks.length === 0) {
    dateHeaderEl.innerHTML = '';
    ganttRowsEl.innerHTML  =
      '<div class="no-project-msg">タスクがありません。「+ Add Task」から追加してください。</div>';
    while (colLarge.children.length  > 1) colLarge.removeChild(colLarge.lastChild);
    while (colMedium.children.length > 1) colMedium.removeChild(colMedium.lastChild);
    while (colSmall.children.length  > 1) colSmall.removeChild(colSmall.lastChild);
    return;
  }

  // チャート範囲計算
  const allDates = tasks.flatMap(t => [t.start_date, t.end_date]);
  const minDate  = allDates.reduce((a, b) => a < b ? a : b);
  const maxDate  = allDates.reduce((a, b) => a > b ? a : b);

  pxPerDay   = VIEW_PX[viewMode] ?? 8;
  chartStart = addDays(mondayOf(parseDate(minDate)), -7);
  chartEnd   = addDays(parseDate(maxDate), 21);

  // 幅セット
  ganttInner.style.width = ((diffDays(chartStart, chartEnd) + 1) * pxPerDay) + 'px';

  buildDateHeader();
  buildHierarchyPane(tasks);
  buildGanttBars(tasks);

  // 今日へスクロール
  if (cachedConfig?.auto_scroll_today !== false) {
    const todayPx = diffDays(chartStart, parseDate(fmtDate(new Date()))) * pxPerDay;
    if (todayPx > 0) {
      setTimeout(() => { ganttPane.scrollLeft = Math.max(0, todayPx - 200); }, 50);
    }
  }
}

// ── Task Detail Panel ─────────────────────────────────────────────────────
function openTaskDetail(task) {
  taskDetailForm.task_id.value              = task.id;
  taskDetailForm.category_large.value       = task.category_large  ?? '';
  taskDetailForm.category_medium.value      = task.category_medium ?? '';
  taskDetailForm.name.value                 = task.name;
  taskDetailForm.start_date.value           = task.start_date;
  taskDetailForm.end_date.value             = task.end_date;
  taskDetailForm.is_milestone.checked       = task.task_type === 'milestone';
  taskDetailForm.progress.value             = Math.round(task.progress * 100);
  detailProgressVal.textContent             = Math.round(task.progress * 100);
  taskDetailForm.color.value                = task.color ?? '#4A90D9';
  taskDetailForm.notes.value                = task.notes ?? '';
  toggleEndDateRow(taskDetailForm, task.task_type === 'milestone');
  taskDetailPanel.hidden = false;
  taskDetailPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

btnCloseDetail.addEventListener('click', () => { taskDetailPanel.hidden = true; });

taskDetailForm.is_milestone.addEventListener('change', e => {
  toggleEndDateRow(taskDetailForm, e.target.checked);
  if (e.target.checked) taskDetailForm.end_date.value = taskDetailForm.start_date.value;
});
taskDetailForm.start_date.addEventListener('input', e => {
  if (taskDetailForm.is_milestone.checked) taskDetailForm.end_date.value = e.target.value;
});

taskDetailForm.addEventListener('submit', async e => {
  e.preventDefault();
  const tid         = parseInt(taskDetailForm.task_id.value);
  const isMilestone = taskDetailForm.is_milestone.checked;
  const data = {
    category_large:  taskDetailForm.category_large.value  || null,
    category_medium: taskDetailForm.category_medium.value || null,
    name:       taskDetailForm.name.value,
    start_date: taskDetailForm.start_date.value,
    end_date:   isMilestone ? taskDetailForm.start_date.value : taskDetailForm.end_date.value,
    task_type:  isMilestone ? 'milestone' : 'task',
    progress:   parseFloat(taskDetailForm.progress.value) / 100,
    color:      taskDetailForm.color.value || null,
    notes:      taskDetailForm.notes.value || null,
  };
  try {
    const updated = await api.updateTask(currentPid, tid, data);
    const idx = currentTasks.findIndex(t => t.id === tid);
    if (idx !== -1) currentTasks[idx] = updated;
    renderSchedule(currentTasks);
    taskDetailPanel.hidden = true;
    showToast('タスクを更新しました', 'success');
  } catch (ex) { showToast(ex.message, 'error'); }
});

btnDeleteTask.addEventListener('click', async () => {
  const tid  = parseInt(taskDetailForm.task_id.value);
  const task = currentTasks.find(t => t.id === tid);
  if (!confirm(`「${task?.name}」を削除しますか？`)) return;
  try {
    await api.deleteTask(currentPid, tid);
    currentTasks = currentTasks.filter(t => t.id !== tid);
    renderSchedule(currentTasks);
    taskDetailPanel.hidden = true;
    showToast('タスクを削除しました', 'success');
  } catch (ex) { showToast(ex.message, 'error'); }
});

// ── Add Task Modal ────────────────────────────────────────────────────────
btnAddTask.addEventListener('click', () => {
  addTaskForm.reset();
  const today = new Date().toISOString().slice(0, 10);
  addTaskForm.start_date.value = today;
  addTaskForm.end_date.value   = today;
  toggleEndDateRow(addTaskForm, false);
  addTaskModal.hidden = false;
  addTaskForm.name.focus();
});

btnCloseAddTask.addEventListener('click', () => { addTaskModal.hidden = true; });
addTaskModal.querySelector('.modal__backdrop').addEventListener('click', () => { addTaskModal.hidden = true; });

addTaskForm['is_milestone'].addEventListener('change', e => {
  toggleEndDateRow(addTaskForm, e.target.checked);
  if (e.target.checked) addTaskForm.end_date.value = addTaskForm.start_date.value;
});
addTaskForm.start_date.addEventListener('input', e => {
  if (addTaskForm['is_milestone'].checked) addTaskForm.end_date.value = e.target.value;
});

addTaskForm.addEventListener('submit', async e => {
  e.preventDefault();
  const isMilestone = addTaskForm['is_milestone'].checked;
  const data = {
    category_large:  addTaskForm.category_large.value  || null,
    category_medium: addTaskForm.category_medium.value || null,
    name:       addTaskForm.name.value,
    start_date: addTaskForm.start_date.value,
    end_date:   isMilestone ? addTaskForm.start_date.value : addTaskForm.end_date.value,
    task_type:  isMilestone ? 'milestone' : 'task',
    color:      addTaskForm.color.value || null,
    notes:      addTaskForm.notes.value || null,
    sort_order: currentTasks.length,
  };
  try {
    const created = await api.createTask(currentPid, data);
    currentTasks.push(created);
    renderSchedule(currentTasks);
    addTaskModal.hidden = true;
    showToast('タスクを追加しました', 'success');
  } catch (ex) { showToast(ex.message, 'error'); }
});

// ── Import ────────────────────────────────────────────────────────────────
importFileEl.addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const result = await api.importProject(file);
    showToast(`インポート完了 (${result.task_count} タスク)`, 'success');
    location.href = `schedule.html?project=${result.project_id}`;
  } catch (ex) { showToast('インポートエラー: ' + ex.message, 'error'); }
  importFileEl.value = '';
});

// ── Export ────────────────────────────────────────────────────────────────
async function triggerExport(format) {
  try {
    const res = await api.exportProject(currentPid, format);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url, download: `project_${currentPid}.${format}`
    });
    a.click();
    URL.revokeObjectURL(url);
  } catch (ex) { showToast('エクスポートエラー: ' + ex.message, 'error'); }
}

btnExportJson.addEventListener('click', () => triggerExport('json'));
btnExportCsv.addEventListener('click',  () => triggerExport('csv'));

// ── キーボードショートカット ──────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!addTaskModal.hidden)   { addTaskModal.hidden = true;   return; }
  if (!taskDetailPanel.hidden) { taskDetailPanel.hidden = true; }
});

// ── Helpers ───────────────────────────────────────────────────────────────
function toggleEndDateRow(form, isMilestone) {
  const rowId = form === taskDetailForm ? 'detail-end-date-row' : 'add-end-date-row';
  const row   = document.getElementById(rowId);
  if (row) row.hidden = isMilestone;
}

// ── Boot: Config → Project 読み込み ───────────────────────────────────────
LOG.info('Boot 開始');
(async () => {
  try {
    cachedConfig = await api.getConfig();
    applyTheme(cachedConfig.theme);
    LOG.info('Config 読み込み完了:', cachedConfig);
  } catch (ex) {
    LOG.warn('Config 読み込み失敗（継続）:', ex.message);
  }

  try {
    const [project, tasks] = await Promise.all([
      api.getProject(currentPid),
      api.listTasks(currentPid),
    ]);
    LOG.info('Project:', project, '/ Tasks:', tasks.length);
    projectNameEl.textContent = project.name;
    document.title = `${project.name} - opeSchedule`;
    currentTasks = tasks;

    if (project.view_mode)              viewMode = project.view_mode;
    else if (cachedConfig?.default_view_mode) viewMode = cachedConfig.default_view_mode;
    updateViewModeBtns();

    initScrollSync();
    renderSchedule(tasks);
    LOG.info('Boot 完了');
  } catch (ex) {
    LOG.error('Project/Tasks 読み込みエラー:', ex);
    ganttRowsEl.innerHTML =
      `<div class="no-project-msg">読み込みエラー: ${ex.message}</div>`;
  }
})();
