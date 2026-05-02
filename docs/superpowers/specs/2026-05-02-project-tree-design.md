# プロジェクトツリー表示 (parent_project_id FK) 設計書

> 作成日: 2026-05-02
> 対象機能: Top画面プロジェクト一覧のツリー階層表示

---

## 1. 概要

**Goal:** プロジェクト間の親子関係（派生機種・ベースラインの関係等）をTop画面でツリー形式に表示し、プロジェクトの系統を一目で把握できるようにする。

**Approach:** DBに `parent_project_id INTEGER FK → projects.id` を追加し、IDベースで親子関係を管理する。テキストマッチングではなくFK参照のため、プロジェクト名変更後も関係が維持される。

**Tech Stack:** Python/FastAPI/SQLAlchemy/Alembic (backend), React/JSX (frontend)

---

## 2. DB設計

### 2.1 追加カラム

`projects` テーブルに以下を追加する。

| カラム | 型 | デフォルト | 説明 |
|--------|-----|-----------|------|
| `parent_project_id` | INTEGER NULL | NULL | 親プロジェクトの id。NULL = ルートプロジェクト |

```sql
ALTER TABLE projects
  ADD COLUMN parent_project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;
```

### 2.2 削除ルール

- 親プロジェクトが削除された場合: `ON DELETE SET NULL` により子の `parent_project_id` は `NULL` に変わる（ルートに昇格）
- 子プロジェクトが削除された場合: その子の子孫は `parent_project_id` がそのまま残る（孤立）→ 削除時に再帰的にNULLクリアはしない（YAGNI）

### 2.3 制約

- 自己参照禁止: `parent_project_id != id`（アプリケーションレベルで強制）
- 循環参照禁止: A→B→Aのような閉路（アプリケーションレベルで強制）
- 深さ制限: DBレベルではなし。UIは5階層まで表示（それ以上は同一レベルで表示）

### 2.4 Alembicマイグレーション

ファイル: `backend/alembic/versions/0013_add_parent_project_id.py`

```python
def upgrade() -> None:
    with op.batch_alter_table("projects") as batch_op:
        batch_op.add_column(sa.Column("parent_project_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_projects_parent_id",
            "projects",
            ["parent_project_id"],
            ["id"],
        )

def downgrade() -> None:
    with op.batch_alter_table("projects") as batch_op:
        batch_op.drop_constraint("fk_projects_parent_id", type_="foreignkey")
        batch_op.drop_column("parent_project_id")
```

---

## 3. バックエンド設計

### 3.1 モデル (`backend/app/models/project.py`)

```python
from sqlalchemy import ForeignKey

parent_project_id: Mapped[int | None] = mapped_column(
    Integer, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
)
children: Mapped[list["Project"]] = relationship(
    "Project",
    foreign_keys="Project.parent_project_id",
    backref=backref("parent", remote_side="Project.id"),
    lazy="select",
)
```

### 3.2 スキーマ (`backend/app/schemas/project.py`)

**ProjectCreate / ProjectUpdate** に追加:

```python
parent_project_id: int | None = None
```

**ProjectResponse** に追加:

```python
parent_project_id: int | None
```

### 3.3 ルーター (`backend/app/routers/projects.py`)

`update_project` に循環参照チェックを追加する。

```python
def _check_circular(db: Session, project_id: int, new_parent_id: int | None) -> None:
    """new_parent_id を設定すると循環参照になるか確認する。なる場合は HTTPException(400)。"""
    if new_parent_id is None:
        return
    if new_parent_id == project_id:
        raise HTTPException(status_code=400, detail="プロジェクトは自分自身を親にできません")
    # 新しい親から祖先をたどり、自分自身が出てきたら循環
    cur_id = new_parent_id
    visited = set()
    while cur_id is not None:
        if cur_id in visited:
            break  # 既存の循環（別バグ）は無視
        visited.add(cur_id)
        if cur_id == project_id:
            raise HTTPException(status_code=400, detail="循環参照になるため設定できません")
        parent = db.query(Project.parent_project_id).filter(Project.id == cur_id).scalar()
        cur_id = parent
```

`update_project` エンドポイント内で呼び出す:

```python
if payload.parent_project_id is not ...:  # フィールドが送信された場合
    _check_circular(db, project_id, payload.parent_project_id)
```

`create_project` では循環参照チェック不要（新規作成時は子孫が存在しない）。ただし自己参照（`parent_project_id == 自分のid`）は作成後に発生しないため問題なし。

### 3.4 `_enrich` / `_enrich_batch`

`parent_project_id` は ORM カラムから自動的に `__table__.columns` に含まれるため変更不要。

---

## 4. フロントエンド設計

### 4.1 変更ファイル一覧

| ファイル | 操作 | 内容 |
|---------|------|------|
| `frontend/src/components/top/ProjectList.jsx` | 変更 | ツリー構造構築ロジックとツリー描画 |
| `frontend/src/components/top/ProjectModal.jsx` | 変更 | 親プロジェクト選択ドロップダウン追加 |
| `frontend/src/api.js` | 変更 | `parent_project_id` を送信に含める（既存の updateProject / createProject が汎用なので変更不要の場合あり） |
| `frontend/src/styles/app.css` | 変更 | ツリーライン・インデントCSS追加 |

### 4.2 ツリー構築アルゴリズム (`ProjectList.jsx`)

フラットなプロジェクト配列からツリーを構築して描画する。

