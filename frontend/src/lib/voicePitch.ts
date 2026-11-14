"use client";

import * as Tone from "tone";

export interface PitchVoice {
  /** The processed stream — publish its audio track instead of the raw mic. */
  outputStream: MediaStream;
  /** Attach the raw mic stream and start the routing. Call once. */
  attach: (raw: MediaStream) => void;
  /** pinch: 0 = fingers together … 1 = open hand. handPresent gates release. */
  setPinch: (pinch: number, handPresent: boolean) => void;
  dispose: () => void;
}

/** Harmony layer level under the dry voice — the one knob to tweak live. */
const WET_LEVEL = 0.35;
const RAMP_PER_TICK = 0.35; // 30ms ticks → ≈80ms glide between steps
const SMOOTH_MS = 30;
const STEP_HOLD = 2;       // identical consecutive readings before committing a new step
const ABSENT_HOLD = 5;      // consecutive hand:false (~0.4s) before back to unison
const MAX_STEPS_DOWN = 12;  // chromatic range: unison → one octave below

/**
 * Live vocal harmonizer: the dry voice always passes through at full level,
 * and a pitch-shifted harmony layer rides underneath at WET_LEVEL. Open hand
 * = unison; closing the fingers walks down chromatic semitone steps to −12.
 * Steps commit only after STEP_HOLD identical readings (no boundary trill),
 * then glide; losing the hand for ~0.4s returns to unison.
 *
 * createPitchVoice() must be called synchronously inside a click handler —
 * iOS Safari only permits AudioContext creation as part of a user gesture.
 */
export function createPitchVoice(): PitchVoice {
  const ctx = new AudioContext();
  void ctx.resume().catch(() => {});
  Tone.setContext(ctx);

  const shifter = new Tone.PitchShift({ pitch: 0, windowSize: 0.1 });
  const wetGain = new Tone.Gain(WET_LEVEL);
  const dryGain = new Tone.Gain(1);
  const dest = ctx.createMediaStreamDestination();

  let current = 0; // semitones currently sounding
  let target = 0; // semitones we're gliding toward
  let committedStep = 0; // step the target reflects
  let pendingStep = 0; // candidate step awaiting confirmation
  let pendingCount = 0;
  let absentStreak = 0;
  let disposed = false;

  // Tone 15's PitchShift.pitch is a plain number setter — glide it ourselves
  // so step changes slide instead of jumping.
  const smoother = window.setInterval(() => {
    current += (target - current) * RAMP_PER_TICK;
    shifter.pitch = current;
  }, SMOOTH_MS);

  return {
    outputStream: dest.stream,
    attach(raw: MediaStream) {
      const source = ctx.createMediaStreamSource(raw);
      // Dry voice straight through, harmony layer underneath.
      Tone.connect(source, dryGain);
      Tone.connect(dryGain, dest);
      Tone.connect(source, shifter);
      shifter.connect(wetGain);
      Tone.connect(wetGain, dest);
    },
    setPinch(pinch: number, handPresent: boolean) {
      if (disposed) return;
      if (handPresent) {
        absentStreak = 0;
        const clamped = Math.min(1, Math.max(0, pinch));
        const step = -Math.round((1 - clamped) * MAX_STEPS_DOWN);
        if (step === committedStep) {
          pendingStep = step;
          pendingCount = 0;
        } else if (step === pendingStep) {
          if (++pendingCount >= STEP_HOLD) {
            committedStep = step;
            target = step;
            pendingCount = 0;
          }
        } else {
          pendingStep = step;
          pendingCount = 1;
        }
      } else if (++absentStreak >= ABSENT_HOLD) {
        committedStep = 0;
        pendingStep = 0;
        pendingCount = 0;
        target = 0; // hand truly gone → back to unison with the dry voice
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      window.clearInterval(smoother);
      try {
        shifter.dispose();
        wetGain.dispose();
        dryGain.dispose();
      } catch {
        // already gone
      }
      void ctx.close().catch(() => {});
    },
  };
}
