import pytest


@pytest.fixture
def project(client):
    r = client.post("/api/v1/projects", json={"name": "Test Project"})
    return r.json()


def test_create_task(client, project):
    pid = project["id"]
    res = client.post(
        f"/api/v1/projects/{pid}/tasks",
        json={"name": "Task 1", "start_date": "2026-04-01", "end_date": "2026-04-07"},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "Task 1"
    assert data["task_type"] == "task"
    assert data["progress"] == 0.0


def test_create_milestone(client, project):
    pid = project["id"]
    res = client.post(
        f"/api/v1/projects/{pid}/tasks",
        json={
            "name": "Go Live",
            "start_date": "2026-05-01",
            "end_date": "2026-05-01",
            "task_type": "milestone",
        },
    )
    assert res.status_code == 201
    assert res.json()["task_type"] == "milestone"


def test_create_milestone_with_range_fails(client, project):
    pid = project["id"]
    res = client.post(
        f"/api/v1/projects/{pid}/tasks",
        json={
            "name": "Bad Milestone",
            "start_date": "2026-05-01",
            "end_date": "2026-05-05",
            "task_type": "milestone",
        },
    )
    assert res.status_code == 422


def test_list_tasks(client, project):
    pid = project["id"]
    client.post(f"/api/v1/projects/{pid}/tasks",
                json={"name": "T1", "start_date": "2026-04-01", "end_date": "2026-04-03"})
    client.post(f"/api/v1/projects/{pid}/tasks",
                json={"name": "T2", "start_date": "2026-04-05", "end_date": "2026-04-10"})
    res = client.get(f"/api/v1/projects/{pid}/tasks")
    assert res.status_code == 200
    assert len(res.json()) == 2


def test_update_task_dates(client, project):
    pid = project["id"]
    r = client.post(f"/api/v1/projects/{pid}/tasks",
                    json={"name": "T1", "start_date": "2026-04-01", "end_date": "2026-04-07"})
    tid = r.json()["id"]
    res = client.patch(
        f"/api/v1/projects/{pid}/tasks/{tid}/dates",
        json={"start_date": "2026-04-10", "end_date": "2026-04-15"},
    )
    assert res.status_code == 200
    assert res.json()["start_date"] == "2026-04-10"


def test_update_task_with_dependencies(client, project):
    pid = project["id"]
    r1 = client.post(f"/api/v1/projects/{pid}/tasks",
                     json={"name": "T1", "start_date": "2026-04-01", "end_date": "2026-04-07"})
    r2 = client.post(f"/api/v1/projects/{pid}/tasks",
                     json={"name": "T2", "start_date": "2026-04-08", "end_date": "2026-04-14",
                           "dependency_ids": [r1.json()["id"]]})
    assert r2.status_code == 201
    assert len(r2.json()["dependencies"]) == 1


def test_delete_task(client, project):
    pid = project["id"]
    r = client.post(f"/api/v1/projects/{pid}/tasks",
                    json={"name": "T1", "start_date": "2026-04-01", "end_date": "2026-04-07"})
    tid = r.json()["id"]
    res = client.delete(f"/api/v1/projects/{pid}/tasks/{tid}")
    assert res.status_code == 204


def test_task_end_before_start_fails(client, project):
    pid = project["id"]
    res = client.post(
        f"/api/v1/projects/{pid}/tasks",
        json={"name": "Bad", "start_date": "2026-04-10", "end_date": "2026-04-01"},
    )
    assert res.status_code == 422


def test_delete_project_cascades_tasks(client, project):
    pid = project["id"]
    client.post(f"/api/v1/projects/{pid}/tasks",
                json={"name": "T1", "start_date": "2026-04-01", "end_date": "2026-04-07"})
    client.delete(f"/api/v1/projects/{pid}")
    res = client.get(f"/api/v1/projects/{pid}/tasks")
    assert res.status_code == 404
