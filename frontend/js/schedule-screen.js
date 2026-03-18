/**
 * schedule-screen.js — GanttWrapper + TaskDetailPanel + AddTask Modal
 */

import * as api from './api.js';
import { AppState, showToast } from './app.js';
import { cachedConfig } from './top-screen.js';

// ── 状態 ──────────────────────────────────────────────────────────────────
let gantt        = null;
let currentPid   = null;
let currentTasks = [];
let viewMode     = 'Week';

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

// ── API タスク → Frappe Gantt フォーマット変換 ────────────────────────────
function toGanttTask(t) {
  return {
    id:           String(t.id),
    name:         t.name,
    start:        t.start_date,
    end:          t.end_date,
    progress:     Math.round(t.progress * 100),
    custom_class: t.task_type === 'milestone' ? 'bar-milestone' : '',
    dependencies: t.dependencies?.map(d => String(d.depends_on_id)).join(',') ?? '',
  };
}

// ── Gantt 描画 ────────────────────────────────────────────────────────────
function renderGantt(tasks) {
  ganttContainer.innerHTML = '';

  if (tasks.length === 0) {
    ganttContainer.innerHTML =
      '<div class="no-project-msg">タスクがありません。「+ Add Task」から追加してください。</div>';
    gantt = null;
    return;
  }

  const cfg = cachedConfig;
  const ganttTasks = tasks.map(toGanttTask);

  gantt = new Gantt(ganttContainer, ganttTasks, {
    view_mode:   viewMode,
    date_format: 'YYYY-MM-DD',
    language:    'en',
    // Config 設定と連動
    highlight_weekend: cfg?.highlight_weekends ?? true,
    scroll_to:         (cfg?.auto_scroll_today ?? true) ? 'today' : undefined,
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
      return `<div style="min-width:160px">
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
}

// ── プロジェクト読み込み ──────────────────────────────────────────────────
async function loadProject(pid) {
  currentPid = pid;
  taskDetailPanel.hidden = true;
  ganttContainer.innerHTML = '<div class="loading">読み込み中...</div>';

  try {
    const [project, tasks] = await Promise.all([
      api.getProject(pid),
      api.listTasks(pid),
    ]);
    projectNameEl.textContent = project.name;
    currentTasks = tasks;

    // プロジェクト固有の view_mode を優先、なければ Config のデフォルト
    if (project.view_mode) {
      viewMode = project.view_mode;
    } else if (cachedConfig?.default_view_mode) {
      viewMode = cachedConfig.default_view_mode;
    }
    updateViewModeBtns();
    renderGantt(tasks);
  } catch (e) {
    ganttContainer.innerHTML =
      `<div class="no-project-msg">読み込みエラー: ${e.message}</div>`;
  }
}

window._loadGanttProject = loadProject;

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
  taskDetailForm.task_id.value      = task.id;
  taskDetailForm.name.value         = task.name;
  taskDetailForm.start_date.value   = task.start_date;
  taskDetailForm.end_date.value     = task.end_date;
  taskDetailForm.is_milestone.checked = task.task_type === 'milestone';
  taskDetailForm.progress.value     = Math.round(task.progress * 100);
  detailProgressVal.textContent     = Math.round(task.progress * 100);
  taskDetailForm.color.value        = task.color ?? '#4A90D9';
  taskDetailForm.notes.value        = task.notes ?? '';
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
  if (!currentPid) { showToast('プロジェクトを選択してください', 'error'); return; }
  addTaskForm.reset();
  const today = new Date().toISOString().slice(0, 10);
  addTaskForm.start_date.value = today;
  addTaskForm.end_date.value   = today;
  toggleEndDateRow(addTaskForm, false);
  addTaskModal.hidden = false;
  addTaskForm.name.focus();
});

btnCloseAddTask.addEventListener('click',  () => { addTaskModal.hidden = true; });
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
  if (!currentPid) { showToast('プロジェクトが選択されていません', 'error'); return; }
  const isMilestone = addTaskForm['is_milestone'].checked;
  const data = {
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
    AppState.navigate('schedule', result.project_id);
  } catch (e) { showToast('インポートエラー: ' + e.message, 'error'); }
  importFileEl.value = '';
});

// ── Export ────────────────────────────────────────────────────────────────
async function triggerExport(format) {
  if (!currentPid) { showToast('プロジェクトが選択されていません', 'error'); return; }
  try {
    const res = await api.exportProject(currentPid, format);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: `project_${currentPid}.${format}` });
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) { showToast('エクスポートエラー: ' + e.message, 'error'); }
}

btnExportJson.addEventListener('click', () => triggerExport('json'));
btnExportCsv.addEventListener('click',  () => triggerExport('csv'));

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

export function initScheduleScreen() { /* loadProject が都度呼ばれる */ }
