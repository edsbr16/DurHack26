```markdown
# AGENTS.md — Hackathon Project: "Composition"

## 1. Project Overview & Architecture
This project is a real-time, multiplayer audiovisual web application built for a hackathon themed **"Composition"**. 
- **Hardware Input:** An Arduino reads **distance** (e.g., HC-SR04), **sound level**, and optionally **color** (e.g., TCS34725), streaming values over USB Serial to a host laptop.
- **Host Bridge:** A local **Node.js** server reads the USB serial stream via `serialport` and broadcasts sensor states via **Socket.io**.
- **Web Application & Multiplayer:** A **React (Vite)** frontend hosted locally and exposed via an `https://` tunnel (**Cloudflare Tunnel** / **ngrok**). Users join a Zoom-style video room on their phones by scanning a QR code (`qrcode.react`) powered by **WebRTC** (`PeerJS` or `LiveKit`).
- **Client-Side Vision & Synthesis:** Phones process their own camera feeds locally in the browser using **MediaPipe Hand Landmarker** (`@mediapipe/tasks-vision`) and **HTML5 Canvas** (RGB sampling & pixel-art downsampling), emitting lightweight state updates over Socket.io. **Tone.js** and **p5.js** handle real-time audio synthesis and visual rendering.

---

## 2. Tech Stack & Strict Boundaries
- **Hardware:** Arduino C++ (keep minimal; read sensors, format JSON/CSV, `Serial.println()`).
- **Backend / Bridge:** Node.js, `serialport`, `socket.io`, `express`.
- **Frontend:** React (Vite), Tailwind CSS (optional), `qrcode.react`.
- **Video / Networking:** `peerjs` (or `livekit-client`) for WebRTC video tiles; Cloudflare Tunnel (`cloudflared`) for HTTPS exposure.
- **Computer Vision:** `@mediapipe/tasks-vision` (Hand Landmarker) + native HTML5 `<canvas>` `getImageData()`.
- **Audio & Graphics:** `tone` (Tone.js) for Web Audio synthesis; `p5` (p5.js) or HTML5 Canvas for pixel art and audio-reactive visuals.

**Architectural Rule:** Never stream raw video frames or raw audio buffers over Socket.io or into the Arduino. Process camera feeds on the client device and transmit only normalized numeric payloads (coordinates, RGB tuples, volume scalars).

---

## 3. Critical Engineering Constraints & Requirements

### A. Browser Security & Networking
1. **HTTPS Requirement:** Mobile browsers block `getUserMedia()` on non-HTTPS origins. All QR codes and client URLs must point to the `https://` tunnel URL, never `localhost` or local LAN IPs.
2. **Audio Unlock Gate:** Web Audio (`Tone.start()`) is blocked until user interaction. Implement a mandatory **"Join Room & Enable Audio"** button on the landing view before initializing Tone.js or WebRTC streams.

### B. Data Throttling & Signal Smoothing
1. **Serial & Socket Throttling:** 
   - Arduino loop must include a delay (`delay(50)` / ~20Hz) to prevent serial buffer overflow.
   - Client MediaPipe/Canvas emitters must throttle Socket.io emissions to **10–20Hz (every 50–100ms)**.
2. **Sensor Smoothing:** Ultrasonic and analog mic sensors are noisy. Apply an exponential moving average filter before mapping values:
   ```js
   smoothedValue = 0.8 * smoothedValue + 0.2 * rawValue;

```

3. **Scale-Invariant Pinch Normalization:** Do not use raw pixel distance between thumb tip (`Landmark 4`) and index tip (`Landmark 8`). Normalize by dividing pinch distance by hand scale (distance between wrist `Landmark 0` and middle finger MCP `Landmark 9`) so volume control works consistently regardless of distance from the camera:
```js
const pinchDist = Math.hypot(thumb.x - index.x, thumb.y - index.y);
const handScale = Math.hypot(wrist.x - middleMcp.x, wrist.y - middleMcp.y);
const normalizedVolume = Math.min(Math.max((pinchDist / handScale - 0.15) / 0.6, 0), 1);

```


4. **MediaPipe Mode:** Initialize Hand Landmarker with `runningMode: "LIVE_STREAM"` so frames drop gracefully under mobile CPU load without blocking the UI thread.

### C. Hardware Fallbacks & Calibration

1. **Simulation / Demo Fallback Mode:** Build a keyboard shortcut (`KeyM`) on the host view that toggles a **Mock Sensor Drawer** with HTML range sliders for Distance, Sound, and Color. If the Arduino disconnects during a live demo, the app must seamlessly fall back to mock values.
2. **Ambient Color Calibration:** Provide a **"Calibrate Ambient"** button that snapshots current baseline RGB/brightness values to offset harsh venue lighting.

---

## 4. Expected Socket.io Event Schema

Keep payloads flat, small, and predictable across `server.js` and React clients:

* `arduino:data` (Server → Clients, ~20Hz)
```json
{ "distance": 42.5, "sound": 0.65, "rgb": [120, 200, 95] }

```


* `client:vision` (Phone Client → Server → All Clients, ~15Hz)
```json
{ "peerId": "abc123", "pinchVolume": 0.78, "dominantRgb": [255, 80, 40], "pixelGrid": [...] }

```



---

## 5. Coding Conventions for AI Assistants (GLM 5.3)

* **Prioritize Speed & Reliability:** Favor working, self-contained modules over complex abstractions. Avoid heavy state management libraries (use React `useState`/`useRef` for high-frequency sensor/vision loops to prevent unnecessary React re-renders).
* **Use `useRef` for 60fps Loops:** Store incoming Socket.io sensor data and MediaPipe landmarks in `useRef` objects, and read from those refs inside `p5.js` `draw()` or `requestAnimationFrame` loops. Never trigger React state updates at 30–60fps.
* **Graceful Degradation:** Wrap `SerialPort` initialization in `try/catch` and auto-reconnect logic so the Node server does not crash if the Arduino is unplugged or running in mock mode.

```

<FollowUp label="Want me to generate the folder structure and starter files matching this AGENTS.md?" query="Generate the project folder structure and starter code for server.js, the Arduino sketch, and the React client matching the AGENTS.md specification."/>

```