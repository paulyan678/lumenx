from fastapi.testclient import TestClient

from src.apps.comic_gen import api as comic_api


def test_delete_project_is_idempotent_when_project_is_already_missing(monkeypatch):
    monkeypatch.setattr(comic_api.pipeline, "get_script", lambda _script_id: None)

    response = TestClient(comic_api.app).delete("/projects/already-deleted")

    assert response.status_code == 200
    assert response.json() == {
        "status": "already_deleted",
        "id": "already-deleted",
    }
