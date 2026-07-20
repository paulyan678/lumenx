"""Regression tests for user-facing JSON persistence failure semantics."""

from __future__ import annotations

import json
import os
import time
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from src.apps.playground import storage as storage_module
from src.apps.playground.models import (
    PlaygroundGeneration,
    PlaygroundMode,
    PlaygroundOutput,
    PlaygroundTemplate,
)
from src.apps.playground.service import PlaygroundService
from src.apps.playground.storage import PlaygroundStorage


def _generation(generation_id: str = "generation-1") -> PlaygroundGeneration:
    return PlaygroundGeneration(
        id=generation_id,
        mode=PlaygroundMode.T2I,
        model_id="gpt-image-2",
        prompt="draw a fox",
        status="pending",
        created_at="2026-01-01T00:00:00+00:00",
    )


def _template(template_id: str = "template-1") -> PlaygroundTemplate:
    return PlaygroundTemplate(
        id=template_id,
        name="Portrait",
        prompt="draw a portrait",
        created_at="2026-01-01T00:00:00+00:00",
        updated_at="2026-01-01T00:00:00+00:00",
    )


def _storage(tmp_path, monkeypatch) -> PlaygroundStorage:
    monkeypatch.setattr(
        PlaygroundStorage, "HISTORY_PATH", str(tmp_path / "playground_history.json")
    )
    monkeypatch.setattr(
        PlaygroundStorage, "TEMPLATES_PATH", str(tmp_path / "playground_templates.json")
    )
    return PlaygroundStorage()


@pytest.mark.parametrize("target_name", ["playground_history.json", "playground_templates.json"])
def test_malformed_playground_state_fails_closed(tmp_path, monkeypatch, target_name):
    target = tmp_path / target_name
    target.write_text("{broken", encoding="utf-8")

    with pytest.raises(RuntimeError, match="Failed to load playground data"):
        _storage(tmp_path, monkeypatch)

    assert target.read_text(encoding="utf-8") == "{broken"


def test_playground_atomic_write_preserves_existing_file(tmp_path, monkeypatch):
    storage = _storage(tmp_path, monkeypatch)
    storage.add_generation(_generation())
    target = tmp_path / "playground_history.json"
    original = target.read_text(encoding="utf-8")

    def fail_replace(*_args):
        raise OSError("disk unavailable")

    monkeypatch.setattr(storage_module.os, "replace", fail_replace)
    with pytest.raises(OSError, match="disk unavailable"):
        storage.add_generation(_generation("generation-2"))

    assert target.read_text(encoding="utf-8") == original
    assert [item.id for item in storage.list_history()] == ["generation-1"]
    assert list(tmp_path.glob(".playground_history.json.*.tmp")) == []


def test_all_playground_mutations_roll_back_in_memory_on_save_failure(tmp_path, monkeypatch):
    storage = _storage(tmp_path, monkeypatch)
    storage.add_generation(_generation())
    storage.add_template(_template())

    generation = storage.get_generation("generation-1")
    template = storage.get_template("template-1")
    assert generation is not None and template is not None
    generation.status = "completed"
    template.name = "Changed"

    def fail_save(*_args):
        raise OSError("disk full")

    monkeypatch.setattr(storage, "_save_file", fail_save)

    for mutation in (
        lambda: storage.add_generation(_generation("generation-2")),
        lambda: storage.update_generation(generation),
        lambda: storage.delete_generation("generation-1"),
        lambda: storage.add_template(_template("template-2")),
        lambda: storage.update_template(template),
        lambda: storage.delete_template("template-1"),
    ):
        with pytest.raises(OSError, match="disk full"):
            mutation()

    persisted_generation = storage.get_generation("generation-1")
    persisted_template = storage.get_template("template-1")
    assert persisted_generation is not None and persisted_generation.status == "pending"
    assert persisted_template is not None and persisted_template.name == "Portrait"
    assert [item.id for item in storage.list_history()] == ["generation-1"]
    assert [item.id for item in storage.list_templates()] == ["template-1"]


