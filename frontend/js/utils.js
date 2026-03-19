/**
 * utils.js — フロントエンド共通ユーティリティ
 *
 * LOG ファクトリ、Toast、テーマ切替、HTML エスケープ、日付ユーティリティを提供する。
 * app.js / top-screen.js / schedule-screen.js の各モジュールから import して使う。
 * 変更は 1 箇所に集中するため、仕様変更・バグ修正が容易になる。
 */

// ── ロガーファクトリ ──────────────────────────────────────────────────────
// 各モジュールが createLogger('SCH') のように prefix を渡してロガーを生成する。
// コンソール出力に [SCH] / [TOP] / [APP] のプレフィックスが付くことで
// どのモジュールのログかが即座に識別できる。
export function createLogger(prefix) {
  return {
    info:  (...a) => console.log (`[${prefix}]`, ...a),
    warn:  (...a) => console.warn(`[${prefix}]`, ...a),
    error: (...a) => console.error(`[${prefix}]`, ...a),
  };
}

// ── Toast ──────────────────────────────────────────────────────────────────
// index.html / schedule.html の両方に id="toast" 要素が存在する。
// createToast() を呼んだ時点のドキュメント内の #toast を操作する showToast 関数を返す。
// タイマー変数はクロージャ内に閉じ込めることで他モジュールとの干渉を防ぐ。
export function createToast() {
  const toastEl = document.getElementById('toast');
  let timer = null;
  return function showToast(msg, type = 'info') {
    if (timer) clearTimeout(timer);
    toastEl.textContent = msg;
    toastEl.className   = `toast ${type}`;
    toastEl.hidden      = false;
    timer = setTimeout(() => { toastEl.hidden = true; }, 3000);
  };
}

// ── テーマ切替 ────────────────────────────────────────────────────────────
// theme === 'dark' のとき body に theme-dark クラスを付与する。
// CSS 変数（--color-bg 等）が theme-dark セレクタで上書きされることでダーク表示になる。
export function applyTheme(theme) {
  document.body.classList.toggle('theme-dark', theme === 'dark');
}

// ── HTML エスケープ ───────────────────────────────────────────────────────
// ユーザー入力を innerHTML に埋め込む際の XSS を防ぐ。
// textContent で十分な場合はこの関数は不要だが、
// テンプレートリテラルで HTML を生成する箇所では必ず使う。
export function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── 日付ユーティリティ ────────────────────────────────────────────────────
// dateStr + 'T00:00:00' でローカル時刻として解釈させる。
// 'YYYY-MM-DD' のみを new Date() に渡すと UTC 0時として解釈され、
// タイムゾーン（JST = UTC+9）の影響で前日にずれる問題を回避する。
export function parseDate(s) {
  return new Date(s + 'T00:00:00');
}

export function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// Date オブジェクトまたは ISO 文字列を 'YYYY-MM-DD' 形式に変換する。
export function fmtDate(d) {
  if (typeof d === 'string') return d.slice(0, 10);
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 2 つの Date の差を日数（整数）で返す。
export function diffDays(a, b) {
  return Math.round((b - a) / 86400000);
}

// 指定日が属する週の月曜日を返す（週の先頭を月曜とするため）。
export function mondayOf(d) {
  const r = new Date(d);
  const dow = r.getDay();
  r.setDate(r.getDate() - (dow === 0 ? 6 : dow - 1));
  return r;
}
