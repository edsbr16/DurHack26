# Public mosaic homepage

The main `/DurHack26/` route is now a full-viewport generative mosaic. The
individual visual studio remains at `/DurHack26/dashboard`, linked as **Your block**.
The existing camera/gesture publisher remains at `/DurHack26/stream`.

The demo contains 96 × 64 tiles (6,144 total). With one active UNO Q, its
normalized RGB and lux control one central tile, distance affects its size,
and sound/gesture values affect its movement. **Find live tile** highlights
and magnifies that contribution. All other tiles are explicitly simulated.

**Demo population** is on by default for the hackathon presentation. Each
simulated tile changes deterministically over time. The composition morphs
between currents, blooms, dunes, cellular gardens, woven interference and
cloudbanks. A new family emerges every 12 seconds with six-second spatial
dissolves, changing palettes and fresh cycle parameters. Simulated tiles also
breathe and turn gently. This creates evolving forms instead of one swirl; no photo or video
is used as an image source. Simulation stays in the browser and never posts
fake readings to the live API. Turning it off shows empty slots and the live
sensor contribution only.

The current deployed API supplies one combined visual state. With the one
available board this is exactly one real participant. If more real boards
are connected before a per-device API is added, the UI explicitly labels
those devices as a single combined live tile; it does not claim to display
separate real participants. Supporting one distinct tile per real board is
the next backend extension. The demo already represents that visual concept.

Room codes select the existing room-filtered API. Public blends current
sensor sources; rooms receive matching sensor inputs. Demo population is a
local preview and isn't a stored room participant list.

Canvas animation runs separately from React. The server clock aligns the
procedural timeline when connected; short polling and smoothing differences
mean this isn't pixel-identical video synchronization. Pause freezes this
screen while readings continue. Capture downloads a PNG of the canvas.

Run `npm run preview` in the OneDrive frontend folder after applying updates.
This rebuilds the static export, so restart it after source changes.

Validation: production build, TypeScript, focused ESLint, deterministic colour
bounds across all 6,144 tiles, and browser checks for live values, simulation
toggle, highlight, pause/resume and room controls passed. The screenshot in
`mosaic-home.png` shows the browser-verified view with the live Arduino.