def test_packaged_config_malformed_file_is_not_reset_or_partially_applied(tmp_path, monkeypatch):
    from src.apps.comic_gen import api

    config_path = tmp_path / "config.json"
    original = json.dumps({"LUMENX_PERSISTENCE_FIRST": "new", "BROKEN": {"nested": True}})
    config_path.write_text(original, encoding="utf-8")
    monkeypatch.setattr(api, "get_user_config_path", lambda: str(config_path))
    monkeypatch.setenv("LUMENX_PERSISTENCE_FIRST", "old")

    with pytest.raises(RuntimeError, match="Failed to load user configuration"):
        api.load_user_config()
    with pytest.raises(RuntimeError, match="Failed to load user configuration"):
        api.save_user_config({"NEWAPI_BASE_URL": "http://127.0.0.1:9999/v1"})

    assert os.environ["LUMENX_PERSISTENCE_FIRST"] == "old"
    assert config_path.read_text(encoding="utf-8") == original


def test_packaged_config_does_not_override_operator_process_environment(tmp_path, monkeypatch):
    from src.apps.comic_gen import api

    config_path = tmp_path / "config.json"
    config_path.write_text(
        json.dumps({"NEWAPI_BASE_URL": "https://saved.example/v1", "SAVED_ONLY": "yes"}),
        encoding="utf-8",
    )
    monkeypatch.setattr(api, "get_user_config_path", lambda: str(config_path))
    monkeypatch.setenv("NEWAPI_BASE_URL", "https://operator.example/v1")
    monkeypatch.delenv("SAVED_ONLY", raising=False)

    api.load_user_config()

    assert os.environ["NEWAPI_BASE_URL"] == "https://operator.example/v1"
    assert os.environ["SAVED_ONLY"] == "yes"


def test_packaged_config_atomic_failure_preserves_file_and_process_state(tmp_path, monkeypatch):
    from src.apps.comic_gen import api

    config_path = tmp_path / "config.json"
    config_path.write_text(
        '{"NEWAPI_BASE_URL": "https://before.example/v1"}',
        encoding="utf-8",
    )
    os.chmod(config_path, 0o600)
    monkeypatch.setattr(api, "get_user_config_path", lambda: str(config_path))
    monkeypatch.setenv("NEWAPI_BASE_URL", "https://before.example/v1")

    def fail_replace(*_args):
        raise OSError("disk unavailable")

    monkeypatch.setattr(api.os, "replace", fail_replace)
    with pytest.raises(HTTPException) as exc_info:
        api.update_env_config(
            api.EnvConfig(NEWAPI_BASE_URL="https://after.example/v1")
        )

    assert exc_info.value.status_code == 500
    assert "disk unavailable" in exc_info.value.detail
    assert os.environ["NEWAPI_BASE_URL"] == "https://before.example/v1"
    assert json.loads(config_path.read_text(encoding="utf-8")) == {
        "NEWAPI_BASE_URL": "https://before.example/v1"
    }
    assert list(tmp_path.glob(".config.json.*.tmp")) == []


def test_packaged_config_remove_is_atomic_private_and_propagates_failures(tmp_path, monkeypatch):
    from src.apps.comic_gen import api

    config_path = tmp_path / "config.json"
    monkeypatch.setattr(api, "get_user_config_path", lambda: str(config_path))
    api.save_user_config({"SECRET": "credential", "KEEP": "value"})
    api.remove_user_config_keys(["SECRET"])

    assert json.loads(config_path.read_text(encoding="utf-8")) == {"KEEP": "value"}
    assert config_path.stat().st_mode & 0o777 == 0o600

    def fail_write(*_args):
        raise OSError("read-only filesystem")

    monkeypatch.setattr(api, "_atomic_write_private_json", fail_write)
    with pytest.raises(OSError, match="read-only filesystem"):
        api.remove_user_config_keys(["KEEP"])
    assert json.loads(config_path.read_text(encoding="utf-8")) == {"KEEP": "value"}


