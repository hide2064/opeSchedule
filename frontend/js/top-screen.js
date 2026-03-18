/**
 * top-screen.js — ProjectList + ConfigPanel + ProjectModal
 */

import * as api from './api.js';

// ── Toast / Theme (standalone) ─────────────────────────────────────────────
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
  document.body.classList.toggle('theme-dark', theme === 'dark');
}

// ── ProjectList ────────────────────────────────────────────────────────────
const listEl      = document.getElementById('project-list');
const chkArchived = document.getElementById('chk-show-archived');

let projects = [];

async function loadProjects() {
  listEl.innerHTML = '<div class="loading">読み込み中...</div>';
  try {
    projects = await api.listProjects(chkArchived.checked);
    renderProjectList();
  } catch (e) {
    listEl.innerHTML = `<div class="empty-msg">読み込みエラー: ${e.message}</div>`;
  }
}

function renderProjectList() {
  if (projects.length === 0) {
    listEl.innerHTML = '<div class="empty-msg">プロジェクトがありません。「+ New Project」から作成してください。</div>';
    return;
  }
  listEl.innerHTML = projects.map(p => `
    <div class="project-row" data-id="${p.id}">
      <span class="project-row__color-dot" style="background:${p.color}"></span>
      <span class="project-row__name">${escHtml(p.name)}</span>
      <span class="project-row__status ${p.status === 'archived' ? 'archived' : ''}">
        ${p.status === 'archived' ? 'archived' : 'active'}
      </span>
      <div class="project-row__actions">
        <button class="btn btn--primary btn-open-schedule" data-id="${p.id}"
                style="padding:4px 10px;font-size:12px">▶ 開く</button>
        <button class="btn btn--secondary btn-edit-project" data-id="${p.id}"
                style="padding:4px 8px;font-size:12px">Edit</button>
        <button class="btn btn--danger btn-delete-project" data-id="${p.id}"
                style="padding:4px 8px;font-size:12px">Del</button>
      </div>
    </div>
  `).join('');

  // ▶ 開く → schedule.html へ画面遷移
  listEl.querySelectorAll('.btn-open-schedule').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      location.href = `schedule.html?project=${btn.dataset.id}`;
    });
  });

  // Edit ボタン
  listEl.querySelectorAll('.btn-edit-project').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const p = projects.find(p => p.id === parseInt(btn.dataset.id));
      if (p) openProjectModal(p);
    });
  });

  // Delete ボタン
  listEl.querySelectorAll('.btn-delete-project').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      const p  = projects.find(p => p.id === id);
      if (!confirm(`「${p?.name}」を削除しますか？\nタスクもすべて削除されます。`)) return;
      try {
        await api.deleteProject(id);
        await loadProjects();
        showToast('プロジェクトを削除しました', 'success');
      } catch (e) { showToast(e.message, 'error'); }
    });
  });
}

chkArchived.addEventListener('change', loadProjects);

// ── Project Modal ──────────────────────────────────────────────────────────
const modal         = document.getElementById('project-modal');
const modalTitle    = document.getElementById('project-modal-title');
const modalForm     = document.getElementById('project-modal-form');
const btnNewProj    = document.getElementById('btn-new-project');
const btnCloseModal = document.getElementById('btn-close-project-modal');

btnNewProj.addEventListener('click',   () => openProjectModal(null));
btnCloseModal.addEventListener('click', closeProjectModal);
modal.querySelector('.modal__backdrop').addEventListener('click', closeProjectModal);

function openProjectModal(project = null) {
  modalTitle.textContent      = project ? 'Edit Project' : 'New Project';
  modalForm.reset();
  modalForm.project_id.value  = project?.id ?? '';
  if (project) {
    modalForm.name.value        = project.name;
    modalForm.description.value = project.description ?? '';
    modalForm.color.value       = project.color;
    modalForm.view_mode.value   = project.view_mode ?? '';
  }
  modal.hidden = false;
  modalForm.name.focus();
}

function closeProjectModal() { modal.hidden = true; }

modalForm.addEventListener('submit', async e => {
  e.preventDefault();
  const fd   = new FormData(modalForm);
  const data = {
    name:        fd.get('name'),
    description: fd.get('description') || null,
    color:       fd.get('color'),
    view_mode:   fd.get('view_mode') || null,
  };
  const id = fd.get('project_id');
  try {
    if (id) {
      await api.updateProject(parseInt(id), data);
      showToast('プロジェクトを更新しました', 'success');
    } else {
      await api.createProject(data);
      showToast('プロジェクトを作成しました', 'success');
    }
    closeProjectModal();
    await loadProjects();
  } catch (e) { showToast(e.message, 'error'); }
});

// ── ConfigPanel ────────────────────────────────────────────────────────────
const configForm    = document.getElementById('config-form');
const configSaveMsg = document.getElementById('config-save-msg');

async function loadConfig() {
  try {
    const cfg = await api.getConfig();
    applyTheme(cfg.theme);
    configForm.week_start_day.value       = cfg.week_start_day;
    configForm.default_view_mode.value    = cfg.default_view_mode;
    configForm.date_format.value          = cfg.date_format;
    configForm.timezone.value             = cfg.timezone;
    configForm.theme.value                = cfg.theme;
    configForm.highlight_weekends.checked = cfg.highlight_weekends;
    configForm.auto_scroll_today.checked  = cfg.auto_scroll_today;
  } catch (e) { showToast('Config読み込みエラー: ' + e.message, 'error'); }
}

configForm.addEventListener('submit', async e => {
  e.preventDefault();
  const data = {
    week_start_day:     configForm.week_start_day.value,
    default_view_mode:  configForm.default_view_mode.value,
    date_format:        configForm.date_format.value,
    timezone:           configForm.timezone.value,
    theme:              configForm.theme.value,
    highlight_weekends: configForm.highlight_weekends.checked,
    auto_scroll_today:  configForm.auto_scroll_today.checked,
  };
  try {
    await api.updateConfig(data);
    applyTheme(data.theme);
    configSaveMsg.textContent = '保存しました ✓';
    setTimeout(() => { configSaveMsg.textContent = ''; }, 2500);
  } catch (e) { showToast(e.message, 'error'); }
});

// ── Init ────────────────────────────────────────────────────────────────────
export async function initTopScreen() {
  await Promise.all([loadProjects(), loadConfig()]);
}

// ── Utility ─────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
