# opeSchedule 追加機能 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** バグ修正2件＋追加機能7件を順次実装し、最後に利用マニュアルを作成する。各項目完了後に commit & push する。

**Architecture:** バックエンドは FastAPI (Python) + SQLAlchemy。フロントエンドは React 18 + Vite 5 のカスタムガントチャート実装。バグ修正→一括Export/Import→UX改善→ドキュメントの順で対応する。

**Tech Stack:** Python 3.12 / FastAPI 0.115 / SQLAlchemy 2.0 / React 18 / Vite 5 / pytest

---

## 実装順序

| # | 種別 | 内容 | フェーズ |
|---|------|------|---------|
| 1 | バグ修正 | CSV 依存関係 round-trip バグ | Phase 1 |
| 2 | バグ修正 | JSON Export の `model_name` フィールド欠落 | Phase 1 |
| 3 | 機能追加 | 一括 Export / Import（マスター操作） | Phase 2 |
| 4 | 機能追加 | 今日ライン（Today Indicator） | Phase 3 |
| 5 | 機能追加 | 遅延アラート（タスクバー色分け） | Phase 3 |
| 6 | 機能追加 | タスク内検索・フィルター | Phase 3 |
| 7 | 機能追加 | タスク複製 | Phase 3 |
| 8 | 機能追加 | 日程一括シフト | Phase 4 |
| 9 | 機能追加 | 印刷 / PDF 出力 | Phase 4 |
| 10 | ドキュメント | 利用マニュアル作成 | Phase 5 |

---

## Phase 1: バグ修正

---

### Task 1: CSV 依存関係 round-trip バグ修正

**問題の詳細:**  
`export_project`（CSV）では `dependencies` 列に **DBタスクID**（例: 15, 23）を書き出す。  
`import_project`（CSV）では各タスクに **行インデックス**（`id: 0, 1, 2...`）を付与する。  
`old_to_new[行インデックス]` に DBタスクID（15, 23）でアクセスするため `None` になり、  
→ `HTTP 400` エラーまたは誤った依存関係が発生する。

**修正方針:**  
CSV エクスポート時に `dependencies` を DB ID → 行インデックスに変換して書き出す。  
インポート側は既存のまま（行インデックスを `id` として使用する動作で正しく動く）。

**Files:**
- Modify: `backend/app/routers/import_export.py` (export_project の CSV ブランチ)
- Modify: `backend/tests/test_import_export.py` (round-trip テスト追加)

- [ ] **Step 1: 失敗するテストを書く**

`backend/tests/test_import_export.py` に追加:

```python
def test_csv_round_trip_preserves_dependencies(client):
    """CSV エクスポート → インポート後も依存関係が保持されることを確認する。"""
    # プロジェクト作成
    r = client.post("/api/v1/projects", json={"name": "CSV Round-trip Test"})
    pid = r.json()["id"]

    # タスク A を作成（依存なし）
    r1 = client.post(f"/api/v1/projects/{pid}/tasks", json={
        "name": "Task A", "start_date": "2026-04-01", "end_date": "2026-04-07",
        "task_type": "task", "progress": 0.0, "sort_order": 0, "dependency_ids": [],
    })
    task_a_id = r1.json()["id"]

    # タスク B を作成（A に依存）
    client.post(f"/api/v1/projects/{pid}/tasks", json={
        "name": "Task B", "start_date": "2026-04-08", "end_date": "2026-04-14",
        "task_type": "task", "progress": 0.0, "sort_order": 1,
        "dependency_ids": [task_a_id],
    })

    # CSV エクスポート
    res = client.get(f"/api/v1/projects/{pid}/export?format=csv")
    assert res.status_code == 200
    csv_bytes = res.content

    # 再インポート（エラーにならないこと）
    import io
    res2 = client.post(
        "/api/v1/projects/import",
        files={"file": ("round_trip.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    assert res2.status_code == 201, f"Import failed: {res2.json()}"

    # 依存関係が保持されていることを確認
    new_pid = res2.json()["project_id"]
    tasks = client.get(f"/api/v1/projects/{new_pid}/tasks").json()
    tasks_by_name = {t["name"]: t for t in tasks}
    assert "Task B" in tasks_by_name
    assert len(tasks_by_name["Task B"]["dependencies"]) == 1
    dep_id = tasks_by_name["Task B"]["dependencies"][0]["depends_on_id"]
    assert dep_id == tasks_by_name["Task A"]["id"]
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
cd backend
pytest tests/test_import_export.py::test_csv_round_trip_preserves_dependencies -v
```

Expected: `FAILED` (400 エラーまたは依存関係が空)

- [ ] **Step 3: `import_export.py` の CSV エクスポートを修正**

`backend/app/routers/import_export.py` の `export_project` 関数、CSV ブランチを以下のように変更:

```python
elif format == "csv":
    output = io.StringIO()
    fieldnames = [
        "category_large", "category_medium", "name",
        "start_date", "end_date", "task_type", "progress",
        "color", "notes", "dependencies", "sort_order",
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    # DB の task.id（主キー）を CSV 内の行インデックス（0始まり）に変換するマップ。
    # CSV インポート時は行インデックスを依存関係の参照に使うため、
    # エクスポート側も同じインデックス体系で書き出す必要がある。
    id_to_row = {t["id"]: i for i, t in enumerate(task_dicts)}
    for t in task_dicts:
        writer.writerow(
            {
                "category_large":  t.get("category_large") or "",
                "category_medium": t.get("category_medium") or "",
                "name": t["name"],
                "start_date": t["start_date"],
                "end_date": t["end_date"],
                "task_type": t["task_type"],
                "progress": t["progress"],
                "color": t["color"] or "",
                "notes": t["notes"] or "",
                "dependencies": ",".join(
                    str(id_to_row[d]) for d in t["dependencies"] if d in id_to_row
                ),
                "sort_order": t["sort_order"],
            }
        )
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="project_{project_id}.csv"'
        },
    )
```

- [ ] **Step 4: テストが通ることを確認**

```bash
cd backend
pytest tests/test_import_export.py -v
```

Expected: 全テスト PASSED（既存テストが壊れていないことも確認）

- [ ] **Step 5: commit & push**

```bash
git add backend/app/routers/import_export.py backend/tests/test_import_export.py
git commit -m "fix: CSV export now writes row-index-based dependencies for correct round-trip import"
git push origin main
```

