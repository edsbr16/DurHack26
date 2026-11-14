// Phone-side vision: MediaPipe HandLandmarker + a tiny canvas sampler for the
// dominant color. Everything runs locally on the phone; we emit numbers only.
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { hueFromRgb } from './audio.js';

const WASM_VERSION = '0.10.14'; // keep in sync with web/package.json
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${WASM_VERSION}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

// shortcut: VIDEO mode + a throttled loop instead of LIVE_STREAM — the JS
// package's supported sample path; frames drop gracefully under mobile CPU load
// (detects are capped ~15Hz, wrapped, timestamps monotonic). Same intent as AGENTS.md.
export async function createHandLandmarker() {
  const files = await FilesetResolver.forVisionTasks(WASM_BASE);
  const build = (delegate) =>
    HandLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.4,
      minHandPresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    });
  try {
    return await build('GPU'); // GPU delegate can fail on some Androids → fall back
  } catch {
    return await build('CPU');
  }
}

let lastTs = 0;

// Scale-invariant pinch, per AGENTS.md: Landmark 4 (thumb tip), 8 (index tip),
// normalized by wrist(0)→middle MCP(9) distance so distance-to-camera doesn't matter.
export function detectHand(landmarker, video) {
  try {
    lastTs = Math.max(lastTs + 1, performance.now());
    const res = landmarker.detectForVideo(video, lastTs);
    const hand = res && res.landmarks && res.landmarks[0];
    if (!hand || hand.length < 10) return { pinch: 0, present: false };
    const pinchDist = Math.hypot(hand[4].x - hand[8].x, hand[4].y - hand[8].y);
    const handScale = Math.hypot(hand[0].x - hand[9].x, hand[0].y - hand[9].y) || 1e-4;
    const pinch = (pinchDist / handScale - 0.15) / 0.6;
    return { pinch: Math.min(1, Math.max(0, pinch)), present: true };
  } catch {
    return { pinch: 0, present: false };
  }
}

// Light hue → rgb, used by LITE mode (no camera) so a blocked camera still gets a voice.
export function hslToRgb(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))));
  };
  return [f(0), f(8), f(4)];
}

// Dominant color: average the camera down to a 16×12 grid, ~5Hz is plenty.
export function sampleHue(video, canvas) {
  canvas.width = 16;
  canvas.height = 12;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, 16, 12);
  const d = ctx.getImageData(0, 0, 16, 12).data;
  let r = 0, g = 0, b = 0;
  const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) {
    r += d[i];
    g += d[i + 1];
    b += d[i + 2];
  }
  r /= n;
  g /= n;
  b /= n;
  return { rgb: [Math.round(r), Math.round(g), Math.round(b)], hue: hueFromRgb([r, g, b]) };
}
