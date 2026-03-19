/**
 * app.js — Top画面 エントリポイント
 */

// プレフィックス [APP] でコンソール出力を区別するロガー。
// info / error の 2 レベルのみ用意し、Top画面全体のログを統一的に出力する。
const LOG = {
  info:  (...a) => console.log ('[APP]',  ...a),
  error: (...a) => console.error('[APP]', ...a),
};

LOG.info('app.js モジュール評価開始');

import { initTopScreen } from './top-screen.js';

LOG.info('top-screen.js インポート完了');

// ── キーボードショートカット ────────────────────────────────────────────────
// Escape キーでプロジェクトモーダルを閉じる。
// UX向上のためページ全体（document）にグローバル登録し、
// フォーカス位置に依存せず確実に動作するようにする。
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const modal = document.getElementById('project-modal');
  if (modal && !modal.hidden) { modal.hidden = true; }
});

// ── Boot ───────────────────────────────────────────────────────────────────
// initTopScreen() を呼んで Top画面を初期化する。
// async 関数のため Promise を返す。エラーが起きた場合でも
// .catch() で確実にキャッチしてコンソールに表示し、
// 未ハンドルの Promise rejection を防ぐ。
LOG.info('initTopScreen() 呼び出し開始');
initTopScreen()
  .then(() => LOG.info('initTopScreen() 完了'))
  .catch(err => LOG.error('initTopScreen() 失敗:', err));
