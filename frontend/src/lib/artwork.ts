export type VisualInputs = {
  sound: number; scale: number; brightness: number;
  colour: [number, number, number]; gesture: number;
};
export type ArtworkState = {
  room: string; devices: number; hands: number;
  server_time: number; epoch: number; received_at: number | null;
  raw: { sound: number; distanceCm: number | null; lux: number | null };
  visual: VisualInputs;
  pattern?: { seed: number };
};
export const idleVisual: VisualInputs = {
  sound: 0, scale: 1, brightness: 0.7, colour: [0.65, 0.38, 0.95], gesture: 0,
};
