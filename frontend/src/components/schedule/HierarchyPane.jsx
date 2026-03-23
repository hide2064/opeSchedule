import { useState, useRef } from 'react';
import { ROW_H } from '../../constants.js';

export default function HierarchyPane({ groupedTasks, criticalTaskIds, onTaskClick }) {
  const { largeOrder, largeMap } = groupedTasks;

  // 大項目名 → 選択色 のマップ
  const [largeColors, setLargeColors] = useState({});
  const colorInputRef = useRef(null);
  const pickerTarget  = useRef(null);   // 現在編集中の大項目名

  function openPicker(largeName) {
    pickerTarget.current = largeName;
    colorInputRef.current.value = largeColors[largeName] || '#e8f0fb';
    colorInputRef.current.click();
  }

  const largeCells = [];
  const medCells   = [];
  const smallCells = [];

  for (let li = 0; li < largeOrder.length; li++) {
    const largeName   = largeOrder[li];
    const grp         = largeMap.get(largeName);
    const { medOrder, medMap } = grp;
    const isLastLarge = li === largeOrder.length - 1;
    const totalRows   = medOrder.reduce((s, m) => s + medMap.get(m).length, 0);
    const rowBg       = largeColors[largeName];

    largeCells.push(
      <div
        key={`l-${li}`}
        className={`hier-cell-large${isLastLarge ? ' grp-end' : ''}`}
        style={{ height: totalRows * ROW_H, padding: 0 }}
      >
        <button
          className="hier-large-btn"
          onClick={() => openPicker(largeName)}
          title={`${largeName || '(未分類)'} — クリックで配下行の背景色を変更`}
        >
          {rowBg && <span className="hier-large-btn__swatch" style={{ background: rowBg }} />}
          {largeName || '(未分類)'}
        </button>
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
            style={{
              ...(rowBg ? { background: rowBg } : {}),
              ...(isLastRow && !isLastLarge ? { borderBottom: '2px solid var(--color-border)' } : {}),
            }}
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
      {/* 非表示カラーインプット — openPicker() から programmatically click する */}
      <input
        ref={colorInputRef}
        type="color"
        style={{ position: 'fixed', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
        onChange={(e) => {
          const name = pickerTarget.current;
          if (name != null) setLargeColors(prev => ({ ...prev, [name]: e.target.value }));
        }}
      />

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
