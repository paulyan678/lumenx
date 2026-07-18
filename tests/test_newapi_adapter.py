import base64
from types import SimpleNamespace

import pytest
import requests

from src.models.newapi import (
    NewAPIImageModel,
    NewAPIVideoModel,
    normalize_newapi_base_url,
    normalize_newapi_image_size,
)
from src.apps.comic_gen.llm_adapter import LLMAdapter


class FakeResponse:
    def __init__(self, payload=None, *, status=200, body=b"", headers=None):
        self._payload = payload
        self.status_code = status
        self.content = body
        self.headers = headers or {}
        self.text = ""

    def json(self):
        return self._payload

    def iter_content(self, chunk_size=65536):
        del chunk_size
        if self.content:
            yield self.content


class TestNewAPIBaseUrl:
    def test_adds_v1_once(self):
        assert normalize_newapi_base_url("https://gateway.example") == "https://gateway.example/v1"
        assert normalize_newapi_base_url("https://gateway.example/v1/") == "https://gateway.example/v1"

    def test_rejects_plain_http_for_remote_host(self):
        with pytest.raises(ValueError, match="HTTPS"):
            normalize_newapi_base_url("http://gateway.example")

    def test_allows_loopback_http(self):
        assert normalize_newapi_base_url("http://127.0.0.1:8080") == "http://127.0.0.1:8080/v1"

    def test_requires_explicit_base_url(self):
        with pytest.raises(RuntimeError, match="required"):
            normalize_newapi_base_url(None)

    def test_maps_legacy_image_sizes_and_rejects_unknown(self):
        assert normalize_newapi_image_size("576*1024") == "1024x1536"
        assert normalize_newapi_image_size("1024*576") == "1536x1024"
        with pytest.raises(ValueError, match="size must be"):
            normalize_newapi_image_size("2048x2048")


class TestNewAPIChatAdapter:
    def test_does_not_echo_upstream_exception_text(self):
        credential_like_text = "Bearer should-never-appear"

        class BrokenCompletions:
            def create(self, **kwargs):
                del kwargs
                raise RuntimeError(credential_like_text)

        client = SimpleNamespace(
            chat=SimpleNamespace(completions=BrokenCompletions())
        )
        with pytest.raises(RuntimeError, match="New API chat request failed") as exc_info:
            LLMAdapter()._chat_once(
                client,
                "deepseek-v4-flash",
                [{"role": "user", "content": "hello"}],
                None,
            )
        assert credential_like_text not in str(exc_info.value)


class TestNewAPIImageModel:
    def test_provider_error_redacts_configured_model_key(self, monkeypatch, tmp_path):
        configured_key = "image-test-token"

        def fake_request(method, url, **kwargs):
            del method, url, kwargs
            return FakeResponse(
                {"error": {"message": f"credential {configured_key} rejected"}},
                status=401,
            )

        monkeypatch.setenv("NEWAPI_BASE_URL", "https://gateway.example/v1")
        monkeypatch.setenv("NEWAPI_GPT_IMAGE_2_API_KEY", configured_key)
        monkeypatch.setattr("src.models.newapi.requests.request", fake_request)

        with pytest.raises(RuntimeError) as exc_info:
            NewAPIImageModel({}).generate(
                "draw a fox",
                str(tmp_path / "result.png"),
                model_id="gpt-image-2",
            )
        assert configured_key not in str(exc_info.value)
        assert "[REDACTED]" in str(exc_info.value)

    def test_saves_base64_image(self, monkeypatch, tmp_path):
        requests_seen = []

        def fake_request(method, url, **kwargs):
            requests_seen.append((method, url, kwargs))
            return FakeResponse({"data": [{"b64_json": base64.b64encode(b"image-bytes").decode()}]})

        monkeypatch.setenv("NEWAPI_BASE_URL", "https://gateway.example/v1")
        monkeypatch.setenv("NEWAPI_GPT_IMAGE_2_API_KEY", "image-test-token")
        monkeypatch.setenv("NEWAPI_IMAGE_MODEL", "gpt-image-2")
        monkeypatch.setattr("src.models.newapi.requests.request", fake_request)

        output = tmp_path / "result.png"
        path, _ = NewAPIImageModel({}).generate("draw a fox", str(output), size="1024*1024")

        assert path == str(output)
        assert output.read_bytes() == b"image-bytes"
        method, url, kwargs = requests_seen[0]
        assert method == "POST"
        assert url == "https://gateway.example/v1/images/generations"
        assert kwargs["json"]["model"] == "gpt-image-2"
        assert kwargs["json"]["size"] == "1024x1024"
        assert kwargs["headers"]["Authorization"] == "Bearer image-test-token"

    def test_image_edit_uses_multipart_image_array(self, monkeypatch, tmp_path):
        reference = tmp_path / "ref.png"
        reference.write_bytes(b"reference")
        output = tmp_path / "edited.png"
        requests_seen = []

        def fake_request(method, url, **kwargs):
            requests_seen.append((method, url, kwargs))
            return FakeResponse({"data": [{"b64_json": base64.b64encode(b"edited").decode()}]})

        monkeypatch.setenv("NEWAPI_BASE_URL", "https://gateway.example")
        monkeypatch.setenv("NEWAPI_GPT_IMAGE_2_API_KEY", "image-test-token")
        monkeypatch.setenv("NEWAPI_IMAGE_MODEL", "gpt-image-2")
        monkeypatch.setattr("src.models.newapi.requests.request", fake_request)

        NewAPIImageModel({}).generate(
            "edit it",
            str(output),
            ref_image_paths=[str(reference)],
        )

        assert output.read_bytes() == b"edited"
        method, url, kwargs = requests_seen[0]
        assert method == "POST"
        assert url.endswith("/v1/images/edits")
        assert kwargs["files"][0][0] == "image[]"


