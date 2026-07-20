import os
from typing import Dict, Any
from .models import GenerationStatus, Script, StoryboardFrame
from ...models.newapi import NewAPIVideoModel
from ...utils.newapi_models import VIDEO, get_model_spec, get_selected_model
from ...utils import get_logger

logger = get_logger(__name__)

class VideoGenerator:
    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or {}
        self.model = NewAPIVideoModel(self.config.get('model', {}))
        self.output_dir = self.config.get('output_dir', 'output/video')

    def generate_i2v(
        self,
        image_url: str,
        prompt: str,
        duration: int = 5,
        audio_url: str = None,
        model_id: str = None,
    ) -> Dict[str, Any]:
        """
        Generate Image-to-Video for motion reference.
        
        Args:
            image_url: Source image URL (can be local path or remote URL)
            prompt: Motion description prompt
            duration: Video duration in seconds (default 5)
            audio_url: Optional audio URL to drive lip-sync
            
        Returns:
            Dict with video_url key containing the generated video URL
        """
        import uuid

        selected_model = model_id or get_selected_model(VIDEO)
        get_model_spec(selected_model, VIDEO)
        if audio_url:
            raise ValueError("New API Seedance does not support driving-audio input")
        
        logger.info(f"Generating I2V motion reference: prompt={prompt[:50]}..., duration={duration}")
        
        # Handle local file paths
        img_path = None
        if image_url and not image_url.startswith("http"):
            potential_path = os.path.join("output", image_url)
            if os.path.exists(potential_path):
                img_path = os.path.abspath(potential_path)
            elif os.path.exists(image_url):
                img_path = image_url
        
        try:
            output_filename = f"motion_ref_{uuid.uuid4().hex[:8]}.mp4"
            output_path = os.path.join(self.output_dir, output_filename)
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            
            video_path, _ = self.model.generate(
                prompt=prompt,
                output_path=output_path,
                img_path=img_path,
                img_url=image_url if not img_path else None,
                model_id=selected_model,
                generation_mode="i2v",
            )
            
            video_url = os.path.relpath(output_path, "output")
            return {"video_url": video_url}
            
        except Exception as e:
            logger.error(f"Failed to generate I2V motion reference: {e}")
            raise

    def generate_clip(self, frame: StoryboardFrame, model_id: str = None) -> StoryboardFrame:
        """Generates a video clip from a storyboard frame."""
        if not frame.image_url:
            logger.error(f"Frame {frame.id} has no image URL. Cannot generate video.")
            frame.status = GenerationStatus.FAILED
            return frame
            
        frame.status = GenerationStatus.PROCESSING
        
        # Use the optimized video prompt if available, otherwise fallback to image prompt or description
        prompt = frame.video_prompt or frame.image_prompt or frame.action_description
        
        # Convert file:// URL to local path if necessary, or ensure the model can handle it.
        # New API accepts a public URL or encoded image input.
        # Local files are passed directly to the New API adapter, which packages
        # the image input for the remote request.
        
        img_url = frame.image_url
        img_path = None
        
        # Handle local file paths
        if img_url and not img_url.startswith("http"):
             # Assuming img_url is a relative path from project root or output dir
             # We need to resolve it to an absolute path
             # In this project, image_url is usually relative to 'output' or project root?
             # assets.py stores "characters/xxx.png" (relative to output dir usually, but let's check)
             # Wait, assets.py stores `rel_sheet_path = os.path.relpath(sheet_path, "output")`
             # So it is "characters/xxx.png".
             # We need to prepend the output directory.
             
             # Assuming we are running from project root
             potential_path = os.path.join("output", img_url)
             if os.path.exists(potential_path):
                 img_path = os.path.abspath(potential_path)
             else:
                 # Try absolute if it was stored absolute
                 if os.path.exists(img_url):
                     img_path = img_url
        
        try:
            output_path = os.path.join(self.output_dir, f"{frame.id}.mp4")
            
            video_path, _ = self.model.generate(
                prompt=prompt,
                output_path=output_path,
                img_path=img_path, # Pass local path, model will upload
                img_url=img_url if not img_path else None, # Pass URL if it's already remote
                model_id=model_id or get_selected_model(VIDEO),
                generation_mode="i2v",
            )
            
            # Store relative path for frontend serving
            rel_path = os.path.relpath(output_path, "output")
            frame.video_url = rel_path
            frame.status = GenerationStatus.COMPLETED
        except Exception as e:
            logger.error(f"Failed to generate video for frame {frame.id}: {e}")
            frame.status = GenerationStatus.FAILED
            
        return frame

    def generate_video(self, script: Script) -> Script:
        """Generate video clips for every storyboard frame in a script."""
        total_frames = len(script.frames)
        model_id = script.model_settings.video_model

        logger.info(f"Generating video clips for script: {script.title}")
        for index, frame in enumerate(script.frames):
            if frame.status == GenerationStatus.COMPLETED and frame.video_url:
                logger.info(f"Skipping completed video frame {frame.id}")
                continue

            logger.info(f"Generating video frame {index + 1}/{total_frames}: {frame.id}")
            script.frames[index] = self.generate_clip(frame, model_id=model_id)

        return script
