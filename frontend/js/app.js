/**
 * app.js — AppState + タブ/プロジェクト選択の状態管理 (URL パラメータ駆動)
 */

import { initTopScreen }      from './top-screen.js';
import { initScheduleScreen } from './schedule-screen.js';

// ── Toast ──────────────────────────────────────────────────────────────────
const toastEl  = document.getElementById('toast');
let toastTimer = null;

export function showToast(msg, type = 'info') {
  if (toastTimer) clearTimeout(toastTimer);
  toastEl.textContent = msg;
  toastEl.className   = `toast ${type}`;
  toastEl.hidden      = false;
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3000);
}

// ── AppState ───────────────────────────────────────────────────────────────
export const AppState = {
  selectedProjectId: null,  // number | null
  activeTab: 'top',         // 'top' | 'schedule'

  syncFromURL() {
    const p   = new URLSearchParams(window.location.search);
    const pid = p.get('project');
    this.selectedProjectId = pid ? parseInt(pid, 10) : null;
    this.activeTab = (p.get('tab') === 'schedule') ? 'schedule' : 'top';
  },

  navigate(tab, projectId) {
    const p = new URLSearchParams();
    if (tab) p.set('tab', tab);
    if (projectId != null) p.set('project', String(projectId));
    history.pushState({}, '', '?' + p.toString());
    this.syncFromURL();
    renderApp();
  },

  selectProject(id) {
    this.navigate(this.activeTab, id);
  },
};

// ── Render ─────────────────────────────────────────────────────────────────
const screenTop      = document.getElementById('screen-top');
const screenSchedule = document.getElementById('screen-schedule');
const tabTop         = document.getElementById('tab-top');
const tabSchedule    = document.getElementById('tab-schedule');

let scheduleInited = false;
let topInited      = false;

export function renderApp() {
  const { activeTab, selectedProjectId } = AppState;

  tabTop.classList.toggle('active',      activeTab === 'top');
  tabSchedule.classList.toggle('active', activeTab === 'schedule');

  screenTop.hidden      = activeTab !== 'top';
  screenSchedule.hidden = activeTab !== 'schedule';

  if (activeTab === 'top') {
    if (!topInited) { initTopScreen(); topInited = true; }
    document.querySelectorAll('.project-row').forEach(row => {
      row.classList.toggle('selected', parseInt(row.dataset.id) === selectedProjectId);
    });
  }

  if (activeTab === 'schedule') {
    if (selectedProjectId == null) {
      document.getElementById('gantt-container').innerHTML =
        '<div class="no-project-msg">Top画面でプロジェクトを選択してください</div>';
      return;
    }
    if (!scheduleInited) { initScheduleScreen(); scheduleInited = true; }
    window._loadGanttProject?.(selectedProjectId);
  }
}

// ── Tab ボタン ─────────────────────────────────────────────────────────────
tabTop.addEventListener('click', () => {
  AppState.navigate('top', AppState.selectedProjectId);
});

tabSchedule.addEventListener('click', () => {
  if (AppState.selectedProjectId == null) {
    showToast('Top画面でプロジェクトを選択してください', 'error');
    return;
  }
  AppState.navigate('schedule', AppState.selectedProjectId);
});

// ── テーマ適用 ─────────────────────────────────────────────────────────────
export function applyTheme(theme) {
  document.body.classList.toggle('theme-dark', theme === 'dark');
}

// ── キーボードショートカット ────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  // 開いているモーダルを Esc で閉じる
  for (const id of ['project-modal', 'add-task-modal']) {
    const el = document.getElementById(id);
    if (el && !el.hidden) { el.hidden = true; return; }
  }
  // タスク詳細パネルを閉じる
  const panel = document.getElementById('task-detail-panel');
  if (panel && !panel.hidden) { panel.hidden = true; }
});

// ── Boot ───────────────────────────────────────────────────────────────────
AppState.syncFromURL();
window.addEventListener('popstate', () => { AppState.syncFromURL(); renderApp(); });
renderApp();
