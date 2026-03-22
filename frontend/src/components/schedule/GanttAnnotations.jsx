import { useState, useEffect, useRef, useCallback } from 'react';
import { diffDays, parseDate } from '../../utils.js';

// カラーパレット（8色）
const COLOR_PRESETS = [
  { value: '#1a1a1a', label: '黒' },
  { value: '#c62828', label: '赤' },
  { value: '#e65100', label: 'オレンジ' },
  { value: '#2e7d32', label: '緑' },
  { value: '#1565c0', label: '青' },
  { value: '#6a1b9a', label: '紫' },
  { value: '#4e342e', label: '茶' },
  { value: '#757575', label: 'グレー' },
];

// フォントサイズプリセット
const SIZE_PRESETS = [
  { value: 11, label: 'S' },
  { value: 13, label: 'M' },
  { value: 16, label: 'L' },
];

const DEFAULT_COLOR = '#1a1a1a';
const DEFAULT_SIZE  = 13;

// ── インラインエディタ ─────────────────────────────────────────────────────
// ダブルクリック直後にクリック位置に表示される入力欄。
// Enter で保存、Esc でキャンセル。
// onSave({ text, text_color, font_size }) を呼ぶ。
export function AnnotationEditor({ x, y, onSave, onCancel }) {
  const [text,      setText]      = useState('');
  const [textColor, setTextColor] = useState(DEFAULT_COLOR);
  const [fontSize,  setFontSize]  = useState(DEFAULT_SIZE);
  const ref = useRef(null);

  useEffect(() => { ref.current?.focus(); }, []);

  const commit = useCallback(() => {
    const t = text.trim();
    if (t) onSave({ text: t, text_color: textColor, font_size: fontSize });
    else   onCancel();
  }, [text, textColor, fontSize, onSave, onCancel]);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { onCancel(); }
    else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
  };

  return (
    <div
      className="gantt-annotation-editor"
      style={{ position: 'absolute', left: x, top: y, zIndex: 50 }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {/* ツールバー: カラーパレット + サイズ選択 */}
      <div className="gantt-annotation-editor__toolbar">
        <div className="gantt-annotation-editor__swatches">
          {COLOR_PRESETS.map(c => (
            <button
              key={c.value}
              className={`gantt-annotation-editor__swatch${textColor === c.value ? ' is-active' : ''}`}
              style={{ background: c.value }}
              title={c.label}
              // onMouseDown + preventDefault でテキストエリアからフォーカスを奪わない
              onMouseDown={(e) => { e.preventDefault(); setTextColor(c.value); }}
            />
          ))}
        </div>
        <div className="gantt-annotation-editor__sizes">
          {SIZE_PRESETS.map(s => (
            <button
              key={s.value}
              className={`gantt-annotation-editor__size-btn${fontSize === s.value ? ' is-active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); setFontSize(s.value); }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <textarea
        ref={ref}
        className="gantt-annotation-editor__input"
        value={text}
        style={{ color: textColor, fontSize: fontSize }}
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
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="gantt-annotation__header">
        <span
          className="gantt-annotation__text"
          style={{
            ...(annotation.text_color ? { color: annotation.text_color } : {}),
            ...(annotation.font_size  ? { fontSize: annotation.font_size } : {}),
          }}
        >
          {annotation.text}
        </span>
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
