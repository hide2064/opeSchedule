/**
 * app.js — Top画面 エントリポイント (Toast + テーマ + Top画面初期化)
 */

import { initTopScreen } from './top-screen.js';

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

// ── テーマ適用 ─────────────────────────────────────────────────────────────
export function applyTheme(theme) {
  document.body.classList.toggle('theme-dark', theme === 'dark');
}

// ── キーボードショートカット ────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const modal = document.getElementById('project-modal');
  if (modal && !modal.hidden) { modal.hidden = true; }
});

// ── Boot ───────────────────────────────────────────────────────────────────
initTopScreen();
