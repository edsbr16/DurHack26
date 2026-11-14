// Player (phone) view: audio gate → camera → local vision → own synth voice.
// Emits flat client:vision payloads at ~15Hz; sends one low-res stream to the host.
import React, { useEffect, useRef, useState } from 'react';
import Peer from 'peerjs';
import { socket, Sensors, HostPeer, onHostPeer } from './store.js';
import { startAudio, chime, Voice, applyAmbient, chordIndexForHue, hueFromRgb } from './audio.js';
import { createHandLandmarker, detectHand, sampleHue, hslToRgb } from './vision.js';

const VOICE_NAMES = ['Marimba', 'Warm pad', 'Glass bell', 'Air organ'];
const EMIT_MS = 66;    // ~15Hz vision emits (AGENTS.md)
const DETECT_MS = 66;  // hand detection cap — phones drop frames gracefully below this
const SAMPLE_MS = 200; // color sampling ~5Hz

export default function PlayerView() {
  const [stage, setStage] = useState('gate');
  const [lite, setLite] = useState(false);
  const [notice, setNotice] = useState(null);

  const R = useRef({
    peer: null, peerId: null, stream: null, calling: false, offHost: null,
    landmarker: null, hueCanvas: null, voice: null,
    pinch: 0, present: false, hue: -1, rgb: [128, 128, 128],
    lastEmit: 0, lastDetect: 0, lastSample: 0,
  }).current;

  const videoRef = useRef(null);
  const barRef = useRef(null);
  const swatchRef = useRef(null);
  const nameRef = useRef(null);

  function callHostIfReady() {
    if (R.calling || !R.peer || !R.stream || !HostPeer.id) return;
    R.calling = true;
    try {
      const call = R.peer.call(HostPeer.id, R.stream); // star topology: host only
      call.on('error', () => {
        R.calling = false; // allow a retry next time the host announces itself
      });
    } catch {
      R.calling = false;
    }
  }

  function startPeer() {
    try {
      const p = new Peer(undefined, { debug: 0 });
      R.peer = p;
      p.on('open', (id) => {
        R.peerId = id;
        socket.emit('peer:register', { role: 'player', peerId: id });
        callHostIfReady();
      });
      p.on('error', (err) => console.warn('[peer]', err && err.type, err && err.message));
      R.offHost = onHostPeer(() => callHostIfReady());
    } catch (e) {
      console.warn('[peer] unavailable — continuing without a video tile');
    }
  }

  async function join() {
    setNotice(null);
    try {
      await startAudio(); // mandatory gesture gate before any audio (AGENTS.md)
    } catch (e) {
      setNotice('Audio could not start: ' + e.message);
      return;
    }
    chime(); // iOS sound check — the silent switch must be OFF to hear this
    setNotice('Hear a chime? You are live. If not: check the silent switch & volume.');
    try {
      await navigator.wakeLock?.request('screen');
    } catch {
      // old browsers — screen may lock; the notice above tells users to keep it awake
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } },
      });
      R.stream = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch (e) {
      // Camera blocked/broken → LITE mode: no gestures, synthetic color, still sounds.
      R.rgb = hslToRgb((performance.now() / 40) % 360 / 360, 0.55, 0.5);
      R.lite = true;
      setLite(true);
      setNotice('Camera unavailable — LITE mode: you still play in the piece.');
    }

    if (!R.lite) {
      R.hueCanvas = document.createElement('canvas');
      createHandLandmarker()
        .then((lm) => {
          R.landmarker = lm;
        })
        .catch((e) => {
          console.warn('[vision] model unavailable:', e.message);
          R.lite = true;
          setLite(true);
          if (!R.hueDone) {
            R.rgb = hslToRgb((performance.now() / 40) % 360 / 360, 0.55, 0.5);
            R.hueDone = true;
          }
        });
    }

    startPeer();
    setStage('live');
  }

  // Live loop: throttle + emit, all through refs — no React re-renders here.
  useEffect(() => {
    if (stage !== 'live') return;

    const onArduino = (d) => applyAmbient({ distance: d.distance, sound: d.sound });
    socket.on('arduino:data', onArduino);

    const tick = () => {
      const now = performance.now();

      if (R.lite) {
        R.pinch = 0.35 + 0.3 * Math.sin(now / 900);
        R.present = true;
        R.hue = (now / 40) % 360;
        R.rgb = hslToRgb(R.hue / 360, 0.55, 0.5);
      } else {
        const v = videoRef.current;
        if (R.landmarker && v && v.readyState >= 2 && now - R.lastDetect >= DETECT_MS) {
          R.lastDetect = now;
          const { pinch, present } = detectHand(R.landmarker, v);
          R.pinch = pinch;
          R.present = present;
        }
        if (v && R.hueCanvas && v.readyState >= 2 && now - R.lastSample >= SAMPLE_MS) {
          R.lastSample = now;
          const s = sampleHue(v, R.hueCanvas);
          R.hue = s.hue;
          R.rgb = s.rgb;
        }
      }

      // Build the voice once we know our color; modulate it every tick.
      if (!R.voice && R.hue >= 0) {
        R.voice = new Voice(chordIndexForHue(R.hue), chordIndexForHue(hueFromRgb(Sensors.rgb)));
        if (nameRef.current) nameRef.current.textContent = VOICE_NAMES[R.voice.preset];
      }
      if (R.voice) {
        R.voice.setLevel(R.pinch, R.present);
        R.voice.setDensity(Sensors.sound);
        R.voice.setChord(chordIndexForHue(hueFromRgb(Sensors.rgb)));
      }

      if (barRef.current) {
        barRef.current.style.transform = `scaleX(${R.present ? R.pinch : 0})`;
      }
      if (swatchRef.current) {
        swatchRef.current.style.background = `rgb(${R.rgb.map(Math.round).join(',')})`;
      }

      if (now - R.lastEmit >= EMIT_MS) {
        R.lastEmit = now;
        socket.emit('client:vision', {
          peerId: R.peerId || 'anon',
          pinchVolume: Math.round(R.pinch * 100) / 100,
          dominantRgb: R.rgb.map(Math.round),
          hand: R.present,
        });
      }
    };

    const iv = setInterval(tick, EMIT_MS);
    return () => {
      clearInterval(iv);
      socket.off('arduino:data', onArduino);
      R.voice?.dispose();
      R.voice = null;
      R.stream?.getTracks().forEach((t) => t.stop());
      R.peer?.destroy();
      R.offHost?.();
    };
  }, [stage]);

  if (stage === 'gate') {
    return (
      <div className="gate">
        <h1>Composition</h1>
        <p>Join the room — your camera's colour becomes your instrument, your pinch plays it.</p>
        <button className="primary" onClick={join}>Join Room &amp; Enable Audio</button>
        {notice && <p className="notice">{notice}</p>}
        <p className="hint">Sound plays from this phone. Keep the tab open, don't lock the screen.</p>
      </div>
    );
  }

  return (
    <div className="player">
      <div className="statusRow">
        <span>{lite ? 'LITE mode' : 'In the piece'}</span>
        <span className="chip" ref={nameRef}>joining…</span>
      </div>
      <div className="selfview">
        {lite ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)' }}>no camera</div>
        ) : (
          <video ref={videoRef} playsInline muted autoPlay />
        )}
        <div className="pinchOverlay">
          <div className="pinchFill" ref={barRef} />
        </div>
      </div>
      <div className="voiceCard">
        <div className="swatch" ref={swatchRef} />
        <div>
          <b>Your voice in the room</b>
          <small>Pinch thumb + index to play. Closer pinch = quieter.</small>
        </div>
      </div>
      {notice && <p className="notice">{notice}</p>}
    </div>
  );
}
