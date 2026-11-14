# DurHack 2026 — WebRTC Camera Stream Platform

Phones stream their cameras to a central FastAPI backend over WebRTC; the
dashboard monitors every feed live. Every frame passes through the backend's
frame processor, which runs MediaPipe hand tracking — thumb + index finger
pinches are detected server-side and shown live as an overlay on the streamer's
own viewfinder and on every dashboard tile.

- `backend/` — FastAPI + aiortc: WebRTC ingest (`/api/publish`), viewer relay
  (`/api/view/{id}`), JPEG snapshots, live stats WebSocket (`/api/ws`), and
  MediaPipe pinch tracking per stream (`hand_tracker.py`, ~12Hz).
- `frontend/` — Next.js: `/stream` (phone/laptop streamer with pinch overlay),
  `/dashboard` (host grid of tiles with pinch overlays + QR to invite phones).

## Run it

```bash
./start.sh              # backend on :8000 + frontend on :3000
./start.sh backend      # or either side alone
./start.sh frontend
```

Open http://localhost:3000/dashboard, start a camera from `/stream` (laptop) or
scan the dashboard QR with a phone, then pinch thumb + index in frame — you'll
see fingertip dots, the pinch line, a live pinch score and a PINCH CAPTURED
badge on both the viewfinder and the dashboard tile.

Notes:

- First backend start downloads the MediaPipe hand model (~7.5 MB, cached in
  `~/.cache/durhack`). `pip install -r backend/requirements.txt` runs on every
  start, so new dependencies are picked up automatically.
- Phones need HTTPS for camera access off-localhost — front it with a tunnel
  (cloudflared/ngrok) for real devices.
- Pinch tracking degrades gracefully: no mediapipe installed, or no hand in
  frame, just shows "no hand" — the stream never dies for it.

## How pinch works

- Frames arriving via WebRTC are fed to a shared MediaPipe HandLandmarker in
  the backend (`backend/hand_tracker.py`), throttled to ~12Hz per stream.
- The pinch score is scale-invariant: thumb-tip(4) to index-tip(8) distance
  normalised by wrist(0) to middle-MCP(9), so distance to the camera doesn't
  matter. 0 = fingertips together, 1 = open hand. The PINCH CAPTURED badge
  uses hysteresis (enter below 0.20, exit above 0.28); payloads carry the raw
  score.
- Results broadcast as `pinch_update` events on `/api/ws`. Nothing acts on
  pinches yet — they are display-only by design; wiring an action later is a
  matter of subscribing to the event.
