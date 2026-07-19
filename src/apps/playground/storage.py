"""Playground storage layer — JSON-file persistence for generation history and templates."""

import json
import os
import tempfile
import threading
from typing import List, Optional

from ...utils import get_logger
from .models import PlaygroundGeneration, PlaygroundTemplate

logger = get_logger(__name__)


class PlaygroundStorage:
    HISTORY_PATH = "output/playground_history.json"
    TEMPLATES_PATH = "output/playground_templates.json"

    def __init__(self):
        self._history: List[PlaygroundGeneration] = []
        self._templates: List[PlaygroundTemplate] = []
        self._lock = threading.RLock()
        self._load()

    # ------------------------------------------------------------------
    # Internal persistence
    # ------------------------------------------------------------------

    def _load(self) -> None:
        """Load both JSON files, creating them if missing."""
        self._history = self._load_file(self.HISTORY_PATH, PlaygroundGeneration)
        self._templates = self._load_file(self.TEMPLATES_PATH, PlaygroundTemplate)
        if os.path.exists(self.TEMPLATES_PATH):
            # Persist any stale template model migration performed by the
            # PlaygroundTemplate validator.
            self._save_templates()

    @staticmethod
    def _load_file(path: str, model_cls):
        """Read a JSON array file and parse each element into *model_cls*."""
        if not os.path.exists(path):
            return []
        try:
            with open(path, "r", encoding="utf-8") as f:
                raw = json.load(f)
            if not isinstance(raw, list):
                raise ValueError("persisted playground data must be a JSON array")
            return [model_cls.model_validate(item) for item in raw]
        except Exception as e:
            logger.error("Failed to load %s: %s", path, e)
            raise RuntimeError(f"Failed to load playground data from {path}: {e}") from e

    def _save_history(self) -> None:
        self._save_file(self.HISTORY_PATH, self._history)

    def _save_templates(self) -> None:
        self._save_file(self.TEMPLATES_PATH, self._templates)

    def _save_file(self, path: str, items: list) -> None:
        """Atomically replace *path* with the serialized model list.

        The temporary file is created beside the destination so ``os.replace``
        is atomic.  Failures intentionally propagate: callers must never report
        a mutation as successful when it was not persisted.
        """
        with self._lock:
            directory = os.path.dirname(path) or "."
            os.makedirs(directory, exist_ok=True)
            temp_path = None
            try:
                with tempfile.NamedTemporaryFile(
                    mode="w",
                    encoding="utf-8",
                    dir=directory,
                    prefix=f".{os.path.basename(path)}.",
                    suffix=".tmp",
                    delete=False,
                ) as temp_file:
                    temp_path = temp_file.name
                    json.dump(
                        [item.model_dump() for item in items],
                        temp_file,
                        indent=2,
                        ensure_ascii=False,
                    )
                    temp_file.flush()
                    os.fsync(temp_file.fileno())
                os.replace(temp_path, path)
            except Exception:
                if temp_path:
                    try:
                        os.unlink(temp_path)
                    except FileNotFoundError:
                        pass
                raise

    # ------------------------------------------------------------------
    # History CRUD
    # ------------------------------------------------------------------

    def add_generation(self, gen: PlaygroundGeneration) -> None:
        """Append a generation record and persist."""
        with self._lock:
            candidate = [*self._history, gen.model_copy(deep=True)]
            self._save_file(self.HISTORY_PATH, candidate)
            self._history = candidate

    def get_generation(self, gen_id: str) -> Optional[PlaygroundGeneration]:
        """Look up a generation by its id."""
        with self._lock:
            for gen in self._history:
                if gen.id == gen_id:
                    return gen.model_copy(deep=True)
        return None

    def list_history(self, limit: int = 50, offset: int = 0) -> List[PlaygroundGeneration]:
        """Return paginated history, newest first."""
        with self._lock:
            ordered = list(reversed(self._history))
            return [item.model_copy(deep=True) for item in ordered[offset : offset + limit]]

    def update_generation(self, gen: PlaygroundGeneration) -> None:
        """Replace an existing generation record (matched by id) and persist."""
        with self._lock:
            for i, existing in enumerate(self._history):
                if existing.id == gen.id:
                    candidate = list(self._history)
                    candidate[i] = gen.model_copy(deep=True)
                    self._save_file(self.HISTORY_PATH, candidate)
                    self._history = candidate
                    return
        logger.warning("update_generation: id %s not found", gen.id)

    def delete_generation(self, gen_id: str) -> bool:
        """Remove a generation by id. Returns True if found and deleted."""
        with self._lock:
            for i, gen in enumerate(self._history):
                if gen.id == gen_id:
                    candidate = [*self._history[:i], *self._history[i + 1 :]]
                    self._save_file(self.HISTORY_PATH, candidate)
                    self._history = candidate
                    return True
        return False

    # ------------------------------------------------------------------
    # Template CRUD
    # ------------------------------------------------------------------

    def add_template(self, template: PlaygroundTemplate) -> None:
        """Append a template record and persist."""
        with self._lock:
            candidate = [*self._templates, template.model_copy(deep=True)]
            self._save_file(self.TEMPLATES_PATH, candidate)
            self._templates = candidate

    def get_template(self, template_id: str) -> Optional[PlaygroundTemplate]:
        """Look up a template by its id."""
        with self._lock:
            for template in self._templates:
                if template.id == template_id:
                    return template.model_copy(deep=True)
        return None

    def list_templates(self) -> List[PlaygroundTemplate]:
        """Return all templates."""
        with self._lock:
            return [template.model_copy(deep=True) for template in self._templates]

    def update_template(self, template: PlaygroundTemplate) -> None:
        """Replace an existing template (matched by id) and persist."""
        with self._lock:
            for i, existing in enumerate(self._templates):
                if existing.id == template.id:
                    candidate = list(self._templates)
                    candidate[i] = template.model_copy(deep=True)
                    self._save_file(self.TEMPLATES_PATH, candidate)
                    self._templates = candidate
                    return
        logger.warning("update_template: id %s not found", template.id)

    def delete_template(self, template_id: str) -> bool:
        """Remove a template by id. Returns True if found and deleted."""
        with self._lock:
            for i, template in enumerate(self._templates):
                if template.id == template_id:
                    candidate = [*self._templates[:i], *self._templates[i + 1 :]]
                    self._save_file(self.TEMPLATES_PATH, candidate)
                    self._templates = candidate
                    return True
        return False
