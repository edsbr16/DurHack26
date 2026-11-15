"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {createArtRoom,checkArtRoom,validRoomCode} from "../lib/rooms";
import { GestureCamera } from "./GestureCamera";
import { emptyFingers, type FingerVisual } from "../lib/fingerGestures";
import { ArtworkCanvas } from "./ArtworkCanvas";
import { BackendSettingsModal } from "./BackendSettingsModal";
import { getBackendUrl } from "../lib/config";
import { idleVisual, type ArtworkState, type VisualInputs } from "../lib/artwork";

function Composition() {
  const params = useSearchParams();
  const router = useRouter();
  const room = (params.get("room") || "PUBLIC").trim().toUpperCase();
  const [received, setState] = useState<ArtworkState | null>(null);
  const state = received?.room === room ? received : null;
  const [connection, setConnection] = useState("Connecting");
  const [demo, setDemo] = useState(false);
  const [sound, setSound] = useState(.25);
  const [distance, setDistance] = useState(45);
  const [lux, setLux] = useState(120);
  const [pinch, setPinch] = useState(0);
  const [colour, setColour] = useState("#a561ef");
  const [paused, setPaused] = useState(false);
  const [settings, setSettings] = useState(false);
  const [copied, setCopied] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [notice, setNotice] = useState("");
  const [roomBusy,setRoomBusy]=useState(false);
  const [roomError,setRoomError]=useState("");
  const gestures = useRef<FingerVisual>(emptyFingers());
  const inputs = useRef<VisualInputs>({ ...idleVisual });
  const clock = useRef({ offset: 0, epoch: 0 });
  const canvas = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController;
    async function poll() {
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const started = Date.now() / 1000;
      try {
        const response = await fetch(`${getBackendUrl()}/api/artwork?room=${encodeURIComponent(room)}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const next: ArtworkState = await response.json();
        if (stopped) return;
        clock.current = { offset: next.server_time - (started + Date.now() / 1000) / 2, epoch: next.epoch };
        setState(next); setConnection(next.devices ? "Live sensors" : "Waiting for sensors");
      } catch {
        if (stopped) return;
        setConnection("Backend unavailable"); setState(null);
      } finally {
        clearTimeout(timeout);
        if (!stopped) timer = setTimeout(poll, 500);
      }
    }
    poll();
    return () => { stopped = true; clearTimeout(timer); controller?.abort(); };
  }, [room, settings]);
  useEffect(() => {
    inputs.current = demo ? {
      sound, scale: .65 + 1.75 * (1 - Math.max(0, Math.min(1, (distance - 10) / 110))),
      brightness: .45 + .55 * Math.min(1, Math.log1p(lux) / Math.log(1001)),
      colour: [1, 3, 5].map(i => parseInt(colour.slice(i, i + 2), 16) / 255) as [number, number, number], gesture: pinch,
    } : state?.visual || { ...idleVisual };
  }, [demo, sound, distance, lux, colour, pinch, state]);
  async function createRoom() {
    if(roomBusy)return;setRoomBusy(true);setRoomError('');
    try {router.push(`/room?code=${encodeURIComponent(await createArtRoom())}`);}
    catch(e){setRoomError(e instanceof Error?e.message:'Room backend unavailable');}
    finally{setRoomBusy(false);}
  }
  async function joinRoom() {
    if(roomBusy)return;setRoomBusy(true);setRoomError('');
    try {router.push(`/room?code=${encodeURIComponent(await checkArtRoom(joinCode))}`);}
    catch(e){setRoomError(e instanceof Error?e.message:'Could not check room');}
    finally{setRoomBusy(false);}
  }
  async function copyInvite() {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setNotice("Could not copy. Share the browser address instead."); }
  }
  function capture() {
    try {
      const a = document.createElement("a"); a.download = `natural-composition-${room}-${Date.now()}.png`;
      a.href = canvas.current!.toDataURL("image/png"); a.click(); setNotice("");
    } catch { setNotice("Could not capture the artwork in this browser."); }
  }
  const rows = [
    { title: "Sound", hint: "Ripple strength & fluid movement", value: sound, set: setSound, min: 0, max: 1, step: .01, reading: demo ? `${Math.round(sound * 100)}%` : state?.devices ? `${Math.round(state.raw.sound)} raw` : "—" },
    { title: "Distance", hint: "Close in to expand the pattern", value: distance, set: setDistance, min: 10, max: 120, step: 1, reading: demo ? `${distance} cm` : state?.raw.distanceCm != null ? `${state.raw.distanceCm.toFixed(0)} cm` : "—" },
    { title: "Light", hint: "Ambient brightness", value: lux, set: setLux, min: 0, max: 1000, step: 1, reading: demo ? `${lux} lx` : state?.raw.lux != null ? `${Math.round(state.raw.lux)} lx` : "—" },
    { title: "Gesture", hint: "Pinch to twist the composition", value: pinch, set: setPinch, min: 0, max: 1, step: .01, reading: demo ? `${Math.round(pinch * 100)}%` : `${state?.hands || 0} hands` },
  ];
  return <div className="studio">
    <header className="studio-header">
      <Link href="/" className="studio-brand"><span aria-hidden="true">◌</span> Natural Composition</Link>
      <nav aria-label="Artwork spaces"><Link href="/" aria-current={room === "PUBLIC" ? "page" : undefined}>Public mosaic</Link><button disabled={roomBusy} onClick={createRoom}>{roomBusy?"Connecting…":"Create room ↗"}</button></nav>
      <button className="studio-button" onClick={() => setSettings(true)}>Connection</button>
    </header>
    <main className="studio-main">
      {roomError&&<p role="alert" className="studio-room-error">{roomError}</p>}
      <div className="studio-title"><div><p className="studio-eyebrow">A COLLECTIVE ENVIRONMENTAL INSTRUMENT</p><h1>{room === "PUBLIC" ? "Your corner of the world." : `Composition / ${room}`}</h1></div><p className="studio-intro">Colour becomes atmosphere. Sound becomes movement.<br />A shared artwork, shaped by the spaces we inhabit.</p></div>
      <div className="studio-layout">
        <section className="art-stage" aria-label="Shared artwork">
          <ArtworkCanvas inputs={inputs} clock={clock} paused={paused} canvasRef={canvas} gestureInput={gestures} />
          <div className="art-topline"><span className="art-label">{room === "PUBLIC" ? "PUBLIC COMPOSITION" : `ROOM ${room}`}</span><span className="art-label">{demo ? "LOCAL PREVIEW" : connection.toUpperCase()}</span></div>
          <div className="art-bottomline"><span>{paused ? "Paused on this screen" : demo ? "Explore the controls. This preview is only yours." : "An original image, generated from environmental data."}</span><span>NC / 001</span></div>
        </section>
        <aside className="studio-panel">
          <GestureCamera key={room} room={room} visualRef={gestures} />
          <details className="studio-environment"><summary>Environment & preview controls</summary>
          <div className="studio-panel-head"><span className={`status-dot ${state?.devices && !demo ? "active" : ""}`} /><span aria-live="polite">{demo ? "Simulated inputs" : connection}</span></div>
          <h2>Your environment,<br /><em>translated.</em></h2>
          <p className="studio-muted">{demo ? "Move a slider to discover how an input shapes the image." : "Connected Arduino readings flow into this composition automatically."}</p>
          <label className="demo-switch"><span>Try simulated inputs</span><input type="checkbox" checked={demo} onChange={e => setDemo(e.target.checked)} /></label>
          <div className="input-row"><div><span>Colour</span>{demo ? <input aria-label="Simulated colour" type="color" value={colour} onChange={e => setColour(e.target.value)} /> : <span className="colour-swatch" style={{ background: `rgb(${(state?.visual.colour || idleVisual.colour).map(v => Math.round(v * 255)).join(",")})` }} />}</div><p>The palette of your surroundings</p></div>
          {rows.map(row => <div className="input-row" key={row.title}><div><span>{row.title}</span><strong>{row.reading}</strong></div><p>{row.hint}</p>{demo && <input aria-label={`Simulated ${row.title.toLowerCase()}`} type="range" min={row.min} max={row.max} step={row.step} value={row.value} onChange={e => row.set(+e.target.value)} />}</div>)}
          </details>
        </aside>
      </div>
      <div className="studio-toolbar"><div className="studio-actions"><button className="studio-button primary" onClick={capture}>Capture artwork ↓</button><button className="studio-button" onClick={() => setPaused(p => !p)}>{paused ? "Resume" : "Pause"}</button><button className="studio-button" onClick={copyInvite}>{copied ? "Link copied" : "Invite to canvas ↗"}</button></div><span className="studio-muted">{demo ? "Local preview · not sent to the shared canvas" : `${state?.devices || 0} connected sensor devices · ${room === "PUBLIC" ? "Everyone contributes" : "Room contributions only"}`}</span></div>
      {notice && <p role="alert">{notice}</p>}
      <section className="studio-foot"><div><h2>Make something together.</h2><p className="studio-muted">The public canvas blends everyone’s inputs. Each room has its own composition.</p></div><form onSubmit={e => { e.preventDefault(); void joinRoom(); }}><label htmlFor="join-art-room" className="sr-only">Room code</label><input id="join-art-room" placeholder="Six-character room code" minLength={6} maxLength={6} required value={joinCode} onChange={e => setJoinCode(e.target.value)} /><button className="studio-button" type="submit" disabled={roomBusy||!validRoomCode(joinCode)}>{roomBusy?"Checking…":"Join room →"}</button></form></section>
      <footer className="studio-footer"><span>NATURAL COMPOSITION</span><span>DURHACK 2026 · AN EXPERIMENT IN SHARED PRESENCE</span></footer>
    </main>
    <BackendSettingsModal isOpen={settings} onClose={() => setSettings(false)} />
  </div>;
}
export default function DashboardPage() { return <Suspense fallback={<div className="studio">Opening composition…</div>}><Composition /></Suspense>; }
