"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import {
  Video,
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
import { BackendSettingsModal } from "../../components/BackendSettingsModal";
import { getBackendUrl, getBackendWsUrl } from "../../lib/config";

export default function DashboardPage() {
  const [streams, setStreams] = useState<StreamItemData[]>([]);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [soloStreamId, setSoloStreamId] = useState<string | null>(null);
  const [phoneUrl, setPhoneUrl] = useState<string>("");

  const wsRef = useRef<WebSocket | null>(null);

  // Setup streaming URL for QR code
  useEffect(() => {
    if (typeof window !== "undefined") {
      const url = `${window.location.origin}/stream`;
      setPhoneUrl(url);
    }
  }, []);

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
    let reconnectTimer: NodeJS.Timeout;

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
    const count = streams.length;
    if (count <= 1) return "grid-cols-1 max-w-4xl mx-auto";
    if (count === 2) return "grid-cols-1 md:grid-cols-2";
    if (count <= 4) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-2";
    if (count <= 6) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
    return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      {/* Header Bar */}
      <header className="sticky top-0 z-30 px-6 py-4 bg-neutral-900/90 backdrop-blur-md border-b border-neutral-800 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Video className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
              Central Stream Dashboard
              <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-neutral-800 text-neutral-300 border border-neutral-700">
                Host Mode
              </span>
            </h1>
            <p className="text-xs text-neutral-400">
              Live WebRTC ingest & central multi-camera monitor
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Server Status Pill */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-950 border border-neutral-800 text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                serverOnline === true
                  ? "bg-emerald-500 animate-pulse"
                  : serverOnline === false
                  ? "bg-rose-500"
                  : "bg-neutral-500"
              }`}
            />
            <span className="text-neutral-300 font-medium">
              {serverOnline === true
                ? "Backend Connected"
                : serverOnline === false
                ? "Backend Offline"
                : "Checking..."}
            </span>
          </div>

          {/* Active streams count */}
          <div className="px-3 py-1.5 rounded-xl bg-indigo-950/60 border border-indigo-500/30 text-indigo-300 text-xs font-semibold">
            {streams.length} {streams.length === 1 ? "Camera" : "Cameras"}
          </div>

          {/* Add Streamer / QR Code Button */}
          <button
            type="button"
            onClick={() => setIsQrModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
          >
            <QrCode className="w-4 h-4" />
            <span className="hidden md:inline">Connect Phone</span>
          </button>

          {/* Refresh Streams */}
          <button
            type="button"
            onClick={fetchStreams}
            className="p-2 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 transition-colors"
            title="Refresh streams"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {/* Settings */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 transition-colors"
            title="Backend Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full flex flex-col justify-center">
        {streams.length === 0 ? (
          /* Empty State: Prompt users to scan QR code with phone */
          <div className="my-auto flex flex-col items-center justify-center text-center p-8 border border-neutral-800/80 bg-neutral-900/40 backdrop-blur-md rounded-3xl max-w-xl mx-auto shadow-2xl">
            <div className="p-4 bg-white rounded-2xl shadow-xl mb-6">
              {phoneUrl ? (
                <QRCodeSVG value={phoneUrl} size={180} level="M" />
              ) : (
                <div className="w-[180px] h-[180px] bg-neutral-100 flex items-center justify-center text-neutral-400">
                  Generating QR...
                </div>
              )}
            </div>

            <h2 className="text-xl font-bold text-white mb-2">
              Connect a Phone Camera
            </h2>
            <p className="text-xs text-neutral-400 max-w-md leading-relaxed mb-6">
              Point your smartphone camera at this QR code or navigate to{" "}
              <code className="text-indigo-400 font-mono font-medium">/stream</code> to
              broadcast live video and audio directly to this screen.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleCopyUrl}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-200 transition-all border border-neutral-700"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {copied ? "Link Copied!" : "Copy Stream Link"}
              </button>

              <Link
                href="/stream"
                target="_blank"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600/90 hover:bg-indigo-500 text-xs font-semibold text-white transition-all shadow-md"
              >
                <ExternalLink className="w-4 h-4" />
                Test Stream in New Tab
              </Link>
            </div>
          </div>
        ) : (
          /* Active Streams Grid */
          <div className={`grid gap-6 ${getGridClass()}`}>
            {streams
              .filter((s) => !soloStreamId || s.stream_id === soloStreamId)
              .map((stream) => (
                <StreamPlayer
                  key={stream.stream_id}
                  stream={stream}
                  onKick={handleKickStream}
                  isSolo={soloStreamId === stream.stream_id}
                  onToggleSolo={handleToggleSolo}
                />
              ))}
          </div>
        )}
      </main>

      {/* QR Code Invitation Modal */}
      {isQrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-3xl p-6 text-center text-white shadow-2xl">
            <button
              type="button"
              onClick={() => setIsQrModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold mb-1">Scan to Stream</h3>
            <p className="text-xs text-neutral-400 mb-5">
              Scan with your smartphone camera to open the streamer app.
            </p>

            <div className="p-4 bg-white rounded-2xl inline-block shadow-lg mb-5">
              {phoneUrl && <QRCodeSVG value={phoneUrl} size={200} level="M" />}
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 p-2 bg-neutral-950 border border-neutral-800 rounded-xl">
                <input
                  type="text"
                  readOnly
                  value={phoneUrl}
                  className="bg-transparent text-xs font-mono text-neutral-300 w-full focus:outline-none px-1"
                />
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors"
                  title="Copy link"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-amber-400/90 text-left bg-amber-950/40 p-2.5 rounded-xl border border-amber-800/40">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>Mobile browsers require HTTPS for camera permission on external networks.</span>
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
