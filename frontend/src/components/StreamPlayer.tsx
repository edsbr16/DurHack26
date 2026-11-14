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
import { getBackendUrl } from "../lib/config";

export interface StreamItemData {
  stream_id: string;
  client_name: string;
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
}

export const StreamPlayer: React.FC<StreamPlayerProps> = ({
  stream,
  onKick,
  isSolo = false,
  onToggleSolo,
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
      className={`group relative flex flex-col bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl transition-all duration-300 ${
        isSolo ? "ring-2 ring-emerald-500" : "hover:border-neutral-700"
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

        {/* Loading / Disconnected state */}
        {(!hasStartedPlaying || connState !== "connected") && !errorMsg && (
          <div className="absolute inset-0 bg-neutral-950/80 backdrop-blur-xs flex flex-col items-center justify-center gap-3 text-neutral-400">
            <Radio className="w-8 h-8 animate-pulse text-indigo-400" />
            <span className="text-xs font-medium uppercase tracking-wider">
              {connState === "connecting" || connState === "new"
                ? "Connecting to phone..."
                : `Status: ${connState}`}
            </span>
          </div>
        )}

        {/* Error overlay */}
        {errorMsg && (
          <div className="absolute inset-0 bg-neutral-950/90 flex flex-col items-center justify-center p-4 text-center text-rose-400">
            <XCircle className="w-8 h-8 mb-2" />
            <p className="text-xs font-medium">{errorMsg}</p>
          </div>
        )}

        {/* Top Floating Badge Bar */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
          <div className="flex items-center gap-2 pointer-events-auto">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-neutral-950/70 backdrop-blur-md text-white border border-white/10 shadow-sm">
              <span
                className={`w-2 h-2 rounded-full ${
                  connState === "connected"
                    ? "bg-emerald-500 animate-pulse"
                    : "bg-amber-400"
                }`}
              />
              {stream.client_name || "Camera"}
            </span>

            {stream.fps !== undefined && stream.fps > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-neutral-950/60 backdrop-blur-md text-neutral-300 border border-white/5">
                <Activity className="w-3 h-3 text-cyan-400" />
                {stream.fps} FPS
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 pointer-events-auto">
            {/* Audio level meter */}
            <div className="px-2 py-1 rounded-lg bg-neutral-950/70 backdrop-blur-md border border-white/10 flex items-center gap-1.5">
              <AudioMeter serverLevel={stream.volume_level} />
            </div>

            {/* Kick Button */}
            {onKick && (
              <button
                type="button"
                onClick={() => onKick(stream.stream_id)}
                className="p-1.5 rounded-lg bg-neutral-950/70 backdrop-blur-md text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 border border-white/10 transition-colors"
                title="Disconnect stream"
              >
                <XCircle className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Bottom Floating Control Bar (Fade on hover or mobile tap) */}
        <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center justify-between opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleMute}
              className={`p-2 rounded-xl backdrop-blur-md text-white transition-all ${
                isMuted
                  ? "bg-neutral-800/80 hover:bg-neutral-700/80 text-neutral-300"
                  : "bg-emerald-600/90 hover:bg-emerald-500/90 shadow-lg shadow-emerald-950"
              }`}
              title={isMuted ? "Unmute audio" : "Mute audio"}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {onToggleSolo && (
              <button
                type="button"
                onClick={() => onToggleSolo(stream.stream_id)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold backdrop-blur-md transition-all ${
                  isSolo
                    ? "bg-emerald-600 text-white"
                    : "bg-neutral-800/80 hover:bg-neutral-700/80 text-neutral-300"
                }`}
                title="Solo this camera feed"
              >
                {isSolo ? "Solo Active" : "Solo"}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSnapshot}
              className="p-2 rounded-xl bg-neutral-800/80 hover:bg-neutral-700/80 text-white backdrop-blur-md transition-colors"
              title="Capture full-res snapshot from server"
            >
              <Camera className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-2 rounded-xl bg-neutral-800/80 hover:bg-neutral-700/80 text-white backdrop-blur-md transition-colors"
              title="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Stream Info Footer */}
      <div className="px-4 py-2.5 flex items-center justify-between text-xs text-neutral-400 bg-neutral-900/90 border-t border-neutral-800/60">
        <div className="flex items-center gap-2 truncate">
          <span className="font-mono text-neutral-500 truncate max-w-[120px]">
            {stream.stream_id}
          </span>
          {stream.device_info?.facingMode && (
            <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300">
              {stream.device_info.facingMode === "user" ? "Front" : "Back"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {stream.width && stream.height && (
            <span>{stream.width}×{stream.height}</span>
          )}
          {stream.motion_score !== undefined && stream.motion_score > 0 && (
            <span className="text-cyan-400 font-mono">
              Δ {stream.motion_score}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
