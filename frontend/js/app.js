/**
 * app.js — Top画面 エントリポイント
 */

import { initTopScreen } from './top-screen.js';

// ── キーボードショートカット ────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const modal = document.getElementById('project-modal');
  if (modal && !modal.hidden) { modal.hidden = true; }
});

// ── Boot ───────────────────────────────────────────────────────────────────
initTopScreen();
