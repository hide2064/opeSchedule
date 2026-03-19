import { useEffect, useRef, useState } from 'react';
import * as api from '../../api.js';
import { useToast } from '../../contexts/ToastContext.jsx';

export default function TaskDetailPanel({ task, allTasks, currentPid, criticalTaskIds, isMultiMode, anchorEl, onClose, onUpdated, onDeleted }) {
  const showToast = useToast();
  const panelRef  = useRef(null);
  const [pos, setPos] = useState({ left: -9999, top: -9999 });
  const [form, setForm] = useState({
    category_large:  task.category_large  ?? '',
    category_medium: task.category_medium ?? '',
    name:       task.name,
    start_date: task.start_date,
    end_date:   task.end_date,
    is_milestone: task.task_type === 'milestone',
    progress:   Math.round(task.progress * 100),
    color:      task.color ?? '#4A90D9',
    notes:      task.notes ?? '',
  });
  const [selectedDeps, setSelectedDeps] = useState(
    new Set((task.dependencies || []).map(d => d.depends_on_id))
  );

  // Position popover after render
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || !anchorEl) return;
    requestAnimationFrame(() => {
      const rect   = anchorEl.getBoundingClientRect();
      const PW     = panel.offsetWidth;
      const PH     = panel.offsetHeight;
      const margin = 10;
      let x = rect.right + margin;
      let y = rect.top + rect.height / 2 - PH / 2;
      if (x + PW + margin > window.innerWidth)  x = rect.left - PW - margin;
      x = Math.max(margin, Math.min(x, window.innerWidth  - PW - margin));
      y = Math.max(margin, Math.min(y, window.innerHeight - PH - margin));
      setPos({ left: x, top: y });
    });
  }, [anchorEl]);

  // Close on outside click
  useEffect(() => {
    const timer = setTimeout(() => {
      const handler = (ev) => {
        if (panelRef.current && !panelRef.current.contains(ev.target)) onClose();
      };
      document.addEventListener('click', handler);
      return () => document.removeEventListener('click', handler);
    }, 0);
    return () => clearTimeout(timer);
  }, [onClose]);

  const set = (field) => (e) => setForm(f => ({
    ...f,
    [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
  }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const data = {
      category_large:  form.category_large  || null,
      category_medium: form.category_medium || null,
      name:       form.name,
      start_date: form.start_date,
      end_date:   form.is_milestone ? form.start_date : form.end_date,
      task_type:  form.is_milestone ? 'milestone' : 'task',
      progress:   form.progress / 100,
      color:      form.color || null,
      notes:      form.notes || null,
      dependency_ids: [...selectedDeps],
    };
    try {
      const updated = await api.updateTask(currentPid, task.id, data);
      onUpdated(updated);
      showToast('タスクを更新しました', 'success');
    } catch (ex) { showToast(ex.message, 'error'); }
  };

  const handleDelete = async () => {
    if (!confirm(`「${task.name}」を削除しますか？`)) return;
    try {
      await api.deleteTask(currentPid, task.id);
      onDeleted(task.id);
      showToast('タスクを削除しました', 'success');
    } catch (ex) { showToast(ex.message, 'error'); }
  };

  const toggleDep = (id) => setSelectedDeps(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const isCritical = criticalTaskIds.has(task.id);
  const otherTasks = allTasks.filter(t => t.id !== task.id);
  const depGroups  = {};
  for (const t of otherTasks) {
    const key = t.category_large || '(未分類)';
    if (!depGroups[key]) depGroups[key] = [];
    depGroups[key].push(t);
  }

  return (
    <div
      ref={panelRef}
      className="task-detail-panel"
      style={{ position: 'fixed', zIndex: 500, left: pos.left, top: pos.top }}
    >
      <div className="task-detail-panel__header">
        <span className="task-detail-panel__title">タスク詳細</span>
        <button className="btn-icon" onClick={onClose}>✕</button>
      </div>

      <form className="task-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <label className="form-label">大項目</label>
          <input className="form-input" value={form.category_large}  onChange={set('category_large')}  disabled={isMultiMode} />
        </div>
        <div className="form-row">
          <label className="form-label">中項目</label>
          <input className="form-input" value={form.category_medium} onChange={set('category_medium')} disabled={isMultiMode} />
        </div>
        <div className="form-row">
          <label className="form-label">タスク名</label>
          <input className="form-input" value={form.name} onChange={set('name')} required disabled={isMultiMode} />
        </div>
        <div className="form-row">
          <label className="form-label">開始日</label>
          <input type="date" className="form-input" value={form.start_date} onChange={set('start_date')}
            onInput={(e) => { if (form.is_milestone) setForm(f => ({...f, end_date: e.target.value})); }}
            disabled={isMultiMode} />
        </div>
        {!form.is_milestone && (
          <div className="form-row" id="detail-end-date-row">
            <label className="form-label">終了日</label>
            <input type="date" className="form-input" value={form.end_date} onChange={set('end_date')} disabled={isMultiMode} />
          </div>
        )}
        <div className="form-row form-row--checkbox">
          <label className="form-label">
            <input type="checkbox" checked={form.is_milestone}
              onChange={(e) => {
                const checked = e.target.checked;
                setForm(f => ({ ...f, is_milestone: checked, ...(checked ? { end_date: f.start_date } : {}) }));
              }}
              disabled={isMultiMode}
            />
            マイルストーン◆
          </label>
        </div>
        <div className="form-row">
          <label className="form-label">進捗: {form.progress}%</label>
          <input type="range" min="0" max="100" className="form-range"
            value={form.progress} onChange={set('progress')} disabled={isMultiMode} />
        </div>
        <div className="form-row">
          <label className="form-label">色</label>
          <input type="color" className="form-color" value={form.color} onChange={set('color')} disabled={isMultiMode} />
        </div>
        <div className="form-row">
          <label className="form-label">メモ</label>
          <textarea className="form-textarea" rows={2} value={form.notes} onChange={set('notes')} disabled={isMultiMode} />
        </div>

        <div className="form-row">
          <label className="form-label">クリティカルパス</label>
          <span className={`critical-badge ${isCritical ? 'critical-badge--yes' : 'critical-badge--no'}`}>
            {isCritical ? '⚠ クリティカルパス上にあります' : '対象外'}
          </span>
        </div>

        {!isMultiMode && (
          <div className="form-row form-row--deps">
            <label className="form-label">前工程（依存タスク）</label>
            <div className="dep-checklist">
              {otherTasks.length === 0
                ? <span className="dep-empty">他にタスクがありません</span>
                : Object.entries(depGroups).map(([grp, ts]) => (
                  <div key={grp} className="dep-group">
                    <div className="dep-group__label">{grp}</div>
                    {ts.map(t => (
                      <label key={t.id} className="dep-item">
                        <input type="checkbox" checked={selectedDeps.has(t.id)} onChange={() => toggleDep(t.id)} />
                        <span className="dep-item__name">
                          {t.category_medium ? t.category_medium + ' › ' : ''}{t.name}
                        </span>
                      </label>
                    ))}
                  </div>
                ))
              }
            </div>
          </div>
        )}

        {!isMultiMode && (
          <div className="form-actions">
            <button type="submit" className="btn btn--primary">Save</button>
            <button type="button" className="btn btn--danger" onClick={handleDelete}>Delete</button>
          </div>
        )}
      </form>
    </div>
  );
}
