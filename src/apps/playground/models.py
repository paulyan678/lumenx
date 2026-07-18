from typing import List, Optional
from enum import Enum
from pydantic import BaseModel, ConfigDict, Field, model_validator

from ...utils.newapi_models import (
    DEFAULT_MODELS,
    IMAGE,
    VIDEO,
    get_model_spec,
    validate_model_for_mode,
)


class PlaygroundMode(str, Enum):
    T2I = "t2i"
    I2I = "i2i"
    T2V = "t2v"
    I2V = "i2v"


class PlaygroundOutput(BaseModel):
    id: str = Field(..., description="Unique identifier (UUID)")
    media_path: str = Field(..., description="Generated file path relative to output/")
    media_type: str = Field(..., description="Output media type: image or video")
    thumbnail_path: Optional[str] = Field(None, description="Thumbnail file path relative to output/")
    saved_to_library: bool = Field(False, description="Whether this output has been saved to the project library")


class PlaygroundGeneration(BaseModel):
    id: str = Field(..., description="Unique identifier (UUID)")
    mode: PlaygroundMode = Field(..., description="Generation mode")
    model_id: str = Field(..., description="Model identifier from model catalog")
    prompt: str = Field(..., description="Text prompt for generation")
    negative_prompt: Optional[str] = Field(None, description="Negative prompt to exclude undesired elements")
    input_media: List[str] = Field(default_factory=list, description="Input file paths for image/video-conditioned modes")
    parameters: dict = Field(default_factory=dict, description="Generation parameters (resolution, duration, aspect_ratio, etc.)")
    batch_size: int = Field(1, ge=1, le=4, description="Number of outputs to generate per request (1-4)")
    outputs: List[PlaygroundOutput] = Field(default_factory=list, description="Generated outputs")
    status: str = Field("pending", description="Generation status: pending/processing/completed/failed")
    error: Optional[str] = Field(None, description="Error message if generation failed")
    created_at: str = Field(..., description="Creation timestamp in ISO 8601 format")


class PlaygroundTemplate(BaseModel):
    id: str = Field(..., description="Unique identifier (UUID)")
    name: str = Field(..., description="Template display name")
    category: str = Field("general", description="Template category: image/video/general")
    prompt: str = Field(..., description="Template prompt text")
    negative_prompt: Optional[str] = Field(None, description="Default negative prompt")
    default_mode: Optional[PlaygroundMode] = Field(None, description="Default generation mode for this template")
    default_model_id: Optional[str] = Field(None, description="Default model identifier")
    default_parameters: dict = Field(default_factory=dict, description="Default generation parameters")
    created_at: str = Field(..., description="Creation timestamp in ISO 8601 format")
    updated_at: str = Field(..., description="Last update timestamp in ISO 8601 format")

    @model_validator(mode="before")
    @classmethod
    def migrate_stale_default_model(cls, value):
        data = dict(value or {})
        mode = data.get("default_mode")
        mode = mode.value if isinstance(mode, PlaygroundMode) else mode
        if mode not in {"t2i", "i2i", "t2v", "i2v", None}:
            data["default_mode"] = None
            data["default_model_id"] = None
            return data
        model_id = data.get("default_model_id")
        if model_id and mode:
            try:
                validate_model_for_mode(model_id, mode)
            except ValueError:
                data["default_model_id"] = DEFAULT_MODELS[
                    IMAGE if mode in {"t2i", "i2i"} else VIDEO
                ]
        elif model_id:
            try:
                get_model_spec(model_id)
            except ValueError:
                data["default_model_id"] = None
        return data


class GenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: PlaygroundMode = Field(..., description="Generation mode")
    model_id: str = Field(..., description="Model identifier from model catalog")
    prompt: str = Field(..., description="Text prompt for generation")
    negative_prompt: Optional[str] = Field(None, description="Negative prompt to exclude undesired elements")
    input_media: Optional[List[str]] = Field(None, description="Input file paths for image/video-conditioned modes")
    parameters: Optional[dict] = Field(None, description="Generation parameters (resolution, duration, aspect_ratio, etc.)")
    batch_size: Optional[int] = Field(1, ge=1, le=4, description="Number of outputs to generate (1-4)")

    @model_validator(mode="after")
    def validate_newapi_selection(self):
        validate_model_for_mode(self.model_id, self.mode.value)
        if self.mode in {PlaygroundMode.I2I, PlaygroundMode.I2V} and not self.input_media:
            raise ValueError(f"{self.mode.value} generation requires one source image")
        return self


class SaveToLibraryRequest(BaseModel):
    category: str = Field("general", description="Library category for the saved output")


class CreateTemplateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., description="Template display name")
    category: Optional[str] = Field("general", description="Template category: image/video/general")
    prompt: str = Field(..., description="Template prompt text")
    negative_prompt: Optional[str] = Field(None, description="Default negative prompt")
    default_mode: Optional[PlaygroundMode] = Field(None, description="Default generation mode")
    default_model_id: Optional[str] = Field(None, description="Default model identifier")
    default_parameters: Optional[dict] = Field(None, description="Default generation parameters")

    @model_validator(mode="after")
    def validate_newapi_default(self):
        if self.default_model_id and self.default_mode:
            validate_model_for_mode(self.default_model_id, self.default_mode.value)
        elif self.default_model_id:
            get_model_spec(self.default_model_id)
        return self


class UpdateTemplateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(None, description="Template display name")
    category: Optional[str] = Field(None, description="Template category: image/video/general")
    prompt: Optional[str] = Field(None, description="Template prompt text")
    negative_prompt: Optional[str] = Field(None, description="Default negative prompt")
    default_mode: Optional[PlaygroundMode] = Field(None, description="Default generation mode")
    default_model_id: Optional[str] = Field(None, description="Default model identifier")
    default_parameters: Optional[dict] = Field(None, description="Default generation parameters")

    @model_validator(mode="after")
    def validate_newapi_default(self):
        if self.default_model_id and self.default_mode:
            validate_model_for_mode(self.default_model_id, self.default_mode.value)
        elif self.default_model_id:
            get_model_spec(self.default_model_id)
        return self
