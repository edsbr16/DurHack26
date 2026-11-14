"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Smartphone,
  LayoutGrid,
  Radio,
  Settings,
  ShieldCheck,
  Zap,
  Cpu,
  ArrowRight,
} from "lucide-react";
import { BackendSettingsModal } from "../components/BackendSettingsModal";
import { getBackendUrl } from "../lib/config";

export default function HomePage() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [backendStatus, setBackendStatus] = useState<"checking" | "online" | "offline">("checking");
  const [activeStreams, setActiveStreams] = useState<number>(0);

  useEffect(() => {
    const backendUrl = getBackendUrl();
    fetch(`${backendUrl}/api/health`)
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error("Backend not ok");
      })
      .then((data) => {
        setBackendStatus("online");
        setActiveStreams(data.active_streams || 0);
      })
      .catch(() => {
        setBackendStatus("offline");
      });
  }, []);

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col justify-between p-6 sm:p-12 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-10 w-80 h-80 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Navbar */}
      <nav className="relative z-10 max-w-5xl mx-auto w-full flex items-center justify-between pb-8">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-lg">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-neutral-200 to-neutral-400 bg-clip-text text-transparent">
              DurHack WebRTC Stream
            </span>
            <p className="text-[11px] text-neutral-500 font-mono">Central Media Engine</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Backend Status indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800 text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                backendStatus === "online"
                  ? "bg-emerald-500 animate-pulse"
                  : backendStatus === "offline"
                  ? "bg-rose-500"
                  : "bg-amber-400 animate-pulse"
              }`}
            />
            <span className="text-neutral-300 font-medium capitalize">
              Backend {backendStatus}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 transition-colors"
            title="Configure Backend"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </nav>

      {/* Main Hero & Choice Section */}
      <main className="relative z-10 max-w-4xl mx-auto w-full my-auto py-8 text-center flex flex-col items-center">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-6 shadow-sm">
          <Zap className="w-3.5 h-3.5" />
          Sub-200ms WebRTC Streaming with Python & AI
        </div>

        <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white max-w-2xl leading-tight mb-4">
          Connect Any Phone. <br />
          <span className="bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
            Stream to Central Backend.
          </span>
        </h1>

        <p className="text-sm sm:text-base text-neutral-400 max-w-xl leading-relaxed mb-10">
          Stream live camera video and audio from any smartphone directly into a
          central Python server with multi-camera monitoring, real-time FPS, and AI-ready frame ingestion.
        </p>

        {/* Two Choice Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full text-left">
          {/* Card 1: Phone Streamer */}
          <Link
            href="/stream"
            className="group relative p-7 rounded-3xl bg-neutral-900/60 hover:bg-neutral-900/90 border border-neutral-800 hover:border-indigo-500/50 backdrop-blur-md transition-all duration-300 hover:shadow-2xl hover:shadow-indigo-500/10 flex flex-col justify-between"
          >
            <div>
              <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center mb-6 group-hover:scale-105 transition-transform">
                <Smartphone className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2 group-hover:text-indigo-300 transition-colors flex items-center gap-2">
                Stream from Phone
                <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-indigo-400" />
              </h2>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Open on your mobile phone to broadcast your front or back camera and microphone
                in real-time to the central server.
              </p>
            </div>

            <div className="mt-8 pt-4 border-t border-neutral-800/80 flex items-center justify-between text-xs text-neutral-500 font-medium">
              <span>Mobile-Optimized WebRTC</span>
              <span className="text-indigo-400 group-hover:underline font-semibold">
                Launch Camera →
              </span>
            </div>
          </Link>

          {/* Card 2: Central Dashboard */}
          <Link
            href="/dashboard"
            className="group relative p-7 rounded-3xl bg-neutral-900/60 hover:bg-neutral-900/90 border border-neutral-800 hover:border-emerald-500/50 backdrop-blur-md transition-all duration-300 hover:shadow-2xl hover:shadow-emerald-500/10 flex flex-col justify-between"
          >
            <div>
              <div className="w-14 h-14 rounded-2xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mb-6 group-hover:scale-105 transition-transform">
                <LayoutGrid className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2 group-hover:text-emerald-300 transition-colors flex items-center gap-2">
                Central Dashboard
                <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-emerald-400" />
              </h2>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Host monitor viewing all incoming streams in a dynamic video grid with audio meters,
                instant QR code pairing, and snapshot capture.
              </p>
            </div>

            <div className="mt-8 pt-4 border-t border-neutral-800/80 flex items-center justify-between text-xs text-neutral-500 font-medium">
              <span>
                {activeStreams > 0
                  ? `${activeStreams} active stream${activeStreams === 1 ? "" : "s"}`
                  : "Multi-camera grid"}
              </span>
              <span className="text-emerald-400 group-hover:underline font-semibold">
                Open Dashboard →
              </span>
            </div>
          </Link>
        </div>

        {/* Feature Highlights Footer */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-12 w-full text-left">
          <div className="p-4 rounded-2xl bg-neutral-900/40 border border-neutral-800/50 flex items-start gap-3">
            <Zap className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-semibold text-white">Ultra-Low Latency</h4>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Sub-200ms RTP streaming via WebRTC directly into Python.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-neutral-900/40 border border-neutral-800/50 flex items-start gap-3">
            <Cpu className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-semibold text-white">AI & CV Ready</h4>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Raw NumPy/PyAV frames accessible in FastAPI for vision & audio models.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-neutral-900/40 border border-neutral-800/50 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-semibold text-white">No App Install</h4>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Works in standard mobile Safari on iOS and Chrome on Android.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 max-w-5xl mx-auto w-full pt-8 border-t border-neutral-900 text-center text-xs text-neutral-500">
        DurHack 2026 WebRTC Central Stream Platform
      </footer>

      {/* Settings Modal */}
      <BackendSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}
