import { addDays, fmtDate, diffDays, mondayOf } from '../../utils.js';
import { HOLIDAYS } from '../../constants.js';

const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
const DAYS   = ['日','月','火','水','木','金','土'];

function buildDayCells(chartStart, chartEnd, pxPerDay) {
  const today  = fmtDate(new Date());
  const upper  = [];
  const lower  = [];
  let cur      = new Date(chartStart);
  let prevMon  = -1;
  let monW     = 0;
  let monIdx   = -1;

  while (cur <= chartEnd) {
    const mon = cur.getMonth();
    if (mon !== prevMon) {
      if (monIdx >= 0) upper[monIdx] = { ...upper[monIdx], width: monW };
      upper.push({ text: `${cur.getFullYear()}/${MONTHS[mon]}`, width: 0 });
      monIdx = upper.length - 1;
      monW   = 0;
      prevMon = mon;
    }
    monW += pxPerDay;

    const dow     = cur.getDay();
    const iso     = fmtDate(cur);
    const isWknd  = dow === 0 || dow === 6;
    const holName = HOLIDAYS.get(iso) ?? '';
    const cls = [
      isWknd ? 'is-weekend' : '',
      holName ? 'is-holiday' : '',
      !isWknd && !holName && iso === today ? 'is-today' : '',
    ].filter(Boolean).join(' ');
    lower.push({ text: `${cur.getDate()}${DAYS[dow]}`, width: pxPerDay, extra: cls, title: holName });
    cur = addDays(cur, 1);
  }
  if (monIdx >= 0) upper[monIdx] = { ...upper[monIdx], width: monW };
  return { upper, lower };
}

function buildWeekCells(chartStart, chartEnd, pxPerDay) {
  const today  = fmtDate(new Date());
  const upper  = [];
  const lower  = [];
  const weekPx = 7 * pxPerDay;
  let cur      = mondayOf(chartStart);
  let prevMon  = -1;
  let monW     = 0;
  let monIdx   = -1;

  while (cur <= chartEnd) {
    const mon = cur.getMonth();
    if (mon !== prevMon) {
      if (monIdx >= 0) upper[monIdx] = { ...upper[monIdx], width: monW };
      upper.push({ text: `${cur.getFullYear()}/${MONTHS[mon]}`, width: 0 });
      monIdx = upper.length - 1;
      monW   = 0;
      prevMon = mon;
    }
    monW += weekPx;

    const iso = fmtDate(cur);
    let holName = '';
    for (let d = 0; d < 7; d++) {
      const hiso = fmtDate(addDays(cur, d));
      if (HOLIDAYS.has(hiso)) { holName = HOLIDAYS.get(hiso); break; }
    }
    const cls = [iso === today ? 'is-today' : '', holName ? 'is-has-holiday' : ''].filter(Boolean).join(' ');
    lower.push({ text: `${cur.getMonth()+1}/${cur.getDate()}`, width: weekPx, extra: cls, title: holName });
    cur = addDays(cur, 7);
  }
  if (monIdx >= 0) upper[monIdx] = { ...upper[monIdx], width: monW };
  return { upper, lower };
}

function buildMonthCells(chartStart, chartEnd, pxPerDay) {
  const upper = [];
  const lower = [];
  let cur     = new Date(chartStart.getFullYear(), chartStart.getMonth(), 1);
  let prevYr  = -1;
  let yrW     = 0;
  let yrIdx   = -1;

  while (cur <= addDays(chartEnd, 31)) {
    const yr = cur.getFullYear();
    const daysInMonth = new Date(yr, cur.getMonth() + 1, 0).getDate();
    const colPx = daysInMonth * pxPerDay;

    if (yr !== prevYr) {
      if (yrIdx >= 0) upper[yrIdx] = { ...upper[yrIdx], width: yrW };
      upper.push({ text: `${yr}年`, width: 0 });
      yrIdx  = upper.length - 1;
      yrW    = 0;
      prevYr = yr;
    }
    yrW += colPx;
    lower.push({ text: MONTHS[cur.getMonth()], width: colPx });
    cur = new Date(yr, cur.getMonth() + 1, 1);
    if (cur > addDays(chartEnd, 60)) break;
  }
  if (yrIdx >= 0) upper[yrIdx] = { ...upper[yrIdx], width: yrW };
  return { upper, lower };
}

function buildQuarterCells(chartStart, chartEnd, pxPerDay) {
  const upper  = [];
  const lower  = [];
  const startQ = Math.floor(chartStart.getMonth() / 3);
  let cur      = new Date(chartStart.getFullYear(), startQ * 3, 1);
  let prevYr   = -1;
  let yrW      = 0;
  let yrIdx    = -1;

  while (cur <= addDays(chartEnd, 90)) {
    const yr = cur.getFullYear();
    const q  = Math.floor(cur.getMonth() / 3);
    const qEnd   = new Date(yr, (q + 1) * 3, 0);
    const daysInQ = diffDays(cur, qEnd) + 1;
    const colPx   = daysInQ * pxPerDay;

    if (yr !== prevYr) {
      if (yrIdx >= 0) upper[yrIdx] = { ...upper[yrIdx], width: yrW };
      upper.push({ text: `${yr}年`, width: 0 });
      yrIdx  = upper.length - 1;
      yrW    = 0;
      prevYr = yr;
    }
    yrW += colPx;
    lower.push({ text: `Q${q + 1}`, width: colPx });
    cur = new Date(yr, (q + 1) * 3, 1);
    if (cur > addDays(chartEnd, 120)) break;
  }
  if (yrIdx >= 0) upper[yrIdx] = { ...upper[yrIdx], width: yrW };
  return { upper, lower };
}

export default function DateHeader({ viewMode, chartStart, chartEnd, pxPerDay }) {
  const { upper, lower } = {
    Day:     buildDayCells,
    Week:    buildWeekCells,
    Month:   buildMonthCells,
    Quarter: buildQuarterCells,
  }[viewMode](chartStart, chartEnd, pxPerDay);

  return (
    <div className="gantt-date-header">
      <div className="gantt-date-row">
        {upper.map((c, i) => (
          <div key={i} className={`gantt-date-cell${c.extra ? ' ' + c.extra : ''}`}
               style={{ width: c.width, height: 25, flexShrink: 0 }}>
            {c.text}
          </div>
        ))}
      </div>
      <div className="gantt-date-row">
        {lower.map((c, i) => (
          <div key={i} className={`gantt-date-cell${c.extra ? ' ' + c.extra : ''}`}
               style={{ width: c.width, height: 25, flexShrink: 0 }}
               title={c.title || undefined}>
            {c.text}
          </div>
        ))}
      </div>
    </div>
  );
}
