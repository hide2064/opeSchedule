/**
 * top-screen.js — ProjectList + ConfigPanel + ProjectModal
 */

import * as api from './api.js';

const LOG = {
  info:  (...a) => console.log ('[TOP]',  ...a),
  warn:  (...a) => console.warn('[TOP]',  ...a),
  error: (...a) => console.error('[TOP]', ...a),
};

LOG.info('top-screen.js モジュール評価開始');

// ── Toast / Theme (standalone) ─────────────────────────────────────────────
const toastEl  = document.getElementById('toast');
LOG.info('toastEl:', toastEl);
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

// ── ProjectList ────────────────────────────────────────────────────────────
const listEl      = document.getElementById('project-list');
const chkArchived = document.getElementById('chk-show-archived');
LOG.info('listEl:', listEl, '/ chkArchived:', chkArchived);

let projects = [];

async function loadProjects() {
  LOG.info('loadProjects() 開始');
  listEl.innerHTML = '<div class="loading">読み込み中...</div>';
  try {
    projects = await api.listProjects(chkArchived.checked);
    LOG.info('loadProjects() API成功, 件数:', projects.length, projects);
    renderProjectList();
    LOG.info('renderProjectList() 完了');
  } catch (e) {
    LOG.error('loadProjects() エラー:', e);
    listEl.innerHTML = `<div class="empty-msg">読み込みエラー: ${e.message}</div>`;
  }
}

function renderProjectList() {
  LOG.info('renderProjectList() 開始, projects:', projects.length);
  if (projects.length === 0) {
    listEl.innerHTML = '<div class="empty-msg">プロジェクトがありません。「+ New Project」から作成してください。</div>';
    LOG.info('renderProjectList(): 0件');
    return;
  }
  listEl.innerHTML = projects.map(p => `
    <div class="project-row" data-id="${p.id}">
      <span class="project-row__color-dot" style="background:${p.color}"></span>
      <span class="project-row__name project-row__name--link">${escHtml(p.name)}</span>
      <span class="project-row__status ${p.status === 'archived' ? 'archived' : ''}">
        ${p.status === 'archived' ? 'archived' : 'active'}
      </span>
      <div class="project-row__actions">
        <button class="btn btn--secondary btn-edit-project" data-id="${p.id}"
                style="padding:4px 8px;font-size:12px">Edit</button>
        <button class="btn btn--danger btn-delete-project" data-id="${p.id}"
                style="padding:4px 8px;font-size:12px">Del</button>
      </div>
    </div>
  `).join('');
  LOG.info('renderProjectList(): innerHTML セット完了');

  // プロジェクト名クリック → schedule.html へ画面遷移
  listEl.querySelectorAll('.project-row__name--link').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const id = el.closest('.project-row').dataset.id;
      location.href = `schedule.html?project=${id}`;
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
  LOG.info('renderProjectList(): イベントリスナー登録完了');
}

chkArchived.addEventListener('change', loadProjects);

// ── Project Modal ──────────────────────────────────────────────────────────
const modal         = document.getElementById('project-modal');
const modalTitle    = document.getElementById('project-modal-title');
const modalForm     = document.getElementById('project-modal-form');
const btnNewProj    = document.getElementById('btn-new-project');
const btnCloseModal = document.getElementById('btn-close-project-modal');
LOG.info('modal DOM:', { modal, modalTitle, modalForm, btnNewProj, btnCloseModal });

btnNewProj.addEventListener('click',   () => openProjectModal(null));
btnCloseModal.addEventListener('click', closeProjectModal);
modal.querySelector('.modal__backdrop').addEventListener('click', closeProjectModal);

function openProjectModal(project = null) {
  LOG.info('openProjectModal:', project);
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
  LOG.info('projectModal submit:', { id, data });
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
LOG.info('configForm:', configForm, '/ configSaveMsg:', configSaveMsg);

async function loadConfig() {
  LOG.info('loadConfig() 開始');
  try {
    const cfg = await api.getConfig();
    LOG.info('loadConfig() API成功:', cfg);
    applyTheme(cfg.theme);
    configForm.week_start_day.value       = cfg.week_start_day;
    configForm.default_view_mode.value    = cfg.default_view_mode;
    configForm.date_format.value          = cfg.date_format;
    configForm.timezone.value             = cfg.timezone;
    configForm.theme.value                = cfg.theme;
    configForm.highlight_weekends.checked = cfg.highlight_weekends;
    configForm.auto_scroll_today.checked  = cfg.auto_scroll_today;
    LOG.info('loadConfig() フォームセット完了');
  } catch (e) {
    LOG.error('loadConfig() エラー:', e);
    showToast('Config読み込みエラー: ' + e.message, 'error');
  }
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
  LOG.info('configForm submit:', data);
  try {
    await api.updateConfig(data);
    applyTheme(data.theme);
    configSaveMsg.textContent = '保存しました ✓';
    setTimeout(() => { configSaveMsg.textContent = ''; }, 2500);
  } catch (e) { showToast(e.message, 'error'); }
});

// ── Import ──────────────────────────────────────────────────────────────────
const importFileEl = document.getElementById('import-file');
importFileEl.addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const result = await api.importProject(file);
    showToast(`インポート完了 (${result.task_count} タスク)`, 'success');
    location.href = `schedule.html?project=${result.project_id}`;
  } catch (ex) { showToast('インポートエラー: ' + ex.message, 'error'); }
  importFileEl.value = '';
});

// ── Init ────────────────────────────────────────────────────────────────────
export async function initTopScreen() {
  LOG.info('initTopScreen() 開始');
  await Promise.all([loadProjects(), loadConfig()]);
  LOG.info('initTopScreen() 完了');
}

// ── Utility ─────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

LOG.info('top-screen.js モジュール評価完了');
