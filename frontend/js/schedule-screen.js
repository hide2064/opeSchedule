/**
 * schedule-screen.js — schedule.html 専用スタンドアロン
 * URL: schedule.html?project=<id>
 */

import * as api from './api.js';

const LOG = {
  info:  (...a) => console.log ('[SCH]',  ...a),
  warn:  (...a) => console.warn('[SCH]',  ...a),
  error: (...a) => console.error('[SCH]', ...a),
};

LOG.info('schedule-screen.js モジュール評価開始');

// ── Toast ──────────────────────────────────────────────────────────────────
const toastEl  = document.getElementById('toast');
let toastTimer = null;

function showToast(msg, type = 'info') {
  if (toastTimer) clearTimeout(toastTimer);
  toastEl.textContent = msg;
  toastEl.className   = `toast ${type}`;
  toastEl.hidden      = false;
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3000);
}

function applyTheme(theme) {
  LOG.info('applyTheme:', theme);
  document.body.classList.toggle('theme-dark', theme === 'dark');
}

// ── 状態 ──────────────────────────────────────────────────────────────────
let gantt        = null;
let currentPid   = null;
let currentTasks = [];
let viewMode     = 'Week';
let cachedConfig = null;

// ── プロジェクト ID を URL から取得 ────────────────────────────────────────
const pid = parseInt(new URLSearchParams(location.search).get('project'), 10);
LOG.info('URL から取得した pid:', pid, '/ URL:', location.search);
if (!pid) {
  LOG.error('pid が無効のため / へリダイレクト');
  location.href = '/';
}
currentPid = pid;

// ── Gantt グローバル確認 ───────────────────────────────────────────────────
LOG.info('typeof Gantt:', typeof Gantt);
if (typeof Gantt === 'undefined') {
  LOG.error('Gantt が未定義です。frappe-gantt CDN の読み込みに失敗している可能性があります。');
}

// ── DOM 参照 ──────────────────────────────────────────────────────────────
const ganttContainer  = document.getElementById('gantt-container');
const projectNameEl   = document.getElementById('schedule-project-name');
const viewModeBtns    = document.getElementById('view-mode-btns');
const taskDetailPanel = document.getElementById('task-detail-panel');
const taskDetailForm  = document.getElementById('task-detail-form');
const btnCloseDetail  = document.getElementById('btn-close-detail');
const btnDeleteTask   = document.getElementById('btn-delete-task');
const detailProgressVal = document.getElementById('detail-progress-val');
const addTaskModal    = document.getElementById('add-task-modal');
const addTaskForm     = document.getElementById('add-task-form');
const btnAddTask      = document.getElementById('btn-add-task');
const btnCloseAddTask = document.getElementById('btn-close-add-task-modal');
const importFileEl    = document.getElementById('import-file');
const btnExportJson   = document.getElementById('btn-export-json');
const btnExportCsv    = document.getElementById('btn-export-csv');

LOG.info('DOM参照確認:', {
  ganttContainer: !!ganttContainer,
  projectNameEl:  !!projectNameEl,
  viewModeBtns:   !!viewModeBtns,
  taskDetailPanel:!!taskDetailPanel,
  addTaskModal:   !!addTaskModal,
  btnAddTask:     !!btnAddTask,
});

// ── API タスク → Frappe Gantt フォーマット変換 ────────────────────────────
function taskDisplayName(t) {
  const parts = [t.category_large, t.category_medium, t.name].filter(Boolean);
  return parts.join(' › ');
}

function toGanttTask(t) {
  return {
    id:           String(t.id),
    name:         taskDisplayName(t),
    start:        t.start_date,
    end:          t.end_date,
    progress:     Math.round(t.progress * 100),
    custom_class: t.task_type === 'milestone' ? 'bar-milestone' : '',
    dependencies: t.dependencies?.map(d => String(d.depends_on_id)).join(',') ?? '',
  };
}

