# AGENTS.md — DurHack26 WebRTC Camera Platform

## Project
Phones/laptops stream camera + mic to a central Python backend over WebRTC
(aiortc); a Next.js frontend serves `/stream` (publisher view) and
`/dashboard` (host grid). `./start.sh` runs both (backend :8000, frontend
:3000). All work happens in `backend/` and `frontend/`.

## Stack
- `backend/` — FastAPI + aiortc: `/api/publish` (ingest), `/api/view/{id}`
  (viewer relay), `/api/ws` (events), `/api/stream/{id}/snapshot.jpg`,
  `/api/streams`, `/api/health`. Per-frame work lives in `ai_processor.py`.
- `frontend/` — Next.js App Router + Tailwind. `src/lib/webrtc.ts`
  (WebRTCPublisher/WebRTCViewer), `src/lib/config.ts` (backend URL,
  localStorage override), `src/components/PinchOverlay.tsx` (canvas overlay).
- Pinch tracking — `backend/hand_tracker.py`: one shared MediaPipe
  HandLandmarker over all streams, ~12Hz each, broadcast as `pinch_update`
  events. The streamer consumes its own echo to harmonize its published
  voice (dry on top, chromatic-stepped layer beneath, 0 → −12 semitones,
  glide + step/absence hysteresis in `frontend/src/lib/voicePitch.ts`).

## Conventions & constraints
- Pinch math (scale-invariant): dist(thumb 4, index 8) / dist(wrist 0,
  middle MCP 9); score = clamp((ratio − 0.15) / 0.6, 0, 1). Badge
  hysteresis: enter < 0.20, exit > 0.28. If these constants move, keep the
  backend and the frontend overlay in sync.
- MediaPipe's Python Tasks API needs `mp.Image` containers — raw ndarrays
  raise `_image_ptr` AttributeError. Detection errors log warn-once and
  never crash the frame loop; missing mediapipe disables tracking only.
- Throttles: pinch detect + `pinch_update` push every 80ms; `audio_level`
  200ms; `stats_update` 1s. Keep WebSocket payloads flat and small.
- Frontend: high-frequency data (pinch updates ~12Hz) flows through
  refs/canvas draws — keep new React state updates coarse-grained.
- Never commit secrets. `terraform/API.http` is untracked on purpose
  (`*.http` is gitignored) — keys live in untracked files and get rotated.
- This Next.js may differ from your training data — check
  `frontend/node_modules/next/dist/docs/` before using unfamiliar APIs.
