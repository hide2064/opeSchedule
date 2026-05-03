import { useState, useEffect, useRef, useCallback } from 'react';
import * as api from '../../api.js';
import { useToast } from '../../contexts/ToastContext.jsx';

/**
 * TodoPanel — プロジェクト全タスクのToDo一覧をドロップダウン表示するパネル。
 * GanttChart のツールバーバッジからトグル表示される。
 */
export default function TodoPanel({ currentPid, tasks, onClose, onTodoStatsChange }) {
  const showToast  = useToast();
  const panelRef   = useRef(null);
  // { taskId: Comment[] } のマップ
  const [todoMap, setTodoMap]   = useState({});
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('remaining'); // 'remaining' | 'all'

  // 実タスク一覧（セパレーター行を除く）
  const realTasks = tasks.filter(t => !t._isSep);

  // 全タスクのToDo一覧を取得
  useEffect(() => {
    if (!currentPid || realTasks.length === 0) { setLoading(false); return; }

    const fetchAll = async () => {
      try {
        const results = await Promise.all(
          realTasks.map(t =>
            api.listComments(t._project_id ?? currentPid, t.id)
              .then(cs => [t.id, cs.filter(c => c.is_todo)])
              .catch(() => [t.id, []])
          )
        );
        const map = {};
        for (const [tid, todos] of results) {
          if (todos.length > 0) map[tid] = todos;
        }
        setTodoMap(map);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [currentPid]);

  // 統計を親に通知
  useEffect(() => {
    const allTodos    = Object.values(todoMap).flat();
    const total       = allTodos.length;
    const done        = allTodos.filter(c => c.is_done).length;
    const remaining   = total - done;
    onTodoStatsChange?.({ total, done, remaining });
  }, [todoMap, onTodoStatsChange]);

  // パネル外クリックで閉じる
  useEffect(() => {
    const timer = setTimeout(() => {
      const handler = (ev) => {
        if (panelRef.current && !panelRef.current.contains(ev.target)) onClose();
      };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, 100);
    return () => clearTimeout(timer);
  }, [onClose]);

  const handleToggleDone = useCallback(async (task, comment) => {
    const pid = task._project_id ?? currentPid;
    try {
      const updated = await api.updateComment(pid, task.id, comment.id, {
        is_done: !comment.is_done,
      });
      setTodoMap(prev => ({
        ...prev,
        [task.id]: (prev[task.id] ?? []).map(c => c.id === updated.id ? updated : c),
      }));
    } catch (ex) {
      showToast(ex.message, 'error');
    }
  }, [currentPid, showToast]);

  // 表示するToDo一覧を構築（タスク名付き）
  const todoEntries = realTasks.flatMap(t => {
    const todos = (todoMap[t.id] ?? []);
    return todos
      .filter(c => filter === 'all' || !c.is_done)
      .map(c => ({ task: t, comment: c }));
  });

  const allTodos   = Object.values(todoMap).flat();
  const total      = allTodos.length;
  const remaining  = allTodos.filter(c => !c.is_done).length;

  return (
    <div className="todo-panel" ref={panelRef}>
      <div className="todo-panel__header">
        <span className="todo-panel__title">
          📌 ToDo一覧
          <span className="todo-panel__stats">
            残 {remaining} / 全 {total} 件
          </span>
        </span>
        <div className="todo-panel__filters">
          <button
            className={`todo-filter-btn${filter === 'remaining' ? ' is-active' : ''}`}
            onClick={() => setFilter('remaining')}
          >未完了のみ</button>
          <button
            className={`todo-filter-btn${filter === 'all' ? ' is-active' : ''}`}
            onClick={() => setFilter('all')}
          >すべて</button>
        </div>
        <button className="btn-icon" onClick={onClose}>✕</button>
      </div>

      <div className="todo-panel__list">
        {loading ? (
          <div className="todo-panel__empty">読み込み中...</div>
        ) : todoEntries.length === 0 ? (
          <div className="todo-panel__empty">
            {filter === 'remaining' ? '未完了のToDoはありません 🎉' : 'ToDoがありません'}
          </div>
        ) : (
          todoEntries.map(({ task, comment }) => (
            <div
              key={`${task.id}-${comment.id}`}
              className={`todo-panel__item${comment.is_done ? ' is-done' : ''}`}
            >
              <button
                className={`comment-done-btn${comment.is_done ? ' is-done' : ''}`}
                onClick={() => handleToggleDone(task, comment)}
                title={comment.is_done ? '未完了に戻す' : '完了にする'}
              >
                {comment.is_done ? '✅' : '☐'}
              </button>
              <div className="todo-panel__item-body">
                <div className={`todo-panel__item-text${comment.is_done ? ' is-done' : ''}`}>
                  {comment.text}
                </div>
                <div className="todo-panel__item-task">
                  {task.category_large && (
                    <span className="todo-panel__item-cat">
                      {task.category_large.replace(/^\x00\d+:/, '')}
                    </span>
                  )}
                  <span className="todo-panel__item-taskname">{task.name}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
