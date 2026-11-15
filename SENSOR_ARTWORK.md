# Environmental artwork

The implementation is in `/Users/ericadasilva/Library/CloudStorage/OneDrive-DurhamUniversity/Durham University/Year 3/Durhack/DurHack26`.
Use this checkout as the active VS Code folder.

## Preview

```bash
cd /Users/ericadasilva/Library/CloudStorage/OneDrive-DurhamUniversity/Durham University/Year 3/Durhack/DurHack26/frontend
npm run preview
```

Open http://localhost:4002/DurHack26/ and enable **Try simulated inputs**.
Colour changes the palette; sound creates ripples; distance controls scale; lux
controls brightness; pinch twists the pattern. The controls affect only this
browser and never submit simulated values as live data. Pause freezes this
screen; Capture artwork downloads its current PNG.

The image uses an original procedural WebGL shader inspired by the flowing
patterns discussed in Hydra. It does not use Hydra itself, a camera image, or
an external graphics dependency. Existing gesture publishing remains at
`/DurHack26/stream`; the previous camera grid remains at `/DurHack26/cameras`.

## Connect Arduino data

Run the updated backend from this checkout with `bash start.sh backend`.
Use **Connection** in the artwork to set its reachable backend URL. HTTPS pages
need an HTTPS backend. Fixing the board's HTTP transport/server TLS is separate
from this implementation.

The new `POST /api/data` accepts the sketch's existing JSON:

```json
{"sound":30,"distanceCm":25,"lux":120,"ir":7,"colour":{"r":1,"g":2,"b":0}}
```

For multiple boards add a unique `device_id` per board. Include `room` to direct
that board's input into a group composition:

```json
{"device_id":"uno-q-2","room":"ABCDEF","sound":70,"distanceCm":30,"lux":200,"ir":0,"colour":{"r":255,"g":90,"b":40}}
```

Without these fields the board is named `uno-q` and belongs to `PUBLIC`.
A board's ID must be unique within a room, or its readings replace another board's.
Group room codes are routing identifiers, not authentication/access control.

To test without the board (send repeatedly or inspect within 15 seconds):

```bash
curl -X POST http://localhost:8000/api/data \
  -H 'Content-Type: application/json' \
  -d '{"device_id":"test","sound":70,"distanceCm":25,"lux":200,"colour":{"r":1,"g":2,"b":0}}'
```

The page reads `GET /api/artwork?room=PUBLIC` every 500 ms. Public combines all
current devices and tracked gestures; group rooms include matching inputs only.
Sensor devices expire after 15 seconds without an update. Valid distance is
2–400 cm; out-of-range echoes and nulls do not enter the average. Each valid
field is averaged equally across contributing devices. RGB is normalized per
device to preserve its hue at low intensities, while lux controls brightness.
Black/missing RGB uses a neutral fallback palette.

Sound uses a provisional raw analog quiet floor of 10 and loud ceiling of 100.
These are not decibels. Adjust the defaults in `sensor_state.py` and the API query
defaults in `main.py` after observing the actual sensor range. The GET endpoint
also accepts `sound_floor` and `sound_ceiling` for calibration tools.

The backend supplies a common clock and parameters, and browsers smooth changes.
This is shared parameter synchronization, not pixel-identical video delivery.
Different polling/render times may briefly differ. Run one backend worker: sensor
state is in memory and resets when it restarts. Gesture-to-visual mapping uses
existing tracking; existing audio generation remains unchanged.

## Validation

- Production static build: passed (`next build --webpack`).
- TypeScript: passed.
- Focused ESLint on the new artwork code: passed.
- Five aggregation tests: passed (`python3 -m unittest discover -s backend -p 'test_sensor_state.py' -v`).
- Python syntax compilation: passed.
- Browser rendering, physical board transport and full FastAPI integration:
  not verified in this session. The session blocked local server listening and
  the backend's Python dependencies were not installed.
