import { useState, useEffect } from 'react';
import * as api from '../../api.js';

export default function Sidebar({ projects }) {
  const [compareOpen, setCompareOpen]     = useState(false);
  const [catfilterOpen, setCatfilterOpen] = useState(false);
  const [selectedCompare, setSelectedCompare]   = useState(new Set());
  const [categories, setCategories]             = useState([]);
  const [selectedCats, setSelectedCats]         = useState(new Set());

  useEffect(() => {
    if (!catfilterOpen || projects.length === 0) return;
    (async () => {
      try {
        const all = await Promise.all(projects.map(p => api.listTasks(p.id)));
        const cats = new Set();
        all.forEach(tasks => tasks.forEach(t => { if (t.category_large) cats.add(t.category_large); }));
        setCategories([...cats].sort((a, b) => a.localeCompare(b, 'ja')));
      } catch {}
    })();
  }, [catfilterOpen, projects]);

  const toggleCompare = (id) => setSelectedCompare(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleCat = (cat) => setSelectedCats(prev => {
    const next = new Set(prev);
    next.has(cat) ? next.delete(cat) : next.add(cat);
    return next;
  });

  const goCompare = () => {
    if (selectedCompare.size < 2) return;
    window.location.href = `/schedule?projects=${[...selectedCompare].join(',')}`;
  };

  const goCatfilter = () => {
    if (selectedCats.size < 1) return;
    const url = new URL('/schedule', window.location.href);
    projects.forEach(p => url.searchParams.append('projects', p.id));
    selectedCats.forEach(cat => url.searchParams.append('catfilter', cat));
    window.location.href = url.toString();
  };

  return (
    <aside className="compare-sidebar">
      {/* 比較表示 */}
      <div
        className={`compare-sidebar__header sidebar-toggle-header${compareOpen ? ' is-open' : ''}`}
        onClick={() => setCompareOpen(o => !o)}
      >
        <span>📊</span><span>比較表示</span>
        <span className="sidebar-toggle-arrow">▶</span>
      </div>
      {compareOpen && (
        <>
          <p className="compare-sidebar__desc">複数プロジェクトを選択してまとめてガントチャート表示</p>
          <div className="compare-project-list">
            {projects.length === 0
              ? <div style={{fontSize:12,color:'var(--color-text-muted)'}}>プロジェクトがありません</div>
              : projects.map(p => (
                <label key={p.id} className="compare-item">
                  <input type="checkbox" checked={selectedCompare.has(p.id)} onChange={() => toggleCompare(p.id)} />
                  <span className="compare-item__dot" style={{ background: p.color }} />
                  <span className="compare-item__name" title={p.name}>{p.name}</span>
                </label>
              ))
            }
          </div>
          <div className="compare-sidebar__actions">
            <button className="btn btn--primary" style={{ width: '100%' }} disabled={selectedCompare.size < 2} onClick={goCompare}>まとめて表示</button>
            <button className="btn btn--secondary" style={{ width: '100%', fontSize: 12 }} onClick={() => setSelectedCompare(new Set())}>選択解除</button>
          </div>
          <div className="compare-sidebar__hint" style={{ color: selectedCompare.size >= 2 ? 'var(--color-primary)' : '' }}>
            {selectedCompare.size === 0 ? '2つ以上選択してください' : selectedCompare.size === 1 ? 'もう1つ選択してください' : `${selectedCompare.size}件を選択中`}
          </div>
        </>
      )}

      <div className="sidebar-section-divider" />

      {/* 大項目フィルター */}
      <div
        className={`compare-sidebar__header sidebar-toggle-header${catfilterOpen ? ' is-open' : ''}`}
        onClick={() => setCatfilterOpen(o => !o)}
      >
        <span>🔍</span><span>大項目フィルター</span>
        <span className="sidebar-toggle-arrow">▶</span>
      </div>
      {catfilterOpen && (
        <>
          <p className="compare-sidebar__desc">大項目を選択して全プロジェクトを横断抽出</p>
          <div className="compare-project-list">
            {categories.length === 0
              ? <div style={{fontSize:12,color:'var(--color-text-muted)'}}>大項目がありません</div>
              : categories.map(cat => (
                <label key={cat} className="compare-item">
                  <input type="checkbox" checked={selectedCats.has(cat)} onChange={() => toggleCat(cat)} />
                  <span className="compare-item__name" title={cat}>{cat}</span>
                </label>
              ))
            }
          </div>
          <div className="compare-sidebar__actions">
            <button className="btn btn--primary" style={{ width: '100%' }} disabled={selectedCats.size < 1} onClick={goCatfilter}>フィルター表示</button>
            <button className="btn btn--secondary" style={{ width: '100%', fontSize: 12 }} onClick={() => setSelectedCats(new Set())}>選択解除</button>
          </div>
          <div className="compare-sidebar__hint" style={{ color: selectedCats.size >= 1 ? 'var(--color-primary)' : '' }}>
            {selectedCats.size === 0 ? '1つ以上選択してください' : `${selectedCats.size}件の大項目を選択中`}
          </div>
        </>
      )}
    </aside>
  );
}
