"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Camera,
  Video,
  VideoOff,
  Mic,
  MicOff,
  SwitchCamera,
  Radio,
  Settings,
  AlertTriangle,
  ArrowLeft,
  ShieldAlert,
} from "lucide-react";
import { WebRTCPublisher } from "../../lib/webrtc";
import { AudioMeter } from "../../components/AudioMeter";
import { BackendSettingsModal } from "../../components/BackendSettingsModal";
import { PinchOverlay, PinchData } from "../../components/PinchOverlay";
import { getBackendWsUrl } from "../../lib/config";

function StreamContent() {
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const publisherRef = useRef<WebRTCPublisher | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const [streamId, setStreamId] = useState<string>("");
  const [clientName, setClientName] = useState<string>("");
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [isAudioEnabled, setIsAudioEnabled] = useState<boolean>(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState<boolean>(true);

  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [connState, setConnState] = useState<RTCPeerConnectionState>("new");
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isSecureContextIssue, setIsSecureContextIssue] = useState<boolean>(false);
  const [pinch, setPinch] = useState<PinchData | undefined>(undefined);

  // The room comes from the join link (?room=CODE) — sent with every publish.
  const room = (useSearchParams().get("room") ?? "").toUpperCase();

  // Initialize unique random stream ID and default name
  useEffect(() => {
    const randomId = Math.random().toString(36).substring(2, 8);
    setStreamId(randomId);

    // Detect device type for friendly default name
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    const deviceType = isIOS ? "iPhone" : isAndroid ? "Android" : "Mobile";
    setClientName(`${deviceType}-${randomId.substring(0, 3)}`);

    // Check secure context
    if (
      typeof window !== "undefined" &&
      (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
    ) {
      if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") {
        setIsSecureContextIssue(true);
      }
    }
  }, []);

  // Screen WakeLock to prevent phone display sleep while streaming
  useEffect(() => {
    async function requestWakeLock() {
      if (isStreaming && "wakeLock" in navigator) {
        try {
          wakeLockRef.current = await navigator.wakeLock.request("screen");
        } catch {
          // Wake lock request failed or unpermitted
        }
      } else if (!isStreaming && wakeLockRef.current) {
        wakeLockRef.current.release().catch(console.error);
        wakeLockRef.current = null;
      }
    }
    requestWakeLock();

    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(console.error);
      }
    };
  }, [isStreaming]);

  // Live pinch tracking for our own stream: the backend runs MediaPipe on our
  // WebRTC frames and echoes pinch_update events over the stats websocket.
  useEffect(() => {
    if (!isStreaming || !streamId) return;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let ws: WebSocket | null = null;

    const connectWs = () => {
      ws = new WebSocket(`${getBackendWsUrl()}/api/ws`);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.event === "pinch_update" && msg.stream_id === streamId) {
            setPinch({
              hand: msg.hand,
              pinch: msg.pinch,
              pinching: msg.pinching,
              landmarks: msg.landmarks,
            });
          }
        } catch {
          // ignore parsing error
        }
      };
      ws.onclose = () => {
        reconnectTimer = setTimeout(connectWs, 3000);
      };
      ws.onerror = () => {
        ws?.close();
      };
    };

    connectWs();
    return () => {
      clearTimeout(reconnectTimer);
      ws?.close();
      setPinch(undefined);
    };
  }, [isStreaming, streamId]);

  const startStream = async () => {
    setErrorMsg(null);
    try {
      const publisher = new WebRTCPublisher({
        streamId: streamId.trim() || `stream-${Date.now()}`,
        clientName: clientName.trim() || "Mobile Camera",
        room: room || undefined,
        facingMode,
        audioEnabled: isAudioEnabled,
        videoEnabled: isVideoEnabled,
        onConnectionStateChange: (state) => {
          setConnState(state);
          if (state === "failed" || state === "closed") {
            setIsStreaming(false);
          }
        },
        onError: (err) => {
          setErrorMsg(err.message);
          setIsStreaming(false);
        },
      });

      publisherRef.current = publisher;
      const stream = await publisher.start();
      setActiveStream(stream);

      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
        previewVideoRef.current.play().catch(console.error);
      }

      setIsStreaming(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorMsg(message);
      setIsStreaming(false);
    }
  };

  const stopStream = () => {
    if (publisherRef.current) {
      publisherRef.current.stop();
      publisherRef.current = null;
    }
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = null;
    }
    setActiveStream(null);
    setIsStreaming(false);
    setConnState("new");
  };

  const handleToggleAudio = () => {
    const nextState = !isAudioEnabled;
    setIsAudioEnabled(nextState);
    if (publisherRef.current) {
      publisherRef.current.setAudioEnabled(nextState);
    }
  };

  const handleToggleVideo = () => {
    const nextState = !isVideoEnabled;
    setIsVideoEnabled(nextState);
    if (publisherRef.current) {
      publisherRef.current.setVideoEnabled(nextState);
    }
  };

  const handleSwitchCamera = async () => {
    const nextMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextMode);
    if (publisherRef.current) {
      await publisherRef.current.switchCamera(nextMode);
      const stream = publisherRef.current.getStream();
      setActiveStream(stream);
      if (previewVideoRef.current && stream) {
        previewVideoRef.current.srcObject = stream;
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col select-none">
      {/* Top Header Bar — light paper chrome */}
      <header className="z-20 px-4 py-3 bg-surface border-b border-line flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            aria-label="Back to home"
            className="p-2 -ml-1 rounded-lg text-ink-soft hover:text-ink hover:bg-paper border border-transparent hover:border-line transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  isStreaming && connState === "connected"
                    ? "bg-rose-600 motion-safe:animate-pulse"
                    : isStreaming
                    ? "bg-amber-500"
                    : "bg-ink-soft/40"
                }`}
              />
              <h1 className="text-sm font-semibold tracking-tight truncate">
                {isStreaming
                  ? connState === "connected"
                    ? "Live streaming"
                    : "Connecting…"
                  : "Camera ready"}
              </h1>
            </div>
            <p className="text-[11px] text-ink-soft font-mono truncate">
              {room ? `Room ${room} · ` : ""}ID {streamId}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeStream && (
            <div className="px-2 py-1 rounded-lg bg-paper border border-line flex items-center gap-1.5">
              <AudioMeter stream={activeStream} />
            </div>
          )}

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

      {/* Camera Viewfinder (dark area — video is video) */}
      <main className="flex-1 relative flex items-center justify-center bg-black overflow-hidden min-h-[45vh]">
        <video
          ref={previewVideoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            isStreaming && isVideoEnabled ? "opacity-100" : "opacity-0"
          }`}
        />

        {/* Pinch tracking overlay (backend MediaPipe on our stream) */}
        {isStreaming && isVideoEnabled && (
          <PinchOverlay pinch={pinch} videoRef={previewVideoRef} fit="cover" banner />
        )}

        {/* Placeholder / Video Disabled Overlay */}
        {(!isStreaming || !isVideoEnabled) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-neutral-400">
            <div className="w-20 h-20 rounded-full border border-neutral-800 flex items-center justify-center mb-4">
              <Camera className="w-9 h-9 text-neutral-500" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-semibold text-neutral-200 mb-1">
              {isStreaming && !isVideoEnabled ? "Video paused" : "Camera ready"}
            </h2>
            <p className="text-xs text-neutral-400 max-w-xs leading-relaxed">
              {isStreaming && !isVideoEnabled
                ? "Your camera track is muted, but audio is still streaming."
                : "Tap Start Streaming to broadcast your camera and microphone to the room."}
            </p>
          </div>
        )}

        {/* HTTPS / Secure Context Warning */}
        {isSecureContextIssue && (
          <div className="absolute inset-x-4 top-4 z-30 p-4 rounded-xl bg-amber-50 border border-amber-300 shadow-sm">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <h3 className="text-sm font-semibold text-amber-900">
                  HTTPS required for mobile camera
                </h3>
                <p className="text-xs text-amber-800/80 mt-1 leading-relaxed">
                  Mobile browsers block camera &amp; microphone access over plain
                  HTTP on a local IP (e.g. <code>http://192.168.x.x</code>).
                  Connect via HTTPS or a tunnel like Cloudflare Tunnel or ngrok.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error notification banner */}
        {errorMsg && (
          <div
            className="absolute inset-x-4 bottom-4 z-30 p-3.5 rounded-xl bg-rose-50 border border-rose-300 flex items-center gap-2.5 text-rose-800 text-xs"
            aria-live="polite"
          >
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" aria-hidden="true" />
            <span className="break-words">{errorMsg}</span>
          </div>
        )}
      </main>

      {/* Bottom Control Dock — light paper chrome */}
      <footer className="z-20 p-4 pb-8 bg-surface border-t border-line flex flex-col gap-4">
        {/* Stream metadata configuration (only shown when not streaming) */}
        {!isStreaming && (
          <div className="flex gap-2.5 max-w-md mx-auto w-full">
            <div className="flex-1 min-w-0">
              <label htmlFor="client-name" className="block text-[11px] font-medium text-ink-soft mb-1">
                Camera name
              </label>
              <input
                id="client-name"
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g. Phone 1, Stage Cam…"
                autoComplete="off"
                className="w-full px-3 py-2 bg-paper border border-line rounded-lg text-xs text-ink placeholder:text-ink-soft/60 focus:border-clay"
              />
            </div>
            <div className="w-28">
              <label htmlFor="stream-id" className="block text-[11px] font-medium text-ink-soft mb-1">
                Stream ID
              </label>
              <input
                id="stream-id"
                type="text"
                value={streamId}
                onChange={(e) => setStreamId(e.target.value)}
                className="w-full px-3 py-2 bg-paper border border-line rounded-lg text-xs font-mono text-ink focus:border-clay"
              />
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center justify-center gap-4 max-w-md mx-auto w-full">
          {/* Switch Camera (Front / Back) */}
          <button
            type="button"
            onClick={handleSwitchCamera}
            aria-label={`Switch to ${facingMode === "environment" ? "front" : "back"} camera`}
            className="p-3.5 rounded-xl border border-line bg-paper text-ink-soft hover:text-ink hover:border-ink/40 active:scale-95 transition-[border-color,color,transform]"
          >
            <SwitchCamera className="w-5 h-5" />
          </button>

          {/* Big Start / Stop Stream Button */}
          <button
            type="button"
            onClick={isStreaming ? stopStream : startStream}
            className={`flex-1 py-4 px-6 rounded-xl font-bold text-sm tracking-wide uppercase transition-colors flex items-center justify-center gap-2.5 active:scale-[0.98] ${
              isStreaming
                ? "bg-rose-700 hover:bg-rose-800 text-white"
                : "bg-clay hover:bg-clay-deep text-white"
            }`}
          >
            <Radio className="w-5 h-5" aria-hidden="true" />
            {isStreaming ? "Stop Streaming" : "Start Streaming"}
          </button>

          {/* Mic Mute / Unmute */}
          <button
            type="button"
            onClick={handleToggleAudio}
            aria-label={isAudioEnabled ? "Mute microphone" : "Unmute microphone"}
            className={`p-3.5 rounded-xl border transition-colors active:scale-95 ${
              isAudioEnabled
                ? "bg-paper border-line text-ink-soft hover:text-ink hover:border-ink/40"
                : "bg-rose-50 border-rose-300 text-rose-700"
            }`}
          >
            {isAudioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>

          {/* Video Toggle */}
          <button
            type="button"
            onClick={handleToggleVideo}
            aria-label={isVideoEnabled ? "Disable camera" : "Enable camera"}
            className={`p-3.5 rounded-xl border transition-colors active:scale-95 ${
              isVideoEnabled
                ? "bg-paper border-line text-ink-soft hover:text-ink hover:border-ink/40"
                : "bg-rose-50 border-rose-300 text-rose-700"
            }`}
          >
            {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>
        </div>
      </footer>

      {/* Backend Settings Modal */}
      <BackendSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}

// useSearchParams needs a Suspense boundary in production builds (Next.js rule).
export default function StreamPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <StreamContent />
    </Suspense>
  );
}
