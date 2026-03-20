/**
 * schedule-screen.js — schedule.html 専用スタンドアロン
 * URL: schedule.html?project=<id>
 *
 * Frappe Gantt を使わないカスタム実装。
 * 縦軸: 大項目 | 中項目 | 小項目 の 3 列階層ラベル（hier-pane）で
 *       タスクをグループ化して表示する。
 * 横軸: 日付バー（pxPerDay ベースの絶対配置）を gantt-pane に描画する。
 *       viewMode（Day / Week / Month / Quarter）に応じて pxPerDay を切り替える。
 */

import * as api from './api.js';
import {
  createLogger, createToast, applyTheme, escHtml,
  parseDate, addDays, fmtDate, diffDays, mondayOf,
} from './utils.js';
import { HOLIDAYS, VIEW_PX, ROW_H, HDR_H } from './constants.js';

const LOG       = createLogger('SCH');
const showToast = createToast();

LOG.info('schedule-screen.js モジュール評価開始');

// ── 状態 ──────────────────────────────────────────────────────────────────
let currentPid   = null;
let currentTasks = [];
let viewMode     = 'Week';
let cachedConfig = null;

// チャート描画状態（renderSchedule で更新）
let chartStart = null;   // Date
let chartEnd   = null;   // Date
let pxPerDay   = 8;

// タスク id → Ganttエリアの行インデックス（矢印描画で使用）
let taskRowIndexMap = new Map();

// 最後に計算したクリティカルパス上のタスクID（詳細パネルで参照）
let currentCriticalTaskIds = new Set();

// ── プロジェクト ID を URL から取得（単体 / 比較 / 大項目フィルターモード） ──
const _urlParams   = new URLSearchParams(location.search);
// ?projects=1,2,3 (比較モード) と ?projects=1&projects=2 (フィルターモード) の両形式に対応する。
// 比較モードはカンマ区切りで 1 パラメータとして渡され、
// フィルターモードは URLSearchParams.append で複数パラメータとして渡される。
// getAll() を使うことで複数パラメータ形式（フィルターモード）を配列として受け取れる。
const _rawProjects = _urlParams.getAll('projects');
const _pidsMulti   = (_rawProjects.length === 1 && _rawProjects[0].includes(','))
  ? _rawProjects[0].split(',').map(Number).filter(n => n > 0)   // カンマ区切り形式
  : _rawProjects.map(Number).filter(n => n > 0);                 // 複数パラム形式
// catfilter: 大項目フィルター値。複数指定可能なため getAll() で配列取得する。
const _catfilter   = _urlParams.getAll('catfilter');
// isCatfilterMode: catfilter パラメータが 1 つ以上あればフィルターモード
const isCatfilterMode = _catfilter.length > 0;
// isMultiMode: 2プロジェクト以上の比較、またはフィルターモード（1プロジェクト以上）の場合に true
const isMultiMode  = _pidsMulti.length >= 2 || (_pidsMulti.length >= 1 && isCatfilterMode);
const pid          = isMultiMode ? _pidsMulti[0] : parseInt(_urlParams.get('project'), 10);
LOG.info('URL params: pid=', pid, 'isMultiMode=', isMultiMode,
  'isCatfilterMode=', isCatfilterMode, 'pids=', _pidsMulti, 'catfilter=', _catfilter);

