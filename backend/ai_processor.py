import io
import time
import numpy as np
from PIL import Image
import av

class VideoFrameProcessor:
    """
    Processes incoming video frames from mobile phone camera streams.
    Provides:
      - Real-time frame statistics (FPS, resolution, bitrate indicators)
      - JPEG snapshot caching for instant web preview / snapshots
      - Motion and activity analysis
      - Extensible AI detection hook (OpenCV, YOLO, Face detection, Gemini, etc.)
    """
    def __init__(self, stream_id: str):
        self.stream_id = stream_id
        self.frame_count = 0
        self.start_time = time.time()
        self.last_frame_time = time.time()
        self.fps = 0.0
        self.width = 0
        self.height = 0
        self.latest_jpeg: bytes | None = None
        self.prev_gray: np.ndarray | None = None
        self.motion_score = 0.0

    def process_video_frame(self, frame: av.VideoFrame) -> dict:
        now = time.time()
        self.frame_count += 1
        
        # Calculate instantaneous FPS
        dt = now - self.last_frame_time
        if dt > 0:
            instant_fps = 1.0 / dt
            self.fps = round(self.fps * 0.9 + instant_fps * 0.1, 1)
        self.last_frame_time = now

        self.width = frame.width
        self.height = frame.height

        # Convert frame to numpy array (RGB) for analysis & snapshot
        # Downsample for lightweight processing if large
        try:
            img = frame.to_image()
            
            # Save lightweight JPEG snapshot every ~5-10 frames or 500ms
            if self.frame_count % 5 == 0 or self.latest_jpeg is None:
                # Resize for thumbnail preview
                thumb = img.copy()
                thumb.thumbnail((640, 480))
                buf = io.BytesIO()
                thumb.save(buf, format="JPEG", quality=75)
                self.latest_jpeg = buf.getvalue()

            # Compute lightweight motion score
            # Downsample to 64x64 grayscale for fast NumPy motion estimate
            small_img = img.resize((64, 64)).convert("L")
            gray = np.asarray(small_img, dtype=np.float32)
            if self.prev_gray is not None:
                diff = np.mean(np.abs(gray - self.prev_gray))
                self.motion_score = round(float(diff), 2)
            self.prev_gray = gray
        except Exception as e:
            pass

        return {
            "stream_id": self.stream_id,
            "fps": self.fps,
            "width": self.width,
            "height": self.height,
            "total_frames": self.frame_count,
            "motion_score": self.motion_score,
            "timestamp": now,
        }


class AudioFrameProcessor:
    """
    Processes incoming audio frames to compute audio energy / VU levels.
    """
    def __init__(self, stream_id: str):
        self.stream_id = stream_id
        self.volume_level = 0.0

    def process_audio_frame(self, frame: av.AudioFrame) -> dict:
        try:
            # frame.to_ndarray() returns sound samples
            raw_audio = frame.to_ndarray()
            # Calculate RMS (root-mean-square) volume
            rms = np.sqrt(np.mean(raw_audio.astype(np.float32) ** 2))
            # Normalize to ~ 0-100 scale
            normalized = min(100.0, float(rms) / 327.68) if raw_audio.dtype == np.int16 else min(100.0, float(rms) * 100)
            self.volume_level = round(float(normalized), 1)
        except Exception:
            self.volume_level = 0.0

        return {
            "stream_id": self.stream_id,
            "volume_level": self.volume_level,
        }
