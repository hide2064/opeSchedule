import { useState, useRef, useCallback } from 'react';
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
// 新規作成・編集の両方で使用。
// initialText / initialColor / initialSize を渡すと編集モードになる。
// onSave({ text, text_color, font_size }) を呼ぶ。
export function AnnotationEditor({ x, y, onSave, onCancel,
  initialText = '', initialColor = DEFAULT_COLOR, initialSize = DEFAULT_SIZE }) {
  const textRef  = useRef(initialText);
  const colorRef = useRef(initialColor);
  const sizeRef  = useRef(initialSize);
  const [text,      setText]      = useState(initialText);
  const [textColor, setTextColor] = useState(initialColor);
  const [fontSize,  setFontSize]  = useState(initialSize);
  const inputRef = useRef(null);

  const setFocus = useCallback((el) => {
    inputRef.current = el;
    if (el) {
      el.focus();
      // カーソルを末尾に移動
      el.selectionStart = el.selectionEnd = el.value.length;
    }
  }, []);

  const handleTextChange = (e) => {
    textRef.current = e.target.value;
    setText(e.target.value);
  };
  const handleColorClick = (value) => {
    colorRef.current = value;
    setTextColor(value);
    inputRef.current?.focus();
  };
  const handleSizeClick = (value) => {
    sizeRef.current = value;
    setFontSize(value);
    inputRef.current?.focus();
  };

  const commit = useCallback(() => {
    const t = textRef.current.trim();
    if (t) onSave({ text: t, text_color: colorRef.current, font_size: sizeRef.current });
    else   onCancel();
  }, [onSave, onCancel]);

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
      <div className="gantt-annotation-editor__toolbar">
        <div className="gantt-annotation-editor__swatches">
          {COLOR_PRESETS.map(c => (
            <button
              key={c.value}
              className={`gantt-annotation-editor__swatch${textColor === c.value ? ' is-active' : ''}`}
              style={{ background: c.value }}
              title={c.label}
              onMouseDown={(e) => { e.preventDefault(); handleColorClick(c.value); }}
            />
          ))}
        </div>
        <div className="gantt-annotation-editor__sizes">
          {SIZE_PRESETS.map(s => (
            <button
              key={s.value}
              className={`gantt-annotation-editor__size-btn${fontSize === s.value ? ' is-active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); handleSizeClick(s.value); }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <textarea
        ref={setFocus}
        className="gantt-annotation-editor__input"
        value={text}
        style={{ color: textColor, fontSize: `${fontSize}px` }}
        onChange={handleTextChange}
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
function Annotation({ annotation, chartStart, pxPerDay, onDelete, onEditRequest }) {
  const left = diffDays(chartStart, parseDate(annotation.anno_date)) * pxPerDay;
  const top  = annotation.y_offset;

  return (
    <div
      className="gantt-annotation"
      style={{ position: 'absolute', left, top }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onEditRequest(annotation, left, top);
      }}
      title="ダブルクリックで編集"
    >
      <div className="gantt-annotation__header">
        <span
          className="gantt-annotation__text"
          style={{
            color:    annotation.text_color ?? DEFAULT_COLOR,
            fontSize: `${annotation.font_size ?? DEFAULT_SIZE}px`,
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
export default function GanttAnnotations({ annotations, chartStart, pxPerDay, onDelete, onUpdate }) {
  // 編集中の付箋情報: { annotation, x, y } | null
  const [editing, setEditing] = useState(null);

  const handleEditRequest = useCallback((annotation, x, y) => {
    setEditing({ annotation, x, y });
  }, []);

  const handleEditSave = useCallback((data) => {
    if (!editing) return;
    onUpdate(editing.annotation.id, data);
    setEditing(null);
  }, [editing, onUpdate]);

  return (
    <>
      {annotations.map(a => (
        <Annotation
          key={a.id}
          annotation={a}
          chartStart={chartStart}
          pxPerDay={pxPerDay}
          onDelete={onDelete}
          onEditRequest={handleEditRequest}
        />
      ))}
      {/* 編集エディタ（対象付箋と同じ位置に重ねて表示） */}
      {editing && (
        <AnnotationEditor
          x={editing.x}
          y={editing.y}
          initialText={editing.annotation.text}
          initialColor={editing.annotation.text_color ?? DEFAULT_COLOR}
          initialSize={editing.annotation.font_size ?? DEFAULT_SIZE}
          onSave={handleEditSave}
          onCancel={() => setEditing(null)}
        />
      )}
    </>
  );
}
