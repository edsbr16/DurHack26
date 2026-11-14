// Composition — host bridge.
// Arduino serial → EMA smoothing → socket.io `arduino:data` @20Hz, mock-first:
// if the Arduino is missing, silent >1s, or a host drawer slider overrides,
// the demo keeps running on generated values. Serves the built web client.
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const PORT = Number(process.env.PORT || 3001);
const BAUD = Number(process.env.SERIAL_BAUD || 115200); // serial contract with the Arduino owner
const EMIT_MS = 50;    // 20Hz broadcast per AGENTS.md
const STALE_MS = 1000; // serial silence this long → auto-mock fallback

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v) => clamp(v, 0, 1);
const round2 = (v) => Math.round(v * 100) / 100;

// --- serial (optional at runtime; mock mode covers its absence) -----------
let serialLib = null;
try {
  serialLib = {
    SerialPort: require('serialport').SerialPort,
    Readline: require('@serialport/parser-readline').ReadlineParser,
  };
} catch (e) {
  console.warn('[serial] native module unavailable, mock-only mode:', e.message);
}

const raw = { distance: 40, sound: 0.35, rgb: [128, 128, 128] };
const smooth = { distance: 40, sound: 0.35, rgb: [128, 128, 128] };
let lastSerialAt = 0;
let override = null;     // manual mock values from the host drawer (KeyM)
let calibration = null;  // ambient rgb baseline from "Calibrate Ambient"
let hostPeerId = null;

// Accepts newline-terminated JSON {"distance":42.5,"sound":0.65,"rgb":[r,g,b]}
// or CSV: distance,sound,r,g,b  (serial contract looseness on purpose).
function applyLine(line) {
  const s = String(line).trim();
  if (!s) return;
  try {
    let d = null;
    if (s[0] === '{') {
      d = JSON.parse(s);
    } else {
      const p = s.split(',').map(Number);
      if (p.length >= 5 && p.every(Number.isFinite)) {
        d = { distance: p[0], sound: p[1], rgb: [p[2], p[3], p[4]] };
      }
    }
    if (d && Number.isFinite(d.distance) && Number.isFinite(d.sound) && Array.isArray(d.rgb) && d.rgb.length === 3) {
      raw.distance = clamp(d.distance, 0, 400);
      raw.sound = clamp01(d.sound);
      raw.rgb = d.rgb.map((v) => clamp(Number(v) || 0, 0, 255));
      lastSerialAt = Date.now();
    }
  } catch {
    // partial/garbage line — wait for a well-formed one
  }
}

async function openSerial() {
  if (!serialLib) return;
  let list;
  try {
    list = await serialLib.SerialPort.list();
  } catch (e) {
    console.warn('[serial] port list failed:', e.message);
    return;
  }
  const usb = list.filter((p) => p.vendorId || /arduino|usb/i.test(String(p.manufacturer || '')));
  const picked =
    usb.find((p) => /arduino/i.test(String(p.manufacturer || ''))) ||
    usb[0] ||
    list.find((p) => p.path && /ttyUSB|ttyACM|usbmodem|COM\d+/i.test(p.path));
  if (!picked) {
    console.log('[serial] no candidate device found — mock mode only');
    return;
  }
  try {
    const port = new serialLib.SerialPort({ path: picked.path, baudRate: BAUD, autoOpen: true });
    const parser = port.pipe(new serialLib.Readline());
    parser.on('data', applyLine);
    port.on('error', (e) => console.warn('[serial] error:', e.message));
    port.on('close', () => console.warn('[serial] port closed — falls back to mock'));
    console.log('[serial] opened', picked.path, '@', BAUD);
  } catch (e) {
    console.warn('[serial] open failed:', e.message);
  }
}

// --- mock generator & smoothing -------------------------------------------
function hslToRgb(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))));
  };
  return [f(0), f(8), f(4)];
}

function autoMock(tSec) {
  // A gentle "room that breathes": solid terrain the demo can narrate against.
  const distance = 30 + 55 * (0.5 + 0.5 * Math.sin(tSec * 0.25));
  const sound = 0.35 + 0.25 * Math.sin(tSec * 0.8) + 0.08 * Math.sin(tSec * 2.7);
  const hue = (tSec * 6) % 360;
  return { distance, sound: clamp01(sound), rgb: hslToRgb(hue / 360, 0.55, 0.45) };
}

const EMA = (prev, v) => 0.8 * prev + 0.2 * v; // AGENTS.md smoothing

// --- http + socket ---------------------------------------------------------
const app = express();
app.use(express.static(path.join(__dirname, '../web/dist')));
const httpServer = http.createServer(app);
const io = new Server(httpServer, { maxHttpBufferSize: 2e4 });

const visionLast = new WeakMap(); // socket → last client:vision emit (server-side rate cap)

io.on('connection', (socket) => {
  if (hostPeerId) socket.emit('host:peer', hostPeerId);

  socket.on('peer:register', ({ role, peerId } = {}) => {
    if (typeof peerId !== 'string') return;
    if (role === 'host') {
      hostPeerId = peerId;
      io.emit('host:peer', hostPeerId);
    } else {
      socket.data.peerId = peerId;
    }
  });

  socket.on('disconnect', () => {
    if (socket.data.peerId) io.emit('peer:gone', socket.data.peerId);
  });

  socket.on('mock:set', (p) => {
    if (!p || typeof p !== 'object') return;
    override = override || {};
    if (Number.isFinite(p.distance)) override.distance = clamp(p.distance, 0, 400);
    if (Number.isFinite(p.sound)) override.sound = clamp01(p.sound);
    if (Array.isArray(p.rgb) && p.rgb.length === 3) {
      override.rgb = p.rgb.map((v) => clamp(Number(v) || 0, 0, 255));
    }
  });
  socket.on('mock:auto', () => {
    override = null;
  });
  socket.on('calibrate', () => {
    calibration = [...smooth.rgb]; // snapshot ambient baseline (venue lighting)
  });

  socket.on('client:vision', (p) => {
    const now = Date.now();
    if (now - (visionLast.get(socket) || 0) < 45) return; // cap ~22Hz regardless of client
    if (!p || typeof p !== 'object') return;
    visionLast.set(socket, now);
    if (Array.isArray(p.pixelGrid)) p.pixelGrid = p.pixelGrid.slice(0, 64); // keep payloads flat & small
    io.emit('client:vision', p);
  });
});

// --- 20Hz broadcast tick ----------------------------------------------------
setInterval(() => {
  let base;
  let mock = false;
  if (Date.now() - lastSerialAt < STALE_MS) {
    smooth.distance = EMA(smooth.distance, raw.distance);
    smooth.sound = EMA(smooth.sound, raw.sound);
    for (let i = 0; i < 3; i++) smooth.rgb[i] = EMA(smooth.rgb[i], raw.rgb[i]);
    base = { ...smooth };
  } else {
    base = autoMock(Date.now() / 1000);
    mock = true;
  }
  if (override) {
    Object.assign(base, override);
    mock = true;
  }
  let rgb = base.rgb;
  if (calibration) {
    rgb = base.rgb.map((c, i) => clamp(c - calibration[i], 0, 255));
    if (rgb[0] + rgb[1] + rgb[2] < 24) rgb = [128, 128, 128]; // sensor sees only ambient → neutral
  }
  io.emit('arduino:data', {
    distance: round2(base.distance),
    sound: round2(clamp01(base.sound)),
    rgb: rgb.map(Math.round),
    mock,
  });
}, EMIT_MS);

httpServer.listen(PORT, () => {
  console.log(`[composition] bridge on http://localhost:${PORT} (serves web/dist if built)`);
  openSerial();
});
