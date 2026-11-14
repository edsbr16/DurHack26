#!/usr/bin/env python3
"""Host-laptop pinch tracker for Composition.

OpenCV webcam + MediaPipe HandLandmarker on the host machine. Tracks the
thumb tip (landmark 4) and index tip (landmark 8), draws the pinch state on
a local webcam window, and relays it to the bridge as flat `host:vision`
payloads — the same shape the phones send as `client:vision`.

Deliberately inert: the bridge relays `host:vision` but nothing consumes it
yet. Pinching does nothing to the room until something subscribes.

Run:  python3 host-vision/hand_pinch.py [--camera 0]
                                       [--server http://localhost:3001]
Keys: q or Esc quits.
"""
import argparse
import math
import os
import sys
import threading
import time
import urllib.request
from pathlib import Path

os.environ.setdefault("QT_QPA_PLATFORM", "xcb")  # cv2's bundled Qt has no wayland plugin

import cv2
import mediapipe as mp
import socketio
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import HandLandmarker, HandLandmarkerOptions, RunningMode

# Same model file the phones fetch (web/src/vision.js); cached locally after
# the first download so the demo survives a dead venue network.
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
    "hand_landmarker/float16/1/hand_landmarker.task"
)
MODEL_CACHE = Path.home() / ".cache" / "composition" / "hand_landmarker.task"

# Landmark indices (MediaPipe hand model, same as web/src/vision.js).
THUMB_TIP, INDEX_TIP, WRIST, MIDDLE_MCP = 4, 8, 0, 9

HAND_CONNECTIONS = (
    (0, 1), (1, 2), (2, 3), (3, 4),          # thumb
    (0, 5), (5, 6), (6, 7), (7, 8),          # index
    (5, 9), (9, 10), (10, 11), (11, 12),     # middle
    (9, 13), (13, 14), (14, 15), (15, 16),   # ring
    (13, 17), (17, 18), (18, 19), (19, 20), (0, 17),  # pinky + palm
)

# Hysteresis for the on-screen banner only (a bare < 0.2 flickers at the
# boundary). The emitted payload always carries the raw score, like the phones.
PINCH_ENTER, PINCH_EXIT = 0.20, 0.28

EMIT_MS = 66      # ~15Hz emits, same cadence as the phones (PlayerView)
SAMPLE_MS = 200   # dominant colour ~5Hz, same as the phones
WINDOW = "Composition — host pinch tracker (q to quit)"
FONT = cv2.FONT_HERSHEY_SIMPLEX


def ensure_model() -> Path:
    """Download the hand landmarker once; reuse the cached copy after that."""
    if MODEL_CACHE.exists() and MODEL_CACHE.stat().st_size > 1_000_000:
        return MODEL_CACHE
    MODEL_CACHE.parent.mkdir(parents=True, exist_ok=True)
    print(f"[model] downloading hand_landmarker.task (~7.5 MB, one time)…")
    tmp = MODEL_CACHE.with_suffix(".tmp")
    urllib.request.urlretrieve(MODEL_URL, tmp)
    tmp.rename(MODEL_CACHE)
    return MODEL_CACHE


def pinch_score(lm) -> float:
    """Scale-invariant pinch, identical to web/src/vision.js detectHand():
    dist(thumb 4, index 8) normalised by wrist(0)→middle MCP(9), so distance
    to the camera doesn't matter. 0 = fingertips touching, 1 = open hand."""
    d = math.hypot(lm[THUMB_TIP].x - lm[INDEX_TIP].x, lm[THUMB_TIP].y - lm[INDEX_TIP].y)
    s = math.hypot(lm[WRIST].x - lm[MIDDLE_MCP].x, lm[WRIST].y - lm[MIDDLE_MCP].y) or 1e-4
    return min(1.0, max(0.0, (d / s - 0.15) / 0.6))


def sample_rgb(frame):
    """16×12 frame average — mirrors web/src/vision.js sampleHue() minus the
    hue mapping. Returned as [r, g, b] ints to match the phone payload."""
    tiny = cv2.resize(frame, (16, 12), interpolation=cv2.INTER_AREA)
    b, g, r = cv2.mean(tiny)[:3]
    return [int(r), int(g), int(b)]


class Relay:
    """Keeps a socket.io connection to the bridge alive in the background.
    The tracker never blocks on it — no server → warn once, keep displaying."""

    def __init__(self, url):
        self.url = url
        self.sio = socketio.Client()
        self.warned = False
        self.thread = threading.Thread(target=self._loop, daemon=True)

    def start(self):
        self.thread.start()

    def _loop(self):
        while True:
            if not self.sio.connected:
                try:
                    self.sio.connect(self.url)
                    print(f"[socket] connected: {self.url}")
                except Exception:
                    if not self.warned:
                        print(f"[socket] bridge not reachable at {self.url} — tracking continues locally")
                        self.warned = True
                    time.sleep(2.0)
                    continue
            time.sleep(1.0)

    def emit(self, payload):
        if not self.sio.connected:
            return
        try:
            self.sio.emit("host:vision", payload)
        except Exception:
            pass  # a dropped bridge must never kill the tracker

    def stop(self):
        try:
            if self.sio.connected:
                self.sio.disconnect()
        except Exception:
            pass


def draw_banner(frame, text, box_bgr, text_bgr):
    x0, y0 = 12, 12
    (tw, th), base = cv2.getTextSize(text, FONT, 0.62, 2)
    pad = 8
    cv2.rectangle(frame, (x0, y0), (x0 + tw + 2 * pad, y0 + th + base + 2 * pad), box_bgr, -1)
    cv2.putText(frame, text, (x0 + pad, y0 + pad + th), FONT, 0.62, text_bgr, 2, cv2.LINE_AA)