---

### Task 2: JSON Export の model_name フィールド欠落修正

**問題の詳細:**  
`export_project`（JSON）の `project` オブジェクトに `model_name` が含まれていない。  
エクスポート → インポート後に `model_name` が失われる。

**Files:**
- Modify: `backend/app/routers/import_export.py`
- Modify: `backend/tests/test_import_export.py`

- [ ] **Step 1: 失敗するテストを書く**

`backend/tests/test_import_export.py` に追加:

```python
def test_json_export_includes_model_name(client):
    """JSON エクスポートに model_name が含まれることを確認する。"""
    r = client.post("/api/v1/projects", json={
        "name": "Model Name Test",
        "model_name": "WebApp",
    })
    pid = r.json()["id"]

    res = client.get(f"/api/v1/projects/{pid}/export?format=json")
    assert res.status_code == 200
    data = res.json()
    assert data["project"].get("model_name") == "WebApp"


def test_json_import_restores_model_name(client):
    """JSON インポートで model_name が復元されることを確認する。"""
    import io, json
    payload = {
        "version": "1.0",
        "project": {"name": "Restored Model", "model_name": "MobileApp"},
        "tasks": [],
    }
    content = json.dumps(payload).encode()
    res = client.post(
        "/api/v1/projects/import",
        files={"file": ("proj.json", io.BytesIO(content), "application/json")},
    )
    assert res.status_code == 201
    pid = res.json()["project_id"]
    proj = client.get(f"/api/v1/projects/{pid}").json()
    assert proj["model_name"] == "MobileApp"
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
cd backend
pytest tests/test_import_export.py::test_json_export_includes_model_name tests/test_import_export.py::test_json_import_restores_model_name -v
```

Expected: FAILED

- [ ] **Step 3: `import_export.py` を修正**

`export_project` の JSON ブランチ、`payload["project"]` に `model_name` を追加:

```python
"project": {
    "name": project.name,
    "description": project.description,
    "color": project.color,
    "project_status": project.project_status,
    "client_name": project.client_name,
    "base_project": project.base_project,
    "view_mode": project.view_mode,
    "model_name": project.model_name,
},
```

`import_project` の `Project(...)` 生成部分に `model_name` を追加:

```python
project = Project(
    name=proj_data["name"],
    description=proj_data.get("description"),
    color=proj_data.get("color", "#4A90D9"),
    project_status=proj_data.get("project_status", "未開始"),
    client_name=proj_data.get("client_name"),
    base_project=proj_data.get("base_project"),
    view_mode=proj_data.get("view_mode"),
    model_name=proj_data.get("model_name"),
)
```

- [ ] **Step 4: 全テストが通ることを確認**

```bash
cd backend
pytest tests/test_import_export.py -v
```

Expected: 全 PASSED

- [ ] **Step 5: commit & push**

```bash
git add backend/app/routers/import_export.py backend/tests/test_import_export.py
git commit -m "fix: include model_name in JSON export/import"
git push origin main
```

---

## Phase 2: 一括 Export / Import（マスター操作）

---

### Task 3: バックエンド — 一括 Export/Import エンドポイント

**仕様:**
- `GET /api/v1/export/all` — 全プロジェクトを1つの JSON ファイルにまとめてエクスポート
- `POST /api/v1/import/all?mode=new|skip_existing` — 一括 JSON ファイルをインポート
  - `mode=new`（デフォルト）: 常に新規プロジェクトとして作成
  - `mode=skip_existing`: 同名プロジェクトが既に存在する場合はスキップ
- ファイルサイズ上限: 50 MB
- トランザクション: 全プロジェクト一括コミット（all-or-nothing）

**エクスポート形式 (version: "2.0", type: "bulk_export"):**
```json
{
  "version": "2.0",
  "type": "bulk_export",
  "exported_at": "2026-05-01T12:00:00+00:00",
  "project_count": 3,
  "projects": [
    {
      "name": "...", "description": null, "color": "#4A90D9",
      "project_status": "作業中", "client_name": null, "base_project": null,
      "view_mode": null, "model_name": null, "sort_order": 0,
      "tasks": [ { ...単一 export と同じ task 形式... } ]
    }
  ]
}
```

**Files:**
- Modify: `backend/app/routers/import_export.py` (エンドポイント追加)
- Modify: `backend/tests/test_import_export.py` (テスト追加)

- [ ] **Step 1: 失敗するテストを書く**

`backend/tests/test_import_export.py` に追加:

```python
def test_export_all(client):
    """全プロジェクトが一括エクスポートされることを確認する。"""
    client.post("/api/v1/projects", json={"name": "Bulk PJ1", "model_name": "A"})
    client.post("/api/v1/projects", json={"name": "Bulk PJ2", "model_name": "B"})

    res = client.get("/api/v1/export/all")
    assert res.status_code == 200
    data = res.json()
    assert data["version"] == "2.0"
    assert data["type"] == "bulk_export"
    assert data["project_count"] >= 2
    names = [p["name"] for p in data["projects"]]
    assert "Bulk PJ1" in names
    assert "Bulk PJ2" in names
    # model_name が含まれていること
    pj1 = next(p for p in data["projects"] if p["name"] == "Bulk PJ1")
    assert pj1["model_name"] == "A"


def test_import_all_mode_new(client):
    """一括インポート（mode=new）で全プロジェクトが新規作成されることを確認する。"""
    import io, json
    payload = {
        "version": "2.0",
        "type": "bulk_export",
        "exported_at": "2026-05-01T00:00:00+00:00",
        "project_count": 2,
        "projects": [
            {
                "name": "Bulk Import A", "color": "#ff0000",
                "project_status": "未開始", "model_name": "X",
                "sort_order": 0,
                "tasks": [
                    {"id": 1, "name": "T1", "start_date": "2026-04-01",
                     "end_date": "2026-04-07", "task_type": "task",
                     "progress": 0.0, "sort_order": 0, "dependencies": []},
                ],
            },
            {
                "name": "Bulk Import B", "color": "#00ff00",
                "project_status": "作業中", "model_name": None,
                "sort_order": 1, "tasks": [],
            },
        ],
    }
    content = json.dumps(payload).encode()
    res = client.post(
        "/api/v1/import/all",
        files={"file": ("bulk.json", io.BytesIO(content), "application/json")},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["imported"] == 2
    assert data["skipped"] == 0
    created = {p["name"]: p for p in data["projects"]}
    assert created["Bulk Import A"]["status"] == "created"
    assert created["Bulk Import A"]["task_count"] == 1


def test_import_all_mode_skip_existing(client):
    """mode=skip_existing では同名プロジェクトをスキップすることを確認する。"""
    import io, json
    client.post("/api/v1/projects", json={"name": "Existing PJ"})

    payload = {
        "version": "2.0", "type": "bulk_export",
        "exported_at": "2026-05-01T00:00:00+00:00",
        "project_count": 2,
        "projects": [
            {"name": "Existing PJ", "project_status": "未開始",
             "sort_order": 0, "tasks": []},
            {"name": "New PJ",      "project_status": "未開始",
             "sort_order": 1, "tasks": []},
        ],
    }
    content = json.dumps(payload).encode()
    res = client.post(
        "/api/v1/import/all?mode=skip_existing",
        files={"file": ("bulk.json", io.BytesIO(content), "application/json")},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["imported"] == 1
    assert data["skipped"] == 1
    by_name = {p["name"]: p for p in data["projects"]}
    assert by_name["Existing PJ"]["status"] == "skipped"
    assert by_name["New PJ"]["status"] == "created"


def test_import_all_wrong_version(client):
    """version が 2.0 でないファイルは 400 を返すことを確認する。"""
    import io, json
    payload = {"version": "1.0", "type": "bulk_export", "projects": []}
    content = json.dumps(payload).encode()
    res = client.post(
        "/api/v1/import/all",
        files={"file": ("bad.json", io.BytesIO(content), "application/json")},
    )
    assert res.status_code == 400
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
cd backend
pytest tests/test_import_export.py::test_export_all tests/test_import_export.py::test_import_all_mode_new -v
```

