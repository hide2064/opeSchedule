def test_create_project(client):
    res = client.post("/api/v1/projects", json={"name": "Project Alpha"})
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "Project Alpha"
    assert data["status"] == "active"
    assert data["color"] == "#4A90D9"


def test_list_projects(client):
    client.post("/api/v1/projects", json={"name": "Project A"})
    client.post("/api/v1/projects", json={"name": "Project B"})
    res = client.get("/api/v1/projects")
    assert res.status_code == 200
    assert len(res.json()) == 2


def test_list_projects_excludes_archived_by_default(client):
    client.post("/api/v1/projects", json={"name": "Active"})
    r = client.post("/api/v1/projects", json={"name": "Archived"})
    pid = r.json()["id"]
    client.patch(f"/api/v1/projects/{pid}", json={"status": "archived"})

    res = client.get("/api/v1/projects")
    assert len(res.json()) == 1

    res = client.get("/api/v1/projects?include_archived=true")
    assert len(res.json()) == 2


def test_get_project(client):
    r = client.post("/api/v1/projects", json={"name": "My Project"})
    pid = r.json()["id"]
    res = client.get(f"/api/v1/projects/{pid}")
    assert res.status_code == 200
    assert res.json()["name"] == "My Project"


def test_get_project_not_found(client):
    res = client.get("/api/v1/projects/9999")
    assert res.status_code == 404


def test_update_project(client):
    r = client.post("/api/v1/projects", json={"name": "Old Name"})
    pid = r.json()["id"]
    res = client.patch(f"/api/v1/projects/{pid}", json={"name": "New Name", "color": "#FF0000"})
    assert res.status_code == 200
    assert res.json()["name"] == "New Name"
    assert res.json()["color"] == "#FF0000"


def test_delete_project(client):
    r = client.post("/api/v1/projects", json={"name": "To Delete"})
    pid = r.json()["id"]
    res = client.delete(f"/api/v1/projects/{pid}")
    assert res.status_code == 204
    assert client.get(f"/api/v1/projects/{pid}").status_code == 404


def test_create_project_invalid_color(client):
    res = client.post("/api/v1/projects", json={"name": "Bad Color", "color": "red"})
    assert res.status_code == 422


# ── /projects/stats tests ──────────────────────────────────

def test_project_stats_empty_project(client):
    pid = client.post("/api/v1/projects", json={"name": "P1"}).json()["id"]
    res = client.get("/api/v1/projects/stats")
    assert res.status_code == 200
    stats = res.json()
    assert len(stats) == 1
    s = stats[0]
    assert s["id"] == pid
    assert s["progress_pct"] == 0.0
    assert s["total_tasks"] == 0
    assert s["delayed_task_count"] == 0
    assert s["next_milestone_name"] is None


def test_project_stats_progress(client):
    pid = client.post("/api/v1/projects", json={"name": "P2"}).json()["id"]
    client.post(f"/api/v1/projects/{pid}/tasks", json={
        "name": "T1", "start_date": "2026-04-01", "end_date": "2026-04-10", "progress": 1.0
    })
    client.post(f"/api/v1/projects/{pid}/tasks", json={
        "name": "T2", "start_date": "2026-04-11", "end_date": "2026-04-20", "progress": 0.0
    })
    res = client.get("/api/v1/projects/stats")
    assert res.status_code == 200
    s = next(x for x in res.json() if x["id"] == pid)
    assert s["total_tasks"] == 2
    assert s["completed_tasks"] == 1
    assert abs(s["progress_pct"] - 0.5) < 0.01


def test_project_stats_delayed(client):
    from datetime import date, timedelta
    pid = client.post("/api/v1/projects", json={"name": "P3"}).json()["id"]
    past = (date.today() - timedelta(days=5)).isoformat()
    client.post(f"/api/v1/projects/{pid}/tasks", json={
        "name": "Late", "start_date": past, "end_date": past, "progress": 0.0
    })
    res = client.get("/api/v1/projects/stats")
    s = next(x for x in res.json() if x["id"] == pid)
    assert s["delayed_task_count"] == 1


def test_project_stats_next_milestone(client):
    from datetime import date, timedelta
    pid = client.post("/api/v1/projects", json={"name": "P4"}).json()["id"]
    future = (date.today() + timedelta(days=10)).isoformat()
    client.post(f"/api/v1/projects/{pid}/tasks", json={
        "name": "M1", "start_date": future, "end_date": future, "task_type": "milestone"
    })
    res = client.get("/api/v1/projects/stats")
    s = next(x for x in res.json() if x["id"] == pid)
    assert s["next_milestone_name"] == "M1"
    assert s["next_milestone_date"] == future


def test_project_stats_excludes_archived(client):
    pid_a = client.post("/api/v1/projects", json={"name": "Active"}).json()["id"]
    pid_b = client.post("/api/v1/projects", json={"name": "Archived"}).json()["id"]
    client.patch(f"/api/v1/projects/{pid_b}", json={"status": "archived"})
    res = client.get("/api/v1/projects/stats")
    ids = [s["id"] for s in res.json()]
    assert pid_a in ids
    assert pid_b not in ids
