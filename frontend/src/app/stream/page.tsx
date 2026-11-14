"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
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

export default function StreamPage() {
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

  const startStream = async () => {
    setErrorMsg(null);
    try {
      const publisher = new WebRTCPublisher({
        streamId: streamId.trim() || `stream-${Date.now()}`,
        clientName: clientName.trim() || "Mobile Camera",
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
    <div className="min-h-screen bg-black text-white flex flex-col justify-between select-none relative overflow-hidden">
      {/* Top Header Bar */}
      <header className="z-20 px-4 py-3 bg-gradient-to-b from-black/90 via-black/50 to-transparent flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 -ml-1 rounded-xl bg-neutral-900/80 hover:bg-neutral-800 text-neutral-300 border border-white/10 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isStreaming && connState === "connected"
                    ? "bg-rose-500 animate-ping"
                    : isStreaming
                    ? "bg-amber-400 animate-pulse"
                    : "bg-neutral-600"
                }`}
              />
              <h1 className="text-sm font-semibold tracking-tight">
                {isStreaming
                  ? connState === "connected"
                    ? "LIVE STREAMING"
                    : "CONNECTING..."
                  : "CAMERA READY"}
              </h1>
            </div>
            <p className="text-[11px] text-neutral-400 font-mono">
              ID: {streamId} • {clientName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeStream && (
            <div className="px-2.5 py-1 rounded-lg bg-neutral-900/80 border border-white/10 flex items-center gap-1.5">
              <AudioMeter stream={activeStream} />
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-xl bg-neutral-900/80 hover:bg-neutral-800 text-neutral-300 border border-white/10 transition-colors"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Camera Viewfinder (Main Area) */}
      <main className="flex-1 relative flex items-center justify-center bg-neutral-950 overflow-hidden">
        {/* Live Video Preview */}
        <video
          ref={previewVideoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            isStreaming && isVideoEnabled ? "opacity-100" : "opacity-0"
          }`}
        />

        {/* Placeholder / Video Disabled Overlay */}
        {(!isStreaming || !isVideoEnabled) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-neutral-400">
            <div className="w-20 h-20 rounded-full bg-neutral-900/80 border border-neutral-800 flex items-center justify-center mb-4 shadow-inner">
              <Camera className="w-9 h-9 text-neutral-500" />
            </div>
            <h2 className="text-lg font-semibold text-neutral-200 mb-1">
              {isStreaming && !isVideoEnabled ? "Video Paused" : "Camera Stream Ready"}
            </h2>
            <p className="text-xs text-neutral-400 max-w-xs leading-relaxed">
              {isStreaming && !isVideoEnabled
                ? "Your camera track is muted, but audio is still streaming."
                : "Tap 'Start Streaming' below to stream your camera and microphone in real time to the central server."}
            </p>
          </div>
        )}

        {/* HTTPS / Secure Context Warning */}
        {isSecureContextIssue && (
          <div className="absolute inset-x-4 top-4 z-30 p-4 rounded-2xl bg-amber-950/90 border border-amber-600/50 backdrop-blur-md shadow-2xl">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-amber-200">
                  HTTPS Required for Mobile Camera
                </h3>
                <p className="text-xs text-amber-300/80 mt-1 leading-relaxed">
                  Mobile browsers (iOS Safari & Android Chrome) block camera & microphone
                  access when connecting over an unencrypted local IP (e.g.{" "}
                  <code>http://192.168.x.x</code>). To stream from your phone, connect
                  via HTTPS or use a free tunnel like Cloudflare Tunnel or ngrok.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error notification banner */}
        {errorMsg && (
          <div className="absolute inset-x-4 bottom-4 z-30 p-3.5 rounded-xl bg-rose-950/90 border border-rose-600/50 backdrop-blur-md flex items-center gap-2.5 text-rose-200 text-xs">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="truncate">{errorMsg}</span>
          </div>
        )}
      </main>

      {/* Bottom Control Dock */}
      <footer className="z-20 p-4 pb-8 bg-gradient-to-t from-black/95 via-black/75 to-transparent flex flex-col gap-4">
        {/* Stream metadata configuration (only shown when not streaming) */}
        {!isStreaming && (
          <div className="flex gap-2.5 max-w-md mx-auto w-full">
            <div className="flex-1">
              <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                Your Device / Camera Name
              </label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g. Phone 1, Stage Cam"
                className="w-full px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="w-28">
              <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                Stream ID
              </label>
              <input
                type="text"
                value={streamId}
                onChange={(e) => setStreamId(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-xl text-xs font-mono text-neutral-300 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center justify-center gap-4 max-w-md mx-auto w-full">
          {/* Switch Camera Button (Front / Back) */}
          <button
            type="button"
            onClick={handleSwitchCamera}
            className="p-3.5 rounded-2xl bg-neutral-900/90 hover:bg-neutral-800 active:scale-95 border border-white/10 text-neutral-200 transition-all shadow-lg"
            title={`Switch to ${facingMode === "environment" ? "Front" : "Back"} Camera`}
          >
            <SwitchCamera className="w-5 h-5" />
          </button>

          {/* Big Start / Stop Stream Button */}
          <button
            type="button"
            onClick={isStreaming ? stopStream : startStream}
            className={`flex-1 py-4 px-6 rounded-2xl font-bold text-sm tracking-wide uppercase transition-all duration-300 flex items-center justify-center gap-2.5 shadow-2xl active:scale-98 ${
              isStreaming
                ? "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/50"
                : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/50"
            }`}
          >
            <Radio className={`w-5 h-5 ${isStreaming ? "animate-pulse" : ""}`} />
            {isStreaming ? "Stop Streaming" : "Start Streaming"}
          </button>

          {/* Mic Mute / Unmute */}
          <button
            type="button"
            onClick={handleToggleAudio}
            className={`p-3.5 rounded-2xl active:scale-95 border transition-all shadow-lg ${
              isAudioEnabled
                ? "bg-neutral-900/90 hover:bg-neutral-800 border-white/10 text-neutral-200"
                : "bg-rose-950/80 border-rose-800/80 text-rose-400"
            }`}
            title={isAudioEnabled ? "Mute Microphone" : "Unmute Microphone"}
          >
            {isAudioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>

          {/* Video Toggle */}
          <button
            type="button"
            onClick={handleToggleVideo}
            className={`p-3.5 rounded-2xl active:scale-95 border transition-all shadow-lg ${
              isVideoEnabled
                ? "bg-neutral-900/90 hover:bg-neutral-800 border-white/10 text-neutral-200"
                : "bg-rose-950/80 border-rose-800/80 text-rose-400"
            }`}
            title={isVideoEnabled ? "Disable Camera" : "Enable Camera"}
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