Expected: `FAILED` (404 — エンドポイント未存在)

- [ ] **Step 3: `import_export.py` にエンドポイントを追加**

ファイル先頭の定数部分に追加:
```python
_MAX_BULK_IMPORT_SIZE = 50 * 1024 * 1024  # 50 MB
```

ファイル末尾（`import_project` 関数の後）に追加:

```python
# ── Bulk Export ──────────────────────────────────────────────────────────────

@router.get("/export/all")
def export_all(db: Session = Depends(get_db)) -> StreamingResponse:
    """全プロジェクトを単一の JSON ファイルにまとめてエクスポートする。
    バックアップや環境移行用のマスター操作エンドポイント。
    """
    from datetime import datetime, timezone

    projects = db.query(Project).order_by(Project.sort_order, Project.id).all()
    result = []
    for project in projects:
        tasks = (
            db.query(Task)
            .filter(Task.project_id == project.id)
            .order_by(Task.sort_order, Task.id)
            .all()
        )
        task_dicts = _tasks_to_export_dicts(tasks)
        # CSV エクスポートと同様に dependencies を行インデックスに変換する。
        id_to_row = {t["id"]: i for i, t in enumerate(task_dicts)}
        for t in task_dicts:
            t["dependencies"] = [
                id_to_row[d] for d in t["dependencies"] if d in id_to_row
            ]
        result.append(
            {
                "name": project.name,
                "description": project.description,
                "color": project.color,
                "project_status": project.project_status,
                "client_name": project.client_name,
                "base_project": project.base_project,
                "view_mode": project.view_mode,
                "model_name": project.model_name,
                "sort_order": project.sort_order,
                "tasks": task_dicts,
            }
        )
    now = datetime.now(timezone.utc)
    payload = {
        "version": "2.0",
        "type": "bulk_export",
        "exported_at": now.isoformat(),
        "project_count": len(result),
        "projects": result,
    }
    content = json.dumps(payload, ensure_ascii=False, indent=2)
    filename = f"opeschedule_all_{now.strftime('%Y%m%d')}.json"
    return StreamingResponse(
        io.StringIO(content),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Bulk Import ──────────────────────────────────────────────────────────────

@router.post("/import/all", response_model=dict, status_code=status.HTTP_201_CREATED)
async def import_all(
    file: UploadFile,
    mode: str = "new",
    db: Session = Depends(get_db),
) -> dict:
    """bulk_export 形式（version: 2.0）の JSON ファイルから全プロジェクトを一括インポートする。
    mode=new: 常に新規作成。
    mode=skip_existing: 同名プロジェクトが既存の場合はスキップ。
    全プロジェクト処理を単一トランザクションで行い、いずれかが失敗した場合は全てロールバック。
    """
    content = await file.read()
    if len(content) > _MAX_BULK_IMPORT_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large (max {_MAX_BULK_IMPORT_SIZE // (1024 * 1024)} MB)",
        )

    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid JSON: {e}",
        )

    if data.get("version") != "2.0" or data.get("type") != "bulk_export":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Not a bulk export file. Requires version=2.0 and type=bulk_export.",
        )

    projects_data = data.get("projects", [])
    if not projects_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No projects found in file",
        )

    # mode=skip_existing 用に既存プロジェクト名を取得する
    existing_names: set[str] = set()
    if mode == "skip_existing":
        existing_names = {row[0] for row in db.query(Project.name).all()}

    results = []
    for proj_data in projects_data:
        name = proj_data.get("name") or ""
        if not name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Each project must have a name",
            )

        if mode == "skip_existing" and name in existing_names:
            results.append(
                {"name": name, "project_id": None, "task_count": 0, "status": "skipped"}
            )
            continue

        tasks_data: list[dict] = proj_data.get("tasks", [])
        _assign_local_ids(tasks_data)
        _validate_no_circular(tasks_data)

        project = Project(
            name=name,
            description=proj_data.get("description"),
            color=proj_data.get("color", "#4A90D9"),
            project_status=proj_data.get("project_status", "未開始"),
            client_name=proj_data.get("client_name"),
            base_project=proj_data.get("base_project"),
            view_mode=proj_data.get("view_mode"),
            model_name=proj_data.get("model_name"),
            sort_order=proj_data.get("sort_order", 0),
        )
        db.add(project)
        db.flush()

        _import_tasks(tasks_data, project.id, db)
        results.append(
            {
                "name": name,
                "project_id": project.id,
                "task_count": len(tasks_data),
                "status": "created",
            }
        )

    db.commit()

    imported = sum(1 for r in results if r["status"] == "created")
    skipped  = sum(1 for r in results if r["status"] == "skipped")
    return {"imported": imported, "skipped": skipped, "projects": results}
```