```js
function buildTree(projects) {
  const map = new Map(projects.map(p => [p.id, { ...p, children: [] }]));
  const roots = [];
  for (const node of map.values()) {
    if (node.parent_project_id && map.has(node.parent_project_id)) {
      map.get(node.parent_project_id).children.push(node);
    } else {
      roots.push(node);  // parent未設定 or 親が一覧に存在しない場合はルート扱い
    }
  }
  return roots;
}
```

兄弟の並び順: `sort_order` 昇順 → `created_at` 昇順

### 4.3 ツリー描画

```jsx
function ProjectTreeNode({ node, depth = 0, isLast = false }) {
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = node.children.length > 0;
  const displayDepth = Math.min(depth, 4); // 5階層以上はインデントを5階層分に固定

  return (
    <>
      <div className={`project-row ${depth > 0 ? 'is-child' : ''}`}
           style={{ paddingLeft: 16 + displayDepth * 20 }}>
        {/* ツリーライン */}
        {depth > 0 && <span className="tree-branch" />}
        {/* 折りたたみトグル */}
        {hasChildren
          ? <button className="tree-toggle" onClick={() => setCollapsed(v => !v)}>
              {collapsed ? '▶' : '▼'}
            </button>
          : <span className="tree-toggle-spacer" />
        }
        {/* 既存のプロジェクト行コンテンツ */}
        ...
      </div>
      {!collapsed && node.children.map((child, i) => (
        <ProjectTreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          isLast={i === node.children.length - 1}
        />
      ))}
    </>
  );
}
```

### 4.4 ProjectModal — 親プロジェクト選択

```jsx
<div className="form-row">
  <label className="form-label">親プロジェクト</label>
  <select
    className="form-select"
    value={form.parent_project_id ?? ''}
    onChange={e => setForm(f => ({
      ...f,
      parent_project_id: e.target.value === '' ? null : Number(e.target.value)
    }))}
  >
    <option value="">— なし（ルートプロジェクト）—</option>
    {parentCandidates.map(p => (
      <option key={p.id} value={p.id}>
        {p.model_name ? `${p.model_name} / ` : ''}{p.name}
      </option>
    ))}
  </select>
</div>
```

**parentCandidates の計算:**
- 自分自身を除外
- 自分の子孫（全階層）を除外（循環防止のためフロントエンドでも事前に除外）
- 既存の `base_project` テキスト欄はそのまま残す（説明用途）

### 4.5 CSS追加 (`app.css`)

```css
/* ── プロジェクトツリー ─────────────────────────────── */
.project-row.is-child { background: #fafbfc; }

.tree-branch {
  position: relative;
  display: inline-block;
  width: 16px;
  height: 100%;
  flex-shrink: 0;
}
.tree-branch::before {
  content: '';
  position: absolute;
  left: 8px;
  top: 50%;
  width: 8px;
  height: 1.5px;
  background: #cbd5e0;
}
.tree-branch::after {
  content: '';
  position: absolute;
  left: 8px;
  top: 0;
  bottom: 50%;
  width: 1.5px;
  background: #cbd5e0;
}

.tree-toggle {
  width: 18px; height: 18px;
  border: 1px solid #cbd5e0;
  border-radius: 4px;
  background: #fff;
  font-size: 9px;
  cursor: pointer;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.tree-toggle:hover { background: #edf2f7; }
.tree-toggle-spacer { width: 18px; flex-shrink: 0; display: inline-block; }
```

---

## 5. APIの変更点

既存エンドポイントへの追加のみ。新規エンドポイント不要。

| エンドポイント | 変更内容 |
|--------------|---------|
| `GET /api/v1/projects` | レスポンスに `parent_project_id` を追加 |
| `POST /api/v1/projects` | リクエストボディに `parent_project_id` を受け付ける |
| `PATCH /api/v1/projects/{id}` | `parent_project_id` の更新 + 循環参照チェック |

---

## 6. エラーハンドリング

| ケース | 挙動 |
|--------|------|
| 自己参照 (`parent_project_id == id`) | API: 400 / フロントエンド: ドロップダウンで自分を除外 |
| 循環参照 (A→B→A) | API: 400 "循環参照になるため設定できません" |
| 親が別ユーザーのアーカイブ済み | 許可（アーカイブ表示時は親子関係を維持） |
| 親が一覧に存在しない（`include_archived=false` 時） | ルート扱いで表示（`buildTree` の分岐） |

---

## 7. テスト方針

### バックエンド (`backend/tests/test_projects.py` に追記)

```python
def test_set_parent_project(client, ...):
    # 正常: 親子関係設定
def test_circular_reference_rejected(client, ...):
    # 異常: A→B→A で 400
def test_self_reference_rejected(client, ...):
    # 異常: 自己参照で 400
def test_parent_deleted_child_becomes_root(client, ...):
    # 親削除後、子の parent_project_id が NULL になる
```

### フロントエンド
- ツリー構築関数 `buildTree()` のユニットテストは省略（既存テスト体制に合わせる）
- 目視確認: 2階層・3階層のプロジェクトでツリー表示、折りたたみ動作

---

## 8. 移行方針

- 既存の `base_project`（テキスト）は変更しない。自動リンクは行わない。
- 既存プロジェクトの `parent_project_id` はすべて `NULL`（ルート）として開始。
- ユーザーが必要に応じて ProjectModal の「親プロジェクト」ドロップダウンから手動設定する。

---

## 9. 実装順序

1. DBマイグレーション + バックエンド (model / schema / router / test)
2. フロントエンド ProjectModal (親プロジェクト選択UI)
3. フロントエンド ProjectList → ProjectTree (ツリー表示)
4. CSS
5. 全テスト確認 + push
