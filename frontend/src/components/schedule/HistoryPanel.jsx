/**
 * HistoryPanel — スケジュール履歴（バージョン）一覧パネル。
 * History ボタン押下で右側からスライドイン表示される。
 * バージョンを選択するとそのスナップショットを読み込んで onSelectSnap() を呼ぶ。
 * 「現在に戻る」ボタンで historyMode を解除する。
 */
import { useState, useEffect } from 'react';
import * as api from '../../api.js';
import { useToast } from '../../contexts/ToastContext.jsx';

export default function HistoryPanel({ projectId, currentSnapId, onSelectSnap, onClose }) {
  const showToast = useToast();
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const list = await api.listSnapshots(projectId);
        setSnapshots(list);
      } catch (e) {
        showToast('履歴の読み込みエラー: ' + e.message, 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  const handleSelect = async (snap) => {
    try {
      const detail = await api.getSnapshot(projectId, snap.id);
      const tasks  = JSON.parse(detail.tasks_json);
      onSelectSnap({ ...snap, tasks });
    } catch (e) {
      showToast('バージョン読み込みエラー: ' + e.message, 'error');
    }
  };

  return (
    <div className="history-panel">
      <div className="history-panel__header">
        <span className="history-panel__title">📋 履歴</span>
        <button className="history-panel__close" onClick={onClose} title="閉じる">✕</button>
      </div>
      <div className="history-panel__body">
        {loading && <div className="history-panel__loading">読み込み中...</div>}
        {!loading && snapshots.length === 0 && (
          <div className="history-panel__empty">まだ履歴がありません。<br />タスクを追加・編集すると自動的に記録されます。</div>
        )}
        {!loading && snapshots.map(snap => (
          <div
            key={snap.id}
            className={`history-snap${snap.id === currentSnapId ? ' history-snap--active' : ''}`}
            onClick={() => handleSelect(snap)}
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
  );
}

function formatDate(isoStr) {
  const d = new Date(isoStr);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
