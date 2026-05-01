import io
import json


def _make_project_with_tasks(client):
    r = client.post("/api/v1/projects", json={"name": "Export Test"})
    pid = r.json()["id"]
    client.post(f"/api/v1/projects/{pid}/tasks",
                json={"name": "Phase 1", "start_date": "2026-04-01", "end_date": "2026-04-14"})
    client.post(f"/api/v1/projects/{pid}/tasks",
                json={"name": "Launch", "start_date": "2026-04-15", "end_date": "2026-04-15",
                      "task_type": "milestone"})
    return pid


def test_export_json(client):
    pid = _make_project_with_tasks(client)
    res = client.get(f"/api/v1/projects/{pid}/export?format=json")
    assert res.status_code == 200
    data = json.loads(res.content)
    assert data["version"] == "1.0"
    assert data["project"]["name"] == "Export Test"
    assert len(data["tasks"]) == 2


def test_export_csv(client):
    pid = _make_project_with_tasks(client)
    res = client.get(f"/api/v1/projects/{pid}/export?format=csv")
    assert res.status_code == 200
    assert b"Phase 1" in res.content
    assert b"Launch" in res.content


def test_import_json(client):
    payload = {
        "version": "1.0",
        "project": {"name": "Imported Project"},
        "tasks": [
            {"id": 1, "name": "T1", "start_date": "2026-04-01", "end_date": "2026-04-07",
             "task_type": "task", "progress": 0.0, "sort_order": 0, "dependencies": []},
            {"id": 2, "name": "T2", "start_date": "2026-04-08", "end_date": "2026-04-14",
             "task_type": "task", "progress": 0.5, "sort_order": 1, "dependencies": [1]},
        ],
    }
    content = json.dumps(payload).encode()
    res = client.post(
        "/api/v1/projects/import",
        files={"file": ("schedule.json", io.BytesIO(content), "application/json")},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["task_count"] == 2

    # Verify the project was created
    pid = data["project_id"]
    tasks = client.get(f"/api/v1/projects/{pid}/tasks").json()
    assert len(tasks) == 2
    assert tasks[1]["dependencies"][0]["depends_on_id"] == tasks[0]["id"]


def test_import_csv(client):
    csv_content = (
        "name,start_date,end_date,task_type,progress,color,notes,dependencies,sort_order\n"
        "Phase 1,2026-04-01,2026-04-14,task,0.0,,,, 0\n"
        "Milestone,2026-04-15,2026-04-15,milestone,0.0,,,,1\n"
    )
    res = client.post(
        "/api/v1/projects/import",
        files={"file": ("project.csv", io.BytesIO(csv_content.encode()), "text/csv")},
    )
    assert res.status_code == 201
    assert res.json()["task_count"] == 2


def test_import_invalid_format(client):
    res = client.post(
        "/api/v1/projects/import",
        files={"file": ("data.txt", io.BytesIO(b"hello"), "text/plain")},
    )
    assert res.status_code == 400


def test_export_not_found(client):
    res = client.get("/api/v1/projects/9999/export?format=json")
    assert res.status_code == 404


def test_import_file_too_large(client):
    """10 MB を超えるファイルは 400 を返すことを確認する。"""
    large_content = b"x" * (10 * 1024 * 1024 + 1)  # 10 MB + 1 byte
    res = client.post(
        "/api/v1/projects/import",
        files={"file": ("big.json", io.BytesIO(large_content), "application/json")},
    )
    assert res.status_code == 400
    assert "too large" in res.json()["detail"].lower()


# ── Task 1: CSV round-trip バグ修正テスト ─────────────────────────────────────

def test_csv_round_trip_preserves_dependencies(client):
    """CSV エクスポート → インポート後も依存関係が保持されることを確認する。"""
    r = client.post("/api/v1/projects", json={"name": "CSV Round-trip Test"})
    pid = r.json()["id"]

    r1 = client.post(f"/api/v1/projects/{pid}/tasks", json={
        "name": "Task A", "start_date": "2026-04-01", "end_date": "2026-04-07",
        "task_type": "task", "progress": 0.0, "sort_order": 0, "dependency_ids": [],
    })
    task_a_id = r1.json()["id"]

    client.post(f"/api/v1/projects/{pid}/tasks", json={
        "name": "Task B", "start_date": "2026-04-08", "end_date": "2026-04-14",
        "task_type": "task", "progress": 0.0, "sort_order": 1,
        "dependency_ids": [task_a_id],
    })

    res = client.get(f"/api/v1/projects/{pid}/export?format=csv")
    assert res.status_code == 200
    csv_bytes = res.content

    res2 = client.post(
        "/api/v1/projects/import",
        files={"file": ("round_trip.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    assert res2.status_code == 201, f"Import failed: {res2.json()}"

    new_pid = res2.json()["project_id"]
    tasks = client.get(f"/api/v1/projects/{new_pid}/tasks").json()
    tasks_by_name = {t["name"]: t for t in tasks}
    assert "Task B" in tasks_by_name
    assert len(tasks_by_name["Task B"]["dependencies"]) == 1
    dep_id = tasks_by_name["Task B"]["dependencies"][0]["depends_on_id"]
    assert dep_id == tasks_by_name["Task A"]["id"]


# ── Task 2: JSON export model_name テスト ─────────────────────────────────────

def test_json_export_includes_model_name(client):
    """JSON エクスポートに model_name が含まれることを確認する。"""
    r = client.post("/api/v1/projects", json={"name": "Model Name Test", "model_name": "WebApp"})
    pid = r.json()["id"]

    res = client.get(f"/api/v1/projects/{pid}/export?format=json")
    assert res.status_code == 200
    data = res.json()
    assert data["project"].get("model_name") == "WebApp"


def test_json_import_restores_model_name(client):
    """JSON インポートで model_name が復元されることを確認する。"""
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


# ── Task 3: 一括 Export/Import テスト ────────────────────────────────────────

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
    pj1 = next(p for p in data["projects"] if p["name"] == "Bulk PJ1")
    assert pj1["model_name"] == "A"


def test_import_all_mode_new(client):
    """一括インポート（mode=new）で全プロジェクトが新規作成されることを確認する。"""
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
    client.post("/api/v1/projects", json={"name": "Existing PJ"})

    payload = {
        "version": "2.0", "type": "bulk_export",
        "exported_at": "2026-05-01T00:00:00+00:00",
        "project_count": 2,
        "projects": [
            {"name": "Existing PJ", "project_status": "未開始", "sort_order": 0, "tasks": []},
            {"name": "New PJ",      "project_status": "未開始", "sort_order": 1, "tasks": []},
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
    payload = {"version": "1.0", "type": "bulk_export", "projects": []}
    content = json.dumps(payload).encode()
    res = client.post(
        "/api/v1/import/all",
        files={"file": ("bad.json", io.BytesIO(content), "application/json")},
    )
    assert res.status_code == 400
