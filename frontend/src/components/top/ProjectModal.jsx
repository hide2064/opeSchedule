import { useRef, useState } from 'react';
import * as api from '../../api.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import Modal from '../common/Modal.jsx';

const PROJECT_STATUSES = ['未開始', '作業中', '中断', '終了'];
const ARCHIVED_STATUSES = ['中断', '終了'];
const MAX_IMAGE_BYTES = 1024 * 1024; // 1MB

function shiftDate(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function copyTasks(srcId, newPid, anchorType, anchorDate) {
  const srcTasks = await api.listTasks(srcId);
  if (!srcTasks.length) return;
  const allDates = srcTasks.flatMap(t => [t.start_date, t.end_date]);
  const origAnchor = anchorType === 'start'
    ? allDates.reduce((a, b) => a < b ? a : b)
    : allDates.reduce((a, b) => a > b ? a : b);
  const shiftMs   = new Date(anchorDate + 'T00:00:00') - new Date(origAnchor + 'T00:00:00');
  const shiftDays = Math.round(shiftMs / 86400000);
  const idMap = new Map();
  for (const t of srcTasks) {
    const created = await api.createTask(newPid, {
      category_large: t.category_large, category_medium: t.category_medium,
      name: t.name, start_date: shiftDate(t.start_date, shiftDays),
      end_date: shiftDate(t.end_date, shiftDays),
      task_type: t.task_type, progress: 0, color: t.color,
      notes: t.notes, sort_order: t.sort_order,
    });
    idMap.set(t.id, created.id);
  }
  for (const t of srcTasks) {
    if (!t.dependencies?.length) continue;
    const newId  = idMap.get(t.id);
    const depIds = t.dependencies.map(d => idMap.get(d.depends_on_id)).filter(Boolean);
    if (depIds.length) await api.updateTask(newPid, newId, { dependency_ids: depIds });
  }
}

export default function ProjectModal({ project, projects, onClose, onSaved }) {
  const showToast = useToast();
  const isNew = !project;
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name:           project?.name           ?? '',
    description:    project?.description    ?? '',
    color:          project?.color          ?? '#4A90D9',
    project_status: project?.project_status ?? '未開始',
    client_name:    project?.client_name    ?? '',
    base_project:   project?.base_project   ?? '',
    view_mode:      project?.view_mode      ?? '',
  });
  const [copySourceId, setCopySourceId] = useState('');
  const [anchorType, setAnchorType]     = useState('start');
  const [anchorDate, setAnchorDate]     = useState('');

  // 画像管理: null = 変更なし / '' = 削除 / 'data:...' = 新しい画像
  const [imagePreview, setImagePreview] = useState(project?.image_data ?? null);
  const [imageDirty,   setImageDirty]   = useState(false); // 変更があったか
  const [imageData,    setImageData]    = useState(null);  // 送信値
  const fileInputRef = useRef(null);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      showToast(`画像は 1MB 以下にしてください (現在: ${(file.size / 1024).toFixed(0)} KB)`, 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = ev.target.result;
      setImagePreview(data);
      setImageData(data);
      setImageDirty(true);
    };
    reader.readAsDataURL(file);
  };

  const handleImageClear = () => {
    setImagePreview(null);
    setImageData('');   // '' = 削除センチネル
    setImageDirty(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (isNew && copySourceId && !anchorDate) {
      showToast('コピー時は基準日を入力してください', 'error');
      return;
    }
    setLoading(true);
    const data = {
      name:           form.name,
      description:    form.description    || null,
      color:          form.color,
      project_status: form.project_status,
      status:         ARCHIVED_STATUSES.includes(form.project_status) ? 'archived' : 'active',
      client_name:    form.client_name    || null,
      base_project:   form.base_project   || null,
      view_mode:      form.view_mode      || null,
      // 画像: 変更があった場合のみ送信 (imageData: '' = 削除, 'data:...' = 新規/更新)
      ...(imageDirty ? { image_data: imageData ?? '' } : {}),
    };
    try {
      if (!isNew) {
        await api.updateProject(project.id, data);
        showToast('プロジェクトを更新しました', 'success');
        onSaved();
      } else {
        const created = await api.createProject(data);
        if (copySourceId) {
          showToast('タスクをコピー中...', 'info');
          await copyTasks(parseInt(copySourceId), created.id, anchorType, anchorDate);
          showToast('コピー完了', 'success');
          onSaved({ project_id: created.id });
        } else {
          showToast('プロジェクトを作成しました', 'success');
          onSaved();
        }
      }
    } catch (ex) {
      showToast(ex.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  return (
    <Modal title={isNew ? 'New Project' : 'Edit Project'} onClose={onClose}>
      <form className="task-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <label className="form-label">プロジェクト名 <span className="required">*</span></label>
          <input className="form-input" value={form.name} onChange={set('name')} required />
        </div>
        <div className="form-row">
          <label className="form-label">説明</label>
          <textarea className="form-textarea" rows={2} value={form.description} onChange={set('description')} />
        </div>
        <div className="form-row">
          <label className="form-label">色</label>
          <input type="color" className="form-color" value={form.color} onChange={set('color')} />
        </div>

        {/* プロジェクト画像 */}
        <div className="form-row">
          <label className="form-label">プロジェクト画像</label>
          <div className="project-image-editor">
            {imagePreview
              ? (
                <div className="project-image-editor__preview-wrap">
                  <img
                    src={imagePreview}
                    alt="プレビュー"
                    className="project-image-editor__preview"
                  />
                  <div className="project-image-editor__actions">
                    <button
                      type="button"
                      className="btn btn--secondary"
                      style={{ fontSize: 12, padding: '3px 8px' }}
                      onClick={() => fileInputRef.current?.click()}
                    >変更</button>
                    <button
                      type="button"
                      className="btn btn--danger"
                      style={{ fontSize: 12, padding: '3px 8px' }}
                      onClick={handleImageClear}
                    >削除</button>
                  </div>
                </div>
              )
              : (
                <button
                  type="button"
                  className="project-image-editor__upload-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <span style={{ fontSize: 20 }}>🖼️</span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    クリックして画像を選択<br />
                    <small>PNG / JPG / WebP — 1MB 以下</small>
                  </span>
                </button>
              )
            }
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              style={{ display: 'none' }}
              onChange={handleImageChange}
            />
          </div>
        </div>

        <div className="form-row">
          <label className="form-label">プロジェクトステータス</label>
          <select className="form-select" value={form.project_status} onChange={set('project_status')}>
            {PROJECT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="form-row">
          <label className="form-label">客先</label>
          <input className="form-input" placeholder="例: 株式会社○○" value={form.client_name} onChange={set('client_name')} />
        </div>
        <div className="form-row">
          <label className="form-label">ベースプロジェクト</label>
          <input className="form-input" placeholder="例: 基幹システム v2" value={form.base_project} onChange={set('base_project')} />
        </div>
        <div className="form-row">
          <label className="form-label">デフォルト表示 (空=グローバル設定)</label>
          <select className="form-select" value={form.view_mode} onChange={set('view_mode')}>
            <option value="">グローバル設定を使用</option>
            {['Day','Week','Month','Quarter'].map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {isNew && (
          <div className="copy-section">
            <div className="copy-section__divider">📋 プロジェクトをコピー</div>
            <div className="form-row">
              <label className="form-label">コピー元プロジェクト</label>
              <select className="form-select" value={copySourceId} onChange={e => setCopySourceId(e.target.value)}>
                <option value="">-- コピーしない --</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {copySourceId && (
              <>
                <div className="form-row">
                  <label className="form-label">日程の基準</label>
                  <div className="radio-group">
                    <label className="radio-label"><input type="radio" checked={anchorType==='start'} onChange={() => setAnchorType('start')} /> 開始日に合わせる</label>
                    <label className="radio-label"><input type="radio" checked={anchorType==='end'}   onChange={() => setAnchorType('end')}   /> 終了日に合わせる</label>
                  </div>
                </div>
                <div className="form-row">
                  <label className="form-label">基準日 <span className="required">*</span></label>
                  <input type="date" className="form-input" value={anchorDate} onChange={e => setAnchorDate(e.target.value)} />
                </div>
              </>
            )}
          </div>
        )}

        <div className="form-actions">
          <button type="submit" className="btn btn--primary" disabled={loading}>
            {loading ? '処理中...' : (isNew ? 'Create' : 'Save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
