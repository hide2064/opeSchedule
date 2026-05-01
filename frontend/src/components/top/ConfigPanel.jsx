import { useState, useRef } from 'react';
import * as api from '../../api.js';
import { useToast } from '../../contexts/ToastContext.jsx';

export default function ConfigPanel({ config, onSaved }) {
  const showToast = useToast();
  const [saveMsg, setSaveMsg] = useState('');
  const [form, setForm] = useState(null);
  const [skipExisting, setSkipExisting] = useState(false);
  const [importing, setImporting] = useState(false);
  const bulkFileRef = useRef(null);

  const effectiveForm = form ?? (config ? {
    week_start_day:    config.week_start_day,
    default_view_mode: config.default_view_mode,
    date_format:       config.date_format,
    timezone:          config.timezone,
    theme:             config.theme,
    highlight_weekends: config.highlight_weekends,
    auto_scroll_today:  config.auto_scroll_today,
  } : null);

  if (!effectiveForm) return <div className="loading">読み込み中...</div>;

  const set = (field) => (e) => setForm(f => ({
    ...(f ?? effectiveForm),
    [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
  }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const saved = await api.updateConfig(effectiveForm);
      onSaved(saved);
      setSaveMsg('保存しました ✓');
      setTimeout(() => setSaveMsg(''), 2500);
    } catch (ex) { showToast(ex.message, 'error'); }
  };

  const handleExportAll = async () => {
    try {
      const blob = await api.exportAll();
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `opeschedule_all_${today}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('全プロジェクトをエクスポートしました', 'success');
    } catch (ex) {
      showToast(`エクスポート失敗: ${ex.message}`, 'error');
    }
  };

  const handleImportAll = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true);
    try {
      const mode = skipExisting ? 'skip_existing' : 'new';
      const result = await api.importAll(file, mode);
      showToast(
        `インポート完了: ${result.imported}件作成, ${result.skipped}件スキップ`,
        'success',
      );
    } catch (ex) {
      showToast(`インポート失敗: ${ex.message}`, 'error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <form className="config-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label className="form-label">週の開始曜日</label>
        <select className="form-select" value={effectiveForm.week_start_day} onChange={set('week_start_day')}>
          <option value="Mon">月曜日 (Mon)</option>
          <option value="Sun">日曜日 (Sun)</option>
          <option value="Sat">土曜日 (Sat)</option>
        </select>
      </div>
      <div className="form-row">
        <label className="form-label">デフォルト表示</label>
        <select className="form-select" value={effectiveForm.default_view_mode} onChange={set('default_view_mode')}>
          {['Day','Week','Month','Quarter'].map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="form-row">
        <label className="form-label">テーマ</label>
        <select className="form-select" value={effectiveForm.theme} onChange={set('theme')}>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>
      <div className="form-row form-row--checkbox">
        <label className="form-label">
          <input type="checkbox" checked={effectiveForm.highlight_weekends} onChange={set('highlight_weekends')} />
          週末をハイライト
        </label>
      </div>
      <div className="form-row form-row--checkbox">
        <label className="form-label">
          <input type="checkbox" checked={effectiveForm.auto_scroll_today} onChange={set('auto_scroll_today')} />
          今日に自動スクロール
        </label>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn--primary">Save Config</button>
        {saveMsg && <span className="save-msg">{saveMsg}</span>}
      </div>

      {/* ── マスター操作 ───────────────────────────────────── */}
      <div className="master-ops">
        <h3 className="master-ops__title">マスター操作</h3>
        <div className="master-ops__row">
          <button type="button" className="btn btn--secondary" onClick={handleExportAll}>
            全プロジェクトをエクスポート (JSON)
          </button>
        </div>
        <div className="master-ops__row">
          <label className="master-ops__skip-label">
            <input
              type="checkbox"
              checked={skipExisting}
              onChange={e => setSkipExisting(e.target.checked)}
            />
            同名プロジェクトはスキップ
          </label>
        </div>
        <div className="master-ops__row">
          <input
            ref={bulkFileRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleImportAll}
          />
          <button
            type="button"
            className="btn btn--secondary"
            disabled={importing}
            onClick={() => bulkFileRef.current?.click()}
          >
            {importing ? 'インポート中...' : '一括インポート (JSON)'}
          </button>
        </div>
      </div>
    </form>
  );
}
