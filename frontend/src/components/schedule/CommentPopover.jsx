import { useState, useEffect, useRef, useCallback } from 'react';
import * as api from '../../api.js';
import { useToast } from '../../contexts/ToastContext.jsx';

export default function CommentPopover({ task, currentPid, anchorEl, onClose, onCountChange }) {
  const showToast = useToast();
  const panelRef  = useRef(null);
  const inputRef  = useRef(null);
  const [pos, setPos]           = useState({ left: -9999, top: -9999 });
  const [comments, setComments] = useState([]);
  const [text, setText]         = useState('');
  const [loading, setLoading]   = useState(true);

  // コメント読み込み
  useEffect(() => {
    api.listComments(currentPid, task.id)
      .then(data => { setComments(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [currentPid, task.id]);

  // ポップオーバーの位置計算（コメント読み込み後に再計算）
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || !anchorEl) return;
    requestAnimationFrame(() => {
      const rect   = anchorEl.getBoundingClientRect();
      const PW     = panel.offsetWidth;
      const PH     = panel.offsetHeight;
      const margin = 10;
      let x = rect.right + margin;
      let y = rect.top + rect.height / 2 - PH / 2;
      if (x + PW + margin > window.innerWidth)  x = rect.left - PW - margin;
      x = Math.max(margin, Math.min(x, window.innerWidth  - PW - margin));
      y = Math.max(margin, Math.min(y, window.innerHeight - PH - margin));
      setPos({ left: x, top: y });
      inputRef.current?.focus();
    });
  }, [anchorEl, loading]);

  // 外側クリックで閉じる
  useEffect(() => {
    const timer = setTimeout(() => {
      const handler = (ev) => {
        if (panelRef.current && !panelRef.current.contains(ev.target)) onClose();
      };
      document.addEventListener('click', handler);
      return () => document.removeEventListener('click', handler);
    }, 0);
    return () => clearTimeout(timer);
  }, [onClose]);

  // コメント数を親に通知
  useEffect(() => {
    onCountChange?.(task.id, comments.length);
  }, [comments.length, task.id, onCountChange]);

  const handleAdd = useCallback(async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      const comment = await api.createComment(currentPid, task.id, { text: text.trim() });
      setComments(prev => [...prev, comment]);
      setText('');
    } catch (ex) {
      showToast(ex.message, 'error');
    }
  }, [currentPid, task.id, text, showToast]);

  const handleDelete = useCallback(async (commentId) => {
    try {
      await api.deleteComment(currentPid, task.id, commentId);
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch (ex) {
      showToast(ex.message, 'error');
    }
  }, [currentPid, task.id, showToast]);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && !e.shiftKey) handleAdd(e);
  };

  return (
    <div
      ref={panelRef}
      className="comment-popover"
      style={{ position: 'fixed', zIndex: 600, left: pos.left, top: pos.top }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="comment-popover__header">
        <span title={task.name}>💬 {task.name}</span>
        <button className="btn-icon" onClick={onClose}>✕</button>
      </div>

      <div className="comment-popover__list">
        {loading
          ? <div className="comment-empty">読み込み中...</div>
          : comments.length === 0
            ? <div className="comment-empty">コメントはありません</div>
            : comments.map(c => (
              <div key={c.id} className="comment-item">
                <div className="comment-item__text">{c.text}</div>
                <div className="comment-item__meta">
                  <span>
                    {new Date(c.created_at).toLocaleString('ja-JP', {
                      month: 'numeric', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                  <button
                    className="comment-item__del"
                    onClick={() => handleDelete(c.id)}
                    title="削除"
                  >✕</button>
                </div>
              </div>
            ))
        }
      </div>

      <form className="comment-popover__form" onSubmit={handleAdd}>
        <input
          ref={inputRef}
          className="comment-input"
          placeholder="コメントを追加... (Enter で送信)"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="submit" className="btn btn--primary btn--sm">追加</button>
      </form>
    </div>
  );
}
