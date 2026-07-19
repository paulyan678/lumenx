"""Strict New API compatible image and video adapters."""

from __future__ import annotations

import base64
import io
import logging
import mimetypes
import os
import time
from contextlib import ExitStack
from typing import Any, Callable, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import requests

from .base import ImageGenModel, VideoGenModel
from ..utils.newapi_models import (
    IMAGE,
    VIDEO,
    get_model_spec,
    get_selected_model,
    redact_newapi_secrets,
    resolve_model_api_key,
    validate_model_for_mode,
)

logger = logging.getLogger(__name__)

RETRYABLE_STATUS_CODES = {429, 502, 503, 504}
IMAGE_SIZE_ALIASES = {
    "576x1024": "1024x1536",
    "768x1024": "1024x1536",
    "1024x1536": "1024x1536",
    "1024x576": "1536x1024",
    "1024x768": "1536x1024",
    "1536x1024": "1536x1024",
    "1024x1024": "1024x1024",
}


def normalize_newapi_base_url(value: Optional[str]) -> str:
    """Return a New API root ending in ``/v1``.

    HTTPS is required for remote hosts so credentials cannot accidentally be
    transmitted in plaintext.  Plain HTTP remains available for loopback
    development servers.
    """

    raw = (value or "").strip().rstrip("/")
    if not raw:
        raise RuntimeError("NEWAPI_BASE_URL is required")
    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("NEWAPI_BASE_URL must be an absolute HTTP(S) URL")
    hostname = (parsed.hostname or "").lower()
    if parsed.scheme != "https" and hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError("NEWAPI_BASE_URL must use HTTPS unless it is a loopback URL")
    if not raw.endswith("/v1"):
        raw = f"{raw}/v1"
    return raw


def _base_url() -> str:
    return normalize_newapi_base_url(os.getenv("NEWAPI_BASE_URL"))


def normalize_newapi_image_size(value: Optional[str]) -> str:
    normalized = str(value or "1024x1024").strip().lower().replace("*", "x")
    try:
        return IMAGE_SIZE_ALIASES[normalized]
    except KeyError as exc:
        raise ValueError("GPT Image 2 size must be 1024x1024, 1024x1536, or 1536x1024") from exc


def newapi_image_configured(model_id: Optional[str] = None) -> bool:
    try:
        selected = model_id or get_selected_model(IMAGE)
        resolve_model_api_key(selected, IMAGE)
        _base_url()
        return True
    except (RuntimeError, ValueError):
        return False


def newapi_video_configured(model_id: Optional[str] = None) -> bool:
    try:
        selected = model_id or get_selected_model(VIDEO)
        resolve_model_api_key(selected, VIDEO)
        _base_url()
        return True
    except (RuntimeError, ValueError):
        return False


def _auth_headers(model_id: str, capability: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {resolve_model_api_key(model_id, capability)}"}


def _response_error(response: requests.Response) -> str:
    message = ""
    try:
        payload = response.json()
        error = payload.get("error") if isinstance(payload, dict) else None
        if isinstance(error, dict):
            message = str(error.get("message") or error.get("type") or "")
        elif error:
            message = str(error)
        if not message and isinstance(payload, dict):
            message = str(payload.get("message") or payload.get("detail") or "")
    except Exception:
        message = response.text or ""
    message = redact_newapi_secrets(" ".join(message.split()))[:500]
    return message or f"HTTP {response.status_code}"


def _request(method: str, url: str, *, max_attempts: int = 3, **kwargs) -> requests.Response:
    """Issue a request with bounded retries and no credential logging."""

    last_response: Optional[requests.Response] = None
    last_exception: Optional[requests.RequestException] = None
    for attempt in range(max_attempts):
        try:
            response = requests.request(method, url, **kwargs)
        except requests.RequestException as exc:
            last_exception = exc
            if attempt == max_attempts - 1:
                message = redact_newapi_secrets(str(exc))[:500]
                raise RuntimeError(f"New API request failed: {message}") from exc
            time.sleep(min(2**attempt, 5))
            continue
        last_response = response
        if 200 <= response.status_code < 300:
            return response
        if response.status_code not in RETRYABLE_STATUS_CODES or attempt == max_attempts - 1:
            raise RuntimeError(f"New API request failed: {_response_error(response)}")
        retry_after = response.headers.get("Retry-After")
        try:
            delay = min(float(retry_after), 10.0) if retry_after else min(2**attempt, 5)
        except (TypeError, ValueError):
            delay = min(2**attempt, 5)
        time.sleep(delay)
    raise RuntimeError(
        f"New API request failed: {_response_error(last_response)}"
        if last_response is not None
        else (
            f"New API request failed: {redact_newapi_secrets(str(last_exception))[:500]}"
            if last_exception is not None
            else "New API request failed"
        )
    )


def _ensure_parent(path: str) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)


