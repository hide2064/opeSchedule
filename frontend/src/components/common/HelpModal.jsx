import { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';

export default function HelpModal({ onClose }) {
  const [html, setHtml]       = useState('');
  const [toc, setToc]         = useState([]);
  const [loading, setLoading] = useState(true);
  const contentRef = useRef(null);

  useEffect(() => {
    fetch('/api/manual')
      .then(r => r.text())
      .then(md => {
        const headings = [];
        md.split('\n').forEach(line => {
          const m = line.match(/^## (.+)/);
          if (m) headings.push(m[1].replace(/^[\d]+\.\s*/, '').trim());
        });
        setToc(headings);
        setHtml(marked.parse(md));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const scrollTo = (heading) => {
    if (!contentRef.current) return;
    const h2s = contentRef.current.querySelectorAll('h2');
    for (const el of h2s) {
      if (el.textContent.includes(heading)) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      }
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="help-modal" onClick={e => e.stopPropagation()}>
        <div className="help-modal__header">
          <span>📖 opeSchedule マニュアル</span>
          <button className="btn-icon" onClick={onClose} title="閉じる (Escape)">✕</button>
        </div>
        <div className="help-modal__body">
          <nav className="help-modal__toc">
            {toc.map((h, i) => (
              <button key={i} className="help-toc__item" onClick={() => scrollTo(h)}>
                {h}
              </button>
            ))}
          </nav>
          <div
            ref={contentRef}
            className="help-modal__content markdown-body"
            dangerouslySetInnerHTML={{ __html: loading ? '<p>読み込み中...</p>' : html }}
          />
        </div>
      </div>
    </div>
  );
}
