// Shared high-frequency state. Plain mutable module state, read from rAF loops
// and synths — never React state at 20Hz (AGENTS.md rule).
import { io } from 'socket.io-client';

export const socket = io(); // same-origin in prod (bridge serves the build), proxied in dev

export const Sensors = { distance: 40, sound: 0.35, rgb: [128, 128, 128], mock: false };
export const Peers = new Map(); // peerId → latest client:vision payload
export const HostPeer = { id: null };

socket.on('arduino:data', (d) => {
  if (!d) return;
  Sensors.distance = d.distance;
  Sensors.sound = d.sound;
  Sensors.rgb = d.rgb;
  Sensors.mock = !!d.mock;
});

socket.on('client:vision', (p) => {
  if (p && typeof p.peerId === 'string') Peers.set(p.peerId, p);
});

socket.on('peer:gone', (id) => Peers.delete(id));

socket.on('host:peer', (id) => {
  HostPeer.id = id;
});

// Subscribe to the host's WebRTC id; fires immediately if we already know it.
export function onHostPeer(cb) {
  const handler = (id) => cb(id);
  if (HostPeer.id) cb(HostPeer.id);
  socket.on('host:peer', handler);
  return () => socket.off('host:peer', handler);
}

export const clamp01 = (v) => Math.min(1, Math.max(0, v));
