import { useEffect } from 'react';

export default function Modal({ title, onClose, children, width = 440 }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="modal" style={{ display: 'flex' }}>
      <div className="modal__backdrop" onClick={onClose} />
      <div className="modal__box" style={{ width, maxWidth: 'calc(100vw - 32px)' }}>
        <div className="modal__header">
          <h3 className="modal__title">{title}</h3>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