def _remove_partial(path: str) -> None:
    try:
        os.unlink(path)
    except OSError:
        pass


def _save_streaming_result(
    response: requests.Response,
    output_path: str,
    media_label: str,
) -> None:
    """Persist a streamed provider result and reject empty 2xx bodies."""
    _ensure_parent(output_path)
    bytes_written = 0
    try:
        with open(output_path, "wb") as handle:
            for chunk in response.iter_content(chunk_size=65536):
                if chunk:
                    handle.write(chunk)
                    bytes_written += len(chunk)
    except Exception:
        _remove_partial(output_path)
        raise
    if bytes_written == 0:
        _remove_partial(output_path)
        raise RuntimeError(f"New API returned an empty {media_label} download")


def _save_image_result(result: Dict[str, Any], output_path: str) -> None:
    data = result.get("data") if isinstance(result, dict) else None
    first = data[0] if isinstance(data, list) and data else None
    if not isinstance(first, dict):
        raise RuntimeError("New API image response did not contain data[0]")

    _ensure_parent(output_path)
    encoded = first.get("b64_json")
    if encoded:
        try:
            payload = base64.b64decode(encoded, validate=True)
            if not payload:
                raise ValueError("empty image payload")
            with open(output_path, "wb") as handle:
                handle.write(payload)
        except (ValueError, TypeError) as exc:
            _remove_partial(output_path)
            raise RuntimeError("New API returned invalid base64 image data") from exc
        return

    url = first.get("url")
    if not url:
        raise RuntimeError("New API image response contained neither url nor b64_json")
    response = _request("GET", str(url), timeout=120, stream=True)
    _save_streaming_result(response, output_path, "image")


def _open_image_ref(reference: str, stack: ExitStack) -> Tuple[str, Any, str]:
    """Open a local, remote, or data-URL image for a multipart request."""

    if reference.startswith("data:"):
        try:
            header, encoded = reference.split(",", 1)
            mime = header[5:].split(";", 1)[0] or "image/png"
            payload = base64.b64decode(encoded)
        except Exception as exc:
            raise ValueError("Invalid image data URL") from exc
        file_obj = stack.enter_context(io.BytesIO(payload))
        extension = mimetypes.guess_extension(mime) or ".png"
        return f"reference{extension}", file_obj, mime

    if reference.startswith(("http://", "https://")):
        response = _request("GET", reference, timeout=120)
        payload = response.content
        file_obj = stack.enter_context(io.BytesIO(payload))
        name = os.path.basename(urlparse(reference).path) or "reference.png"
        mime = response.headers.get("Content-Type", "").split(";", 1)[0]
        return name, file_obj, mime or mimetypes.guess_type(name)[0] or "image/png"

    if not os.path.isfile(reference):
        raise ValueError(f"Reference image not found: {reference}")
    file_obj = stack.enter_context(open(reference, "rb"))
    name = os.path.basename(reference)
    mime = mimetypes.guess_type(name)[0] or "application/octet-stream"
    return name, file_obj, mime


