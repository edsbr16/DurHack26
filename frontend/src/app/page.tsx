"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBackendUrl } from "../lib/config";

// Unambiguous alphabet — no I/L/O/0/1 so codes read aloud can't be mistyped.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

function LogoMark() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 26 26"
      fill="none"
      aria-hidden="true"
      className="text-clay shrink-0"
    >
      <path
        d="M5 21 C7 12, 13 5, 22 4 C21 13, 14 20, 6 22 M6 22 C9 17, 13 13, 18 10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const STEPS = [
  {
    n: "01",
    t: "Create a room",
    d: "One tap makes a fresh room code and opens the host grid.",
  },
  {
    n: "02",
    t: "Share the link",
    d: "Send the QR or code — phones open it straight in the browser.",
  },
  {
    n: "03",
    t: "Cameras join the grid",
    d: "Every phone becomes a live camera, with pinch tracking built in.",
  },
];

export default function HomePage() {
  const router = useRouter();
  const [joinOpen, setJoinOpen] = useState(false);
  const [code, setCode] = useState("");

  // Live room teaser: camera count + a real snapshot frame from the backend.
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const [snapTick, setSnapTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [healthRes, streamsRes] = await Promise.all([
          fetch(`${getBackendUrl()}/api/health`, { cache: "no-store" }),
          fetch(`${getBackendUrl()}/api/streams`, { cache: "no-store" }),
        ]);
        if (!healthRes.ok || !streamsRes.ok) throw new Error("backend not ok");
        const health = await healthRes.json();
        const streams: { stream_id: string }[] = await streamsRes.json();
        if (cancelled) return;
        setLiveCount(health.active_streams ?? 0);
        setSnapshotId(streams.length > 0 ? streams[0].stream_id : null);
      } catch {
        if (!cancelled) setLiveCount(-1);
      }
    };
    load();
    const iv = setInterval(load, 4000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  // Snapshot refresh cadence — only while a stream is actually up.
  useEffect(() => {
    if (!snapshotId) return;
    const iv = setInterval(() => setSnapTick((t) => t + 1), 2000);
    return () => clearInterval(iv);
  }, [snapshotId]);

  const createRoom = () => {
    router.push(`/dashboard?room=${generateRoomCode()}`);
  };

  const joinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const room = code.trim().toUpperCase();
    router.push(room ? `/stream?room=${room}` : "/stream");
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero band — soft clay tint with paper grain */}
      <div className="bg-clay-tint grain">
        <header className="max-w-4xl mx-auto w-full px-6 pt-7">
          <nav className="flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-2.5">
              <LogoMark />
              <span className="font-display text-xl tracking-tight">Natural Composition</span>
            </Link>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setJoinOpen((o) => !o)}
                aria-expanded={joinOpen}
                className="px-4 py-2 text-sm font-semibold rounded-lg border border-line bg-surface text-ink hover:border-ink/40 transition-colors"
              >
                Join Room
              </button>
              <button
                type="button"
                onClick={createRoom}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-clay text-white hover:bg-clay-deep transition-colors"
              >
                Create Room
              </button>
            </div>
          </nav>
        </header>

        <section className="max-w-4xl mx-auto w-full px-6 pt-12 pb-16 sm:pb-20 flex flex-col">
          <h1 className="font-display text-4xl sm:text-6xl leading-[1.08] tracking-tight max-w-2xl text-wrap-balance">
            One room. Every phone a{" "}
            <span className="relative inline-block italic">
              live&nbsp;camera
              <svg
                className="absolute left-0 -bottom-2 w-full h-2.5 text-clay"
                viewBox="0 0 200 12"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  d="M2 8 C 30 3, 60 10, 100 6 C 140 2, 170 9, 198 5"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
            </span>
            .
          </h1>
          <p className="mt-5 text-base sm:text-lg text-ink-soft leading-relaxed max-w-xl text-pretty">
            Create a room and share the link — each phone that opens it becomes a
            camera in one live grid. Pinch a thumb and finger at the lens and the
            whole room sees it, tracked in real time. No apps, no accounts.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={createRoom}
              className="px-5 py-3 text-sm font-semibold rounded-lg bg-clay text-white hover:bg-clay-deep transition-colors"
            >
              Create Room as Host
            </button>
            <button
              type="button"
              onClick={() => setJoinOpen(true)}
              className="px-5 py-3 text-sm font-semibold rounded-lg border border-line bg-surface text-ink hover:border-ink/40 transition-colors"
            >
              Join Room with a Code
            </button>
          </div>

          {joinOpen && (
            <form
              onSubmit={joinRoom}
              aria-label="Join a room with a code"
              className="mt-5 flex items-center gap-2.5"
            >
              <label htmlFor="room-code" className="text-xs text-ink-soft">
                Room code
              </label>
              <input
                id="room-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. HX4K2M…"
                maxLength={8}
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="characters"
                className="w-44 px-3 py-2 text-sm font-mono uppercase tracking-widest bg-surface border border-line rounded-lg text-ink placeholder:normal-case placeholder:tracking-normal placeholder:text-ink-soft/60 focus:border-clay"
              />
              <button
                type="submit"
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-ink text-paper hover:bg-ink/85 transition-colors"
              >
                Join
              </button>
            </form>
          )}
        </section>
      </div>

      {/* Paper section: live teaser + how it works */}
      <div className="flex-1 max-w-4xl mx-auto w-full px-6 py-14 flex flex-col gap-14">
        <section aria-label="Live room teaser" className="max-w-xl">
          <div className="border border-line bg-surface rounded-xl p-4 flex flex-col sm:flex-row items-center gap-4">
            {snapshotId ? (
              <img
                key={`${snapshotId}-${snapTick}`}
                src={`${getBackendUrl()}/api/stream/${snapshotId}/snapshot.jpg?t=${snapTick}`}
                alt="Live frame from an active room camera"
                width={256}
                height={192}
                loading="lazy"
                className="w-64 aspect-[4/3] object-cover rounded-lg border border-line bg-paper"
              />
            ) : (
              <div className="w-64 aspect-[4/3] rounded-lg border border-line bg-paper flex items-center justify-center text-xs text-ink-soft">
                No frame
              </div>
            )}
            <div className="min-w-0">
              {liveCount === null && (
                <p className="text-sm text-ink-soft">Checking the room…</p>
              )}
              {liveCount === -1 && (
                <p className="text-sm text-ink-soft">Can&apos;t reach the backend right now.</p>
              )}
              {liveCount === 0 && (
                <p className="text-sm text-ink-soft">Nothing live yet — create the first room.</p>
              )}
              {liveCount !== null && liveCount > 0 && (
                <>
                  <p className="text-sm font-semibold tabular-nums">
                    {liveCount} {liveCount === 1 ? "camera" : "cameras"} live right now
                  </p>
                  <p className="text-xs text-ink-soft mt-1 leading-relaxed">
                    A real frame straight from the room — refreshes every couple of seconds.
                  </p>
                </>
              )}
            </div>
          </div>
        </section>

        <section aria-label="How it works" className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-10 max-w-3xl">
          {STEPS.map((s) => (
            <div key={s.n}>
              <span className="font-display text-clay text-xl">{s.n}</span>
              <h2 className="mt-2 text-sm font-semibold">{s.t}</h2>
              <p className="mt-1 text-xs text-ink-soft leading-relaxed">{s.d}</p>
            </div>
          ))}
        </section>
      </div>

      <footer className="max-w-4xl mx-auto w-full px-6 py-8 text-xs text-ink-soft flex justify-between gap-4">
        <span>Natural Composition</span>
        <span>DurHack 2026</span>
      </footer>
    </div>
  );
}
