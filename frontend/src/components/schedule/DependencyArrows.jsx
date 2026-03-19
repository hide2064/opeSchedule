import { parseDate, diffDays } from '../../utils.js';
import { ROW_H, HDR_H } from '../../constants.js';

export default function DependencyArrows({ tasks, criticalDepPairs, taskRowIndexMap, chartStart, pxPerDay, isMultiMode, totalWidth, totalRows }) {
  if (isMultiMode) return null;
  const hasDeps = tasks.some(t => t.dependencies?.length > 0);
  if (!hasDeps) return null;

  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const svgH    = totalRows * ROW_H + ROW_H;
  const paths   = [];

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
      const predY    = predIdx * ROW_H + ROW_H / 2;
      const predEndX = (diffDays(chartStart, parseDate(pred.end_date)) + 1) * pxPerDay;

      const isCritical = criticalDepPairs.has(`${pred.id}__${task.id}`);
      const color   = isCritical ? '#e74c3c' : '#b0b0b0';
      const strokeW = isCritical ? 2 : 1.5;
      const marker  = isCritical ? 'url(#ah-critical)' : 'url(#ah-normal)';
      const opacity = isCritical ? '1' : '0.65';

      const GAP  = 10;
      const viaX = Math.max(predEndX + GAP, succX - GAP);
      let d;
      if (viaX < succX) {
        d = `M ${predEndX},${predY} H ${viaX} V ${succY} H ${succX}`;
      } else {
        const loopY = predY < succY ? succY + ROW_H * 0.4 : succY - ROW_H * 0.4;
        d = `M ${predEndX},${predY} H ${predEndX + GAP} V ${loopY} H ${succX - GAP} V ${succY} H ${succX}`;
      }

      paths.push(
        <path key={`${pred.id}-${task.id}`} d={d}
          stroke={color} strokeWidth={strokeW} fill="none"
          markerEnd={marker} opacity={opacity}
        />
      );
    }
  }

  return (
    <svg
      className="gantt-arrows-svg"
      width={totalWidth}
      height={svgH}
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 2, overflow: 'visible' }}
    >
      <defs>
        <marker id="ah-normal"   markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto">
          <polygon points="0 0,7 2.5,0 5" fill="#b0b0b0" />
        </marker>
        <marker id="ah-critical" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto">
          <polygon points="0 0,7 2.5,0 5" fill="#e74c3c" />
        </marker>
      </defs>
      {paths}
    </svg>
  );
}
