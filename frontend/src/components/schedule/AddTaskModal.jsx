import { useState, useEffect, useCallback } from 'react';
import * as api from '../../api.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import Modal from '../common/Modal.jsx';

// ── CSV パースユーティリティ ────────────────────────────────────────────────
/**
 * CSV テキストをタスクオブジェクト配列にパースする。
 * 先頭行をヘッダーとして扱い、以下の列を認識する:
 *   タスク名(name), 大項目(category_large), 中項目(category_medium),
 *   開始日(start_date), 終了日(end_date), メモ(notes)
 */
function parseCsv(text) {
  const lines = text.trim().split('\n').map(l => l.replace(/\r$/, ''));
  if (lines.length < 2) return { tasks: [], errors: ['ヘッダー行とデータ行が必要です'] };

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"(.*)"$/, '$1'));
  const colMap = {
    name:            headers.findIndex(h => /タスク名|name/i.test(h)),
    category_large:  headers.findIndex(h => /大項目|category_large/i.test(h)),
    category_medium: headers.findIndex(h => /中項目|category_medium/i.test(h)),
    start_date:      headers.findIndex(h => /開始日|start_date/i.test(h)),
    end_date:        headers.findIndex(h => /終了日|end_date/i.test(h)),
    notes:           headers.findIndex(h => /メモ|notes/i.test(h)),
  };

  const tasks = [];
  const errors = [];
  const today = new Date().toISOString().slice(0, 10);

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = lines[i].split(',').map(c => c.trim().replace(/^"(.*)"$/, '$1'));
    const name = colMap.name >= 0 ? (cols[colMap.name] || '') : '';
    if (!name) { errors.push(`行${i+1}: タスク名が空です`); continue; }

    const start = colMap.start_date >= 0 ? (cols[colMap.start_date] || today) : today;
    const end   = colMap.end_date   >= 0 ? (cols[colMap.end_date]   || start) : start;

    // 日付フォーマット簡易バリデーション
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) { errors.push(`行${i+1}: 開始日の形式が不正 (${start})`); continue; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(end))   { errors.push(`行${i+1}: 終了日の形式が不正 (${end})`);   continue; }

    tasks.push({
      name,
      category_large:  colMap.category_large  >= 0 ? (cols[colMap.category_large]  || null) : null,
      category_medium: colMap.category_medium  >= 0 ? (cols[colMap.category_medium] || null) : null,
      start_date: start,
      end_date:   end,
      notes:      colMap.notes >= 0 ? (cols[colMap.notes] || null) : null,
      task_type:  'task',
    });
  }

  return { tasks, errors };
}

// ── 各タブコンポーネント ──────────────────────────────────────────────────────

/** タブ1: 1件フォーム入力 */
function FormTab({ currentPid, taskCount, onCreated, showToast }) {
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
      onCreated([created]);
      showToast('タスクを追加しました', 'success');
    } catch (ex) { showToast(ex.message, 'error'); }
  };

  return (
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
  );
}