class TestNewAPIVideoModel:
    def test_polls_and_downloads_video(self, monkeypatch, tmp_path):
        calls = []
        responses = iter(
            [
                FakeResponse(
                    {"task_id": "task-123", "status": "processing"},
                    status=201,
                    headers={"x-request-id": "request-456"},
                ),
                FakeResponse({"task_id": "task-123", "status": "succeeded", "url": "https://cdn.example/video.mp4"}),
                FakeResponse(body=b"video-bytes"),
            ]
        )

        def fake_request(method, url, **kwargs):
            calls.append((method, url, kwargs))
            return next(responses)

        provider_ids = []
        monkeypatch.setenv("NEWAPI_BASE_URL", "https://gateway.example/v1")
        monkeypatch.setenv("NEWAPI_SEEDANCE_2_API_KEY", "video-test-token")
        monkeypatch.setenv("NEWAPI_VIDEO_MODEL", "doubao-seedance-2-0-260128")
        monkeypatch.setenv("NEWAPI_VIDEO_POLL_INTERVAL", "0.1")
        monkeypatch.setattr("src.models.newapi.requests.request", fake_request)
        monkeypatch.setattr("src.models.newapi.time.sleep", lambda _: None)

        output = tmp_path / "result.mp4"
        path, _ = NewAPIVideoModel({}).generate(
            "camera pushes in",
            str(output),
            duration=5,
            resolution="720p",
            aspect_ratio="16:9",
            img_url="https://cdn.example/first.png",
            on_provider_ids=lambda *args: provider_ids.append(args),
        )

        assert path == str(output)
        assert output.read_bytes() == b"video-bytes"
        assert provider_ids == [("newapi", "task-123", "request-456")]
        assert calls[0][1] == "https://gateway.example/v1/video/generations"
        assert calls[0][2]["json"]["image"] == "https://cdn.example/first.png"
        assert "images" not in calls[0][2]["json"]
        assert calls[0][2]["json"]["metadata"]["resolution"] == "720p"
        assert calls[1][1].endswith("/video/generations/task-123")
        assert calls[1][2]["headers"]["Authorization"] == "Bearer video-test-token"

    def test_accepts_deeply_nested_newapi_video_result(self, monkeypatch, tmp_path):
        responses = iter(
            [
                FakeResponse({"data": {"task_id": "task-nested", "status": "PROCESSING"}}),
                requests.ConnectionError("temporary proxy failure"),
                FakeResponse(
                    {
                        "code": "success",
                        "data": {
                            "task_id": "task-nested",
                            "status": "SUCCESS",
                            "data": {
                                "code": "success",
                                "data": {
                                    "status": "succeeded",
                                    "content": {
                                        "video_url": "https://cdn.example/nested.mp4"
                                    },
                                },
                            },
                        },
                    }
                ),
                FakeResponse(body=b"nested-video"),
            ]
        )

        monkeypatch.setenv("NEWAPI_BASE_URL", "https://gateway.example/v1")
        monkeypatch.setenv("NEWAPI_SEEDANCE_2_MINI_API_KEY", "mini-test-token")
        monkeypatch.setenv("NEWAPI_VIDEO_POLL_INTERVAL", "0.1")
        def fake_request(*args, **kwargs):
            response = next(responses)
            if isinstance(response, Exception):
                raise response
            return response

        monkeypatch.setattr("src.models.newapi.requests.request", fake_request)
        monkeypatch.setattr("src.models.newapi.time.sleep", lambda _: None)

        output = tmp_path / "nested.mp4"
        path, _ = NewAPIVideoModel({}).generate(
            "camera pushes in",
            str(output),
            img_url="https://cdn.example/first.png",
            model_id="doubao-seedance-2-0-mini-260615",
        )

        assert path == str(output)
        assert output.read_bytes() == b"nested-video"

    def test_rejects_unverified_multi_reference_mode(self, monkeypatch, tmp_path):
        with pytest.raises(ValueError, match="does not support generation mode"):
            NewAPIVideoModel({}).generate(
                "prompt",
                str(tmp_path / "out.mp4"),
                generation_mode="r2v",
                ref_image_urls=["one.png", "two.png"],
            )

    def test_rejects_i2v_without_an_image(self, tmp_path):
        with pytest.raises(ValueError, match="requires one image"):
            NewAPIVideoModel({}).generate(
                "prompt",
                str(tmp_path / "out.mp4"),
                model_id="doubao-seedance-2-0-fast-260128",
                generation_mode="i2v",
            )

    def test_rejects_t2v_with_an_image(self, tmp_path):
        with pytest.raises(ValueError, match="does not accept an image"):
            NewAPIVideoModel({}).generate(
                "prompt",
                str(tmp_path / "out.mp4"),
                img_url="https://cdn.example/first.png",
                model_id="doubao-seedance-2-0-fast-260128",
                generation_mode="t2v",
            )
