# Camera beside the artwork: finger instrument

Open **Your block** from the public mosaic. The `/dashboard` studio shows the
artwork and a camera panel together. **Start camera** requests video only and
publishes it through the existing WebRTC backend. The current backend already
sends 21 hand landmarks, so no new detector, Arduino firmware, or backend route
is needed for this local studio feature.

Touch each fingertip to your thumb:

| Pair | Default pitch | Artwork effect |
| --- | --- | --- |
| Thumb + index | C4 | Ripples |
| Thumb + middle | E4 | Grain |
| Thumb + ring | G4 | Ribbons |
| Thumb + little | B4 | Sparkles |

Each note can be changed from C4 to C5 in its dropdown. Higher active notes
increase texture density. Multiple active pairs layer their effects and play
chords. Thumb is the common contact point rather than a separate fifth note.

Notes are silent until **Enable notes** is pressed. The synthesizer uses four
sine voices with gain smoothing. Camera publishing includes its generated audio
track; no microphone is requested. Existing microphone harmonization remains
available on the original `/stream` page. A room's camera viewer can receive the
published instrument audio through the existing media relay.

The overlay marks every fingertip in its own colour. Tracking messages arrive
on the existing WebSocket; their own stream ID is checked. High-frequency
pressure values go to refs, the graphics loop and audio gains. React samples the
finger badges at 4 Hz. Missing hand updates for 700 ms release notes and effects.
Stopping, navigating away or failed startup closes camera tracks and disposes
audio resources. Finger detection preserves the existing scale-normalized
0.15/0.6 score and 0.20-enter / 0.28-exit hysteresis for all four pairs.

**Test finger controls without camera** enables four labelled Play/Release pads.
These apply local simulated gestures without sharing fake sensor events. They
work with the real Arduino palette too. They are useful for rehearsing the demo
and testing mappings before allowing camera access.

Limits: this adds full-finger effects to the individual studio. The public
mosaic's real tile currently follows the existing combined environmental API;
individual four-finger texture parameters are not yet distributed to all public
mosaic participants. The existing shared index-pinch signal remains available.
Browser/WebRTC hand tracking and audible output still need a physical camera
trial; this session tested rendering and simulated gestures without requesting
camera access.

Validation: production build, TypeScript, focused ESLint, synthetic landmark
tests (independent pairs, scale invariance, hysteresis and lost-hand release),
audio graph checks (notes, gates, mute and cleanup), and browser checks for
layered test effects and changing pitches passed.
