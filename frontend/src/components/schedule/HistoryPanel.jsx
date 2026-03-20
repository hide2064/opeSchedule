/**
 * HistoryPanel — スケジュール履歴パネル
 *
 * 画面右端からスライドイン表示。3つのセクションで構成:
 *  1. バージョンUP ボタン（ラベル入力 → POST /snapshots）
 *  2. 未コミットの変更一覧（API changelog から取得。pendingChanges が変化したら再取得）
 *  3. 過去バージョン一覧（クリックで読み取り専用表示）
 */
import { useState, useEffect, useCallback } from 'react';
import * as api from '../../api.js';
import { useToast } from '../../contexts/ToastContext.jsx';

export default function HistoryPanel({
  projectId,
  pendingChanges,   // ローカルで追跡した未コミット変更数（バッジ用）。変化を検知して再取得トリガーに使う
  currentSnapId,    // 現在表示中のスナップショット ID（null = 最新）
  onSelectSnap,     // (snap) => void  過去バージョン選択
  onVersionUp,      // () => void  バージョンUP 完了後のコールバック（ローカル状態リセット）
  onClose,
}) {
  const showToast = useToast();
  const [snapshots, setSnapshots]   = useState([]);
  const [changelog, setChangelog]   = useState([]);
  const [loadingSnap, setLoadingSnap] = useState(true);
  const [loadingLog, setLoadingLog]   = useState(true);
  const [label, setLabel]           = useState('');
  const [saving, setSaving]         = useState(false);

  // データ取得
  const fetchAll = useCallback(async () => {
    try {
      const [snaps, logs] = await Promise.all([
        api.listSnapshots(projectId),
        api.listChangelog(projectId),
      ]);
      setSnapshots(snaps);
      setChangelog(logs);
    } catch (e) {
      showToast('履歴の読み込みエラー: ' + e.message, 'error');
    } finally {
      setLoadingSnap(false);
      setLoadingLog(false);
    }
  }, [projectId]);

  // マウント時 + pendingChanges が増えるたびに再取得（API changelog は DB 永続化済みなので最新が得られる）
  const pendingCount = pendingChanges.length;
  useEffect(() => { fetchAll(); }, [fetchAll, pendingCount]);

  // バージョンUP 実行
  const handleVersionUp = async () => {
    const trimmed = label.trim() || `v${(snapshots[0]?.version_number ?? 0) + 1}`;
    setSaving(true);
    try {
      await api.createSnapshot(projectId, trimmed);
      setLabel('');
      onVersionUp();        // ローカル pendingChanges リセット
      await fetchAll();     // 一覧を再取得
      showToast('バージョンUP しました: ' + trimmed, 'success');
    } catch (e) {
      showToast('バージョンUP エラー: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // 過去バージョン選択
  const handleSelectSnap = async (snap) => {
    try {
      const detail = await api.getSnapshot(projectId, snap.id);
      const tasks  = JSON.parse(detail.tasks_json);
      onSelectSnap({ ...snap, tasks });
    } catch (e) {
      showToast('バージョン読み込みエラー: ' + e.message, 'error');
    }
  };

  // API changelog が未コミット変更の正源泉（DB 永続化済み）
  const hasUncommitted = changelog.length > 0;

  return (
    <div className="history-panel">
      {/* ヘッダー */}
      <div className="history-panel__header">
        <span className="history-panel__title">📋 履歴 / バージョン管理</span>
        <button className="history-panel__close" onClick={onClose} title="閉じる">✕</button>
      </div>

      <div className="history-panel__body">

        {/* ── バージョンUP セクション ── */}
        <div className="history-vup">
          <div className="history-vup__label-row">
            <input
              className="history-vup__input"
              type="text"
              placeholder={`バージョン名（例: v${(snapshots[0]?.version_number ?? 0) + 1} リリース準備）`}
              value={label}
              onChange={e => setLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !saving && handleVersionUp()}
              disabled={saving}
            />
          </div>
          <button
            className="history-vup__btn"
            onClick={handleVersionUp}
            disabled={saving}
          >
            {saving ? '保存中...' : '⬆ バージョンUP'}
          </button>
          <p className="history-vup__hint">
            現在のタスク状態を新しいバージョンとして保存します。
          </p>
        </div>

        {/* ── 未コミットの変更 ── */}
        <div className="history-section">
          <div className="history-section__title">
            {hasUncommitted
              ? <><span className="history-badge history-badge--warn">●</span> 未コミットの変更（{changelog.length}件）</>
              : <><span className="history-badge history-badge--ok">●</span> 未コミットの変更なし</>
            }
          </div>
          {loadingLog && <div className="history-panel__loading">読み込み中...</div>}
          {!loadingLog && hasUncommitted && (
            <div className="history-changelog">
              {changelog.map((c, i) => (
                <div key={c.id ?? i} className="history-changelog__item">
                  <span className="history-changelog__op">{opIcon(c.operation)} {c.operation}</span>
                  {c.task_name && <span className="history-changelog__name">{c.task_name}</span>}
                  {c.detail    && <span className="history-changelog__detail">{c.detail}</span>}
                  <span className="history-changelog__time">{c.created_at ? formatDate(c.created_at) : '今'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 過去バージョン一覧 ── */}
        <div className="history-section">
          <div className="history-section__title">過去のバージョン</div>
          {loadingSnap && <div className="history-panel__loading">読み込み中...</div>}
          {!loadingSnap && snapshots.length === 0 && (
            <div className="history-panel__empty">
              バージョンはまだありません。<br />
              「バージョンUP」で現在の状態を保存できます。
            </div>
          )}
          {!loadingSnap && snapshots.map(snap => (
            <div
              key={snap.id}
              className={`history-snap${snap.id === currentSnapId ? ' history-snap--active' : ''}`}
              onClick={() => handleSelectSnap(snap)}
              title="クリックして過去バージョンを表示"
            >
              <div className="history-snap__label">
                <span className="history-snap__ver">v{snap.version_number}</span>
                <span className="history-snap__op">{snap.label}</span>
              </div>
              <div className="history-snap__meta">
                <span className="history-snap__tasks">{snap.task_count} タスク</span>
                <span className="history-snap__date">{formatDate(snap.created_at)}</span>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

// ── ヘルパー ──────────────────────────────────────────────────────────────────

function opIcon(op) {
  switch (op) {
    case 'タスク追加': return '＋';
    case 'タスク更新': return '✎';
    case 'タスク削除': return '✕';
    case '日程変更':   return '📅';
    case '並び替え':   return '↕';
    default:           return '・';
  }
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