if (!isMultiMode && !pid) {
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

// ── グループ化ヘルパー ────────────────────────────────────────────────────
// tasks を category_large → category_medium の順序付き Map に変換する。
// largeOrder: 大項目の出現順を保持する配列（Map はイテレーション順を保証するが明示化）
// largeMap: 大項目名 → { medOrder（中項目出現順配列）, medMap（中項目名 → タスク配列） }
// この構造により、大項目・中項目のネストを走査しながら DOM を生成できる。
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
// viewMode に応じて異なるヘッダー構造を生成する。
// Day:     上行に年/月、下行に日・曜日（1日1セル、週末/祝日に色付け）
// Week:    上行に年/月、下行に週の月曜日（1週1セル、祝日を title 属性で表示）
// Month:   上行に年、下行に月（月ごとの日数幅）
// Quarter: 上行に年、下行に四半期（Q1〜Q4、四半期内の日数幅）
const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

function buildDateHeader() {
  dateHeaderEl.innerHTML = '';
  const today = fmtDate(new Date());
  if      (viewMode === 'Day')   buildDayHeader(today);
  else if (viewMode === 'Week')  buildWeekHeader(today);
  else if (viewMode === 'Month') buildMonthHeader(today);
  else                           buildQuarterHeader(today);
}

// ヘッダー上下 2 行の div を生成して返す共通ヘルパー。
// 全 4 モードで同一の構造（上行: 月/年ラベル、下行: 詳細ラベル）を使うため集約する。
function createHeaderRows() {
  const upper = document.createElement('div'); upper.className = 'gantt-date-row';
  const lower = document.createElement('div'); lower.className = 'gantt-date-row';
  return [upper, lower];
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
  const [upperRow, lowerRow] = createHeaderRows();

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
    // 週内（月〜日）に含まれる祝日を検索
    let weekHolName = '';
    for (let d = 0; d < 7; d++) {
      const hiso = fmtDate(addDays(cur, d));
      if (HOLIDAYS.has(hiso)) { weekHolName = HOLIDAYS.get(hiso); break; }
    }
    const weekEnd = fmtDate(addDays(cur, 6));
    const clsParts = [];
    // 今日が週の月曜〜日曜の範囲内であればハイライト（曜日を問わず判定）
    if (today >= iso && today <= weekEnd) clsParts.push('is-today');
    if (weekHolName)   clsParts.push('is-has-holiday');
    const cell = makeHeaderCell(`${cur.getMonth()+1}/${cur.getDate()}`, weekPx, 25, clsParts.join(' '));
    if (weekHolName) cell.title = weekHolName;
    lowerRow.appendChild(cell);
    cur = addDays(cur, 7);
  }
  if (monthCell) monthCell.style.width = monthPx + 'px';

  dateHeaderEl.append(upperRow, lowerRow);
}

function buildDayHeader(today) {
  const [upperRow, lowerRow] = createHeaderRows();

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

    const dow     = cur.getDay();
    const iso     = fmtDate(cur);
    const isWknd  = dow === 0 || dow === 6;
    const holName = HOLIDAYS.get(iso) ?? '';
    const clsParts = [];
    if (isWknd)   clsParts.push('is-weekend');
    if (holName)  clsParts.push('is-holiday');
    if (!isWknd && !holName && iso === today) clsParts.push('is-today');
    const cell = makeHeaderCell(`${cur.getDate()}${DAYS[dow]}`, pxPerDay, 25, clsParts.join(' '));
    if (holName) cell.title = holName;
    lowerRow.appendChild(cell);
    cur = addDays(cur, 1);
  }
  if (monthCell) monthCell.style.width = monthPx + 'px';

  dateHeaderEl.append(upperRow, lowerRow);
}

function buildMonthHeader(today) {
  const [upperRow, lowerRow] = createHeaderRows();

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

    // 今日が属する月のセルをハイライト
    const monthStart = fmtDate(new Date(yr, cur.getMonth(), 1));
    const monthEnd   = fmtDate(new Date(yr, cur.getMonth() + 1, 0));
    const isThisMonth = today >= monthStart && today <= monthEnd;
    lowerRow.appendChild(makeHeaderCell(MONTHS[cur.getMonth()], colPx, 25, isThisMonth ? 'is-today' : ''));

    cur = new Date(yr, cur.getMonth() + 1, 1);
    if (cur > addDays(chartEnd, 60)) break;
  }
  if (yearCell) yearCell.style.width = yearPx + 'px';

  dateHeaderEl.append(upperRow, lowerRow);
}

