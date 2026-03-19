/**
 * top-screen.js — ProjectList + ConfigPanel + ProjectModal
 */

import * as api from './api.js';

const LOG = {
  info:  (...a) => console.log ('[TOP]',  ...a),
  warn:  (...a) => console.warn('[TOP]',  ...a),
  error: (...a) => console.error('[TOP]', ...a),
};

LOG.info('top-screen.js モジュール評価開始')

// ── サイドバーセクション 開閉トグル ─────────────────────────────────────────
document.querySelectorAll('.sidebar-toggle-header').forEach(header => {
  header.addEventListener('click', () => {
    const bodyId = header.id.replace('toggle-header', 'section-body');
    const body   = document.getElementById(bodyId);
    if (!body) return;
    body.hidden = !body.hidden;
    header.classList.toggle('is-open', !body.hidden);
  });
});;

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
    renderCompareList();
    loadCategories();   // バックグラウンドで大項目を収集（await しない）
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
      <span class="project-row__meta">
        ${p.client_name  ? `<span class="project-meta-chip project-meta-chip--client">👤 ${escHtml(p.client_name)}</span>` : ''}
        ${p.base_project ? `<span class="project-meta-chip project-meta-chip--base">🔗 ${escHtml(p.base_project)}</span>` : ''}
      </span>
      <span class="project-pstatus project-pstatus--${p.project_status}">${escHtml(p.project_status)}</span>
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

// ── Compare Sidebar ─────────────────────────────────────────────────────────
const compareListEl   = document.getElementById('compare-project-list');
const btnCompareView  = document.getElementById('btn-compare-view');
const btnCompareClear = document.getElementById('btn-compare-clear');
const compareHintEl   = document.getElementById('compare-hint');

let selectedCompareIds = new Set();

function renderCompareList() {
  if (!compareListEl) return;
  if (projects.length === 0) {
    compareListEl.innerHTML = '<div style="font-size:12px;color:var(--color-text-muted);padding:4px 0">プロジェクトがありません</div>';
    return;
  }
  compareListEl.innerHTML = projects.map(p => `
    <label class="compare-item">
      <input type="checkbox" class="compare-checkbox" value="${p.id}"${selectedCompareIds.has(p.id) ? ' checked' : ''}>
      <span class="compare-item__dot" style="background:${p.color}"></span>
      <span class="compare-item__name" title="${escHtml(p.name)}">${escHtml(p.name)}</span>
    </label>
  `).join('');

  compareListEl.querySelectorAll('.compare-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      const id = parseInt(cb.value, 10);
      if (cb.checked) selectedCompareIds.add(id);
      else selectedCompareIds.delete(id);
      updateCompareBtn();
    });
  });
}

function updateCompareBtn() {
  const count = selectedCompareIds.size;
  if (btnCompareView) btnCompareView.disabled = count < 2;
  if (compareHintEl) {
    compareHintEl.textContent = count === 0
      ? '2つ以上選択してください'
      : count === 1
        ? 'もう1つ選択してください'
        : `${count}件を選択中`;
    compareHintEl.style.color = count >= 2 ? 'var(--color-primary)' : '';
  }
}

btnCompareView?.addEventListener('click', () => {
  if (selectedCompareIds.size < 2) return;
  const ids = Array.from(selectedCompareIds).join(',');
  location.href = `schedule.html?projects=${ids}`;
});

btnCompareClear?.addEventListener('click', () => {
  selectedCompareIds.clear();
  renderCompareList();
  updateCompareBtn();
});

// ── 大項目フィルター ─────────────────────────────────────────────────────────
const catfilterListEl   = document.getElementById('catfilter-list');
const btnCatfilterView  = document.getElementById('btn-catfilter-view');
const btnCatfilterClear = document.getElementById('btn-catfilter-clear');
const catfilterHintEl   = document.getElementById('catfilter-hint');

let allCategories       = [];   // 全プロジェクトから収集した大項目一覧
let selectedCatfilters  = new Set();

