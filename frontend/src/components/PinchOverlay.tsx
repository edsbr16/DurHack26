"use client";

import React, { useEffect, useRef } from "react";

export interface PinchData {
  hand: boolean;
  pinch: number;
  pinching: boolean;
  landmarks: [number, number][] | null;
}

const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBadge(
  ctx: CanvasRenderingContext2D,
  text: string,
  bg: string,
  fg: string
) {
  ctx.font = "600 13px system-ui, -apple-system, sans-serif";
  const tw = ctx.measureText(text).width;
  roundRect(ctx, 10, 10, tw + 20, 28, 8);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 20, 25);
  ctx.textBaseline = "alphabetic";
}

interface PinchOverlayProps {
  pinch: PinchData | undefined;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** How the sibling <video> fills its container — must match its CSS. */
  fit?: "contain" | "cover";
  /** Show the "show a hand" hint (streamer page); dashboard tiles stay quiet. */
  banner?: boolean;
}

/**
 * Canvas overlay layered over a WebRTC <video> that renders backend-side
 * MediaPipe hand tracking: skeleton, fingertip dots, pinch line, score and a
 * PINCH CAPTURED badge. Data arrives as ~12Hz pinch_update websocket events.
 */
export const PinchOverlay: React.FC<PinchOverlayProps> = ({
  pinch,
  videoRef,
  fit = "contain",
  banner = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (!cw || !ch) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    // Map frame-normalised coords to element coords: object-fit letterboxes
    // (contain) or crops (cover), so the overlay must apply the same math.
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const lm = pinch?.hand ? pinch.landmarks : null;
    if (vw && vh && lm && lm.length >= 21) {
      const scale =
        fit === "cover"
          ? Math.max(cw / vw, ch / vh)
          : Math.min(cw / vw, ch / vh);
      const dw = vw * scale;
      const dh = vh * scale;
      const ox = (cw - dw) / 2;
      const oy = (ch - dh) / 2;
      const pt = (i: number): [number, number] => [
        ox + lm[i][0] * dw,
        oy + lm[i][1] * dh,
      ];

      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (const [a, b] of HAND_CONNECTIONS) {
        const [ax, ay] = pt(a);
        const [bx, by] = pt(b);
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
      }
      ctx.stroke();

      const [tx, ty] = pt(4); // thumb tip
      const [ix, iy] = pt(8); // index tip
      ctx.strokeStyle = pinch?.pinching
        ? "#34d399"
        : "rgba(255, 255, 255, 0.55)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(ix, iy);
      ctx.stroke();

      ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
      ctx.shadowBlur = 4;
      for (const [px, py] of [
        [tx, ty],
        [ix, iy],
      ]) {
        ctx.beginPath();
        ctx.fillStyle = "#818cf8";
        ctx.arc(px, py, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#10131c";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.fillStyle = "#ffffff";
      ctx.font = "600 13px system-ui, -apple-system, sans-serif";
      ctx.fillText(
        `pinch ${(pinch?.pinch ?? 0).toFixed(2)}`,
        (tx + ix) / 2 - 30,
        Math.min(ty, iy) - 14
      );
      ctx.shadowBlur = 0;
    }

    if (pinch?.pinching) {
      drawBadge(ctx, "PINCH CAPTURED", "#10b981", "#06251a");
    } else if (pinch?.hand) {
      drawBadge(ctx, "tracking hand…", "rgba(3, 7, 18, 0.7)", "#d4d4d4");
    } else if (banner) {
      drawBadge(ctx, "show a hand to the camera", "rgba(3, 7, 18, 0.7)", "#a3a3a3");
    }
  }, [pinch, fit, banner, videoRef]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
};
