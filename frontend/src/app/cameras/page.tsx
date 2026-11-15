"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import {
  QrCode,
  Settings,
  RefreshCw,
  Copy,
  Check,
  X,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";
import { StreamPlayer, StreamItemData } from "../../components/StreamPlayer";
import { PinchData } from "../../components/PinchOverlay";
import { BackendSettingsModal } from "../../components/BackendSettingsModal";
import { getBackendUrl, getBackendWsUrl } from "../../lib/config";

function DashboardContent() {
  const [streams, setStreams] = useState<StreamItemData[]>([]);
  const [pinchMap, setPinchMap] = useState<Record<string, PinchData>>({});
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [soloStreamId, setSoloStreamId] = useState<string | null>(null);
  const [phoneUrl, setPhoneUrl] = useState<string>("");

  const wsRef = useRef<WebSocket | null>(null);

  // The room lives in the URL (?room=CODE) — deep-linkable and carried by the QR.
  const room = (useSearchParamsRoom() ?? "").toUpperCase();

  // Streams in this room: roomless streams show everywhere as a safety net,
  // so a mistyped code can never make a camera silently invisible.
  const roomStreams = streams.filter(
    (s) => !room || !s.room || s.room === room
  );

  // The join URL phones scan — includes the room so their cameras land here.
  useEffect(() => {
    if (typeof window !== "undefined") {
      const url = `${window.location.origin}/stream${room ? `?room=${room}` : ""}`;
      setPhoneUrl(url);
    }
  }, [room]);

  // Poll backend health and streams
  const fetchStreams = async () => {
    const backendUrl = getBackendUrl();
    try {
      const healthRes = await fetch(`${backendUrl}/api/health`, { cache: "no-store" });
      if (healthRes.ok) {
        setServerOnline(true);
        const streamsRes = await fetch(`${backendUrl}/api/streams`, { cache: "no-store" });
        if (streamsRes.ok) {
          const data: StreamItemData[] = await streamsRes.json();
          setStreams((prev) => {
            // Merge existing stats
            const map = new Map(prev.map((s) => [s.stream_id, s]));
            return data.map((item) => ({
              ...item,
              volume_level: map.get(item.stream_id)?.volume_level ?? item.volume_level ?? 0,
              fps: map.get(item.stream_id)?.fps ?? item.fps ?? 0,
              motion_score: map.get(item.stream_id)?.motion_score ?? item.motion_score ?? 0,
            }));
          });
        }
      } else {
        setServerOnline(false);
      }
    } catch {
      setServerOnline(false);
    }
  };

  // WebSocket for live room events
  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connectWs() {
      const wsUrl = `${getBackendWsUrl()}/api/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setServerOnline(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.event === "init") {
            setStreams(msg.streams || []);
          } else if (msg.event === "stream_joined") {
            setStreams((prev) => {
              const filtered = prev.filter((s) => s.stream_id !== msg.stream.stream_id);
              return [...filtered, msg.stream];
            });
          } else if (msg.event === "stream_left") {
            setStreams((prev) => prev.filter((s) => s.stream_id !== msg.stream_id));
            setSoloStreamId((prev) => (prev === msg.stream_id ? null : prev));
            setPinchMap((prev) => {
              const next = { ...prev };
              delete next[msg.stream_id];
              return next;
            });
          } else if (msg.event === "pinch_update") {
            // Backend MediaPipe pinch tracking for the tile overlay
            setPinchMap((prev) => ({
              ...prev,
              [msg.stream_id]: {
                hand: msg.hand,
                pinch: msg.pinch,
                pinching: msg.pinching,
                landmarks: msg.landmarks,
              },
            }));
          } else if (msg.event === "stats_update") {
            setStreams((prev) =>
              prev.map((s) =>
                s.stream_id === msg.stream_id
                  ? {
                      ...s,
                      fps: msg.fps,
                      width: msg.width,
                      height: msg.height,
                      motion_score: msg.motion_score,
                    }
                  : s
              )
            );
          } else if (msg.event === "audio_level") {
            setStreams((prev) =>
              prev.map((s) =>
                s.stream_id === msg.stream_id
                  ? { ...s, volume_level: msg.volume_level }
                  : s
              )
            );
          }
        } catch {
          // ignore parsing error
        }
      };

      ws.onclose = () => {
        // Try to reconnect in 3 seconds
        reconnectTimer = setTimeout(connectWs, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    fetchStreams();
    connectWs();
    const interval = setInterval(fetchStreams, 5000);

    return () => {
      clearInterval(interval);
      clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const handleKickStream = async (streamId: string) => {
    const backendUrl = getBackendUrl();
    try {
      await fetch(`${backendUrl}/api/stream/${streamId}`, { method: "DELETE" });
      setStreams((prev) => prev.filter((s) => s.stream_id !== streamId));
    } catch (err) {
      console.error("Failed to kick stream:", err);
    }
  };

  const handleToggleSolo = (streamId: string) => {
    setSoloStreamId((prev) => (prev === streamId ? null : streamId));
  };

  const handleCopyUrl = () => {
    if (phoneUrl) {
      navigator.clipboard.writeText(phoneUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Determine grid layout classes
  const getGridClass = () => {
    if (soloStreamId) return "grid-cols-1";
    const count = roomStreams.length;
    if (count <= 1) return "grid-cols-1 max-w-4xl mx-auto";
    if (count === 2) return "grid-cols-1 md:grid-cols-2";
    if (count <= 4) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-2";
    if (count <= 6) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
    return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
  };

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      {/* Header Bar */}
      <header className="sticky top-0 z-30 px-6 py-4 bg-surface border-b border-line flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <svg width="22" height="22" viewBox="0 0 26 26" fill="none" aria-hidden="true" className="text-clay shrink-0">
              <path
                d="M5 21 C7 12, 13 5, 22 4 C21 13, 14 20, 6 22 M6 22 C9 17, 13 13, 18 10"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="font-display text-lg tracking-tight hidden sm:block">Natural Composition</span>
          </Link>
          {room && (
            <span className="font-mono text-xs tracking-widest px-2.5 py-1 rounded-lg bg-clay-tint text-clay-deep border border-clay/20 tabular-nums">
              ROOM {room}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Server Status */}
          <span className="hidden sm:flex items-center gap-1.5 text-xs text-ink-soft tabular-nums">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                serverOnline === true
                  ? "bg-emerald-600"
                  : serverOnline === false
                  ? "bg-rose-600"
                  : "bg-amber-500"
              }`}
            />
            {serverOnline === true ? "Backend connected" : serverOnline === false ? "Backend offline" : "Checking…"}
          </span>

          {/* Cameras count */}
          <span className="px-2.5 py-1.5 rounded-lg border border-line bg-paper text-ink-soft text-xs font-medium tabular-nums">
            {roomStreams.length} {roomStreams.length === 1 ? "camera" : "cameras"}
          </span>

          {/* Invite Phones / QR */}
          <button
            type="button"
            onClick={() => setIsQrModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-clay hover:bg-clay-deep text-white text-xs font-semibold transition-colors"
          >
            <QrCode className="w-4 h-4" />
            <span className="hidden md:inline">Connect Phone</span>
          </button>

          {/* Refresh */}
          <button
            type="button"
            onClick={fetchStreams}
            aria-label="Refresh streams"
            className="p-2 rounded-lg text-ink-soft hover:text-ink hover:bg-paper border border-line transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {/* Settings */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            aria-label="Backend settings"
            className="p-2 rounded-lg text-ink-soft hover:text-ink hover:bg-paper border border-line transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full flex flex-col justify-center">
        {roomStreams.length === 0 ? (
          /* Empty State: invite phones */
          <div className="my-auto flex flex-col items-center justify-center text-center p-8 border border-line bg-surface rounded-xl max-w-xl mx-auto">
            <div className="p-4 bg-white rounded-lg border border-line mb-6">
              {phoneUrl ? (
                <QRCodeSVG value={phoneUrl} size={180} level="M" />
              ) : (
                <div className="w-[180px] h-[180px] bg-paper flex items-center justify-center text-ink-soft">
                  Generating…
                </div>
              )}
            </div>

            <h2 className="font-display text-2xl tracking-tight mb-2 text-wrap-balance">
              Connect a phone camera
            </h2>
            <p className="text-xs text-ink-soft max-w-md leading-relaxed mb-6">
              Point a smartphone at this code, or open{" "}
              <code className="font-mono text-clay-deep">/stream</code> in its
              browser, to broadcast live video and audio to this screen
              {room ? " and join this room" : ""}.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleCopyUrl}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-line bg-paper hover:border-ink/40 text-xs font-medium text-ink transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-700" /> : <Copy className="w-4 h-4" />}
                {copied ? "Link copied" : "Copy join link"}
              </button>

              <Link
                href={`/stream${room ? `?room=${room}` : ""}`}
                target="_blank"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-ink text-paper hover:bg-ink/85 text-xs font-semibold transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Test stream in new tab
              </Link>
            </div>
          </div>
        ) : (
          /* Active Streams Grid */
          <div className={`grid gap-6 ${getGridClass()}`}>
            {roomStreams
              .filter((s) => !soloStreamId || s.stream_id === soloStreamId)
              .map((stream) => (
                <StreamPlayer
                  key={stream.stream_id}
                  stream={stream}
                  onKick={handleKickStream}
                  isSolo={soloStreamId === stream.stream_id}
                  onToggleSolo={handleToggleSolo}
                  pinch={pinchMap[stream.stream_id]}
                />
              ))}
          </div>
        )}
      </main>

      {/* QR Code Invitation Modal */}
      {isQrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40">
          <div className="relative w-full max-w-sm bg-surface border border-line rounded-xl p-6 text-center text-ink shadow-sm">
            <button
              type="button"
              onClick={() => setIsQrModalOpen(false)}
              aria-label="Close"
              className="absolute top-4 right-4 p-1.5 rounded-lg text-ink-soft hover:text-ink hover:bg-paper transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="font-display text-xl tracking-tight mb-1">Scan to join</h3>
            <p className="text-xs text-ink-soft mb-5">
              Opens the streamer page{room ? ` in room ${room}` : ""} on the phone.
            </p>

            <div className="p-4 bg-white rounded-lg border border-line inline-block mb-5">
              {phoneUrl && <QRCodeSVG value={phoneUrl} size={200} level="M" />}
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 p-2 bg-paper border border-line rounded-lg">
                <input
                  type="text"
                  readOnly
                  aria-label="Join URL"
                  value={phoneUrl}
                  className="bg-transparent text-xs font-mono text-ink-soft w-full px-1"
                />
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  aria-label="Copy join link"
                  className="p-1.5 rounded-lg bg-surface border border-line hover:border-ink/40 text-ink transition-colors"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-700" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-ink-soft text-left bg-paper p-2.5 rounded-lg border border-line">
                <ShieldAlert className="w-4 h-4 shrink-0 text-clay" />
                <span>Phone browsers need HTTPS for camera access — use a tunnel when off-localhost.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Backend Settings Modal */}
      <BackendSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}

// useSearchParams needs a Suspense boundary in production builds (Next.js rule).
function useSearchParamsRoom(): string | null {
  const searchParams = useSearchParams();
  return searchParams.get("room");
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <DashboardContent />
    </Suspense>
  );
}