async function loadCategories() {
  if (!catfilterListEl) return;
  if (projects.length === 0) {
    catfilterListEl.innerHTML = '<div style="font-size:12px;color:var(--color-text-muted)">プロジェクトがありません</div>';
    return;
  }
  catfilterListEl.innerHTML = '<div style="font-size:12px;color:var(--color-text-muted)">読み込み中...</div>';
  try {
    // 全プロジェクトのタスクを並列取得して大項目を収集
    const allTasksArr = await Promise.all(projects.map(p => api.listTasks(p.id)));
    const catSet = new Set();
    allTasksArr.forEach(tasks => tasks.forEach(t => {
      if (t.category_large) catSet.add(t.category_large);
    }));
    allCategories = [...catSet].sort((a, b) => a.localeCompare(b, 'ja'));
    renderCatfilterList();
  } catch (e) {
    LOG.error('loadCategories() エラー:', e);
    if (catfilterListEl) catfilterListEl.innerHTML = '<div style="font-size:12px;color:var(--color-danger)">読み込みエラー</div>';
  }
}

function renderCatfilterList() {
  if (!catfilterListEl) return;
  if (allCategories.length === 0) {
    catfilterListEl.innerHTML = '<div style="font-size:12px;color:var(--color-text-muted)">大項目がありません</div>';
    return;
  }
  catfilterListEl.innerHTML = allCategories.map(cat => `
    <label class="compare-item">
      <input type="checkbox" class="catfilter-checkbox" value="${escHtml(cat)}"${selectedCatfilters.has(cat) ? ' checked' : ''}>
      <span class="compare-item__name" title="${escHtml(cat)}">${escHtml(cat)}</span>
    </label>
  `).join('');

  catfilterListEl.querySelectorAll('.catfilter-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) selectedCatfilters.add(cb.value);
      else selectedCatfilters.delete(cb.value);
      updateCatfilterBtn();
    });
  });
}

function updateCatfilterBtn() {
  const count = selectedCatfilters.size;
  if (btnCatfilterView) btnCatfilterView.disabled = count < 1;
  if (catfilterHintEl) {
    catfilterHintEl.textContent = count === 0
      ? '1つ以上選択してください'
      : `${count}件の大項目を選択中`;
    catfilterHintEl.style.color = count >= 1 ? 'var(--color-primary)' : '';
  }
}

btnCatfilterView?.addEventListener('click', () => {
  if (selectedCatfilters.size < 1) return;
  const url = new URL('schedule.html', location.href);
  projects.forEach(p => url.searchParams.append('projects', p.id));
  selectedCatfilters.forEach(cat => url.searchParams.append('catfilter', cat));
  location.href = url.toString();
});

btnCatfilterClear?.addEventListener('click', () => {
  selectedCatfilters.clear();
  renderCatfilterList();
  updateCatfilterBtn();
});

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

// コピー元選択 → 基準日セクションの表示切替（要素が存在しない場合は安全にスキップ）
document.getElementById('copy-source-id')?.addEventListener('change', e => {
  const sec = document.getElementById('copy-anchor-section');
  if (sec) sec.hidden = !e.target.value;
});

function openProjectModal(project = null) {
  LOG.info('openProjectModal:', project);
  const isNew = !project;
  modalTitle.textContent = isNew ? 'New Project' : 'Edit Project';
  const submitBtn = document.getElementById('project-modal-submit-btn');
  if (submitBtn) submitBtn.textContent = isNew ? 'Create' : 'Save';
  modalForm.reset();
  modalForm.project_id.value = project?.id ?? '';

  if (project) {
    modalForm.name.value           = project.name;
    modalForm.description.value    = project.description    ?? '';
    modalForm.color.value          = project.color;
    modalForm.project_status.value = project.project_status ?? '未開始';
    modalForm.client_name.value    = project.client_name    ?? '';
    modalForm.base_project.value   = project.base_project   ?? '';
    modalForm.view_mode.value      = project.view_mode      ?? '';
  }

  // コピーセクションは新規作成時のみ表示
  const copySection = document.getElementById('copy-section');
  copySection.hidden = !isNew;
  document.getElementById('copy-anchor-section').hidden = true;

  if (isNew) {
    // コピー元リストを現在の projects で埋める
    const sel = document.getElementById('copy-source-id');
    sel.innerHTML = '<option value="">-- コピーしない --</option>'
      + projects.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('');
  }

  modal.hidden = false;
  modalForm.name.focus();
}