function buildQuarterHeader(today) {
  const [upperRow, lowerRow] = createHeaderRows();

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

    // 今日が属する四半期セルをハイライト
    const qStart    = fmtDate(cur);
    const qEnd      = fmtDate(qEndDate);
    const isThisQ   = today >= qStart && today <= qEnd;
    lowerRow.appendChild(makeHeaderCell(`Q${q + 1}`, colPx, 25, isThisQ ? 'is-today' : ''));

    cur = new Date(yr, (q + 1) * 3, 1);
    if (cur > addDays(chartEnd, 120)) break;
  }
  if (yearCell) yearCell.style.width = yearPx + 'px';

  dateHeaderEl.append(upperRow, lowerRow);
}

// ── クリティカルパス計算 ──────────────────────────────────────────────────
// 依存関係のある predecessor の end_date の翌日 == successor の start_date
// （バッファが 0 日 = スラックなし）の連鎖をクリティカルパスとみなす。
// slack = (後続タスクの start) - (先行タスクの end) - 1 日
// slack ≦ 0 の場合、その依存ペアはバッファなしとみなしクリティカルと判定する。
// 先行・後続の両タスク ID を criticalTaskIds に登録し、
// ペアを "predId__succId" 形式の文字列で criticalDepPairs に登録して矢印の色分けに使う。
function calculateCriticalPath(tasks) {
  const taskMap        = new Map(tasks.map(t => [t.id, t]));
  const criticalTaskIds  = new Set();
  const criticalDepPairs = new Set(); // "predId__succId"

  for (const task of tasks) {
    if (!task.dependencies?.length) continue;
    for (const dep of task.dependencies) {
      const pred = taskMap.get(dep.depends_on_id);
      if (!pred) continue;
      // slack = (後続 start) - (先行 end) - 1 日  ≦ 0 → クリティカル
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

// ── 階層ラベルペイン描画 ──────────────────────────────────────────────────
// 大項目・中項目セルは子タスク数 × ROW_H の高さを設定することで
// HTML テーブルの rowspan 相当の視覚的な縦結合を実現する。
// colLarge / colMedium / colSmall はそれぞれ独立した flex コンテナで
// セルを縦に積み重ねるため、高さを合わせるだけで整列する。
function buildHierarchyPane(tasks, criticalTaskIds = new Set()) {
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
          + (criticalTaskIds.has(t.id)   ? ' is-critical'  : '')
          + ((isLastRow && isLastLarge)  ? ' grp-end'      : '');
        if (isLastRow && !isLastLarge) sCell.style.borderBottom = '2px solid var(--color-border)';

        if (t.task_type === 'milestone') {
          sCell.innerHTML = `<span class="ms-icon">◆</span>${escHtml(t.name)}`;
        } else {
          sCell.textContent = t.name;
        }
        sCell.title = t.name;
        sCell.addEventListener('click', () => openTaskDetail(t, sCell));
        colSmall.appendChild(sCell);
      }
    }
  }
}

