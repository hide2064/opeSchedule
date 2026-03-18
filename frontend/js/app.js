/**
 * app.js — Top画面 エントリポイント
 */

const LOG = {
  info:  (...a) => console.log ('[APP]',  ...a),
  error: (...a) => console.error('[APP]', ...a),
};

LOG.info('app.js モジュール評価開始');

import { initTopScreen } from './top-screen.js';

LOG.info('top-screen.js インポート完了');

// ── キーボードショートカット ────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const modal = document.getElementById('project-modal');
  if (modal && !modal.hidden) { modal.hidden = true; }
});

// ── Boot ───────────────────────────────────────────────────────────────────
LOG.info('initTopScreen() 呼び出し開始');
initTopScreen()
  .then(() => LOG.info('initTopScreen() 完了'))
  .catch(err => LOG.error('initTopScreen() 失敗:', err));
