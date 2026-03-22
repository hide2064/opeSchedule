import { useState, useEffect, useRef, useCallback } from 'react';
import { diffDays, parseDate } from '../../utils.js';

// ── インラインエディタ ─────────────────────────────────────────────────────
// ダブルクリック直後にクリック位置に表示される入力欄。
// Enter で保存、Esc でキャンセル。
export function AnnotationEditor({ x, y, onSave, onCancel }) {
  const [text, setText] = useState('');
  const ref = useRef(null);

  useEffect(() => { ref.current?.focus(); }, []);

  const commit = useCallback(() => {
    const t = text.trim();
    if (t) onSave(t);
    else   onCancel();
  }, [text, onSave, onCancel]);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { onCancel(); }
    else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
  };

  return (
    <div
      className="gantt-annotation-editor"
      style={{ position: 'absolute', left: x, top: y, zIndex: 50 }}
      // 付箋エディタ自体のクリック/ダブルクリックが gantt-rows に伝播しないよう阻止
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <textarea
        ref={ref}
        className="gantt-annotation-editor__input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        placeholder="コメントを入力..."
        rows={2}
      />
      <div className="gantt-annotation-editor__hint">Enter で保存 / Esc でキャンセル</div>
    </div>
  );
}

// ── 付箋 1 枚 ─────────────────────────────────────────────────────────────
function Annotation({ annotation, chartStart, pxPerDay, onDelete }) {
  const left = diffDays(chartStart, parseDate(annotation.anno_date)) * pxPerDay;
  const top  = annotation.y_offset;

  return (
    <div
      className="gantt-annotation"
      style={{ position: 'absolute', left, top }}
      // 付箋クリック/ダブルクリックが gantt-rows に伝播しないよう阻止
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="gantt-annotation__header">
        <span className="gantt-annotation__text">{annotation.text}</span>
        <button
          className="gantt-annotation__del"
          onClick={() => onDelete(annotation.id)}
          title="削除"
        >✕</button>
      </div>
      <div className="gantt-annotation__date">{annotation.anno_date}</div>
    </div>
  );
}

// ── 付箋一覧 ──────────────────────────────────────────────────────────────
export default function GanttAnnotations({ annotations, chartStart, pxPerDay, onDelete }) {
  return (
    <>
      {annotations.map(a => (
        <Annotation
          key={a.id}
          annotation={a}
          chartStart={chartStart}
          pxPerDay={pxPerDay}
          onDelete={onDelete}
        />
      ))}
    </>
  );
}
