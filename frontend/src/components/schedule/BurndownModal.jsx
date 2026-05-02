/**
 * BurndownModal — バーンダウンチャート (B-3)
 *
 * 現在のタスク一覧から「計画バーンダウン」と「実績バーンダウン」を描画する。
 * - X軸: プロジェクト開始日 〜 最終タスク終了日
 * - Y軸: 残タスク数（または残日数）
 * - 計画ライン: 全タスクが予定通りに完了する場合の理想曲線（線形）
 * - 実績ライン: 各タスクの progress と end_date に基づいた実績
 */
import { useMemo, useRef, useEffect } from 'react';
import Modal from '../common/Modal.jsx';

// ── 定数 ──────────────────────────────────────────────────────────────────
const W = 600;  // SVG 幅
const H = 320;  // SVG 高さ
const PAD = { top: 20, right: 24, bottom: 48, left: 52 };
const CHART_W = W - PAD.left - PAD.right;
const CHART_H = H - PAD.top  - PAD.bottom;

// ── ユーティリティ ────────────────────────────────────────────────────────
function isoToDate(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function diffDays(a, b) {
  return Math.round((b - a) / 86400000);
}
function fmtDate(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

// ── チャートデータ計算 ────────────────────────────────────────────────────
function computeBurndown(tasks) {
  const realTasks = tasks.filter(t => t.task_type === 'task' && !t._isSep);
  if (realTasks.length === 0) return null;

  const startDates = realTasks.map(t => isoToDate(t.start_date)).filter(Boolean);
  const endDates   = realTasks.map(t => isoToDate(t.end_date)).filter(Boolean);

  const projectStart = new Date(Math.min(...startDates));
  const projectEnd   = new Date(Math.max(...endDates));
  const today        = new Date(); today.setHours(0,0,0,0);
  const totalDays    = diffDays(projectStart, projectEnd);
  const totalTasks   = realTasks.length;

  if (totalDays <= 0 || totalTasks === 0) return null;

  // 理想ライン（線形: 初日 = totalTasks, 最終日 = 0）
  const idealPoints = [
    { day: 0,         remaining: totalTasks },
    { day: totalDays, remaining: 0 },
  ];

  // 実績ライン: 各日付で完了済みタスク数を積算
  // タスクが完了(progress >= 1.0) && end_date が過去 → その end_date で 1 減る
  const completionDays = realTasks
    .filter(t => t.progress >= 1.0 && isoToDate(t.end_date) <= today)
    .map(t => diffDays(projectStart, isoToDate(t.end_date)))
    .sort((a, b) => a - b);

  let remaining = totalTasks;
  const actualPoints = [{ day: 0, remaining }];
  for (const day of completionDays) {
    remaining--;
    if (day >= 0 && day <= totalDays) {
      actualPoints.push({ day, remaining });
    }
  }
  // 今日を終端に追加（まだ未完了タスクが残っている場合）
  const todayDay = Math.min(diffDays(projectStart, today), totalDays);
  if (todayDay > 0 && todayDay <= totalDays) {
    actualPoints.push({ day: todayDay, remaining });
  }

  return { projectStart, projectEnd, totalDays, totalTasks, idealPoints, actualPoints, today };
}

// ── SVG チャート描画 ──────────────────────────────────────────────────────
function BurndownChart({ tasks }) {
  const data = useMemo(() => computeBurndown(tasks), [tasks]);

  if (!data) {
    return (
      <div className="burndown-empty">
        バーンダウンチャートを表示するにはタスクが必要です。
      </div>
    );
  }

  const { totalDays, totalTasks, idealPoints, actualPoints, projectStart, projectEnd, today } = data;

  // スケール関数
  const scaleX = (day)       => PAD.left + (day / totalDays) * CHART_W;
  const scaleY = (remaining) => PAD.top  + ((totalTasks - remaining) / totalTasks) * CHART_H;
  // ↑ Y軸は「残タスク数」を反転（上が0、下が totalTasks）
  const scaleYPure = (remaining) => PAD.top + (remaining / totalTasks) * CHART_H;
  // 残タスクチャート: 上が totalTasks、下が 0
  const sy = (r) => PAD.top + ((totalTasks - r) / totalTasks) * CHART_H;

  // 軸目盛
  const xTicks = [];
  const step = Math.max(1, Math.ceil(totalDays / 6));
  for (let d = 0; d <= totalDays; d += step) {
    const date = new Date(projectStart);
    date.setDate(date.getDate() + d);
    xTicks.push({ day: d, label: fmtDate(date).slice(5) }); // MM-DD
  }
  const yTicks = [];
  const yStep = Math.max(1, Math.ceil(totalTasks / 5));
  for (let r = 0; r <= totalTasks; r += yStep) {
    yTicks.push(r);
  }

  // Polyline ポイント文字列
  const toPoints = (pts) => pts.map(p => `${scaleX(p.day).toFixed(1)},${sy(p.remaining).toFixed(1)}`).join(' ');

  // 今日ライン
  const todayDay   = Math.max(0, Math.min(totalDays, diffDays(projectStart, today)));
  const todayX     = scaleX(todayDay);

  return (
    <svg width={W} height={H} style={{ overflow: 'visible', display: 'block' }}>
      {/* 背景 */}
      <rect x={PAD.left} y={PAD.top} width={CHART_W} height={CHART_H}
        fill="var(--color-bg-subtle, #f8f8f8)" stroke="var(--color-border, #ddd)" strokeWidth={1} rx={4} />

      {/* Y 軸グリッド & 目盛 */}
      {yTicks.map(r => {
        const y = sy(r);
        return (
          <g key={r}>
            <line x1={PAD.left} y1={y} x2={PAD.left + CHART_W} y2={y}
              stroke="var(--color-border, #e0e0e0)" strokeWidth={1} strokeDasharray="3,3" />
            <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize={10} fill="#888">{r}</text>
          </g>
        );
      })}

      {/* X 軸目盛 */}
      {xTicks.map(({ day, label }) => (
        <text key={day} x={scaleX(day)} y={PAD.top + CHART_H + 16}
          textAnchor="middle" fontSize={10} fill="#888">{label}</text>
      ))}

      {/* 今日ライン */}
      {todayDay >= 0 && todayDay <= totalDays && (
        <line x1={todayX} y1={PAD.top} x2={todayX} y2={PAD.top + CHART_H}
          stroke="#ff9800" strokeWidth={1.5} strokeDasharray="4,2" />
      )}

      {/* 理想ライン (青、破線) */}
      <polyline
        points={toPoints(idealPoints)}
        fill="none"
        stroke="#4A90D9"
        strokeWidth={2}
        strokeDasharray="6,3"
        opacity={0.7}
      />

      {/* 実績ライン (緑/赤 — 理想より上なら遅延) */}
      <polyline
        points={toPoints(actualPoints)}
        fill="none"
        stroke="#43a047"
        strokeWidth={2.5}
      />

      {/* 実績ポイント */}
      {actualPoints.map((p, i) => (
        <circle key={i} cx={scaleX(p.day)} cy={sy(p.remaining)} r={4}
          fill="#43a047" stroke="#fff" strokeWidth={1.5} />
      ))}

      {/* 軸ラベル */}
      <text x={PAD.left - 36} y={PAD.top + CHART_H / 2} textAnchor="middle"
        fontSize={11} fill="#555" transform={`rotate(-90,${PAD.left - 36},${PAD.top + CHART_H / 2})`}>
        残タスク数
      </text>
      <text x={PAD.left + CHART_W / 2} y={H - 4} textAnchor="middle" fontSize={11} fill="#555">
        日付
      </text>

      {/* 今日ラベル */}
      {todayDay >= 0 && todayDay <= totalDays && (
        <text x={todayX + 4} y={PAD.top + 12} fontSize={10} fill="#ff9800">今日</text>
      )}

      {/* 凡例 */}
      <g transform={`translate(${PAD.left + CHART_W - 120}, ${PAD.top + 4})`}>
        <line x1={0} y1={8} x2={20} y2={8} stroke="#4A90D9" strokeWidth={2} strokeDasharray="4,2" />
        <text x={24} y={12} fontSize={10} fill="#555">理想</text>
        <line x1={0} y1={24} x2={20} y2={24} stroke="#43a047" strokeWidth={2} />
        <circle cx={10} cy={24} r={4} fill="#43a047" />
        <text x={24} y={28} fontSize={10} fill="#555">実績</text>
      </g>
    </svg>
  );
}

// ── メインコンポーネント ──────────────────────────────────────────────────
export default function BurndownModal({ tasks, project, onClose }) {
  const realTasks = tasks.filter(t => t.task_type === 'task' && !t._isSep);
  const completed = realTasks.filter(t => t.progress >= 1.0).length;
  const data      = useMemo(() => computeBurndown(tasks), [tasks]);

  return (
    <Modal title={`📉 バーンダウンチャート — ${project?.name ?? ''}`} onClose={onClose} width={680}>
      {/* サマリー */}
      {data && (
        <div className="burndown-summary">
          <div className="burndown-stat">
            <span className="burndown-stat__label">総タスク数</span>
            <span className="burndown-stat__val">{realTasks.length}</span>
          </div>
          <div className="burndown-stat">
            <span className="burndown-stat__label">完了</span>
            <span className="burndown-stat__val burndown-stat__val--done">{completed}</span>
          </div>
          <div className="burndown-stat">
            <span className="burndown-stat__label">残り</span>
            <span className="burndown-stat__val burndown-stat__val--remain">{realTasks.length - completed}</span>
          </div>
          <div className="burndown-stat">
            <span className="burndown-stat__label">進捗</span>
            <span className="burndown-stat__val">{realTasks.length > 0 ? Math.round((completed / realTasks.length) * 100) : 0}%</span>
          </div>
        </div>
      )}

      <div className="burndown-chart-wrap">
        <BurndownChart tasks={tasks} />
      </div>
    </Modal>
  );
}