/** タブ2: テンプレートから一括追加 */
function TemplateTab({ currentPid, taskCount, onCreated, showToast }) {
  const today = new Date().toISOString().slice(0, 10);
  const [templates, setTemplates] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState(null);
  const [baseDate,  setBaseDate]  = useState(today);
  const [applying,  setApplying]  = useState(false);

  useEffect(() => {
    api.listTemplates()
      .then(setTemplates)
      .catch(() => showToast('テンプレートの読み込みに失敗しました', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const handleApply = async () => {
    if (!selected) return;
    setApplying(true);
    try {
      const result = await api.applyTemplate(currentPid, selected.id, baseDate);
      showToast(`${result.added}件のタスクを追加しました`, 'success');
      // 追加後は tasks を再取得して返す
      const updated = await api.listTasks(currentPid);
      onCreated(updated, true /* replaceAll */);
    } catch (ex) {
      showToast('テンプレート適用エラー: ' + ex.message, 'error');
    } finally {
      setApplying(false);
    }
  };

  if (loading) return <div className="tab-loading">テンプレートを読み込み中...</div>;
  if (templates.length === 0) return (
    <div className="tab-empty">
      <p>テンプレートがありません。</p>
      <p className="tab-empty__hint">設定画面から「現在のプロジェクトをテンプレートとして保存」できます。</p>
    </div>
  );

  return (
    <div className="template-tab">
      <div className="template-list">
        {templates.map(t => (
          <div
            key={t.id}
            className={`template-item${selected?.id === t.id ? ' is-selected' : ''}`}
            onClick={() => setSelected(t)}
          >
            <div className="template-item__name">{t.name}</div>
            <div className="template-item__meta">{t.task_count} タスク</div>
            {t.description && <div className="template-item__desc">{t.description}</div>}
          </div>
        ))}
      </div>
      {selected && (
        <div className="template-apply">
          <div className="form-row">
            <label className="form-label">基準日（タスク開始日の起点）</label>
            <input
              type="date"
              className="form-input"
              value={baseDate}
              onChange={e => setBaseDate(e.target.value)}
            />
          </div>
          <div className="form-actions">
            <button
              className="btn btn--primary"
              onClick={handleApply}
              disabled={applying}
            >
              {applying ? '追加中...' : `「${selected.name}」を適用（${selected.task_count}件）`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** タブ3: CSV一括追加 */
function CsvTab({ currentPid, taskCount, onCreated, showToast }) {
  const CSV_TEMPLATE = `タスク名,大項目,中項目,開始日,終了日,メモ
フロントエンド設計,設計フェーズ,UI設計,2026-06-01,2026-06-07,ワイヤーフレーム作成
バックエンド設計,設計フェーズ,API設計,2026-06-01,2026-06-10,
テスト,テストフェーズ,,2026-07-01,2026-07-10,結合テスト含む`;

  const [csvText,  setCsvText]  = useState('');
  const [preview,  setPreview]  = useState([]);
  const [errors,   setErrors]   = useState([]);
  const [adding,   setAdding]   = useState(false);

  const handleParse = useCallback(() => {
    if (!csvText.trim()) { setPreview([]); setErrors([]); return; }
    const { tasks, errors } = parseCsv(csvText);
    setPreview(tasks);
    setErrors(errors);
  }, [csvText]);

  const handleAdd = async () => {
    if (preview.length === 0) return;
    setAdding(true);
    try {
      const results = [];
      for (let i = 0; i < preview.length; i++) {
        const created = await api.createTask(currentPid, {
          ...preview[i],
          sort_order: taskCount + i,
        });
        results.push(created);
      }
      showToast(`${results.length}件のタスクを追加しました`, 'success');
      onCreated(results);
    } catch (ex) {
      showToast('CSVインポートエラー: ' + ex.message, 'error');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="csv-tab">
      <p className="csv-tab__hint">
        CSV形式でタスクを一括追加できます。<br />
        ヘッダー行: <code>タスク名,大項目,中項目,開始日,終了日,メモ</code>（日付はYYYY-MM-DD形式）
      </p>
      <button
        className="btn btn--secondary csv-tab__template-btn"
        onClick={() => setCsvText(CSV_TEMPLATE)}
        title="CSVテンプレートを挿入"
      >
        テンプレートを挿入
      </button>
      <textarea
        className="csv-tab__textarea"
        rows={8}
        value={csvText}
        onChange={e => setCsvText(e.target.value)}
        placeholder="ここにCSVを貼り付けてください..."
        spellCheck={false}
      />
      <div className="form-actions" style={{ marginBottom: 8 }}>
        <button className="btn btn--secondary" onClick={handleParse}>
          プレビュー ({preview.length}件)
        </button>
      </div>

      {errors.length > 0 && (
        <div className="csv-tab__errors">
          {errors.map((e, i) => <div key={i} className="csv-tab__error">⚠ {e}</div>)}
        </div>
      )}

      {preview.length > 0 && (
        <>
          <div className="csv-preview">
            <table className="csv-preview__table">
              <thead>
                <tr>
                  <th>タスク名</th><th>大項目</th><th>中項目</th><th>開始日</th><th>終了日</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((t, i) => (
                  <tr key={i}>
                    <td>{t.name}</td>
                    <td>{t.category_large || '—'}</td>
                    <td>{t.category_medium || '—'}</td>
                    <td>{t.start_date}</td>
                    <td>{t.end_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="form-actions">
            <button
              className="btn btn--primary"
              onClick={handleAdd}
              disabled={adding}
            >
              {adding ? '追加中...' : `${preview.length}件を一括追加`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── メインコンポーネント ──────────────────────────────────────────────────────
const TABS = [
  { id: 'form',     label: '📝 フォーム入力' },
  { id: 'template', label: '📋 テンプレート' },
  { id: 'csv',      label: '📊 CSV一括追加' },
];

export default function AddTaskModal({ currentPid, taskCount, onClose, onCreated }) {
  const showToast = useToast();
  const [activeTab, setActiveTab] = useState('form');

  /**
   * created: Task[] — 新規作成タスクの配列
   * replaceAll: bool — true の場合はタスク全量を差し替える（テンプレート適用後）
   */
  const handleCreated = useCallback((tasks, replaceAll = false) => {
    if (replaceAll) {
      // テンプレート適用時: 全タスクリストで上書き（onCreated が全量を受け取るケース）
      onCreated(tasks, true);
    } else {
      // 通常の1件/複数件追加: それぞれ個別に通知
      tasks.forEach(t => onCreated(t));
    }
    onClose();
  }, [onCreated, onClose]);

  return (
    <Modal title="タスク追加" onClose={onClose} width={560}>
      {/* タブ切り替え */}
      <div className="addtask-tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`addtask-tab${activeTab === tab.id ? ' is-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="addtask-tab-content">
        {activeTab === 'form' && (
          <FormTab
            currentPid={currentPid}
            taskCount={taskCount}
            onCreated={(tasks) => handleCreated(tasks)}
            showToast={showToast}
          />
        )}
        {activeTab === 'template' && (
          <TemplateTab
            currentPid={currentPid}
            taskCount={taskCount}
            onCreated={(tasks, replaceAll) => handleCreated(tasks, replaceAll)}
            showToast={showToast}
          />
        )}
        {activeTab === 'csv' && (
          <CsvTab
            currentPid={currentPid}
            taskCount={taskCount}
            onCreated={(tasks) => handleCreated(tasks)}
            showToast={showToast}
          />
        )}
      </div>
    </Modal>
  );
}