- [ ] **Step 4: 全テストが通ることを確認**

```bash
cd backend
pytest tests/test_import_export.py -v
```

Expected: 全 PASSED

- [ ] **Step 5: commit & push**

```bash
git add backend/app/routers/import_export.py backend/tests/test_import_export.py
git commit -m "feat: add bulk export/import endpoints (GET /export/all, POST /import/all)"
git push origin main
```

---

### Task 4: フロントエンド — 一括 Export/Import UI

**配置:** Top 画面 → Global Config タブ最下部に「マスター操作」セクションを追加。

**Files:**
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/components/top/ConfigPanel.jsx`
- Modify: `frontend/src/styles/app.css`

- [ ] **Step 1: `api.js` に関数を追加**

`frontend/src/api.js` の末尾（`// ── Import/Export` セクション付近）に追加:

```javascript
// ── Bulk Export/Import ───────────────────────────────────────────────────────
export async function exportAll() {
  const url = BASE + '/export/all';
  LOG.info(`→ GET ${url}`);
  let res;
  try {
    res = await fetch(url);
  } catch (networkErr) {
    LOG.error('ネットワークエラー exportAll:', networkErr);
    throw networkErr;
  }
  LOG.info(`← ${res.status} GET ${url}`);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { detail = parseDetail(await res.json(), detail); } catch {}
    throw new Error(detail);
  }
  return res.blob();
}

export async function importAll(file, mode = 'new') {
  const url = `${BASE}/import/all?mode=${mode}`;
  LOG.info(`→ POST ${url}`);
  const fd = new FormData();
  fd.append('file', file);
  let res;
  try {
    res = await fetch(url, { method: 'POST', body: fd });
  } catch (networkErr) {
    LOG.error('ネットワークエラー importAll:', networkErr);
    throw networkErr;
  }
  LOG.info(`← ${res.status} POST ${url}`);
  const data = await res.json();
  if (!res.ok) throw new Error(parseDetail(data, `HTTP ${res.status}`));
  LOG.info('レスポンスデータ:', data);
  return data;
}
```

- [ ] **Step 2: `ConfigPanel.jsx` にマスター操作セクションを追加**

`frontend/src/components/top/ConfigPanel.jsx` の `<div className="form-actions">` の直前（`handleSubmit` の後、`return` 内）に追加。完成形:

