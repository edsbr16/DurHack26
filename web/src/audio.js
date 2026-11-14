// Distributed synthesis. Each phone owns ONE voice (its timbre comes from what
// its camera sees); the Arduino's ambient color picks which chord set the whole
// room plays; distance/sound shape the shared filter + reverb. Host adds a drone.
import * as Tone from 'tone';
import { Sensors, clamp01 } from './store.js';

// 4 chord sets — ambient hue (0-360) picks one for everyone.
const CHORDS = [
  ['C4', 'E4', 'G4', 'B4', 'D5'],
  ['C4', 'D4', 'F4', 'A4', 'B4'],
  ['D4', 'F4', 'A4', 'C5', 'E5'],
  ['E4', 'G4', 'A4', 'C5', 'D5'],
];

let master = null;

export async function startAudio() {
  if (master) return;
  await Tone.start(); // mandatory gesture gate (AGENTS.md)
  const filter = new Tone.Filter(1200, 'lowpass');
  const reverb = new Tone.Reverb({ decay: 6, wet: 0.35 });
  const limiter = new Tone.Limiter(-1);
  filter.chain(reverb, limiter, Tone.Destination);
  master = { filter, reverb, limiter };
  Tone.getTransport().start();
}

// Called (up to 20Hz) with fresh arduino values — cheap param ramps.
export function applyAmbient({ distance, sound }) {
  if (!master) return;
  const cutoff = 250 + clamp01((distance - 5) / 150) * 4500; // close hand = dark, far = bright
  const wet = 0.15 + clamp01(sound) * 0.65; // loud room = wash
  master.filter.frequency.rampTo(cutoff, 0.2);
  master.reverb.wet.rampTo(wet, 0.5);
}

export function chordIndexForHue(h) {
  return Math.min(3, Math.max(0, Math.floor(h / 90)));
}

// One phone's voice. preset 0 marimba / 1 warm pad / 2 glass bell / 3 air organ.
const PRESET_GAIN = [0.5, 0.4, 0.35, 0.45];

function buildSynth(preset) {
  if (preset === 0) {
    return new Tone.FMSynth({
      harmonicity: 4,
      modulationIndex: 10,
      oscillator: { type: 'sine' },
      modulation: { type: 'triangle' },
      envelope: { attack: 0.002, decay: 0.35, sustain: 0, release: 0.3 },
    });
  }
  if (preset === 1) {
    return new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 2, decay: 0.3, sustain: 0.7, release: 3 },
    });
  }
  if (preset === 2) {
    return new Tone.FMSynth({
      harmonicity: 2.5,
      modulationIndex: 6,
      oscillator: { type: 'sine' },
      modulation: { type: 'sine' },
      envelope: { attack: 0.01, decay: 2.2, sustain: 0, release: 1.2 },
    });
  }
  return new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.4, decay: 0.3, sustain: 0.8, release: 1.5 },
  });
}

export class Voice {
  constructor(presetIndex, chordIndex) {
    this.preset = presetIndex;
    this.chord = chordIndex || 0;
    this.density = 0.5;
    this.ticks = 0;
    this.synth = buildSynth(presetIndex);
    this.gain = new Tone.Gain(0);
    this.synth.connect(this.gain);
    this.gain.connect(master.filter);
    this.loop = new Tone.Loop(() => this.tick(), 0.8);
    this.loop.start(0);
  }

  tick() {
    const chord = CHORDS[this.chord];
    const sustained = this.preset === 1 || this.preset === 3;
    if (sustained) {
      // Re-pick a chord dyad every ~5s; sustained voices ignore density.
      if (this.ticks % 6 === 0) {
        this.synth.releaseAll();
        const a = chord[(Math.random() * chord.length) | 0];
        const b = chord[(Math.random() * chord.length) | 0];
        this.synth.triggerAttack([a, b]);
      }
    } else if (Math.random() < 0.25 + 0.75 * this.density) {
      const note = chord[(Math.random() * chord.length) | 0];
      this.synth.triggerAttackRelease(note, this.preset === 2 ? '2n' : '16n');
    }
    this.ticks++;
  }

  setChord(i) {
    if (i !== this.chord) this.chord = i;
  }

  setDensity(d) {
    this.density = clamp01(d);
    this.loop.interval = 0.25 + (1 - this.density) * 1.4;
  }

  // pinch 0..1 gate × whether a hand is visible at all
  setLevel(pinch, handPresent) {
    const target = handPresent ? clamp01(pinch) * PRESET_GAIN[this.preset] : 0;
    this.gain.gain.rampTo(target, 0.25);
  }

  dispose() {
    this.loop.dispose();
    this.synth.dispose();
    this.gain.dispose();
  }
}

// Host's quiet drone bed through laptop speakers — cohesion + a safety net if
// only a couple of phones are in the room.
let drone = null;
export function startDrone() {
  if (!master || drone) return;
  drone = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sine' },
    envelope: { attack: 4, decay: 1, sustain: 0.9, release: 6 },
  });
  const g = new Tone.Gain(0.5);
  drone.connect(g);
  g.connect(master.filter);
  drone.lastChord = -1;
  const loop = new Tone.Loop(() => {
    const idx = chordIndexForHue(rgbHue(Sensors.rgb));
    if (idx !== drone.lastChord || !drone.lastAt || Tone.now() - drone.lastAt > 10) {
      drone.lastChord = idx;
      drone.lastAt = Tone.now();
      const c = CHORDS[idx];
      drone.releaseAll();
      drone.triggerAttack([c[0], c[2], c[3]]);
    }
  }, 1);
  loop.start(0);
}

function rgbHue([r, g, b]) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
  if (!d) return 0;
  let h;
  if (max === R) h = ((G - B) / d) % 6;
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return ((h * 60) + 360) % 360;
}
export { rgbHue as hueFromRgb };

// One-off chime for the iOS silent-switch sound check after the join tap.
export function chime() {
  if (!master) return;
  const s = new Tone.MembraneSynth({ octaves: 2, pitchDecay: 0.02 }).toDestination();
  s.triggerAttackRelease('C6', '16n');
  setTimeout(() => s.dispose(), 2000);
}