def _media_input(reference: Optional[str]) -> Optional[str]:
    if not reference:
        return None
    if reference.startswith(("http://", "https://", "data:")):
        return reference
    if not os.path.isfile(reference):
        return reference
    mime = mimetypes.guess_type(reference)[0] or "application/octet-stream"
    with open(reference, "rb") as handle:
        encoded = base64.b64encode(handle.read()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def _video_dimensions(resolution: str, aspect_ratio: str) -> Tuple[int, int]:
    long_edge = 1920 if str(resolution).lower() in {"1080p", "1080"} else 1280
    short_edge = 1080 if long_edge == 1920 else 720
    if aspect_ratio in {"9:16", "3:4"}:
        return short_edge, long_edge
    if aspect_ratio == "1:1":
        return short_edge, short_edge
    return long_edge, short_edge


def _walk_provider_payload(value: Any):
    """Yield every mapping in an arbitrarily nested provider response."""
    if isinstance(value, dict):
        yield value
        for nested in value.values():
            yield from _walk_provider_payload(nested)
    elif isinstance(value, list):
        for nested in value:
            yield from _walk_provider_payload(nested)


def _extract_video_url(payload: Dict[str, Any]) -> Optional[str]:
    # New API relays do not all preserve the same wrapper depth. In
    # particular, Seedance may return data.data.data.content.video_url.
    for candidate in _walk_provider_payload(payload):
        for key in ("url", "video_url", "output_url"):
            value = candidate.get(key)
            if isinstance(value, str) and value:
                return value
    return None


def _extract_video_status(payload: Dict[str, Any]) -> str:
    for candidate in _walk_provider_payload(payload):
        value = candidate.get("status")
        if value is not None and str(value).strip():
            return str(value).strip().lower()
    return ""


class NewAPIImageModel(ImageGenModel):
    """GPT Image generation/editing through a New API deployment."""

    def generate(self, prompt: str, output_path: str, **kwargs) -> Tuple[str, float]:
        start = time.time()
        base_url = _base_url()
        model = (
            kwargs.pop("model_id", None)
            or kwargs.pop("model_name", None)
            or get_selected_model(IMAGE)
        )
        # Resolve the exact model/key pair before opening files or making a
        # network request. This is the final fail-closed routing boundary.
        headers = _auth_headers(model, IMAGE)
        size = normalize_newapi_image_size(kwargs.get("size"))
        quality = kwargs.get("quality", "high")
        refs: List[str] = []
        if kwargs.get("ref_image_path"):
            refs.append(kwargs["ref_image_path"])
        refs.extend(kwargs.get("ref_image_paths") or [])

        if refs:
            with ExitStack() as stack:
                files = []
                for reference in refs[:16]:
                    name, file_obj, mime = _open_image_ref(reference, stack)
                    files.append(("image[]", (name, file_obj, mime)))
                response = _request(
                    "POST",
                    f"{base_url}/images/edits",
                    headers=headers,
                    files=files,
                    data={
                        "model": model,
                        "prompt": prompt,
                        "n": "1",
                        "size": size,
                        "quality": quality,
                    },
                    timeout=300,
                )
        else:
            response = _request(
                "POST",
                f"{base_url}/images/generations",
                headers={**headers, "Content-Type": "application/json"},
                json={
                    "model": model,
                    "prompt": prompt,
                    "n": 1,
                    "size": size,
                    "quality": quality,
                },
                timeout=300,
            )

        _save_image_result(response.json(), output_path)
        return output_path, time.time() - start


class NewAPIVideoModel(VideoGenModel):
    """Seedance-compatible async video generation through New API."""

    def generate(
        self,
        prompt: str,
        output_path: str,
        img_url: Optional[str] = None,
        img_path: Optional[str] = None,
        **kwargs,
    ) -> Tuple[str, float]:
        start = time.time()
        model = (
            kwargs.pop("model_id", None)
            or kwargs.pop("model", None)
            or kwargs.pop("model_name", None)
            or get_selected_model(VIDEO)
        )
        get_model_spec(model, VIDEO)
        duration = int(kwargs.get("duration", 5))
        resolution = str(kwargs.get("resolution", "1080p"))
        aspect_ratio = str(kwargs.get("aspect_ratio", "16:9"))
        seed = kwargs.get("seed")
        ref_images = list(kwargs.get("ref_image_urls") or [])
        primary_reference = img_path or img_url or (ref_images[0] if ref_images else None)
        generation_mode = kwargs.get("generation_mode") or ("i2v" if primary_reference else "t2v")
        validate_model_for_mode(model, generation_mode)
        if len(ref_images) > 1:
            raise ValueError("New API multi-reference video generation is not supported")
        if ref_images and (img_path or img_url):
            raise ValueError("New API video generation accepts only one image input")

        if generation_mode == "i2v" and not primary_reference:
            raise ValueError("Image-to-video generation requires one image input")
        if generation_mode == "t2v" and primary_reference:
            raise ValueError("Text-to-video generation does not accept an image input")

        base_url = _base_url()
        headers = {**_auth_headers(model, VIDEO), "Content-Type": "application/json"}

        primary_image = _media_input(primary_reference)
        body: Dict[str, Any] = {
            "model": model,
            "prompt": prompt,
            "duration": duration,
            "n": 1,
            "metadata": {
                "resolution": resolution,
                "ratio": aspect_ratio,
                "generate_audio": bool(kwargs.get("generate_audio", True)),
                "watermark": bool(kwargs.get("watermark", False)),
            },
        }
        if seed is not None:
            body["seed"] = seed
        if primary_image:
            # New API's verified I2V contract accepts one top-level image.
            # R2V/multi-reference remains disabled.
            body["image"] = primary_image

        response = _request(
            "POST",
            f"{base_url}/video/generations",
            headers=headers,
            json=body,
            timeout=120,
        )
        payload = response.json()
        task_id = payload.get("task_id") or payload.get("id")
        if not task_id and isinstance(payload.get("data"), dict):
            task_id = payload["data"].get("task_id") or payload["data"].get("id")
        if not task_id:
            raise RuntimeError("New API video response did not contain a task_id")

        callback: Optional[Callable[[str, Optional[str], Optional[str]], None]] = kwargs.get(
            "on_provider_ids"
        )
        if callback:
            request_id = response.headers.get("x-request-id") or response.headers.get(
                "X-Request-Id"
            )
            try:
                callback("newapi", str(task_id), request_id)
            except Exception as exc:
                logger.warning("New API provider-id callback failed: %s", exc)

        poll_interval = max(float(os.getenv("NEWAPI_VIDEO_POLL_INTERVAL", "10")), 0.1)
        deadline = time.monotonic() + max(float(os.getenv("NEWAPI_VIDEO_MAX_WAIT", "900")), 1.0)
        result = payload
        while True:
            status = _extract_video_status(result)
            url = _extract_video_url(result)
            if url and status in {"", "completed", "succeeded", "success"}:
                break
            if status in {"failed", "error", "cancelled", "canceled"}:
                error = result.get("error") or result.get("message") or "unknown provider error"
                raise RuntimeError(
                    f"New API video task failed: {redact_newapi_secrets(error)[:500]}"
                )
            if time.monotonic() >= deadline:
                raise RuntimeError("New API video task timed out")
            time.sleep(poll_interval)
            poll = _request(
                "GET",
                f"{base_url}/video/generations/{task_id}",
                headers=_auth_headers(model, VIDEO),
                timeout=30,
                max_attempts=8,
            )
            result = poll.json()

        video_url = _extract_video_url(result)
        if not video_url:
            raise RuntimeError("New API completed the video task without a download URL")
        download = _request("GET", video_url, timeout=180, stream=True)
        _save_streaming_result(download, output_path, "video")
        return output_path, time.time() - start