```jsx
import { useState, useRef } from 'react';
import * as api from '../../api.js';
import { useToast } from '../../contexts/ToastContext.jsx';

export default function ConfigPanel({ config, onSaved }) {
  const showToast = useToast();
  const [saveMsg, setSaveMsg] = useState('');
  const [form, setForm] = useState(null);
  const [skipExisting, setSkipExisting] = useState(false);
  const [importing, setImporting] = useState(false);
  const bulkFileRef = useRef(null);

  const effectiveForm = form ?? (config ? {
    week_start_day:    config.week_start_day,
    default_view_mode: config.default_view_mode,
    date_format:       config.date_format,
    timezone:          config.timezone,
    theme:             config.theme,
    highlight_weekends: config.highlight_weekends,
    auto_scroll_today:  config.auto_scroll_today,
  } : null);

  if (!effectiveForm) return <div className="loading">読み込み中...</div>;

  const set = (field) => (e) => setForm(f => ({
    ...(f ?? effectiveForm),
    [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
  }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const saved = await api.updateConfig(effectiveForm);
      onSaved(saved);
      setSaveMsg('保存しました ✓');
      setTimeout(() => setSaveMsg(''), 2500);
    } catch (ex) { showToast(ex.message, 'error'); }
  };

  const handleExportAll = async () => {
    try {
      const blob = await api.exportAll();
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `opeschedule_all_${today}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('全プロジェクトをエクスポートしました', 'success');
    } catch (ex) {
      showToast(`エクスポート失敗: ${ex.message}`, 'error');
    }
  };

  const handleImportAll = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true);
    try {
      const mode = skipExisting ? 'skip_existing' : 'new';
      const result = await api.importAll(file, mode);
      showToast(
        `インポート完了: ${result.imported}件作成, ${result.skipped}件スキップ`,
        'success',
      );
    } catch (ex) {
      showToast(`インポート失敗: ${ex.message}`, 'error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <form className="config-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label className="form-label">週の開始曜日</label>
        <select className="form-select" value={effectiveForm.week_start_day} onChange={set('week_start_day')}>
          <option value="Mon">月曜日 (Mon)</option>
          <option value="Sun">日曜日 (Sun)</option>
          <option value="Sat">土曜日 (Sat)</option>
        </select>
      </div>
      <div className="form-row">
        <label className="form-label">デフォルト表示</label>
        <select className="form-select" value={effectiveForm.default_view_mode} onChange={set('default_view_mode')}>
          {['Day','Week','Month','Quarter'].map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="form-row">
        <label className="form-label">テーマ</label>
        <select className="form-select" value={effectiveForm.theme} onChange={set('theme')}>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>
      <div className="form-row form-row--checkbox">
        <label className="form-label">
          <input type="checkbox" checked={effectiveForm.highlight_weekends} onChange={set('highlight_weekends')} />
          週末をハイライト
        </label>
      </div>
      <div className="form-row form-row--checkbox">
        <label className="form-label">
          <input type="checkbox" checked={effectiveForm.auto_scroll_today} onChange={set('auto_scroll_today')} />
          今日に自動スクロール
        </label>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn--primary">Save Config</button>
        {saveMsg && <span className="save-msg">{saveMsg}</span>}
      </div>

      {/* ── マスター操作 ─────────────────────────────────── */}
      <div className="master-ops">
        <h3 className="master-ops__title">マスター操作</h3>
        <div className="master-ops__row">
          <button type="button" className="btn btn--secondary" onClick={handleExportAll}>
            全プロジェクトをエクスポート (JSON)
          </button>
        </div>
        <div className="master-ops__row">
          <label className="form-label master-ops__skip-label">
            <input
              type="checkbox"
              checked={skipExisting}
              onChange={e => setSkipExisting(e.target.checked)}
            />
            同名プロジェクトはスキップ
          </label>
        </div>
        <div className="master-ops__row">
          <input
            ref={bulkFileRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleImportAll}
          />
          <button
            type="button"
            className="btn btn--secondary"
            disabled={importing}
            onClick={() => bulkFileRef.current?.click()}
          >
            {importing ? 'インポート中...' : '一括インポート (JSON)'}
          </button>
        </div>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: CSS を追加**

`frontend/src/styles/app.css` の末尾に追加:

```css
/* ── マスター操作セクション ─────────────────────────────────── */
.master-ops {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid var(--color-border);
}
.master-ops__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 12px;
}
.master-ops__row {
  margin-bottom: 10px;
}
.master-ops__skip-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
}
```

- [ ] **Step 4: フロントエンドをビルドしてブラウザで動作確認**

```bash
cd frontend
npm run build
```

ブラウザで http://localhost:8000 を開き:
1. Top 画面 → Global Config タブを選択
2. 「マスター操作」セクションが表示されることを確認
3. 「全プロジェクトをエクスポート (JSON)」ボタンでファイルがダウンロードされることを確認
4. ダウンロードしたファイルの `version` が `"2.0"`, `type` が `"bulk_export"` であることを確認
5. 「一括インポート (JSON)」でダウンロードしたファイルをインポートして結果トーストが表示されることを確認

- [ ] **Step 5: commit & push**

```bash
git add frontend/src/api.js frontend/src/components/top/ConfigPanel.jsx frontend/src/styles/app.css frontend/dist/
git commit -m "feat: add bulk export/import UI in Config tab (master operations)"
git push origin main
```

---

## Phase 3: UX 改善

---

### Task 5: 今日ライン（Today Indicator）

**仕様:** ガントチャートの右ペイン（gantt-rows エリア）に、今日の日付位置に赤い縦線を表示する。  
`auto_scroll_today` の設定に関わらず常時表示する（既にスクロール設定は別途制御されている）。

**Files:**
- Modify: `frontend/src/components/schedule/GanttChart.jsx`
- Modify: `frontend/src/styles/app.css`

- [ ] **Step 1: `GanttChart.jsx` に今日ライン描画を追加**

`GanttChart.jsx` の `gantt-rows` 内の JSX（タスクバーを描画する部分の直後）に追加。  
`chartStart` と `pxPerDay` は既にスコープ内に存在する。

まず `diffDays` と `parseDate` が import されていることを確認（既存コードで使用済み）。  
今日の Date オブジェクトを計算するロジックを追加:

```jsx
// GanttChart.jsx の return 内、gantt-rows div の中（GanttAnnotations の直前あたり）に追加

const today = new Date();
today.setHours(0, 0, 0, 0);
const chartStartDate = parseDate(chartStart); // chartStart は 'YYYY-MM-DD' 文字列
const todayOffset = diffDays(chartStartDate, today) * pxPerDay;
const totalWidth = /* gantt-rows の幅。既存の chartWidth or totalDays * pxPerDay */ totalDays * pxPerDay;

// todayOffset がチャート範囲内の場合のみ描画
{todayOffset >= 0 && todayOffset <= totalWidth && (
  <div className="today-line" style={{ left: todayOffset }} />
)}
```

`chartStart`, `totalDays`, `pxPerDay` は GanttChart.jsx 内の既存変数を使用する。  
（ファイル内で `const chartStart` や `const totalDays` を検索して確認すること）

- [ ] **Step 2: CSS を追加**

`frontend/src/styles/app.css` に追加:

```css
/* ── 今日ライン ────────────────────────────────────────────── */
.today-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #e53935;
  opacity: 0.6;
  pointer-events: none;
  z-index: 5;
}
```

- [ ] **Step 3: ブラウザで動作確認**

`npm run build` 後、ガントチャートを開き:
1. 今日の日付位置に赤い縦線が表示されることを確認
2. Day/Week/Month/Quarter の各表示モードで正しい位置に表示されることを確認
3. 今日がチャート範囲外の場合は表示されないことを確認

- [ ] **Step 4: commit & push**

```bash
git add frontend/src/components/schedule/GanttChart.jsx frontend/src/styles/app.css frontend/dist/
git commit -m "feat: add today line indicator on gantt chart"
git push origin main
```

---

### Task 6: 遅延アラート（タスクバー色分け）

**仕様:**
- `end_date < 今日` かつ `progress < 1.0` → 遅延（赤）
- `progress >= 1.0` → 完了（グレー）
- それ以外 → デフォルト（タスク固有 color または プロジェクトカラー）

タスク詳細パネルや左ペインラベルへの遅延マーク（⚠️）も追加する。

**Files:**
- Modify: `frontend/src/components/schedule/GanttBars.jsx`
- Modify: `frontend/src/components/schedule/HierarchyPane.jsx`
- Modify: `frontend/src/styles/app.css`

- [ ] **Step 1: `GanttBars.jsx` に色分けロジックを追加**

`GanttBars.jsx` 内のタスクバー色を決定している箇所を修正。  
（`task.color` や `projectColor` を参照している箇所を検索する）

バー色計算のヘルパー関数を追加:

```javascript
function getTaskBarColor(task, projectColor) {
  if (task.task_type === 'milestone') return projectColor;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = parseDate(task.end_date);
  if (task.progress >= 1.0) return '#9e9e9e';       // 完了: グレー
  if (end < today)          return '#e53935';       // 遅延: 赤
  return task.color || projectColor;               // デフォルト
}
```

既存のバー色参照部分をこの関数で置き換える:

```jsx
// 変更前: style={{ background: task.color || projectColor, ... }}
// 変更後:
style={{ background: getTaskBarColor(task, projectColor), ... }}
```

- [ ] **Step 2: 左ペインに遅延マーク（⚠）を追加**

`HierarchyPane.jsx` の小項目ラベル（タスク名表示箇所）に追加:

```jsx
// タスク名の後に遅延マークを追加
const isOverdue = task.progress < 1.0 && new Date(task.end_date) < new Date();
// ...
<span className="hier-task-name">
  {task.name}
  {isOverdue && <span className="overdue-mark" title="期限超過">⚠</span>}
</span>
```

- [ ] **Step 3: CSS を追加**

```css
/* ── 遅延アラート ───────────────────────────────────────────── */
.overdue-mark {
  margin-left: 4px;
  font-size: 11px;
  color: #e53935;
}
```

- [ ] **Step 4: ブラウザで動作確認**

1. 既に終了日を過ぎた未完了タスクのバーが赤く表示されることを確認
2. 進捗100%（完了）タスクのバーがグレーになることを確認
3. 期限内タスクは元の色のままであることを確認
4. 遅延タスクの左ペインに ⚠ マークが表示されることを確認

- [ ] **Step 5: commit & push**

```bash
git add frontend/src/components/schedule/GanttBars.jsx frontend/src/components/schedule/HierarchyPane.jsx frontend/src/styles/app.css frontend/dist/
git commit -m "feat: add delay alert with bar color coding (overdue=red, done=gray)"
git push origin main
```

---

### Task 7: タスク内検索・フィルター

**仕様:** Schedule 画面のツールバーに検索入力欄を追加。タスク名・大項目・中項目・メモを対象にフロントエンドのみで絞り込む。検索中は非マッチタスクの行を非表示にする。

**Files:**
- Modify: `frontend/src/components/schedule/ScheduleScreen.jsx`
- Modify: `frontend/src/components/schedule/GanttChart.jsx`
- Modify: `frontend/src/styles/app.css`

- [ ] **Step 1: `ScheduleScreen.jsx` に検索 state を追加**

```jsx
// ScheduleScreen.jsx 既存の state 宣言に追加
const [searchQuery, setSearchQuery] = useState('');
```

`GanttChart` への props に `searchQuery` と `onSearchChange` を追加:

```jsx
<GanttChart
  ...既存のprops...
  searchQuery={searchQuery}
  onSearchChange={setSearchQuery}
/>
```

- [ ] **Step 2: `GanttChart.jsx` に検索 UI と絞り込みロジックを追加**

`GanttChart.jsx` に props を追加し、ツールバーに検索入力を追加:

```jsx
// Props に追加
export default function GanttChart({ ..., searchQuery = '', onSearchChange }) {

// フィルタリング済みタスクを useMemo で計算
const filteredTasks = useMemo(() => {
  if (!searchQuery.trim()) return tasks;
  const q = searchQuery.toLowerCase();
  return tasks.filter(t =>
    (t.name            || '').toLowerCase().includes(q) ||
    (t.category_large  || '').toLowerCase().includes(q) ||
    (t.category_medium || '').toLowerCase().includes(q) ||
    (t.notes           || '').toLowerCase().includes(q)
  );
}, [tasks, searchQuery]);

// groupTasks, buildRowIndexMap, calculateCriticalPath への tasks 参照を filteredTasks に変更
const grouped = useMemo(() => groupTasks(filteredTasks), [filteredTasks]);
```

ツールバーの JSX（`+ Add Task` ボタンの近く）に検索欄を追加:

```jsx
{!isMultiMode && (
  <input
    type="search"
    className="gantt-search"
    placeholder="タスクを検索..."
    value={searchQuery}
    onChange={e => onSearchChange?.(e.target.value)}
  />
)}
```

- [ ] **Step 3: CSS を追加**

```css
/* ── タスク検索 ─────────────────────────────────────────────── */
.gantt-search {
  padding: 4px 10px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 13px;
  background: var(--color-bg);
  color: var(--color-text);
  width: 180px;
}
.gantt-search:focus {
  outline: none;
  border-color: var(--color-primary);
}
```

- [ ] **Step 4: ブラウザで動作確認**

1. 検索欄に文字を入力するとタスク行がリアルタイムに絞り込まれることを確認
2. 検索欄をクリアすると全タスクが表示されることを確認
3. 大項目・中項目・メモでの検索が機能することを確認
4. 比較モード時は検索欄が非表示になることを確認

- [ ] **Step 5: commit & push**

```bash
git add frontend/src/components/schedule/ScheduleScreen.jsx frontend/src/components/schedule/GanttChart.jsx frontend/src/styles/app.css frontend/dist/
git commit -m "feat: add task search/filter in gantt toolbar"
git push origin main
```

---

### Task 8: タスク複製

**仕様:** タスク詳細パネルに「複製」ボタンを追加。同じ大項目・中項目に日程を1日ずらしたコピーを作成する。

**Files:**
- Modify: `frontend/src/components/schedule/TaskDetailPanel.jsx`

- [ ] **Step 1: `TaskDetailPanel.jsx` に複製ハンドラを追加**

`TaskDetailPanel.jsx` の既存 `handleSave` 関数の近くに追加:

```jsx
const handleDuplicate = async () => {
  try {
    const newTask = {
      category_large:  task.category_large,
      category_medium: task.category_medium,
      name:            `${task.name} (コピー)`,
      start_date:      fmtDate(addDays(parseDate(task.start_date), 1)),
      end_date:        fmtDate(addDays(parseDate(task.end_date), 1)),
      task_type:       task.task_type,
      progress:        0.0,
      color:           task.color,
      notes:           task.notes,
      sort_order:      task.sort_order + 1,
      dependency_ids:  [],
    };
    await api.createTask(projectId, newTask);
    onMutation?.({ type: 'duplicate', taskName: task.name });
    onClose();
    showToast(`「${task.name}」を複製しました`, 'success');
  } catch (ex) {
    showToast(`複製失敗: ${ex.message}`, 'error');
  }
};
```

`fmtDate`, `addDays`, `parseDate` は `utils.js` から import 済みであることを確認。未 import の場合は追加:

```jsx
import { fmtDate, addDays, parseDate } from '../../utils.js';
```

保存ボタンの近くに複製ボタンを追加:

```jsx
<button type="button" className="btn btn--secondary" onClick={handleDuplicate}>
  複製
</button>
```

- [ ] **Step 2: ブラウザで動作確認**

1. タスク詳細パネルを開く
2. 「複製」ボタンをクリック
3. 同じ大項目・中項目にコピータスク（名前に「(コピー)」付き、日程+1日）が追加されることを確認
4. トースト通知が表示されることを確認

- [ ] **Step 3: commit & push**

```bash
git add frontend/src/components/schedule/TaskDetailPanel.jsx frontend/dist/
git commit -m "feat: add task duplicate button in detail panel"
git push origin main
```

---

## Phase 4: 高度な機能

---

### Task 9: 日程一括シフト

**仕様:** プロジェクト全タスクの日程を N 日まとめてシフトするエンドポイントとUIを追加。  
マイルストーンも含め全タスクを対象にする。

**Files:**
- Modify: `backend/app/routers/tasks.py` (エンドポイント追加)
- Modify: `backend/tests/test_tasks.py` (テスト追加)
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/components/schedule/GanttChart.jsx` (UIボタン追加)

- [ ] **Step 1: バックエンドのテストを書く**

`backend/tests/test_tasks.py` に追加:

```python
def test_shift_task_dates(client):
    """全タスクの日程が指定日数だけシフトされることを確認する。"""
    r = client.post("/api/v1/projects", json={"name": "Shift Test"})
    pid = r.json()["id"]
    client.post(f"/api/v1/projects/{pid}/tasks", json={
        "name": "T1", "start_date": "2026-04-01", "end_date": "2026-04-10",
        "task_type": "task", "progress": 0.0, "dependency_ids": [],
    })
    client.post(f"/api/v1/projects/{pid}/tasks", json={
        "name": "T2", "start_date": "2026-04-11", "end_date": "2026-04-20",
        "task_type": "task", "progress": 0.0, "dependency_ids": [],
    })

    res = client.post(f"/api/v1/projects/{pid}/tasks/shift_dates", json={"days": 7})
    assert res.status_code == 200
    data = res.json()
    assert data["shifted"] == 2
    assert data["days"] == 7

    tasks = client.get(f"/api/v1/projects/{pid}/tasks").json()
    by_name = {t["name"]: t for t in tasks}
    assert by_name["T1"]["start_date"] == "2026-04-08"
    assert by_name["T1"]["end_date"]   == "2026-04-17"
    assert by_name["T2"]["start_date"] == "2026-04-18"
    assert by_name["T2"]["end_date"]   == "2026-04-27"


def test_shift_task_dates_negative(client):
    """負の日数（前倒し）シフトも正しく動作することを確認する。"""
    r = client.post("/api/v1/projects", json={"name": "Shift Negative Test"})
    pid = r.json()["id"]
    client.post(f"/api/v1/projects/{pid}/tasks", json={
        "name": "T1", "start_date": "2026-04-10", "end_date": "2026-04-20",
        "task_type": "task", "progress": 0.0, "dependency_ids": [],
    })
    res = client.post(f"/api/v1/projects/{pid}/tasks/shift_dates", json={"days": -3})
    assert res.status_code == 200
    tasks = client.get(f"/api/v1/projects/{pid}/tasks").json()
    assert tasks[0]["start_date"] == "2026-04-07"
    assert tasks[0]["end_date"]   == "2026-04-17"
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
cd backend
pytest tests/test_tasks.py::test_shift_task_dates -v
```

Expected: `FAILED` (404 — エンドポイント未存在)

- [ ] **Step 3: `tasks.py` にエンドポイントを追加**

`backend/app/routers/tasks.py` の import に追加:
```python
from datetime import timedelta
from fastapi import Body
```

`reorder_tasks` の後に追加:

```python
@router.post("/projects/{project_id}/tasks/shift_dates")
def shift_task_dates(
    project_id: int,
    days: int = Body(..., embed=True),
    db: Session = Depends(get_db),
) -> dict:
    """プロジェクト内の全タスクの start_date / end_date を days 日分シフトする。
    スケジュール全体の後ろ倒し・前倒し用のマスター操作エンドポイント。
    """
    get_or_404(db, Project, project_id, "Project not found")
    tasks = db.query(Task).filter(Task.project_id == project_id).all()
    delta = timedelta(days=days)
    for task in tasks:
        task.start_date = task.start_date + delta
        task.end_date   = task.end_date   + delta
    sign = f"+{days}" if days >= 0 else str(days)
    _log(db, project_id, "日程一括シフト", None, f"{sign}日")
    db.commit()
    return {"shifted": len(tasks), "days": days}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
cd backend
pytest tests/test_tasks.py -v
```

Expected: 全 PASSED

- [ ] **Step 5: `api.js` に関数を追加**

```javascript
export const shiftTaskDates = (pid, days) =>
  request('POST', `/projects/${pid}/tasks/shift_dates`, { days });
```

- [ ] **Step 6: `GanttChart.jsx` に日程シフト UI を追加**

ツールバーにシフトボタンを追加（`isMultiMode` が false の場合のみ表示）:

```jsx
// state 追加
const [shiftDays, setShiftDays] = useState('');

const handleShiftDates = async () => {
  const d = parseInt(shiftDays, 10);
  if (isNaN(d) || d === 0) return;
  if (!window.confirm(`全タスクの日程を ${d > 0 ? '+' : ''}${d} 日シフトしますか？`)) return;
  try {
    const result = await api.shiftTaskDates(projectId, d);
    showToast(`${result.shifted}件のタスクを ${d > 0 ? '+' : ''}${d}日シフトしました`, 'success');
    setShiftDays('');
    onMutation?.({ type: 'shift', days: d });
  } catch (ex) {
    showToast(`シフト失敗: ${ex.message}`, 'error');
  }
};
```

ツールバー JSX に追加:

```jsx
{!isMultiMode && !isHistoryMode && (
  <span className="shift-dates-group">
    <input
      type="number"
      className="shift-days-input"
      value={shiftDays}
      onChange={e => setShiftDays(e.target.value)}
      placeholder="日数"
      title="正: 後ろ倒し, 負: 前倒し"
    />
    <button
      className="btn btn--secondary"
      onClick={handleShiftDates}
      disabled={!shiftDays || isNaN(parseInt(shiftDays, 10))}
      title="全タスクの日程を一括シフト"
    >
      日程シフト
    </button>
  </span>
)}
```

CSS 追加:

```css
.shift-dates-group {
  display: flex;
  align-items: center;
  gap: 4px;
}
.shift-days-input {
  width: 60px;
  padding: 4px 6px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 13px;
  background: var(--color-bg);
  color: var(--color-text);
  text-align: center;
}
```

- [ ] **Step 7: ブラウザで動作確認**

1. 日数入力欄に `7` を入力して「日程シフト」をクリック
2. 確認ダイアログが表示されることを確認
3. OK 後、全タスクが7日後ろ倒しになることを確認
4. `-3` など負の値で前倒しが機能することを確認

- [ ] **Step 8: commit & push**

```bash
git add backend/app/routers/tasks.py backend/tests/test_tasks.py frontend/src/api.js frontend/src/components/schedule/GanttChart.jsx frontend/src/styles/app.css frontend/dist/
git commit -m "feat: add bulk date shift endpoint and UI"
git push origin main
```

---

### Task 10: 印刷 / PDF 出力

**仕様:** ガントチャートをブラウザの印刷機能（Print → Save as PDF）で出力できるように、印刷用 CSS を追加する。ツールバーに「印刷」ボタンを追加し `window.print()` を呼ぶ。

**Files:**
- Modify: `frontend/src/components/schedule/GanttChart.jsx` (印刷ボタン追加)
- Modify: `frontend/src/styles/app.css` (印刷用 @media print CSS)

- [ ] **Step 1: `GanttChart.jsx` に印刷ボタンを追加**

ツールバーの末尾（Export ボタン群の近く）に追加:

```jsx
{!isMultiMode && !isHistoryMode && (
  <button
    type="button"
    className="btn btn--secondary"
    onClick={() => window.print()}
    title="ガントチャートを印刷 / PDF 保存"
  >
    🖨 印刷
  </button>
)}
```

- [ ] **Step 2: 印刷用 CSS を追加**

`frontend/src/styles/app.css` に追加:

```css
/* ── 印刷 / PDF 出力 ────────────────────────────────────────── */
@media print {
  /* ナビゲーション・ヘッダー類を非表示 */
  .app-header,
  .top-nav,
  .gantt-toolbar,
  .history-btn,
  .task-detail-panel,
  .annotation-editor,
  .toast-container,
  .add-task-modal,
  .history-panel {
    display: none !important;
  }

  /* ガントチャートをページ全幅に表示 */
  body, html {
    overflow: visible;
    height: auto;
  }
  .gantt-container,
  .gantt-scroll-wrapper {
    overflow: visible;
    height: auto;
  }
  .gantt-pane {
    overflow: visible;
  }

  /* ページ余白設定 */
  @page {
    margin: 10mm;
    size: A3 landscape;
  }
}
```

> **注意:** CSS クラス名は GanttChart.jsx / ScheduleScreen.jsx の実際のクラス名と一致させること。  
> （`app-header`, `gantt-toolbar` 等は実際のファイルを確認して修正する）

- [ ] **Step 3: ブラウザで動作確認**

1. 「🖨 印刷」ボタンをクリックしてブラウザの印刷ダイアログが開くことを確認
2. プレビューでツールバー・ヘッダーが非表示になることを確認
3. 「PDFとして保存」でガントチャートが保存されることを確認

- [ ] **Step 4: commit & push**

```bash
git add frontend/src/components/schedule/GanttChart.jsx frontend/src/styles/app.css frontend/dist/
git commit -m "feat: add print/PDF export button with print CSS"
git push origin main
```

---

## Phase 5: ドキュメント

---

### Task 11: 利用マニュアル作成

**仕様:** 全機能を網羅した利用マニュアルを `docs/user_manual.md` に作成する。  
設計書（`docs/design.md`）も実装した機能を反映して更新する。

**Files:**
- Create: `docs/user_manual.md`
- Modify: `docs/design.md`

- [ ] **Step 1: `docs/user_manual.md` を作成**

（実装完了後に全機能を文書化する — Task 11 のみ、実装の最後に行う）

利用マニュアルには以下のセクションを含める:
1. はじめに（システム概要・アクセス方法）
2. Top 画面の操作
   - プロジェクト作成・編集・削除・アーカイブ
   - Global Config 設定
   - マスター操作（一括 Export/Import）
3. Schedule 画面の操作
   - ガントチャートの見方（今日ライン・遅延アラート色分け）
   - タスク追加・編集・複製・削除
   - ドラッグによる日程変更
   - タスク検索・フィルター
   - 日程一括シフト
   - 依存関係の設定
   - クリティカルパスの見方
   - 付箋（アノテーション）の使い方
   - バージョン管理・履歴
   - Export / Import（単体）
   - 印刷 / PDF 出力
4. 比較表示・大項目フィルター
5. キーボードショートカット（あれば）
6. トラブルシューティング

- [ ] **Step 2: `docs/design.md` を更新**

以下のセクションを最新実装に合わせて更新:
- セクション 7（API仕様）: 新エンドポイント追加
  - `GET /api/v1/export/all`
  - `POST /api/v1/import/all`
  - `POST /api/v1/projects/{id}/tasks/shift_dates`
- セクション 8（Import/Export仕様）: bulk_export 形式を追記
- セクション 4（フロントエンド設計）: 新機能を追記
  - 今日ライン
  - 遅延アラート
  - タスク検索
  - タスク複製
  - 日程一括シフト
  - 印刷/PDF

- [ ] **Step 3: commit & push**

```bash
git add docs/user_manual.md docs/design.md
git commit -m "docs: add user manual and update design doc with all new features"
git push origin main
```

---

## セルフレビューチェックリスト

### スペックカバレッジ
- [ ] CSV バグ修正: `id_to_row` マップで dependencies を行インデックスに変換 ✓
- [ ] JSON export model_name 欠落修正 ✓
- [ ] 一括 Export: `GET /api/v1/export/all` ✓
- [ ] 一括 Import: `POST /api/v1/import/all?mode=new|skip_existing` ✓
- [ ] 今日ライン: gantt-rows 内に赤い縦線 ✓
- [ ] 遅延アラート: 期限超過=赤、完了=グレー ✓
- [ ] タスク検索: フロントエンドのみ、リアルタイム絞り込み ✓
- [ ] タスク複製: 同大項目・中項目に +1日でコピー ✓
- [ ] 日程一括シフト: バックエンドエンドポイント + UI ✓
- [ ] 印刷/PDF: window.print() + @media print CSS ✓
- [ ] 利用マニュアル: 全機能網羅 ✓

### 型・関数名の一貫性
- `_tasks_to_export_dicts()` — Task 1, 2, 3 すべてで使用 ✓
- `_assign_local_ids()`, `_validate_no_circular()`, `_import_tasks()` — Task 3 bulk import で再利用 ✓
- `_log()` — Task 9 の shift_task_dates で使用 ✓
- `fmtDate`, `addDays`, `parseDate` — Task 8 の TaskDetailPanel で使用 ✓
- `diffDays` — Task 5 の今日ライン計算で使用 ✓
