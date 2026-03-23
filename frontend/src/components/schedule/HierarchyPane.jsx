import { ROW_H } from '../../constants.js';

const SEP_KEY = '\x00sep:';
const NS_RE   = /^\x00\d+:/;  // "\x00{projectId}:" プレフィックスを除去するための正規表現

function stripNs(name) {
  return name.replace(NS_RE, '');
}

export default function HierarchyPane({ groupedTasks, criticalTaskIds, onTaskClick }) {
  const { largeOrder, largeMap } = groupedTasks;

  const largeCells = [];
  const medCells   = [];
  const smallCells = [];

  for (let li = 0; li < largeOrder.length; li++) {
    const largeName = largeOrder[li];
    const grp = largeMap.get(largeName);
    const { medOrder, medMap } = grp;
    const isLastLarge = li === largeOrder.length - 1;

    // ── プロジェクトセパレーター行 ──────────────────────────────────────
    if (largeName.startsWith(SEP_KEY)) {
      const sepTask = medMap.get('')?.[0];
      largeCells.push(
        <div key={`sep-l-${li}`} className="hier-cell-sep" style={{ height: ROW_H }}>
          <span className="hier-cell-sep__dot" style={{ background: sepTask?._projColor }} />
          {sepTask?._projName}
        </div>
      );
      medCells.push(
        <div key={`sep-m-${li}`} className="hier-cell-sep hier-cell-sep--empty" style={{ height: ROW_H }} />
      );
      smallCells.push(
        <div key={`sep-s-${li}`} className="hier-cell-sep hier-cell-sep--empty" style={{ height: ROW_H }} />
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
              : t.name
            }
          </div>
        );
      }
    }
  }

  return (
    <>
      <div className="hier-col hier-col--large">
        <div className="hier-header">大項目</div>
        {largeCells}
      </div>
      <div className="hier-col hier-col--medium">
        <div className="hier-header">中項目</div>
        {medCells}
      </div>
      <div className="hier-col hier-col--small">
        <div className="hier-header">小項目</div>
        {smallCells}
      </div>
    </>
  );
}
