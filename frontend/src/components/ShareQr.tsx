"use client";
import { useSyncExternalStore } from "react";
import { QRCodeSVG } from "qrcode.react";

// Encodes the current page address, so a scan opens exactly what the sharer
// sees, on any deployment host. The address only exists in the browser, so it
// is read through useSyncExternalStore: prerender sees an empty snapshot and
// hydration stays stable, with no effect or cascading render.
// marginSize 4 is the quiet zone the QR specification requires — without it
// codes shown on busy panels stop scanning reliably.
const subscribe = () => () => {};
const serverHref = () => "";

export function ShareQr({ size, level = "M", title }: {
  size: number; level?: "L" | "M" | "Q" | "H"; title: string;
}) {
  const href = useSyncExternalStore(subscribe, () => window.location.href, serverHref);
  return href ? <QRCodeSVG value={href} size={size} level={level} marginSize={4} title={title} /> : null;
}
