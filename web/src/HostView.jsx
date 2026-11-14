// Host console (laptop, /?host): visuals canvas + tile wall + QR + mock drawer.
// Browsers only: no peer meshes, phones push one small stream here each.
import React, { useEffect, useRef, useState } from 'react';
import Peer from 'peerjs';
import { QRCodeSVG } from 'qrcode.react';
import { socket } from './store.js';
import { startAudio, startDrone, applyAmbient } from './audio.js';
import { startVisuals } from './visuals.js';

export default function HostView() {
  const [stage, setStage] = useState('gate');
  const [qrUrl, setQrUrl] = useState(location.protocol === 'https:' ? location.origin : '');
  const [drawer, setDrawer] = useState(false);
  const [mockOn, setMockOn] = useState(false);
  const [tiles, setTiles] = useState([]); // [{id, stream}]
  const canvasRef = useRef(null);
  const peerRef = useRef(null);

  async function startConsole() {
    try {
      await startAudio(); // host audio needs its own gesture gate
      startDrone();       // the room's quiet shared floor
    } catch (e) {
      console.warn('[audio]', e.message);
    }
    setStage('live');

    try {
      const p = new Peer(undefined, { debug: 0 });
      peerRef.current = p;
      p.on('open', (id) => socket.emit('peer:register', { role: 'host', peerId: id }));
      p.on('call', (call) => {
        call.answer();
        call.on('stream', (stream) =>
          setTiles((prev) =>
            prev.some((t) => t.id === call.peer) ? prev : [...prev, { id: call.peer, stream }]
          )
        );
        call.on('close', () => setTiles((prev) => prev.filter((t) => t.id !== call.peer)));
        call.on('error', () => setTiles((prev) => prev.filter((t) => t.id !== call.peer)));
      });
      p.on('error', (e) => console.warn('[peer]', e && e.type));
    } catch (e) {
      console.warn('[peer] unavailable — tiles disabled:', e.message);
    }
  }

  // Low-frequency socket → React state (only on flips), plus 20Hz param ramps.
  useEffect(() => {
    const onArduino = (d) => {
      applyAmbient({ distance: d.distance, sound: d.sound });
      setMockOn((prev) => (prev === !!d.mock ? prev : !!d.mock));
    };
    const onGone = (id) => setTiles((prev) => prev.filter((t) => t.id !== id));
    socket.on('arduino:data', onArduino);
    socket.on('peer:gone', onGone);
    const onKey = (e) => {
      if (e.code === 'KeyM') setDrawer((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      socket.off('arduino:data', onArduino);
      socket.off('peer:gone', onGone);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    if (stage !== 'live' || !canvasRef.current) return;
    const stop = startVisuals(canvasRef.current);
    return () => {
      stop();
      peerRef.current?.destroy();
    };
  }, [stage]);

  const setMock = (patch) => socket.emit('mock:set', patch);
  const mockRgb = useRef([128, 128, 128]);
  function colorPatch(i, v) {
    mockRgb.current = mockRgb.current.map((c, idx) => (idx === i ? v : c));
    setMock({ rgb: mockRgb.current });
  }

  if (stage === 'gate') {
    return (
      <div className="gate">
        <h1>Composition — Host Console</h1>
        <p>Open the room, paste the tunnel URL for the QR, and let the crowd in.</p>
        <button className="primary" onClick={startConsole}>Open Room &amp; Enable Audio</button>
        <p className="hint">Press <b>M</b> any time for the mock sensor drawer (hardware dies → keys take over).</p>
      </div>
    );
  }

  return (
    <div className="host">
      {mockOn && <div className="mockBadge">SIMULATED</div>}
      <canvas className="hostCanvas" ref={canvasRef} />
      <aside>
        <div className="panel">
          <h3>Join QR</h3>
          <input
            type="text"
            placeholder="paste the https:// trycloudflare.com URL"
            value={qrUrl}
            onChange={(e) => setQrUrl(e.target.value.trim())}
          />
          <div className="qrWrap">
            {qrUrl ? <QRCodeSVG value={qrUrl} size={110} /> : <div className="empty">no URL yet</div>}
            <button onClick={() => navigator.clipboard?.writeText(qrUrl)}>Copy join URL</button>
          </div>
        </div>

        <div className="panel">
          <h3>Room ({tiles.length} live)</h3>
          {tiles.length === 0 ? (
            <div className="empty">no video tiles yet…</div>
          ) : (
            <div className="tiles">
              {tiles.map((t) => (
                <video
                  key={t.id}
                  playsInline
                  muted
                  autoPlay
                  ref={(el) => {
                    if (el && el.srcObject !== t.stream) {
                      el.srcObject = t.stream;
                      el.play().catch(() => {});
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="panel drawer" style={{ display: drawer ? 'block' : 'none' }}>
          <h3>Mock sensors (KeyM)</h3>
          <label>
            Distance (cm)
            <input type="range" min="0" max="150" step="1" defaultValue="40"
              onChange={(e) => setMock({ distance: +e.target.value })} />
          </label>
          <label>
            Sound level
            <input type="range" min="0" max="1" step="0.01" defaultValue="0.35"
              onChange={(e) => setMock({ sound: +e.target.value })} />
          </label>
          <label>
            Red
            <input type="range" min="0" max="255" defaultValue="128"
              onChange={(e) => colorPatch(0, +e.target.value)} />
          </label>
          <label>
            Green
            <input type="range" min="0" max="255" defaultValue="128"
              onChange={(e) => colorPatch(1, +e.target.value)} />
          </label>
          <label>
            Blue
            <input type="range" min="0" max="255" defaultValue="128"
              onChange={(e) => colorPatch(2, +e.target.value)} />
          </label>
          <div className="row">
            <button onClick={() => socket.emit('mock:auto')}>Resume auto</button>
            <button onClick={() => socket.emit('calibrate')}>Calibrate ambient</button>
          </div>
        </div>
      </aside>
    </div>
  );
}
