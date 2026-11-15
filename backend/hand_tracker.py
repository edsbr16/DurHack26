"""MediaPipe hand pinch tracking on incoming WebRTC frames.

The HandLandmarker loads once for the whole process — every stream's frames
are processed serially on the event loop, so one shared instance is safe and
avoids N model loads. Detection is throttled to ~12Hz per stream.

Pinch is scale-invariant: dist(thumb tip 4, index tip 8) normalised by
wrist(0) -> middle MCP(9), so distance to the camera doesn't matter.
0 = fingertips touching, 1 = open hand. The ``pinching`` flag uses hysteresis
(enter < 0.20, exit > 0.28) so the on-screen badge doesn't flicker; payloads
always carry the raw score.

If mediapipe is not installed (fresh venv before ``pip install -r
requirements.txt``), tracking degrades to "no hand" and the backend keeps
running — a missing optional dependency must never kill the frame pipeline.
"""
import logging
import math
import time
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("hand_tracker")

try:
    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions
    from mediapipe.tasks.python.vision import HandLandmarker, HandLandmarkerOptions, RunningMode

    _MP_OK = True
except Exception as e:  # optional dependency — degrade, don't crash
    mp = None
    _MP_OK = False
    logger.warning("mediapipe unavailable — pinch tracking disabled (%s)", e)

MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
    "hand_landmarker/float16/1/hand_landmarker.task"
)
MODEL_CACHE = Path.home() / ".cache" / "durhack" / "hand_landmarker.task"
LEGACY_CACHE = Path.home() / ".cache" / "composition" / "hand_landmarker.task"

PINCH_ENTER, PINCH_EXIT = 0.20, 0.28
THUMB_TIP, INDEX_TIP, WRIST, MIDDLE_MCP = 4, 8, 0, 9
DETECT_INTERVAL = 0.08  # ~12Hz per stream

_landmarker = None
_image_landmarker = None
_last_ts = 0
_detect_warned = False


def _ensure_model() -> Path:
    if MODEL_CACHE.exists() and MODEL_CACHE.stat().st_size > 1_000_000:
        return MODEL_CACHE
    MODEL_CACHE.parent.mkdir(parents=True, exist_ok=True)
    # Reuse a copy downloaded by the retired standalone tracker, if present.
    if LEGACY_CACHE.exists() and LEGACY_CACHE.stat().st_size > 1_000_000:
        MODEL_CACHE.write_bytes(LEGACY_CACHE.read_bytes())
        return MODEL_CACHE
    logger.info("downloading hand_landmarker.task (~7.5 MB, one time)...")
    tmp = MODEL_CACHE.with_suffix(".tmp")
    urllib.request.urlretrieve(MODEL_URL, tmp)
    tmp.rename(MODEL_CACHE)
    return MODEL_CACHE


def _get_landmarker():
    global _landmarker
    if _landmarker is None:
        _landmarker = HandLandmarker.create_from_options(
            HandLandmarkerOptions(
                base_options=BaseOptions(model_asset_path=str(_ensure_model())),
                running_mode=RunningMode.VIDEO,
                num_hands=1,
                min_hand_detection_confidence=0.4,
                min_hand_presence_confidence=0.4,
                min_tracking_confidence=0.4,
            )
        )
    return _landmarker


def _get_image_landmarker():
    # Room/studio cameras are separate JPEG sequences. VIDEO mode's shared
    # temporal history mixes different participants' hands; detect independently.
    global _image_landmarker
    if _image_landmarker is None:
        _image_landmarker = HandLandmarker.create_from_options(
            HandLandmarkerOptions(base_options=BaseOptions(model_asset_path=str(_ensure_model())),
                                  running_mode=RunningMode.IMAGE, num_hands=1,
                                  min_hand_detection_confidence=.4,
                                  min_hand_presence_confidence=.4))
    return _image_landmarker


class HandTracker:
    """Per-stream pinch state over the shared landmarker."""

    def __init__(self, independent=False):
        self.independent = independent
        self.present = False
        self.pinch = 0.0
        self.pinching = False
        self.landmarks: Optional[List[List[float]]] = None
        self._last_detect = 0.0

    def maybe_detect(self, frame) -> None:
        """Run detection at most every DETECT_INTERVAL on an av.VideoFrame."""
        global _last_ts, _detect_warned
        now = time.monotonic()
        if now - self._last_detect < DETECT_INTERVAL:
            return
        self._last_detect = now
        if not _MP_OK:
            return
        try:
            rgb = frame.to_ndarray(format="rgb24")
            # detect_for_video needs a strictly increasing ms timestamp and its
            # Image container — a raw ndarray dies on a `_image_ptr` AttributeError.
            _last_ts = max(_last_ts + 1, int(time.monotonic() * 1000))
            image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            hands = (_get_image_landmarker().detect(image) if self.independent else
                     _get_landmarker().detect_for_video(image, _last_ts)).hand_landmarks
        except Exception as e:
            if not _detect_warned:
                _detect_warned = True
                logger.warning("pinch detection error (further ones suppressed): %r", e)
            return
        if hands:
            hand = hands[0]
            d = math.hypot(hand[THUMB_TIP].x - hand[INDEX_TIP].x, hand[THUMB_TIP].y - hand[INDEX_TIP].y)
            s = math.hypot(hand[WRIST].x - hand[MIDDLE_MCP].x, hand[WRIST].y - hand[MIDDLE_MCP].y) or 1e-4
            self.pinch = min(1.0, max(0.0, (d / s - 0.15) / 0.6))
            self.present = True
            self.landmarks = [[round(p.x, 4), round(p.y, 4)] for p in hand]
            self.pinching = self.pinch < PINCH_ENTER or (self.pinching and self.pinch < PINCH_EXIT)
        else:
            self.present = False
            self.pinch = 0.0
            self.pinching = False
            self.landmarks = None

    def to_event_fields(self) -> Dict[str, Any]:
        return {
            "hand": self.present,
            "pinch": round(self.pinch, 2),
            "pinching": self.pinching,
            "landmarks": self.landmarks,
        }
