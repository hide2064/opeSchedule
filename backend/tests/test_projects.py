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
