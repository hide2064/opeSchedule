/**
 * api.js — FastAPI バックエンドへの fetch ラッパー
 */

// API のベース URL。バックエンドと同一オリジンで配信されるため
// 絶対 URL ではなく相対パスで指定し、ホスト変更に対応しやすくする。
const BASE = '/api/v1';

// ── ログユーティリティ ──────────────────────────────────────────────────────
const LOG = {
  info:  (...a) => console.log ('[API]',  ...a),
  warn:  (...a) => console.warn('[API]',  ...a),
  error: (...a) => console.error('[API]', ...a),
};

// FastAPI はエラー詳細を 2 つの形式で返す。
//   1. 文字列: { "detail": "Not Found" }
//   2. バリデーションエラー配列: { "detail": [{loc, msg, type}, ...] }
// 両方をハンドリングして人間が読めるメッセージ文字列に変換する。
// 解釈できない場合は fallback（HTTP ステータスコード文字列）をそのまま返す。
function parseDetail(json, fallback) {
  if (typeof json.detail === 'string') return json.detail;
  if (Array.isArray(json.detail)) {
    // FastAPI validation errors: [{loc, msg, type}, ...]
    return json.detail.map(d => d.msg ?? JSON.stringify(d)).join(', ');
  }
  return fallback;
}

// 全 API 呼び出しの共通処理。以下を一元管理する:
//   - リクエスト前後のログ出力（→ 送信 / ← 受信）
//   - ネットワークエラー（fetch 自体が reject した場合）のキャッチとログ
//   - HTTP エラー（!res.ok）時のエラーメッセージ解析と throw
//   - 204 No Content レスポンスの特殊処理（body がないため null を返す）
//   - 正常レスポンスの JSON パースとログ出力
async function request(method, path, body = null) {
  const url = BASE + path;
  LOG.info(`→ ${method} ${url}`, body ?? '');
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== null) opts.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(url, opts);
  } catch (networkErr) {
    LOG.error(`ネットワークエラー ${method} ${url}:`, networkErr);
    throw networkErr;
  }

  LOG.info(`← ${res.status} ${method} ${url}`);

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { detail = parseDetail(await res.json(), detail); } catch {}
    LOG.error(`エラーレスポンス: ${detail}`);
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  const data = await res.json();
  LOG.info(`レスポンスデータ:`, data);
  return data;
}

// ── Config ───────────────────────────────────────────────
export const getConfig    = ()       => request('GET',   '/config');
export const updateConfig = (data)   => request('PATCH', '/config', data);

// ── Projects ─────────────────────────────────────────────
// includeArchived: Top画面の「アーカイブ済みを表示」チェックボックスの状態を渡す。
// true の場合は status='archived' のプロジェクトもリストに含める。
export const listProjects   = (includeArchived = false) =>
  request('GET', `/projects?include_archived=${includeArchived}`);
export const createProject  = (data)  => request('POST',   '/projects', data);
export const getProject     = (id)    => request('GET',    `/projects/${id}`);
export const updateProject  = (id, d) => request('PATCH',  `/projects/${id}`, d);
export const deleteProject  = (id)    => request('DELETE', `/projects/${id}`);

// ── Tasks ────────────────────────────────────────────────
export const listTasks    = (pid)              => request('GET',   `/projects/${pid}/tasks`);
export const createTask   = (pid, data)        => request('POST',  `/projects/${pid}/tasks`, data);
export const updateTask   = (pid, tid, d)      => request('PATCH', `/projects/${pid}/tasks/${tid}`, d);
// updateDates: ドラッグ&ドロップ専用の軽量エンドポイント。
// start_date / end_date のみを送信し、他フィールドを誤って上書きしないようにする。
export const updateDates  = (pid, tid, d)      => request('PATCH', `/projects/${pid}/tasks/${tid}/dates`, d);
export const deleteTask   = (pid, tid)         => request('DELETE',`/projects/${pid}/tasks/${tid}`);
export const reorderTasks = (pid, items)       => request('POST',  `/projects/${pid}/tasks/reorder`, items);

// ── Import / Export ──────────────────────────────────────
// exportProject: レスポンスを Blob（バイナリ）として受け取るため、
// JSON 専用の request() ではなく生の fetch を直接使用する。
// 呼び出し元で res.blob() を呼んでファイルダウンロードを行う。
export const exportProject = (pid, format) =>
  fetch(`${BASE}/projects/${pid}/export?format=${format}`);

// importProject: ファイルを multipart/form-data で送信する。
// Content-Type を明示的に指定すると boundary が欠落するため、
// fetch に自動設定させる（JSON 専用の request() は使用できない）。
export async function importProject(file) {
  LOG.info(`→ POST /projects/import file=${file.name}`);
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE}/projects/import`, { method: 'POST', body: form });
  LOG.info(`← ${res.status} POST /projects/import`);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { detail = parseDetail(await res.json(), detail); } catch {}
    LOG.error(`インポートエラー: ${detail}`);
    throw new Error(detail);
  }
  const data = await res.json();
  LOG.info('インポート完了:', data);
  return data;
}
