import { useState } from 'react';
import * as api from '../../api.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import Modal from '../common/Modal.jsx';

export default function AddTaskModal({ currentPid, taskCount, onClose, onCreated }) {
  const showToast = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    category_large: '', category_medium: '', name: '',
    start_date: today, end_date: today,
    is_milestone: false, color: '', notes: '',
  });

  const set = (field) => (e) => setForm(f => ({
    ...f,
    [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    ...(field === 'is_milestone' && e.target.checked ? { end_date: f.start_date } : {}),
    ...(field === 'start_date' && f.is_milestone ? { end_date: e.target.value } : {}),
  }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const created = await api.createTask(currentPid, {
        category_large:  form.category_large  || null,
        category_medium: form.category_medium || null,
        name:       form.name,
        start_date: form.start_date,
        end_date:   form.is_milestone ? form.start_date : form.end_date,
        task_type:  form.is_milestone ? 'milestone' : 'task',
        color:      form.color || null,
        notes:      form.notes || null,
        sort_order: taskCount,
      });
      onCreated(created);
      showToast('タスクを追加しました', 'success');
    } catch (ex) { showToast(ex.message, 'error'); }
  };

  return (
    <Modal title="Add Task" onClose={onClose}>
      <form className="task-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <label className="form-label">大項目</label>
          <input className="form-input" value={form.category_large}  onChange={set('category_large')} />
        </div>
        <div className="form-row">
          <label className="form-label">中項目</label>
          <input className="form-input" value={form.category_medium} onChange={set('category_medium')} />
        </div>
        <div className="form-row">
          <label className="form-label">タスク名 <span className="required">*</span></label>
          <input className="form-input" value={form.name} onChange={set('name')} required />
        </div>
        <div className="form-row">
          <label className="form-label">開始日</label>
          <input type="date" className="form-input" value={form.start_date} onChange={set('start_date')} />
        </div>
        {!form.is_milestone && (
          <div className="form-row">
            <label className="form-label">終了日</label>
            <input type="date" className="form-input" value={form.end_date} onChange={set('end_date')} />
          </div>
        )}
        <div className="form-row form-row--checkbox">
          <label className="form-label">
            <input type="checkbox" checked={form.is_milestone} onChange={set('is_milestone')} />
            マイルストーン◆
          </label>
        </div>
        <div className="form-row">
          <label className="form-label">色</label>
          <input type="color" className="form-color" value={form.color || '#4A90D9'} onChange={set('color')} />
        </div>
        <div className="form-row">
          <label className="form-label">メモ</label>
          <textarea className="form-textarea" rows={2} value={form.notes} onChange={set('notes')} />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn--primary">Add Task</button>
        </div>
      </form>
    </Modal>
  );
}