// ── Gantt 描画 ────────────────────────────────────────────────────────────
function renderGantt(tasks) {
  LOG.info('renderGantt() 開始, タスク数:', tasks.length);
  ganttContainer.innerHTML = '';

  if (tasks.length === 0) {
    ganttContainer.innerHTML =
      '<div class="no-project-msg">タスクがありません。「+ Add Task」から追加してください。</div>';
    gantt = null;
    LOG.info('renderGantt(): タスク0件');
    return;
  }

  const ganttTasks = tasks.map(toGanttTask);
  LOG.info('Gantt タスク変換完了:', ganttTasks);

  if (typeof Gantt === 'undefined') {
    LOG.error('renderGantt(): Gantt クラスが未定義のため描画できません');
    ganttContainer.innerHTML =
      '<div class="no-project-msg" style="color:red">エラー: Ganttライブラリが読み込まれていません（CDN未接続の可能性）</div>';
    return;
  }

  try {
    gantt = new Gantt(ganttContainer, ganttTasks, {
      view_mode:   viewMode,
      date_format: 'YYYY-MM-DD',
      language:    'en',
      highlight_weekend: cachedConfig?.highlight_weekends ?? true,
      scroll_to:         (cachedConfig?.auto_scroll_today ?? true) ? 'today' : undefined,
      popup_trigger: 'click',

      on_click(task) {
        const t = currentTasks.find(t => String(t.id) === task.id);
        if (t) openTaskDetail(t);
      },

      on_date_change: async (task, start, end) => {
        const tid      = parseInt(task.id);
        const startStr = fmtDate(start);
        const endStr   = fmtDate(end);
        const orig     = currentTasks.find(t => t.id === tid);
        try {
          const updated = await api.updateDates(currentPid, tid, {
            start_date: startStr,
            end_date:   endStr,
          });
          const idx = currentTasks.findIndex(t => t.id === tid);
          if (idx !== -1) currentTasks[idx] = updated;
        } catch (e) {
          showToast('日程更新エラー: ' + e.message, 'error');
          if (orig) renderGantt(currentTasks);
        }
      },

      on_progress_change: async (task, progress) => {
        const tid = parseInt(task.id);
        try {
          const updated = await api.updateTask(currentPid, tid, { progress: progress / 100 });
          const idx = currentTasks.findIndex(t => t.id === tid);
          if (idx !== -1) currentTasks[idx] = updated;
        } catch (e) {
          showToast('進捗更新エラー: ' + e.message, 'error');
        }
      },

      custom_popup_html(task) {
        const t = currentTasks.find(t => String(t.id) === task.id);
        if (!t) return '';
        const pct  = Math.round(t.progress * 100);
        const type = t.task_type === 'milestone' ? '◆ マイルストーン' : 'タスク';
        const dur  = t.start_date === t.end_date
          ? t.start_date
          : `${t.start_date} → ${t.end_date}`;
        const catLine = [t.category_large, t.category_medium]
          .filter(Boolean).map(escHtml).join(' › ');
        return `<div style="min-width:180px">
          ${catLine ? `<div style="font-size:11px;color:#888;margin-bottom:2px">${catLine}</div>` : ''}
          <div style="font-weight:600;margin-bottom:4px">${escHtml(t.name)}</div>
          <div style="font-size:11px;color:#666">${type}</div>
          <div style="font-size:11px">${dur}</div>
          <div style="font-size:11px;margin-top:4px">
            進捗:
            <span style="display:inline-block;width:80px;background:#eee;border-radius:3px;height:6px;vertical-align:middle">
              <span style="display:block;width:${pct}%;background:#4A90D9;height:6px;border-radius:3px"></span>
            </span>
            ${pct}%
          </div>
          ${t.notes ? `<div style="font-size:11px;color:#888;margin-top:4px">${escHtml(t.notes)}</div>` : ''}
        </div>`;
      },
    });
    LOG.info('renderGantt(): Gantt インスタンス生成完了');
  } catch (e) {
    LOG.error('renderGantt(): Gantt インスタンス生成エラー:', e);
    ganttContainer.innerHTML =
      `<div class="no-project-msg" style="color:red">Gantt描画エラー: ${e.message}</div>`;
  }
}

// ── View Mode ─────────────────────────────────────────────────────────────
function updateViewModeBtns() {
  viewModeBtns.querySelectorAll('.view-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === viewMode);
  });
}

