import pytest


@pytest.fixture
def project(client):
    r = client.post("/api/v1/projects", json={"name": "Test Project"})
    return r.json()


def test_list_members_empty(client, project):
    pid = project["id"]
    res = client.get(f"/api/v1/projects/{pid}/members")
    assert res.status_code == 200
    assert res.json() == []


def test_create_member(client, project):
    pid = project["id"]
    res = client.post(f"/api/v1/projects/{pid}/members", json={"name": "Alice", "color": "#FF5722"})
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "Alice"
    assert data["color"] == "#FF5722"
    assert data["project_id"] == pid


def test_create_member_blank_name_fails(client, project):
    pid = project["id"]
    res = client.post(f"/api/v1/projects/{pid}/members", json={"name": "  "})
    assert res.status_code == 400


def test_update_member(client, project):
    pid = project["id"]
    mid = client.post(f"/api/v1/projects/{pid}/members", json={"name": "Bob"}).json()["id"]
    res = client.patch(f"/api/v1/projects/{pid}/members/{mid}", json={"name": "Robert", "email": "r@example.com"})
    assert res.status_code == 200
    assert res.json()["name"] == "Robert"
    assert res.json()["email"] == "r@example.com"


def test_delete_member(client, project):
    pid = project["id"]
    mid = client.post(f"/api/v1/projects/{pid}/members", json={"name": "Carol"}).json()["id"]
    res = client.delete(f"/api/v1/projects/{pid}/members/{mid}")
    assert res.status_code == 204
    assert client.get(f"/api/v1/projects/{pid}/members").json() == []


def test_delete_member_sets_task_assignee_null(client, project):
    """メンバー削除時に担当タスクの assignee_id が NULL になることを確認する。"""
    pid = project["id"]
    mid = client.post(f"/api/v1/projects/{pid}/members", json={"name": "Dave"}).json()["id"]
    r = client.post(f"/api/v1/projects/{pid}/tasks", json={
        "name": "Task A", "start_date": "2026-06-01", "end_date": "2026-06-05",
        "assignee_id": mid,
    })
    assert r.status_code == 201
    tid = r.json()["id"]
    assert r.json()["assignee_id"] == mid
    # メンバー削除
    client.delete(f"/api/v1/projects/{pid}/members/{mid}")
    # タスクの assignee_id が NULL になっていること
    tasks = client.get(f"/api/v1/projects/{pid}/tasks").json()
    task = next(t for t in tasks if t["id"] == tid)
    assert task["assignee_id"] is None


def test_member_not_found(client, project):
    pid = project["id"]
    assert client.delete(f"/api/v1/projects/{pid}/members/99999").status_code == 404