def test_concurrent_packaged_config_updates_do_not_lose_keys(tmp_path, monkeypatch):
    from src.apps.comic_gen import api

    config_path = tmp_path / "config.json"
    monkeypatch.setattr(api, "get_user_config_path", lambda: str(config_path))
    real_write = api._atomic_write_private_json

    def slow_write(*args):
        # Hold the read/modify/write window open long enough for an unlocked
        # implementation to let every worker read the same stale snapshot.
        time.sleep(0.01)
        real_write(*args)

    monkeypatch.setattr(api, "_atomic_write_private_json", slow_write)
    updates = [{f"KEY_{index}": str(index)} for index in range(8)]
    with ThreadPoolExecutor(max_workers=8) as executor:
        list(executor.map(api.save_user_config, updates))

    assert json.loads(config_path.read_text(encoding="utf-8")) == {
        f"KEY_{index}": str(index) for index in range(8)
    }


def test_development_env_defaults_do_not_override_explicit_process_values(tmp_path, monkeypatch):
    from src.apps.comic_gen import api

    env_file = tmp_path / ".env"
    env_file.write_text("LUMENX_PRECEDENCE_TEST=file-default\n", encoding="utf-8")
    monkeypatch.setenv("LUMENX_PRECEDENCE_TEST", "explicit-process-value")

    api._load_project_environment(str(env_file))

    assert os.environ["LUMENX_PRECEDENCE_TEST"] == "explicit-process-value"


def test_development_config_is_private_and_remove_errors_propagate(tmp_path, monkeypatch):
    import dotenv

    from src.apps.comic_gen import api

    config_path = tmp_path / ".env"
    monkeypatch.setattr(api, "get_user_config_path", lambda: str(config_path))
    api.save_user_config({"SECRET": "credential", "KEEP": "value"})
    api.remove_user_config_keys(["SECRET"])

    assert dotenv.dotenv_values(config_path) == {"KEEP": "value"}
    assert config_path.stat().st_mode & 0o777 == 0o600

    def fail_unset(*_args):
        raise OSError("development config is read-only")

    monkeypatch.setattr(dotenv, "unset_key", fail_unset)
    with pytest.raises(OSError, match="development config is read-only"):
        api.remove_user_config_keys(["KEEP"])


def test_save_to_library_persists_output_relative_url_and_propagates_failure(tmp_path, monkeypatch):
    from src.apps.comic_gen import api as comic_api

    monkeypatch.chdir(tmp_path)
    storage = _storage(tmp_path, monkeypatch)
    source = tmp_path / "output" / "playground" / "images" / "fox.png"
    source.parent.mkdir(parents=True)
    source.write_bytes(b"image")
    generation = _generation()
    generation.outputs.append(
        PlaygroundOutput(
            id="output-1",
            media_path="output/playground/images/fox.png",
            media_type="image",
        )
    )
    storage.add_generation(generation)
    service = PlaygroundService(storage)
    created = []

    def create_asset(asset_type, payload):
        created.append((asset_type, payload))
        return SimpleNamespace(id="prop-1")

    monkeypatch.setattr(comic_api.pipeline, "create_library_asset", create_asset)
    assert service.save_to_library("generation-1", "output-1", "../../escape") is True
    assert created[0][0] == "prop"
    assert created[0][1]["image_url"].startswith("assets/prop/")
    assert created[0][1]["image_url"].endswith("_fox.png")
    assert not (tmp_path / "escape" / "fox.png").exists()
    assert storage.get_generation("generation-1").outputs[0].saved_to_library is True
    saved_files = set((tmp_path / "output" / "assets" / "prop").iterdir())

    second = _generation("generation-2")
    second.outputs.append(
        PlaygroundOutput(
            id="output-2",
            media_path="output/playground/images/fox.png",
            media_type="image",
        )
    )
    storage.add_generation(second)

    def fail_create(*_args):
        raise OSError("library persistence failed")

    monkeypatch.setattr(comic_api.pipeline, "create_library_asset", fail_create)
    with pytest.raises(OSError, match="library persistence failed"):
        service.save_to_library("generation-2", "output-2", "prop")
    assert storage.get_generation("generation-2").outputs[0].saved_to_library is False
    assert set((tmp_path / "output" / "assets" / "prop").iterdir()) == saved_files