viewModeBtns.addEventListener('click', e => {
  const btn = e.target.closest('.view-btn');
  if (!btn) return;
  viewMode = btn.dataset.mode;
  updateViewModeBtns();
  if (gantt) gantt.change_view_mode(viewMode);
});

// ── Task Detail Panel ─────────────────────────────────────────────────────
function openTaskDetail(task) {
  taskDetailForm.task_id.value              = task.id;
  taskDetailForm.category_large.value       = task.category_large  ?? '';
  taskDetailForm.category_medium.value      = task.category_medium ?? '';
  taskDetailForm.name.value                 = task.name;
  taskDetailForm.start_date.value           = task.start_date;
  taskDetailForm.end_date.value       = task.end_date;
  taskDetailForm.is_milestone.checked = task.task_type === 'milestone';
  taskDetailForm.progress.value       = Math.round(task.progress * 100);
  detailProgressVal.textContent       = Math.round(task.progress * 100);
  taskDetailForm.color.value          = task.color ?? '#4A90D9';
  taskDetailForm.notes.value          = task.notes ?? '';
  toggleEndDateRow(taskDetailForm, task.task_type === 'milestone');
  taskDetailPanel.hidden = false;
  taskDetailPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

btnCloseDetail.addEventListener('click', () => { taskDetailPanel.hidden = true; });

taskDetailForm.is_milestone.addEventListener('change', e => {
  toggleEndDateRow(taskDetailForm, e.target.checked);
  if (e.target.checked) taskDetailForm.end_date.value = taskDetailForm.start_date.value;
});
taskDetailForm.start_date.addEventListener('input', e => {
  if (taskDetailForm.is_milestone.checked) taskDetailForm.end_date.value = e.target.value;
});

taskDetailForm.addEventListener('submit', async e => {
  e.preventDefault();
  const tid         = parseInt(taskDetailForm.task_id.value);
  const isMilestone = taskDetailForm.is_milestone.checked;
  const data = {
    category_large:  taskDetailForm.category_large.value  || null,
    category_medium: taskDetailForm.category_medium.value || null,
    name:       taskDetailForm.name.value,
    start_date: taskDetailForm.start_date.value,
    end_date:   isMilestone ? taskDetailForm.start_date.value : taskDetailForm.end_date.value,
    task_type:  isMilestone ? 'milestone' : 'task',
    progress:   parseFloat(taskDetailForm.progress.value) / 100,
    color:      taskDetailForm.color.value || null,
    notes:      taskDetailForm.notes.value || null,
  };
  try {
    const updated = await api.updateTask(currentPid, tid, data);
    const idx = currentTasks.findIndex(t => t.id === tid);
    if (idx !== -1) currentTasks[idx] = updated;
    renderGantt(currentTasks);
    taskDetailPanel.hidden = true;
    showToast('タスクを更新しました', 'success');
  } catch (e) { showToast(e.message, 'error'); }
});

btnDeleteTask.addEventListener('click', async () => {
  const tid  = parseInt(taskDetailForm.task_id.value);
  const task = currentTasks.find(t => t.id === tid);
  if (!confirm(`「${task?.name}」を削除しますか？`)) return;
  try {
    await api.deleteTask(currentPid, tid);
    currentTasks = currentTasks.filter(t => t.id !== tid);
    renderGantt(currentTasks);
    taskDetailPanel.hidden = true;
    showToast('タスクを削除しました', 'success');
  } catch (e) { showToast(e.message, 'error'); }
});

// ── Add Task Modal ────────────────────────────────────────────────────────
btnAddTask.addEventListener('click', () => {
  addTaskForm.reset();
  const today = new Date().toISOString().slice(0, 10);
  addTaskForm.start_date.value = today;
  addTaskForm.end_date.value   = today;
  toggleEndDateRow(addTaskForm, false);
  addTaskModal.hidden = false;
  addTaskForm.name.focus();
});

btnCloseAddTask.addEventListener('click', () => { addTaskModal.hidden = true; });
addTaskModal.querySelector('.modal__backdrop').addEventListener('click', () => { addTaskModal.hidden = true; });

addTaskForm['is_milestone'].addEventListener('change', e => {
  toggleEndDateRow(addTaskForm, e.target.checked);
  if (e.target.checked) addTaskForm.end_date.value = addTaskForm.start_date.value;
});
addTaskForm.start_date.addEventListener('input', e => {
  if (addTaskForm['is_milestone'].checked) addTaskForm.end_date.value = e.target.value;
});

addTaskForm.addEventListener('submit', async e => {
  e.preventDefault();
  const isMilestone = addTaskForm['is_milestone'].checked;
  const data = {
    category_large:  addTaskForm.category_large.value  || null,
    category_medium: addTaskForm.category_medium.value || null,
    name:       addTaskForm.name.value,
    start_date: addTaskForm.start_date.value,
    end_date:   isMilestone ? addTaskForm.start_date.value : addTaskForm.end_date.value,
    task_type:  isMilestone ? 'milestone' : 'task',
    color:      addTaskForm.color.value || null,
    notes:      addTaskForm.notes.value || null,
    sort_order: currentTasks.length,
  };
  try {
    const created = await api.createTask(currentPid, data);
    currentTasks.push(created);
    renderGantt(currentTasks);
    addTaskModal.hidden = true;
    showToast('タスクを追加しました', 'success');
  } catch (e) { showToast(e.message, 'error'); }
});

// ── Import ────────────────────────────────────────────────────────────────
importFileEl.addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const result = await api.importProject(file);
    showToast(`インポート完了 (${result.task_count} タスク)`, 'success');
    location.href = `schedule.html?project=${result.project_id}`;
  } catch (e) { showToast('インポートエラー: ' + e.message, 'error'); }
  importFileEl.value = '';
});

