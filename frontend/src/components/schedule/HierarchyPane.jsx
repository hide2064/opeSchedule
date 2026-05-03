import { useState } from 'react';
import { ROW_H } from '../../constants.js';

const SEP_KEY = '\x00sep:';
const NS_RE   = /^\x00\d+:/;  // "\x00{projectId}:" プレフィックスを除去するための正規表現
const TODAY_STR = new Date().toISOString().slice(0, 10);

function stripNs(name) {
  return name.replace(NS_RE, '');
}

export default function HierarchyPane({ groupedTasks, criticalTaskIds, onTaskClick }) {
  const { largeOrder, largeMap } = groupedTasks;

  const [widths, setWidths] = useState(() => {
    const defaults = { large: 88, medium: 78, small: 144 };
    try {
      const saved = localStorage.getItem('opeschedule_hier_widths');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (
          typeof parsed === 'object' && parsed !== null &&
          Number.isFinite(parsed.large) && Number.isFinite(parsed.medium) && Number.isFinite(parsed.small)
        ) return parsed;
      }
    } catch(e) {}
    return defaults;
  });

  const handleResizeStart = (e, key) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = widths[key];

    const onMouseMove = (ev) => {
      const newWidth = Math.max(40, startWidth + (ev.clientX - startX));
      setWidths(prev => {
        const next = { ...prev, [key]: newWidth };
        localStorage.setItem('opeschedule_hier_widths', JSON.stringify(next));
        return next;
      });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
  };

  const largeCells = [];
  const medCells   = [];
  const smallCells = [];

  for (let li = 0; li < largeOrder.length; li++) {
    const largeName = largeOrder[li];
    const grp = largeMap.get(largeName);
    const { medOrder, medMap } = grp;
    const isLastLarge = li === largeOrder.length - 1;

    // ── プロジェクトセパレーター行 ──────────────────────────────────
    if (largeName.startsWith(SEP_KEY)) {
      const sepTask = medMap.get('')?.[0];
      const projColor = sepTask?._projColor || '#4A90D9';
      const projName  = sepTask?._projName  || '';

      // 大項目列：カラー帯 + プロジェクト名
      largeCells.push(
        <div
          key={`sep-l-${li}`}
          className="hier-cell-sep hier-cell-sep--main"
          style={{
            height: ROW_H,
            borderLeft: `4px solid ${projColor}`,
            background: `linear-gradient(90deg, ${projColor}22 0%, ${projColor}08 60%, transparent 100%)`,
          }}
        >
          <span className="hier-cell-sep__dot" style={{ background: projColor }} />
          <span className="hier-cell-sep__name" title={projName}>{projName}</span>
        </div>
      );
      // 中項目列・小項目列: 同じ背景帯を継続させる
      medCells.push(
        <div
          key={`sep-m-${li}`}
          className="hier-cell-sep hier-cell-sep--fill"
          style={{
            height: ROW_H,
            background: `linear-gradient(90deg, ${projColor}08 0%, transparent 100%)`,
          }}
        />
      );
      smallCells.push(
        <div
          key={`sep-s-${li}`}
          className="hier-cell-sep hier-cell-sep--fill"
          style={{
            height: ROW_H,
            background: `linear-gradient(90deg, ${projColor}08 0%, transparent 100%)`,
          }}
        />
      );
      continue;
    }

    // ── 通常の大項目セル ────────────────────────────────────────────────
    const totalRows = medOrder.reduce((s, m) => s + medMap.get(m).length, 0);
    const displayLargeName = largeName.startsWith('\x00') ? stripNs(largeName) : largeName;

    largeCells.push(
      <div
        key={`l-${li}`}
        className={`hier-cell-large${isLastLarge ? ' grp-end' : ''}`}
        style={{ height: totalRows * ROW_H }}
        title={displayLargeName}
      >
        {displayLargeName || '(未分類)'}
      </div>
    );

    for (let mi = 0; mi < medOrder.length; mi++) {
      const medName  = medOrder[mi];
      const medTasks = medMap.get(medName);
      const isLastMed = mi === medOrder.length - 1;

      medCells.push(
        <div
          key={`m-${li}-${mi}`}
          className={`hier-cell-medium${isLastMed && isLastLarge ? ' grp-end' : ''}`}
          style={{
            height: medTasks.length * ROW_H,
            ...(isLastMed && !isLastLarge ? { borderBottom: '2px solid var(--color-border)' } : {}),
          }}
          title={medName}
        >
          {medName || '(未分類)'}
        </div>
      );

      for (let ti = 0; ti < medTasks.length; ti++) {
        const t = medTasks[ti];
        const isLastRow = ti === medTasks.length - 1 && isLastMed;
        smallCells.push(
          <div
            key={`s-${t.id}`}
            className={[
              'hier-cell-small',
              t.task_type === 'milestone' ? 'is-milestone' : '',
              criticalTaskIds.has(t.id) ? 'is-critical' : '',
              isLastRow && isLastLarge ? 'grp-end' : '',
            ].filter(Boolean).join(' ')}
            style={isLastRow && !isLastLarge ? { borderBottom: '2px solid var(--color-border)' } : {}}
            title={t.name}
            onClick={(e) => onTaskClick(t, e.currentTarget)}
          >
            {t.task_type === 'milestone'
              ? <><span className="ms-icon">◆</span>{t.name}</>
              : <>{t.name}{t.progress < 1.0 && t.end_date < TODAY_STR && <span className="overdue-mark" title="期限超過">⚠</span>}</>
            }
          </div>
        );
      }
    }
  }

  return (
    <>
      <div className="hier-col hier-col--large" style={{ width: widths.large, minWidth: widths.large, maxWidth: widths.large }}>
        <div className="hier-header">大項目</div>
        {largeCells}
        <div className="hier-col-resizer" onMouseDown={(e) => handleResizeStart(e, 'large')} />
      </div>
      <div className="hier-col hier-col--medium" style={{ width: widths.medium, minWidth: widths.medium, maxWidth: widths.medium }}>
        <div className="hier-header">中項目</div>
        {medCells}
        <div className="hier-col-resizer" onMouseDown={(e) => handleResizeStart(e, 'medium')} />
      </div>
      <div className="hier-col hier-col--small" style={{ width: widths.small, minWidth: widths.small, maxWidth: widths.small }}>
        <div className="hier-header">小項目</div>
        {smallCells}
        <div className="hier-col-resizer" onMouseDown={(e) => handleResizeStart(e, 'small')} />
      </div>
    </>
  );
}
