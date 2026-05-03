import { useState } from 'react';

/**
 * フラットなプロジェクト配列からツリー構造を構築する。
 * parent_project_id が未設定か、参照先が一覧に存在しない場合はルート扱いにする。
 * 兄弟は sort_order 昇順 → created_at 昇順 で並べる。
 */
function buildTree(projects) {
  const map = new Map(projects.map(p => [p.id, { ...p, children: [] }]));
  const roots = [];
  for (const node of map.values()) {
    if (node.parent_project_id && map.has(node.parent_project_id)) {
      map.get(node.parent_project_id).children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortSiblings = (nodes) => {
    nodes.sort((a, b) =>
      a.sort_order - b.sort_order || new Date(a.created_at) - new Date(b.created_at)
    );
    nodes.forEach(n => sortSiblings(n.children));
  };
  sortSiblings(roots);
  return roots;
}

/**
 * プロジェクト行クリック時の遷移先を決定する。
 * 子を持つ親プロジェクト → ?parent=ID（親子まとめて表示）
 * 子を持たない（または子プロジェクト自身）→ ?project=ID（単体表示）
 */
function navigateTo(node) {
  if (node.children.length > 0) {
    window.location.href = `/schedule?parent=${node.id}`;
  } else {
    window.location.href = `/schedule?project=${node.id}`;
  }
}

/**
 * ツリーノード 1 件を描画する再帰コンポーネント。
 *
 * グリッド列構成（全行共通・列ずれなし）:
 *   カラーdot | サムネイル | モデル名(ツリー) | プロジェクト名 | ステータス |
 *   顧客 | ベース | Ver. | 更新日 | 操作
 *
 * ツリーのインデント / ブランチライン / 折りたたみトグルは
 * モデル名セル（.project-row__col--model）の内部にのみ閉じ込める。
 */
function ProjectTreeNode({ node, depth = 0, onEdit, onDelete }) {
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = node.children.length > 0;
  const displayDepth = Math.min(depth, 4); // 5 階層以上はインデント固定

  return (
    <>
      <div
        className={`project-row${node.status === 'archived' ? ' is-archived' : ''}${depth > 0 ? ' is-child' : ''}${hasChildren ? ' is-parent' : ''}`}
      >
        {/* ── カラードット */}
        <span className="project-row__color-dot" style={{ background: node.color }} />

        {/* ── サムネイル */}
        <span className="project-row__thumbnail">
          {node.image_data
            ? <img src={node.image_data} alt="" className="project-row__thumb-img" />
            : <span className="project-row__thumb-placeholder" style={{ background: node.color + '22' }} />
          }
        </span>

        {/* ── モデル名列（ツリーUI はここだけ） */}
        <span
          className="project-row__col project-row__col--model project-row__name--link"
          title={node.model_name
            ? (hasChildren ? `${node.model_name}（子プロジェクトと一緒に表示）` : node.model_name)
            : ''}
          onClick={() => navigateTo(node)}
        >
          {/* インデント＋ブランチライン＋トグル */}
          <span className="tree-prefix" style={{ paddingLeft: displayDepth * 20 }}>
            {depth > 0 && <span className="tree-branch" />}
            {hasChildren
              ? (
                <button
                  className="tree-toggle"
                  onClick={(e) => { e.stopPropagation(); setCollapsed(v => !v); }}
                  title={collapsed ? '展開' : '折りたたむ'}
                >
                  {collapsed ? '▶' : '▼'}
                </button>
              )
              : <span className="tree-toggle-spacer" />
            }
          </span>
          {/* モデル名テキスト */}
          <span className="project-row__model-name-text">
            {node.model_name
              ? node.model_name
              : <span className="project-row__model-name--empty">—</span>
            }
          </span>
          {/* 子を持つ親プロジェクトはバッジを表示 */}
          {hasChildren && (
            <span className="project-row__children-badge" title={`子プロジェクト ${node.children.length}件`}>
              📂 {node.children.length}
            </span>
          )}
        </span>

        {/* ── プロジェクト名列（ツリーなし・プレーンテキスト） */}
        <span
          className="project-row__col project-row__col--project-name project-row__name--link"
          title={node.name}
          onClick={() => navigateTo(node)}
        >
          <span className="project-row__project-name-text">{node.name}</span>
        </span>

        {/* ── ステータス */}
        <span className="project-row__col project-row__col--status">
          <span className={`project-pstatus project-pstatus--${node.project_status}`}>{node.project_status}</span>
          {node.status === 'archived' && <span className="project-row__archived-badge">archived</span>}
        </span>

        {/* ── 顧客名 */}
        <span className="project-row__col project-row__col--client">
          {node.client_name && <span className="project-meta-chip project-meta-chip--client" title={node.client_name}>👤 {node.client_name}</span>}
        </span>

        {/* ── ベースプロジェクト */}
        <span className="project-row__col project-row__col--base">
          {node.base_project && <span className="project-meta-chip project-meta-chip--base" title={node.base_project}>🔗 {node.base_project}</span>}
        </span>

        {/* ── バージョン */}
        <span className="project-row__col project-row__col--version">
          {node.latest_version != null
            ? <span className="project-version-badge">v{node.latest_version}</span>
            : <span className="project-version-badge project-version-badge--none">—</span>
          }
        </span>

        {/* ── 最終更新日 */}
        <span className="project-row__col project-row__col--activity">
          {node.last_activity_at
            ? <span className="project-activity-date" title={formatFull(node.last_activity_at)}>{formatShort(node.last_activity_at)}</span>
            : <span className="project-activity-date project-activity-date--none">—</span>
          }
        </span>

        {/* ── 操作ボタン */}
        <div className="project-row__actions">
          <button className="btn btn--secondary" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => onEdit(node)}>Edit</button>
          <button className="btn btn--danger"    style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => onDelete(node.id)}>Del</button>
        </div>
      </div>

      {/* 子ノードを再帰描画（折りたたみ時は非表示） */}
      {!collapsed && node.children.map(child => (
        <ProjectTreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </>
  );
}

export default function ProjectList({ projects, onEdit, onDelete }) {
  if (projects.length === 0) {
    return <div className="empty-msg">プロジェクトがありません。「+ New Project」から作成してください。</div>;
  }

  const tree = buildTree(projects);

  return (
    <div className="project-list">
      {/* ── 列ヘッダー */}
      <div className="project-list-header">
        <span />{/* color-dot */}
        <span />{/* thumbnail */}
        <span>モデル名</span>
        <span>プロジェクト名</span>
        <span>ステータス</span>
        <span>顧客</span>
        <span>ベース</span>
        <span>Ver.</span>
        <span>更新日</span>
        <span />{/* actions */}
      </div>

      {/* ── ツリーノード */}
      {tree.map(root => (
        <ProjectTreeNode
          key={root.id}
          node={root}
          depth={0}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function formatShort(isoStr) {
  const d = new Date(isoStr);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function formatFull(isoStr) {
  const d = new Date(isoStr);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