// ── Export ────────────────────────────────────────────────────────────────
async function triggerExport(format) {
  try {
    const res = await api.exportProject(currentPid, format);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url, download: `project_${currentPid}.${format}`
    });
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) { showToast('エクスポートエラー: ' + e.message, 'error'); }
}

btnExportJson.addEventListener('click', () => triggerExport('json'));
btnExportCsv.addEventListener('click',  () => triggerExport('csv'));

// ── キーボードショートカット ────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!addTaskModal.hidden) { addTaskModal.hidden = true; return; }
  if (!taskDetailPanel.hidden) { taskDetailPanel.hidden = true; }
});

// ── Helpers ───────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (typeof d === 'string') return d.slice(0, 10);
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toggleEndDateRow(form, isMilestone) {
  const rowId = form === taskDetailForm ? 'detail-end-date-row' : 'add-end-date-row';
  const row   = document.getElementById(rowId);
  if (row) row.hidden = isMilestone;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Boot: Config → Project 読み込み ───────────────────────────────────────
LOG.info('Boot IIFE 開始');
(async () => {
  LOG.info('Config 読み込み開始');
  try {
    cachedConfig = await api.getConfig();
    LOG.info('Config 読み込み完了:', cachedConfig);
    applyTheme(cachedConfig.theme);
  } catch (e) {
    LOG.warn('Config 読み込み失敗（継続）:', e.message);
  }

  LOG.info('Project & Tasks 読み込み開始, pid:', currentPid);
  try {
    const [project, tasks] = await Promise.all([
      api.getProject(currentPid),
      api.listTasks(currentPid),
    ]);
    LOG.info('Project:', project);
    LOG.info('Tasks 件数:', tasks.length);
    projectNameEl.textContent = project.name;
    document.title = `${project.name} - opeSchedule`;
    currentTasks = tasks;

    if (project.view_mode) {
      viewMode = project.view_mode;
      LOG.info('viewMode (プロジェクト設定):', viewMode);
    } else if (cachedConfig?.default_view_mode) {
      viewMode = cachedConfig.default_view_mode;
      LOG.info('viewMode (グローバル設定):', viewMode);
    }
    updateViewModeBtns();
    renderGantt(tasks);
    LOG.info('Boot 完了');
  } catch (e) {
    LOG.error('Project/Tasks 読み込みエラー:', e);
    ganttContainer.innerHTML =
      `<div class="no-project-msg">読み込みエラー: ${e.message}</div>`;
  }
})();