// ── Ganttバー・行描画 ──────────────────────────────────────────────────────
// バー位置の計算式:
//   left = diffDays(chartStart, startD) × pxPerDay  （絶対配置）
//   width = (diffDays(startD, endD) + 1) × pxPerDay （1日以上を保証）
// ganttRowsEl は position:relative なので left/top の絶対配置が有効。
function buildGanttBars(tasks, criticalTaskIds = new Set()) {
  ganttRowsEl.innerHTML = '';
  taskRowIndexMap.clear();
  // ganttInner に配置した前回の今日ラインを除去する。
  // ganttRowsEl と異なり ganttInner は innerHTML リセットされないため明示的に削除が必要。
  ganttInner.querySelector('.gantt-today-line')?.remove();

  if (tasks.length === 0) {
    ganttRowsEl.innerHTML =
      '<div class="no-project-msg">タスクがありません。「+ Add Task」から追加してください。</div>';
    return;
  }

  const today = fmtDate(new Date());
  const totalPx = (diffDays(chartStart, chartEnd) + 1) * pxPerDay;

  // 週末・祝日ストライプ（Day / Week モードで 1 日単位描画）
  if (viewMode === 'Day' || viewMode === 'Week') {
    let cur = new Date(chartStart);
    while (cur <= chartEnd) {
      const iso    = fmtDate(cur);
      const dow    = cur.getDay();
      const isWknd = dow === 0 || dow === 6;
      const isHol  = HOLIDAYS.has(iso);
      if (isWknd || isHol) {
        const stripe = document.createElement('div');
        // 祝日（平日）は別色。祝日 + 土日は祝日色を優先
        stripe.className = isHol ? 'gantt-holiday-stripe' : 'gantt-weekend-stripe';
        stripe.style.left  = diffDays(chartStart, cur) * pxPerDay + 'px';
        stripe.style.width = pxPerDay + 'px';
        ganttRowsEl.appendChild(stripe);
      }
      cur = addDays(cur, 1);
    }
  }

  // 今日ライン（ganttInner に配置してヘッダー〜行エリアの全高を貫通させる）
  // ganttInner は position:relative なので left 座標は週末ストライプと同じ基準になる。
  const todayPx = diffDays(chartStart, parseDate(today)) * pxPerDay;
  if (todayPx >= 0 && todayPx <= totalPx) {
    const todayLine = document.createElement('div');
    todayLine.className = 'gantt-today-line';
    todayLine.style.left = todayPx + 'px';
    // 「今日」ラベルをヘッダー直下（top: 54px = HDR_H + 4px）に配置する
    const lbl = document.createElement('div');
    lbl.className = 'gantt-today-label';
    lbl.textContent = '今日';
    todayLine.appendChild(lbl);
    ganttInner.appendChild(todayLine);
  }

  const { largeOrder, largeMap } = groupTasks(tasks);
  let rowIndex = 0;

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
        const isCritical = criticalTaskIds.has(t.id);

        // 行インデックスを記録（矢印描画で使用）
        taskRowIndexMap.set(t.id, rowIndex);

        const row = document.createElement('div');
        row.className = 'gantt-row'
          + ((isLastRow && isLastLarge) ? ' grp-end' : '');
        if (isLastRow && !isLastLarge) row.style.borderBottom = '2px solid var(--color-border)';
        ganttRowsEl.appendChild(row);

        const startD = parseDate(t.start_date);
        const endD   = parseDate(t.end_date);
        // バー左端 = チャート開始日からの経過日数 × pxPerDay（絶対配置）
        const left   = diffDays(chartStart, startD) * pxPerDay;

        if (t.task_type === 'milestone') {
          const ms = document.createElement('div');
          ms.className = 'gantt-milestone' + (isCritical ? ' is-critical' : '');
          ms.style.left = (left - 7) + 'px';
          ms.title = t.name;
          ms.addEventListener('click', () => openTaskDetail(t, ms));
          addTooltip(ms, t);
          row.appendChild(ms);
        } else {
          const width = Math.max(pxPerDay, (diffDays(startD, endD) + 1) * pxPerDay);

          const bar = document.createElement('div');
          bar.className = 'gantt-bar' + (isCritical ? ' is-critical' : '');
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

          bar.addEventListener('click', () => {
            if (!bar.classList.contains('is-dragging')) openTaskDetail(t, bar);
          });

          attachDrag(bar, t);
          addTooltip(bar, t);
          row.appendChild(bar);
        }
        rowIndex++;
      }
    }
  }

  ganttRowsEl.style.minHeight = (tasks.length * ROW_H) + 'px';
}

