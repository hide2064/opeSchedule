/**
 * api.js — FastAPI バックエンドへの fetch ラッパー
 */

const BASE = '/api/v1';

// ── ログユーティリティ ──────────────────────────────────────────────────────
const LOG = {
  info:  (...a) => console.log ('[API]',  ...a),
  warn:  (...a) => console.warn('[API]',  ...a),
  error: (...a) => console.error('[API]', ...a),
};

function parseDetail(json, fallback) {
  if (typeof json.detail === 'string') return json.detail;
  if (Array.isArray(json.detail)) {
    // FastAPI validation errors: [{loc, msg, type}, ...]
    return json.detail.map(d => d.msg ?? JSON.stringify(d)).join(', ');
  }
  return fallback;
}

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
export const updateDates  = (pid, tid, d)      => request('PATCH', `/projects/${pid}/tasks/${tid}/dates`, d);
export const deleteTask   = (pid, tid)         => request('DELETE',`/projects/${pid}/tasks/${tid}`);
export const reorderTasks = (pid, items)       => request('POST',  `/projects/${pid}/tasks/reorder`, items);

// ── Import / Export ──────────────────────────────────────
export const exportProject = (pid, format) =>
  fetch(`${BASE}/projects/${pid}/export?format=${format}`);

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
