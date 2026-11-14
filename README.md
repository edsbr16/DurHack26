# Composition — the room is the instrument

People scan a QR code and join with their phones. Each phone's camera picks the
colour of that phone's synth voice; a hand pinch plays it; the Arduino's
distance/mic/colour sensors set the mode of the whole piece. The sound comes
**from the crowd's phones**, the host laptop adds a quiet drone floor, and the
host screen shows the tile wall + visuals.

- `server/` — Node bridge: Arduino serial → smoothed `arduino:data` @20Hz over
  socket.io, relays `client:vision`, serves the built client. **Mock-first**: no
  Arduino / unplugged Arduino / silent serial → generated values, seamless.
- `web/` — one Vite app, two roles: `/?host` = host console, everyone else =
  phone player. Vision (MediaPipe hand landmarker + canvas colour sampling)
  runs **on the phone**; only tiny flat JSON payloads go over the network.

## Run it

```bash
# 1. bridge (serves the built client on :3001)
cd server && npm install
# 2. client (dev mode is laptop-only; phones use the built assets)
cd web && npm install && npm run build
# 3. start
cd ../server && npm start          # http://localhost:3001
# host laptop opens:  http://localhost:3001/?host
# 4. expose for phones (HTTPS required for camera):
cloudflared tunnel --url http://localhost:3001
# paste the printed https://…trycloudflare.com URL into the QR box on the host
```

Dev on the laptop only: `cd web && npm run dev` (socket proxied to :3001).

## Networking facts that matter at the demo

- Phones do **not** need venue WiFi. They need *any* internet to reach the
  tunnel URL — 4G/5G sidesteps eduroam/captive-portal entirely.
- The phone QR payload must be the **https tunnel URL**, never localhost.
- Tunnel URLs change on restart → the host view has a paste-box, QR re-renders.
- WebRTC is a **star**: each phone calls the host only. PeerJS signaling uses
  the public cloud; if the venue blocks it we self-host PeerJS later (cut list).

## Serial contract (for the Arduino owner)

115200 baud, one line per `delay(50)`, JSON preferred, CSV accepted:

```json
{"distance": 42.5, "sound": 0.65, "rgb": [120, 200, 95]}
```

or `42.5,0.65,120,200,95` (distance cm, sound 0–1, rgb 0–255).

If the server sees no well-formed line for 1s it falls back to mock values —
the demo literally cannot die of an unplugged Arduino. `SERIAL_BAUD=… npm start`
overrides the baud.

## Host console cheat-sheet

| Action | How |
|---|---|
| Toggle mock drawer (sliders for distance/sound/colour) | `M` |
| Resume auto/mock values | "Resume auto" button |
| Snapshot ambient colour (venue light) | "Calibrate ambient" |
| Room is simulated | orange "SIMULATED" badge |

## Smoke test — run this on-site before building anything else

1. `cloudflared tunnel --url http://localhost:3001` — open the URL on a phone
   with WiFi OFF (pure cellular): page loads, gate button works.
2. Same phone on eduroam/captive portal: note the pain, keep participants on cellular.
3. 2 phones + host: tiles appear, pinch visibly moves bars/nodes.
4. **iPhone**: silent switch (does audio die?), screen lock (does audio die?),
   camera prompt under the tunnel's HTTPS.
5. Quick Android pass of the same.
6. Watch data usage — vision payloads are tiny; video is ~160×120 @8fps.

## Cut list, in order (if time runs short)

1. Video tiles (vision payloads still flow; sound unaffected)
2. Calibrate ambient button
3. Visual extras (keep the background wash + participant nodes)
4. Drone bed — **never cut**: mock fallback, audio gate, QR, throttling
