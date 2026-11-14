"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Camera,
  XCircle,
  Activity,
  Radio,
} from "lucide-react";
import { WebRTCViewer } from "../lib/webrtc";
import { AudioMeter } from "./AudioMeter";
import { PinchOverlay, PinchData } from "./PinchOverlay";
import { getBackendUrl } from "../lib/config";

export interface StreamItemData {
  stream_id: string;
  client_name: string;
  room?: string;
  device_info?: {
    facingMode?: string;
    userAgent?: string;
  };
  has_video?: boolean;
  has_audio?: boolean;
  fps?: number;
  width?: number;
  height?: number;
  volume_level?: number;
  motion_score?: number;
}

interface StreamPlayerProps {
  stream: StreamItemData;
  onKick?: (streamId: string) => void;
  isSolo?: boolean;
  onToggleSolo?: (streamId: string) => void;
  /** Live pinch tracking data from the backend (MediaPipe on this stream). */
  pinch?: PinchData;
}

export const StreamPlayer: React.FC<StreamPlayerProps> = ({
  stream,
  onKick,
  isSolo = false,
  onToggleSolo,
  pinch,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<WebRTCViewer | null>(null);

  const [connState, setConnState] = useState<RTCPeerConnectionState>("new");
  const [isMuted, setIsMuted] = useState<boolean>(true); // Default muted to allow autoplay without user gesture block
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasStartedPlaying, setHasStartedPlaying] = useState<boolean>(false);

  useEffect(() => {
    let viewer: WebRTCViewer | null = null;
    let isCancelled = false;

    async function initWebRTC() {
      try {
        setErrorMsg(null);
        viewer = new WebRTCViewer({
          streamId: stream.stream_id,
          onTrack: (remoteStream) => {
            if (isCancelled) return;
            if (videoRef.current) {
              videoRef.current.srcObject = remoteStream;
              videoRef.current
                .play()
                .then(() => setHasStartedPlaying(true))
                .catch(() => {
                  // User interaction might be required for unmuted playback
                  if (videoRef.current) {
                    videoRef.current.muted = true;
                    setIsMuted(true);
                    videoRef.current.play().then(() => setHasStartedPlaying(true));
                  }
                });
            }
          },
          onConnectionStateChange: (state) => {
            if (isCancelled) return;
            setConnState(state);
          },
          onError: (err) => {
            if (isCancelled) return;
            setErrorMsg(err.message);
          },
        });

        viewerRef.current = viewer;
        await viewer.start();
      } catch (err: unknown) {
        if (!isCancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setErrorMsg(message);
        }
      }
    }

    initWebRTC();

    return () => {
      isCancelled = true;
      if (viewerRef.current) {
        viewerRef.current.stop();
        viewerRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [stream.stream_id]);

  const toggleMute = () => {
    if (videoRef.current) {
      const nextMuted = !isMuted;
      videoRef.current.muted = nextMuted;
      setIsMuted(nextMuted);
      if (!nextMuted) {
        videoRef.current.play().catch(console.error);
      }
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.error);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.error);
    }
  };

  const handleSnapshot = () => {
    const backendUrl = getBackendUrl();
    const snapshotUrl = `${backendUrl}/api/stream/${stream.stream_id}/snapshot.jpg?t=${Date.now()}`;
    window.open(snapshotUrl, "_blank");
  };

  return (
    <div
      ref={containerRef}
      className={`group relative flex flex-col bg-surface border border-line rounded-xl overflow-hidden transition-colors duration-300 ${
        isSolo ? "ring-2 ring-clay" : "hover:border-ink/30"
      }`}
    >
      {/* Video Container */}
      <div className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isMuted}
          className="w-full h-full object-contain"
        />

        {/* Pinch tracking overlay (backend-side MediaPipe on this stream) */}
        <PinchOverlay pinch={pinch} videoRef={videoRef} fit="contain" />

        {/* Loading / Disconnected state */}
        {(!hasStartedPlaying || connState !== "connected") && !errorMsg && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3 text-neutral-400">
            <Radio className="w-8 h-8 motion-safe:animate-pulse text-neutral-300" aria-hidden="true" />
            <span className="text-xs font-medium uppercase tracking-wider">
              {connState === "connecting" || connState === "new"
                ? "Connecting to phone..."
                : `Status: ${connState}`}
            </span>
          </div>
        )}

        {/* Error overlay */}
        {errorMsg && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-4 text-center text-rose-400">
            <XCircle className="w-8 h-8 mb-2" />
            <p className="text-xs font-medium">{errorMsg}</p>
          </div>
        )}

        {/* Top Floating Badge Bar */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
          <div className="flex items-center gap-2 pointer-events-auto">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-black/60 text-white border border-white/10">
              <span
                className={`w-2 h-2 rounded-full ${
                  connState === "connected"
                    ? "bg-emerald-500 motion-safe:animate-pulse"
                    : "bg-amber-400"
                }`}
              />
              {stream.client_name || "Camera"}
            </span>

            {stream.fps !== undefined && stream.fps > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-black/60 text-neutral-200 border border-white/10 tabular-nums">
                <Activity className="w-3 h-3 text-neutral-300" aria-hidden="true" />
                {stream.fps} FPS
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 pointer-events-auto">
            {/* Audio level meter */}
            <div className="px-2 py-1 rounded-lg bg-black/60 border border-white/10 flex items-center gap-1.5">
              <AudioMeter serverLevel={stream.volume_level} />
            </div>

            {/* Kick Button */}
            {onKick && (
              <button
                type="button"
                onClick={() => onKick(stream.stream_id)}
                aria-label="Disconnect stream"
                className="p-1.5 rounded-lg bg-black/60 text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 border border-white/10 transition-colors"
              >
                <XCircle className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Bottom Floating Control Bar (visible on hover or tap) */}
        <div className="absolute bottom-0 inset-x-0 p-3 bg-black/70 flex items-center justify-between opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={isMuted ? "Unmute audio" : "Mute audio"}
              className={`p-2 rounded-xl text-white transition-colors ${
                isMuted
                  ? "bg-white/10 hover:bg-white/20"
                  : "bg-emerald-700/90 hover:bg-emerald-600"
              }`}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {onToggleSolo && (
              <button
                type="button"
                onClick={() => onToggleSolo(stream.stream_id)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                  isSolo
                    ? "bg-clay text-white"
                    : "bg-white/10 hover:bg-white/20 text-white"
                }`}
              >
                {isSolo ? "Solo active" : "Solo"}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSnapshot}
              aria-label="Capture snapshot"
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <Camera className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label="Toggle fullscreen"
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Stream Info Footer */}
      <div className="px-4 py-2.5 flex items-center justify-between text-xs text-ink-soft bg-surface border-t border-line gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-ink-soft/70 truncate">{stream.stream_id}</span>
          {stream.room && (
            <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-clay-tint text-clay-deep border border-clay/20">
              {stream.room}
            </span>
          )}
          {stream.device_info?.facingMode && (
            <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-paper text-ink-soft border border-line">
              {stream.device_info.facingMode === "user" ? "Front" : "Back"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0 tabular-nums">
          {stream.width && stream.height && (
            <span>{stream.width}×{stream.height}</span>
          )}
          {stream.motion_score !== undefined && stream.motion_score > 0 && (
            <span>Δ {stream.motion_score}</span>
          )}
        </div>
      </div>
    </div>
  );
};
