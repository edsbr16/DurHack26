"use client";
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { MosaicCanvas } from './MosaicCanvas';
import { BackendSettingsModal } from './BackendSettingsModal';
import { getBackendUrl } from '../lib/config';
import { TILE_COUNT, type MosaicFeed } from '../lib/mosaic';
import {createArtRoom,checkArtRoom,validRoomCode} from '../lib/rooms';
import type { ArtworkState } from '../lib/artwork';

function MosaicContent() {
  const router = useRouter();
  const params = useSearchParams();
  const room = (params.get('room') || 'PUBLIC').trim().toUpperCase();
  const [populated, setPopulated] = useState(true);
  const [paused, setPaused] = useState(false);
  const [locate, setLocate] = useState(false);
  const [settings, setSettings] = useState(false);
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [code, setCode] = useState('');
  const [roomBusy, setRoomBusy] = useState(false);
  const [roomError, setRoomError] = useState('');
  const [state, setState] = useState<ArtworkState | null>(null);
  const [status, setStatus] = useState('Connecting to live inputs');
  const [notice, setNotice] = useState('');
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const feed = useRef<MosaicFeed>({state:null, offset:0, epoch:1794700800});
  const liveState = state?.room === room ? state : null;
  const hasLive = !!liveState?.devices;
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let request: AbortController;
    async function refresh() {
      request = new AbortController();
      const timeout = setTimeout(() => request.abort(),6000);
      const started = Date.now()/1000;
      try {
        const response = await fetch(`${getBackendUrl()}/api/artwork?room=${encodeURIComponent(room)}`, {cache:'no-store', signal:request.signal});
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        const next: ArtworkState = await response.json();
        if (disposed) return;
        if (!next.visual || !Array.isArray(next.visual.colour) || next.room !== room) throw new Error('Unexpected artwork response');
        feed.current = {state:next, offset:next.server_time-(started+Date.now()/1000)/2, epoch:next.epoch};
        setState(next); setStatus(next.devices && next.received_at != null ? `Live reading · ${Math.max(0,next.server_time-next.received_at).toFixed(1)}s old` : 'Waiting for live sensors');
      } catch (err) {
        if (disposed) return;
        feed.current = {...feed.current,state:null}; setState(null);
        setStatus(err instanceof Error && err.message.startsWith('API') ? err.message : 'Live backend unavailable');
      } finally {
        clearTimeout(timeout);
        if (!disposed) timer = setTimeout(refresh,750);
      }
    }
    refresh();
    return () => { disposed=true; clearTimeout(timer); request?.abort(); };
  }, [room, settings]);
  function capture() {
    try {
      const link = document.createElement('a');
      link.download = `natural-composition-mosaic-${room}-${Date.now()}.png`;
      link.href=canvas.current!.toDataURL('image/png'); link.click(); setNotice('');
    } catch { setNotice('Could not capture this canvas. Try another browser.'); }
  }
  async function createRoom() {
    setRoomBusy(true); setRoomError('');
    try {
      router.push(`/room?code=${encodeURIComponent(await createArtRoom())}`);
    } catch(e) {setRoomError(e instanceof Error?e.message:'Room backend unavailable');}
    finally {setRoomBusy(false);}
  }
  async function joinRoom(){
    if(roomBusy)return;setRoomBusy(true);setRoomError('');
    try{router.push(`/room?code=${encodeURIComponent(await checkArtRoom(code))}`);}
    catch(e){setRoomError(e instanceof Error?e.message:'Could not check room');}
    finally{setRoomBusy(false);}
  }
  return <main className="mosaic-home">
    <MosaicCanvas canvasRef={canvas} feed={feed} populated={populated} paused={paused} locate={locate} />
    <div className="mosaic-top-shade" aria-hidden="true" />
    <div className="mosaic-bottom-shade" aria-hidden="true" />
    <header className="mosaic-header">
      <Link className="mosaic-brand" href="/"><span className="mosaic-mark" aria-hidden="true"><i/><i/><i/><i/></span><span>Natural<br />Composition</span></Link>
      <div className="mosaic-space"><span className="mosaic-live-dot" />{room === 'PUBLIC' ? 'THE PUBLIC MOSAIC' : `ROOM / ${room}`}</div>
      <nav aria-label="Mosaic navigation">
        <Link className="mosaic-studio-link" href="/dashboard">Your square ↗</Link>
        <button className="mosaic-nav-button" onClick={() => setRoomsOpen(true)}>Rooms <span aria-hidden="true">＋</span></button>
      </nav>
    </header>
    <section className="mosaic-caption" aria-label="About this composition">
      <p className="mosaic-kicker"><span>COMPOSITION / 001</span><span className="mosaic-kicker-line" />{paused ? 'PAUSED ON THIS SCREEN' : 'CONTINUOUSLY EVOLVING'}</p>
      <h1>A little of <em>everywhere.</em></h1>
      <p className="mosaic-description">Every environment, a pixel.<br />Together, a world that never stands still.</p>
      <div className="mosaic-legend"><span><i className={hasLive ? 'legend-live' : 'legend-idle'} />{hasLive ? `${liveState!.devices} real sensor${liveState!.devices === 1 ? '' : 's'} → 1 live tile` : 'No live sensor connected'}</span><span><i className="legend-demo" />{populated ? `${(TILE_COUNT-(hasLive ? 1 : 0)).toLocaleString()} simulated tiles` : 'Demo population off'}</span></div>
    </section>
    <aside className="mosaic-console" aria-label="Mosaic controls">
      <div className="mosaic-console-title"><span className={hasLive ? 'sensor-online' : 'sensor-waiting'} /> <span aria-live="polite">{status}</span><button aria-label="Backend connection settings" title="Backend connection settings" onClick={() => setSettings(true)}>⚙</button></div>
      <label className="mosaic-population"><span>Demo population<small>Simulates a crowd. Your live tile stays real.</small></span><input type="checkbox" checked={populated} onChange={e => setPopulated(e.target.checked)} /><span className="mosaic-switch" aria-hidden="true" /></label>
      {hasLive && <div className="mosaic-sensor-values"><span>Sound (raw) <b>{Math.round(liveState!.raw.sound)}</b></span><span>Distance <b>{liveState!.raw.distanceCm == null ? '—' : `${Math.round(liveState!.raw.distanceCm)} cm`}</b></span><span>Light <b>{liveState!.raw.lux == null ? '—' : `${Math.round(liveState!.raw.lux)} lx`}</b></span></div>}
      <div className="mosaic-tools"><button onClick={() => setPaused(v => !v)}>{paused ? '▶ Resume' : 'Ⅱ Pause'}</button><button disabled={!hasLive} onClick={() => setLocate(v => !v)} aria-pressed={locate}>{locate ? 'Hide marker' : 'Find live tile'}</button><button onClick={capture}>Capture ↓</button></div>
      {notice && <p className="mosaic-notice" role="alert">{notice}</p>}
    </aside>
    <footer className="mosaic-footer"><span>AN ARTWORK MADE OF US</span><span>{populated ? 'DEMO DATA IS GENERATED LOCALLY · NO CAMERA IMAGERY' : 'LIVE SENSOR DATA ONLY'}</span><span>DURHACK / 2026</span></footer>
    {roomsOpen && <div className="mosaic-room-backdrop" onClick={e => {if(e.target===e.currentTarget)setRoomsOpen(false);}}><section role="dialog" aria-modal="true" aria-labelledby="mosaic-room-title" className="mosaic-room-dialog"><button className="mosaic-close" aria-label="Close rooms" onClick={() => setRoomsOpen(false)}>×</button><p className="mosaic-kicker">A SPACE TO CREATE TOGETHER</p><h2 id="mosaic-room-title">Your own corner<br />of the mosaic.</h2><p>Create a room, share its code, and shape one artwork together. Your camera preview stays in your corner.</p><button className="mosaic-room-create" disabled={roomBusy} onClick={createRoom}>{roomBusy?'Creating…':'Create a room ↗'}</button><form onSubmit={e => {e.preventDefault();void joinRoom();}}><label htmlFor="mosaic-room-code">Have a room code?</label><div><input id="mosaic-room-code" minLength={6} maxLength={6} required placeholder="Six-character code" value={code} onChange={e=>setCode(e.target.value)} /><button type="submit" disabled={roomBusy||!validRoomCode(code)}>{roomBusy?'Checking…':'Join →'}</button></div></form>{roomError&&<p role="alert">{roomError}</p>}<Link href="/" onClick={() => setRoomsOpen(false)}>Back to the public mosaic</Link></section></div>}
    <BackendSettingsModal isOpen={settings} onClose={() => setSettings(false)} />
  </main>;
}
export default function MosaicHome() { return <Suspense fallback={<div className="mosaic-home" />}><MosaicContent /></Suspense>; }