function closeProjectModal() { modal.hidden = true; }

modalForm.addEventListener('submit', async e => {
  e.preventDefault();
  const fd   = new FormData(modalForm);
  const data = {
    name:           fd.get('name'),
    description:    fd.get('description')    || null,
    color:          fd.get('color'),
    project_status: fd.get('project_status') || '未開始',
    client_name:    fd.get('client_name')    || null,
    base_project:   fd.get('base_project')   || null,
    view_mode:      fd.get('view_mode')      || null,
  };
  const id         = fd.get('project_id');
  const copySource = fd.get('copy_source_id');
  const anchorType = fd.get('copy_anchor_type') || 'start';
  const anchorDate = fd.get('copy_anchor_date');

  // コピーモードのバリデーション
  if (!id && copySource && !anchorDate) {
    showToast('コピー時は基準日を入力してください', 'error');
    return;
  }

  LOG.info('projectModal submit:', { id, data, copySource, anchorType, anchorDate });
  const submitBtn = document.getElementById('project-modal-submit-btn');
  if (submitBtn) submitBtn.disabled = true;
  try {
    if (id) {
      await api.updateProject(parseInt(id), data);
      showToast('プロジェクトを更新しました', 'success');
      closeProjectModal();
      await loadProjects();
    } else {
      const created = await api.createProject(data);
      if (copySource) {
        showToast('タスクをコピー中...', 'info');
        await copyProjectTasks(parseInt(copySource), created.id, anchorType, anchorDate);
        showToast('コピー完了', 'success');
        closeProjectModal();
        location.href = `schedule.html?project=${created.id}`;
      } else {
        showToast('プロジェクトを作成しました', 'success');
        closeProjectModal();
        await loadProjects();
      }
    }
  } catch (ex) {
    showToast(ex.message, 'error');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

// ── プロジェクトコピー ────────────────────────────────────────────────────
async function copyProjectTasks(srcId, newProjectId, anchorType, anchorDate) {
  const srcTasks = await api.listTasks(srcId);
  if (srcTasks.length === 0) return;

  // コピー元の全日付からアンカー（開始 or 終了）を算出
  const allDates    = srcTasks.flatMap(t => [t.start_date, t.end_date]);
  const originalAnchor = anchorType === 'start'
    ? allDates.reduce((a, b) => a < b ? a : b)   // min
    : allDates.reduce((a, b) => a > b ? a : b);  // max

  const shiftMs   = new Date(anchorDate + 'T00:00:00') - new Date(originalAnchor + 'T00:00:00');
  const shiftDays = Math.round(shiftMs / 86400000);

  // Pass 1: タスクを日程シフトして作成、old id → new id マップを記録
  const idMap = new Map();
  for (const t of srcTasks) {
    const created = await api.createTask(newProjectId, {
      category_large:  t.category_large,
      category_medium: t.category_medium,
      name:       t.name,
      start_date: shiftDate(t.start_date, shiftDays),
      end_date:   shiftDate(t.end_date,   shiftDays),
      task_type:  t.task_type,
      progress:   0,
      color:      t.color,
      notes:      t.notes,
      sort_order: t.sort_order,
    });
    idMap.set(t.id, created.id);
  }

  // Pass 2: 依存関係を新 ID に読み替えて登録
  for (const t of srcTasks) {
    if (!t.dependencies?.length) continue;
    const newId  = idMap.get(t.id);
    const depIds = t.dependencies.map(d => idMap.get(d.depends_on_id)).filter(Boolean);
    if (depIds.length > 0) await api.updateTask(newProjectId, newId, { dependency_ids: depIds });
  }
}

function shiftDate(dateStr, shiftDays) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + shiftDays);
  return d.toISOString().slice(0, 10);
}

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