def draw_meter(frame, score, pinching):
    h, w = frame.shape[:2]
    bw, bh = 220, 14
    x0, y0 = 12, h - 12 - bh
    cv2.putText(frame, "pinch score   0 = closed   1 = open", (x0, y0 - 6),
                FONT, 0.42, (220, 220, 220), 1, cv2.LINE_AA)
    cv2.rectangle(frame, (x0, y0), (x0 + bw, y0 + bh), (90, 90, 90), 1)
    fill = max(2, int(bw * score))
    col = (60, 220, 60) if pinching else (200, 200, 200)
    cv2.rectangle(frame, (x0, y0), (x0 + fill, y0 + bh), col, -1)


def draw_overlay(frame, lm, score, pinching, present):
    if present:
        h, w = frame.shape[:2]
        pts = [(int(l.x * w), int(l.y * h)) for l in lm]
        for a, b in HAND_CONNECTIONS:
            cv2.line(frame, pts[a], pts[b], (110, 110, 110), 1, cv2.LINE_AA)
        thumb, index = pts[THUMB_TIP], pts[INDEX_TIP]
        line_col = (60, 220, 60) if pinching else (150, 150, 150)
        cv2.line(frame, thumb, index, line_col, 2, cv2.LINE_AA)
        for p in (thumb, index):
            cv2.circle(frame, p, 6, (0, 230, 230), -1, cv2.LINE_AA)   # fingertip dots
            cv2.circle(frame, p, 7, (30, 30, 30), 1, cv2.LINE_AA)
        mid = ((thumb[0] + index[0]) // 2, (thumb[1] + index[1]) // 2 - 14)
        cv2.putText(frame, f"pinch {score:.2f}", mid, FONT, 0.5, (255, 255, 255), 1, cv2.LINE_AA)

    if pinching:
        draw_banner(frame, "PINCH CAPTURED", (40, 200, 60), (20, 20, 20))
    elif present:
        draw_banner(frame, "tracking hand…", (70, 70, 70), (230, 230, 230))
    else:
        draw_banner(frame, "show a hand to the camera", (60, 60, 60), (210, 210, 210))

    draw_meter(frame, score, pinching)


def main():
    ap = argparse.ArgumentParser(description="Host-laptop pinch tracker (Composition)")
    ap.add_argument("--camera", type=int, default=0, help="camera index (default 0)")
    ap.add_argument("--server", default=os.environ.get("COMPOSITION_SERVER", "http://localhost:3001"),
                    help="bridge URL (default http://localhost:3001)")
    ap.add_argument("--peer-id", default="host-hands", help="peerId sent in payloads")
    args = ap.parse_args()
    sys.stdout.reconfigure(line_buffering=True)  # survive piping / SIGTERM flushes

    model = ensure_model()
    landmarker = HandLandmarker.create_from_options(HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(model)),
        running_mode=RunningMode.VIDEO,
        num_hands=1,
        min_hand_detection_confidence=0.4,   # match web/src/vision.js
        min_hand_presence_confidence=0.4,
        min_tracking_confidence=0.4,
    ))

    cap = cv2.VideoCapture(args.camera)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    if not cap.isOpened():
        print(f"[camera] could not open camera {args.camera} — try --camera 1")
        return 1

    relay = Relay(args.server)
    relay.start()
    print(f"[tracker] camera {args.camera}, bridge {args.server} — q or Esc quits")

    pinching = False
    score = 0.0
    present = False
    rgb = [128, 128, 128]
    last_ts = 0        # detect_for_video needs strictly increasing ms stamps
    last_emit = 0.0
    last_sample = 0.0
    detect_warned = False
    exit_code = 0

    while True:
        ok, frame = cap.read()
        if not ok:
            print("[camera] frame read failed — camera went away")
            break
        frame = cv2.flip(frame, 1)  # selfie mirror, like the phones' facingMode: 'user'

        last_ts = max(last_ts + 1, int(time.monotonic() * 1000))
        try:
            # mediapipe 1.x needs its Image container — a raw ndarray dies on a
            # `_image_ptr` AttributeError, every frame, silently.
            mp_img = mp.Image(image_format=mp.ImageFormat.SRGB,
                              data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            result = landmarker.detect_for_video(mp_img, last_ts)
        except Exception as e:
            result = None
            if not detect_warned:
                detect_warned = True
                print(f"[vision] detection error — further ones suppressed: {e!r}")
        hands = result.hand_landmarks if result else []
        present = bool(hands)
        score = pinch_score(hands[0]) if present else 0.0

        # Banner hysteresis — display only; the payload carries the raw score.
        if present:
            pinching = score < PINCH_ENTER or (pinching and score < PINCH_EXIT)
        else:
            pinching = False

        now = time.monotonic() * 1000
        if now - last_sample >= SAMPLE_MS:
            last_sample = now
            rgb = sample_rgb(frame)

        draw_overlay(frame, hands[0] if present else None, score, pinching, present)
        cv2.imshow(WINDOW, frame)

        if now - last_emit >= EMIT_MS:
            last_emit = now
            relay.emit({
                "peerId": args.peer_id,                  # same flat shape as the phones
                "pinchVolume": round(score * 100) / 100,
                "dominantRgb": rgb,
                "hand": present,
            })

        key = cv2.waitKey(1) & 0xFF
        if key in (ord("q"), 27):
            break
        if cv2.getWindowProperty(WINDOW, cv2.WND_PROP_VISIBLE) < 1:
            break  # window closed with the X button

    cap.release()
    cv2.destroyAllWindows()
    relay.stop()
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