// ── 依存関係矢印 + クリティカルパス描画 ──────────────────────────────────
function drawDependencyArrows(tasks, criticalDepPairs) {
  // 既存 SVG を削除
  ganttInner.querySelector('.gantt-arrows-svg')?.remove();

  // 比較モードでは矢印を非表示（異なるプロジェクト間でIDが衝突する恐れがある）
  if (isMultiMode) return;

  const hasDeps = tasks.some(t => t.dependencies?.length > 0);
  if (!hasDeps) return;

  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const svgW    = (diffDays(chartStart, chartEnd) + 1) * pxPerDay;
  const svgH    = tasks.length * ROW_H + ROW_H;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('gantt-arrows-svg');
  svg.setAttribute('width',  svgW);
  svg.setAttribute('height', svgH);
  svg.style.cssText =
    `position:absolute;top:${HDR_H}px;left:0;pointer-events:none;z-index:2;overflow:visible`;

  // arrowhead マーカー定義
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <marker id="ah-normal"   markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto">
      <polygon points="0 0,7 2.5,0 5" fill="#b0b0b0"/>
    </marker>
    <marker id="ah-critical" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto">
      <polygon points="0 0,7 2.5,0 5" fill="#e74c3c"/>
    </marker>
  `;
  svg.appendChild(defs);

  for (const task of tasks) {
    if (!task.dependencies?.length) continue;
    const succIdx = taskRowIndexMap.get(task.id);
    if (succIdx === undefined) continue;

    const succY  = succIdx * ROW_H + ROW_H / 2;
    const succX  = diffDays(chartStart, parseDate(task.start_date)) * pxPerDay;

    for (const dep of task.dependencies) {
      const pred = taskMap.get(dep.depends_on_id);
      if (!pred) continue;
      const predIdx = taskRowIndexMap.get(pred.id);
      if (predIdx === undefined) continue;

      const predY  = predIdx * ROW_H + ROW_H / 2;
      const predEndX = (diffDays(chartStart, parseDate(pred.end_date)) + 1) * pxPerDay;

      const isCritical = criticalDepPairs.has(`${pred.id}__${task.id}`);
      const color   = isCritical ? '#e74c3c' : '#b0b0b0';
      const strokeW = isCritical ? 2 : 1.5;
      const marker  = isCritical ? 'url(#ah-critical)' : 'url(#ah-normal)';
      const opacity = isCritical ? '1' : '0.65';

      // エルボーコネクター: 先行 end → 後続 start
      const GAP  = 10;
      const viaX = Math.max(predEndX + GAP, succX - GAP);
      let d;
      if (viaX < succX) {
        d = `M ${predEndX},${predY} H ${viaX} V ${succY} H ${succX}`;
      } else {
        // 後続がより左にある場合はループして回り込む
        const loopY = predY < succY
          ? succY + ROW_H * 0.4
          : succY - ROW_H * 0.4;
        d = `M ${predEndX},${predY} H ${predEndX + GAP} V ${loopY} H ${succX - GAP} V ${succY} H ${succX}`;
      }

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('stroke', color);
      path.setAttribute('stroke-width', strokeW);
      path.setAttribute('fill', 'none');
      path.setAttribute('marker-end', marker);
      path.setAttribute('opacity', opacity);
      svg.appendChild(path);
    }
  }

  ganttInner.appendChild(svg);
}

// ── ドラッグ（水平方向のみ：日程変更） ───────────────────────────────────
// mousedown でドラッグ開始位置と元の left 値を記録し、
// mousemove でバーの left を追従させてビジュアルフィードバックを与える。
// mouseup でマウス移動量を pxPerDay で割って dayShift（日数）を算出し、
// API（updateDates）を呼んで DB に反映後、renderSchedule で再描画する。
// document にリスナーを登録することでバーの外にカーソルが出ても追従し続ける。
function attachDrag(bar, task) {
  if (isMultiMode) return; // 比較モードはドラッグ無効
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
// scrollSyncing フラグで再帰的なイベント発火を防ぐ。
// 片方のスクロールイベントから scrollTop を変更すると
// もう片方の scroll イベントが発火して無限ループになるため、
// フラグが true の間は処理をスキップして二重同期を防ぐ。
// hierPane は CSS で align-items: flex-start が設定されているため
// overflow-y: scroll が有効に機能し、scrollTop の同期が正しく動作する。
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
// チャート範囲を全タスクの min/max 日付から計算する。
// chartStart: 最早 start_date の月曜日から 1 週間前（左マージン）
// chartEnd:   最遅 end_date から 3 週間後（右マージン）
// 週単位でマージンを加えることでチャートの端にタスクが張り付かず見やすくなる。
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

  const { criticalTaskIds, criticalDepPairs } = isMultiMode
    ? { criticalTaskIds: new Set(), criticalDepPairs: new Set() }
    : calculateCriticalPath(tasks);
  currentCriticalTaskIds = criticalTaskIds;

  buildDateHeader();
  buildHierarchyPane(tasks, criticalTaskIds);
  buildGanttBars(tasks, criticalTaskIds);
  drawDependencyArrows(tasks, criticalDepPairs);

  // 今日へスクロール
  if (cachedConfig?.auto_scroll_today !== false) {
    const todayPx = diffDays(chartStart, parseDate(fmtDate(new Date()))) * pxPerDay;
    if (todayPx > 0) {
      setTimeout(() => { ganttPane.scrollLeft = Math.max(0, todayPx - 200); }, 50);
    }
  }
}

// ── Task Detail Panel ─────────────────────────────────────────────────────
let _closeDetailOutside = null;

// タスク詳細ポップオーバーをアンカー要素の右隣に配置する。
// 1. まず left/top を -9999px に設定して画面外に仮配置し、ブラウザにレイアウトを確定させる。
//    この手順を踏まないと offsetWidth / offsetHeight が 0 のまま実サイズを取得できない。
// 2. requestAnimationFrame 後（1フレーム後）に offsetWidth / offsetHeight を計測し、
//    アンカー要素の右隣（rect.right + margin）に配置する。
//    垂直方向はアンカー要素の中央に合わせる。
// 3. 右にはみ出す場合は左側に折り返し、左右・上下をウィンドウ内にクランプする。
function positionDetailPopover(anchorEl) {
  // まず画面外に仮配置してレイアウトを確定させる
  taskDetailPanel.style.left = '-9999px';
  taskDetailPanel.style.top  = '-9999px';

  // 1フレーム後に実サイズを計測して正確に配置
  requestAnimationFrame(() => {
    const rect   = anchorEl.getBoundingClientRect();
    const PW     = taskDetailPanel.offsetWidth;
    const PH     = taskDetailPanel.offsetHeight;
    const margin = 10;
    const vw     = window.innerWidth;
    const vh     = window.innerHeight;

    // 要素の右隣に表示（垂直方向は要素の中央に合わせる）
    let x = rect.right + margin;
    let y = rect.top + rect.height / 2 - PH / 2;

    // 右にはみ出る場合は要素の左に表示
    if (x + PW + margin > vw) {
      x = rect.left - PW - margin;
    }
    // 左右・上下クランプ
    x = Math.max(margin, Math.min(x, vw - PW - margin));
    y = Math.max(margin, Math.min(y, vh - PH - margin));

    taskDetailPanel.style.left = x + 'px';
    taskDetailPanel.style.top  = y + 'px';
  });
}

// isMultiMode（比較モード / フィルターモード）の場合は全入力を disabled にして
// 読み取り専用にする。送信ボタン・削除ボタン・依存関係行も非表示にする。
// これにより複数プロジェクトを跨いだ誤った編集を防ぐ。
function openTaskDetail(task, anchorEl = null) {
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

  // クリティカルパス表示
  const critEl = document.getElementById('detail-is-critical');
  const isCritical = currentCriticalTaskIds.has(task.id);
  critEl.textContent = isCritical ? '⚠ クリティカルパス上にあります' : '対象外';
  critEl.className   = 'critical-badge ' + (isCritical ? 'critical-badge--yes' : 'critical-badge--no');

  // 前工程（依存タスク）チェックリスト
  const depList    = document.getElementById('detail-dep-list');
  const currentDepIds = new Set((task.dependencies || []).map(d => d.depends_on_id));
  const otherTasks = currentTasks.filter(t => t.id !== task.id);

  if (otherTasks.length === 0) {
    depList.innerHTML = '<span class="dep-empty">他にタスクがありません</span>';
  } else {
    // 大項目でグループ化
    const groups = {};
    for (const t of otherTasks) {
      const key = t.category_large || '(未分類)';
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    }
    depList.innerHTML = Object.entries(groups).map(([grp, tasks]) => `
      <div class="dep-group">
        <div class="dep-group__label">${escHtml(grp)}</div>
        ${tasks.map(t => `
          <label class="dep-item">
            <input type="checkbox" name="dep_id" value="${t.id}"${currentDepIds.has(t.id) ? ' checked' : ''}>
            <span class="dep-item__name">${t.category_medium ? escHtml(t.category_medium) + ' › ' : ''}${escHtml(t.name)}</span>
          </label>
        `).join('')}
      </div>
    `).join('');
  }

  // 比較モード: 読み取り専用（編集・削除不可）
  taskDetailPanel.querySelectorAll('input,textarea,select').forEach(el => {
    el.disabled = isMultiMode;
  });
  taskDetailForm.querySelector('[type="submit"]').hidden = isMultiMode;
  btnDeleteTask.hidden = isMultiMode;
  const depRow = taskDetailPanel.querySelector('.form-row--deps');
  if (depRow) depRow.hidden = isMultiMode;

  taskDetailPanel.hidden = false;
  if (anchorEl) positionDetailPopover(anchorEl);

  // 既存の外クリックリスナーを解除してから再登録
  if (_closeDetailOutside) document.removeEventListener('click', _closeDetailOutside);
  _closeDetailOutside = null;
  setTimeout(() => {
    _closeDetailOutside = (ev) => {
      if (!taskDetailPanel.contains(ev.target)) {
        taskDetailPanel.hidden = true;
        document.removeEventListener('click', _closeDetailOutside);
        _closeDetailOutside = null;
      }
    };
    document.addEventListener('click', _closeDetailOutside);
  }, 0);
}

btnCloseDetail.addEventListener('click', () => {
  taskDetailPanel.hidden = true;
  if (_closeDetailOutside) { document.removeEventListener('click', _closeDetailOutside); _closeDetailOutside = null; }
});

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
  const checkedDeps = taskDetailPanel.querySelectorAll('input[name="dep_id"]:checked');
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
    dependency_ids: Array.from(checkedDeps).map(cb => parseInt(cb.value)),
  };
  try {
    const updated = await api.updateTask(currentPid, tid, data);
    const idx = currentTasks.findIndex(t => t.id === tid);
    if (idx !== -1) currentTasks[idx] = updated;
    renderSchedule(currentTasks);
    taskDetailPanel.hidden = true;
    if (_closeDetailOutside) { document.removeEventListener('click', _closeDetailOutside); _closeDetailOutside = null; }
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
    if (_closeDetailOutside) { document.removeEventListener('click', _closeDetailOutside); _closeDetailOutside = null; }
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
  if (!addTaskModal.hidden)   { addTaskModal.hidden = true; return; }
  if (!taskDetailPanel.hidden) {
    taskDetailPanel.hidden = true;
    if (_closeDetailOutside) { document.removeEventListener('click', _closeDetailOutside); _closeDetailOutside = null; }
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────
function toggleEndDateRow(form, isMilestone) {
  const rowId = form === taskDetailForm ? 'detail-end-date-row' : 'add-end-date-row';
  const row   = document.getElementById(rowId);
  if (row) row.hidden = isMilestone;
}

// ── Boot: Config → Project 読み込み ───────────────────────────────────────
// IIFE（即時実行関数）として async で起動する。
// 1. まず Config を取得してテーマを適用する（失敗しても継続）。
// 2. isMultiMode の場合:
//    - 複数プロジェクトを Promise.all で並列取得してマージする。
//    - isCatfilterMode が true の場合は catfilter に合致する category_large を持つ
//      タスクのみ抽出し、大項目にプロジェクト名を前置してグループ化する。
//    - 編集・追加・エクスポート系ボタンを非表示にして読み取り専用にする。
// 3. 単一プロジェクトモードの場合:
//    - project と tasks を Promise.all で並列取得して renderSchedule に渡す。
//    - プロジェクト固有の view_mode があれば優先し、なければ Global Config の
//      default_view_mode を使用する。
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
    if (isMultiMode) {
      // ── 複数プロジェクト比較 / 大項目フィルターモード ────────────────────
      LOG.info('Multi-mode: pids=', _pidsMulti, 'catfilter=', _catfilter);
      const results = await Promise.all(
        _pidsMulti.map(id => Promise.all([api.getProject(id), api.listTasks(id)]))
      );
      const projectNames = results.map(([p]) => p.name);
      const allTasks = [];
      for (const [project, tasks] of results) {
        // 大項目フィルターが指定されている場合は合致するタスクのみ抽出
        const filteredTasks = isCatfilterMode
          ? tasks.filter(t => _catfilter.includes(t.category_large ?? ''))
          : tasks;
        for (const t of filteredTasks) {
          allTasks.push({
            ...t,
            // 大項目にプロジェクト名を前置してグループ化
            category_large: `[${project.name}]${t.category_large ? ' ' + t.category_large : ''}`,
            _project_id: project.id,
          });
        }
      }

      if (isCatfilterMode) {
        const catLabel = _catfilter.slice(0, 2).join('・') + (_catfilter.length > 2 ? '…' : '');
        projectNameEl.textContent = `🔍 ${catLabel}`;
        document.title = `フィルター: ${catLabel} - opeSchedule`;
      } else {
        projectNameEl.textContent = '📊 ' + projectNames.join('  ＋  ');
        const titleProjects = projectNames.slice(0, 2).join(' / ') + (projectNames.length > 2 ? '…' : '');
        document.title = `比較: ${titleProjects} - opeSchedule`;
      }

      currentTasks = allTasks;
      btnAddTask.hidden    = true;
      btnExportJson.hidden = true;
      btnExportCsv.hidden  = true;
      if (cachedConfig?.default_view_mode) viewMode = cachedConfig.default_view_mode;
      updateViewModeBtns();
      initScrollSync();
      renderSchedule(allTasks);
      LOG.info('Multi-mode Boot 完了, tasks:', allTasks.length);
    } else {
      // ── 単一プロジェクトモード ──────────────────────────────────────────
      const [project, tasks] = await Promise.all([
        api.getProject(currentPid),
        api.listTasks(currentPid),
      ]);
      LOG.info('Project:', project, '/ Tasks:', tasks.length);
      projectNameEl.textContent = project.name;
      document.title = `${project.name} - opeSchedule`;
      currentTasks = tasks;

      if (project.view_mode)                    viewMode = project.view_mode;
      else if (cachedConfig?.default_view_mode) viewMode = cachedConfig.default_view_mode;
      updateViewModeBtns();

      initScrollSync();
      renderSchedule(tasks);
      LOG.info('Boot 完了');
    }
  } catch (ex) {
    LOG.error('Project/Tasks 読み込みエラー:', ex);
    ganttRowsEl.innerHTML =
      `<div class="no-project-msg">読み込みエラー: ${ex.message}</div>`;
  }
})();
