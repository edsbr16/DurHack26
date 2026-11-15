"use client";
import {Suspense,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {ArtworkCanvas} from './ArtworkCanvas';
import {ShareQr} from './ShareQr';
import {getBackendUrl,getBackendWsUrl} from '../lib/config';
import {idleVisual,type ArtworkState,type VisualInputs} from '../lib/artwork';
import {emptyFingers,FINGERS,type FingerVisual} from '../lib/fingerGestures';
import {createRoomAudio,type RoomVoice} from '../lib/roomAudio';

type SensorSettings={source:'all'|'room'|'off';enabled:Record<string,boolean>};
type RoomState={sensor_settings:SensorSettings;code:string;epoch:number;server_time:number;participants:RoomVoice[];fingers:FingerVisual;environment:ArtworkState};
const scale=['C','D','E','G','A'];
function Room() {
  const params=useSearchParams();const code=(params.get('code')||'').trim().toUpperCase();
  const [state,setState]=useState<RoomState|null>(null),[status,setStatus]=useState('Joining room…'),[error,setError]=useState('');
  const [running,setRunning]=useState(false),[starting,setStarting]=useState(false),[listen,setListen]=useState(false),[copied,setCopied]=useState(false);
  const [qrOpen,setQrOpen]=useState(false);
  const [notes,setNotes]=useState([0,2,3,4]),[octave,setOctave]=useState(0),[pressed,setPressed]=useState([false,false,false,false]);
  const [ownPressure,setOwnPressure]=useState<number[]>([0,0,0,0]);
  const [online,setOnline]=useState(false);
  const [largeCamera,setLargeCamera]=useState(false),[handFound,setHandFound]=useState(false);
  const video=useRef<HTMLVideoElement|null>(null),overlay=useRef<HTMLCanvasElement|null>(null),canvas=useRef<HTMLCanvasElement|null>(null);
  const socket=useRef<WebSocket|null>(null),media=useRef<MediaStream|null>(null),capture=useRef<HTMLCanvasElement|null>(null);
  const audio=useRef<ReturnType<typeof createRoomAudio>|null>(null),people=useRef<RoomVoice[]>([]);
  const fingers=useRef(emptyFingers()),inputs=useRef<VisualInputs>({...idleVisual}),clock=useRef({offset:0,epoch:0});
  const choices=useRef({notes,octave,pressed});
  const cameraGeneration=useRef(0);
  useEffect(()=>{choices.current={notes,octave,pressed};},[notes,octave,pressed]);
  useEffect(()=>{
    let stopped=false,retry:ReturnType<typeof setTimeout>,lastFrame=0,lastSnapshot=0,pending=false;
    let current:WebSocket|null=null;
    const controller=new AbortController();
    function silence(){people.current=[];audio.current?.update([]);fingers.current=emptyFingers();setOwnPressure([0,0,0,0]);setOnline(false);}
    async function connect(){
      if(!/^[A-HJ-NP-Z2-9]{6}$/.test(code)){setError('Enter a valid six-character room code from the home page.');setStatus('Room code needed');return;}
      setStatus('Joining room…');
      try{
        const response=await fetch(`${getBackendUrl()}/api/rooms/join`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code}),signal:controller.signal});
        const joined=await response.json();
        if(!response.ok)throw new Error(joined.detail||'Could not join room');
        if(stopped)return;
        const ws=new WebSocket(`${getBackendWsUrl()}/api/rooms/${code}/ws`);current=ws;socket.current=ws;
        ws.onopen=()=>{lastSnapshot=Date.now();if(stopped){ws.close();return;}ws.send(JSON.stringify({token:joined.token}));setStatus('Connected · make something together');setError('');setOnline(true);};
        ws.onmessage=e=>{
          if(stopped)return;
          try{
            const data=JSON.parse(e.data);
            if(data.event==='room_state'){
              lastSnapshot=Date.now();setStatus('Connected · make something together');setState(data);people.current=data.participants;audio.current?.update(data.participants);
              fingers.current=data.fingers;clock.current={offset:data.server_time-Date.now()/1000,epoch:data.epoch};
              const visual=data.environment.visual;
              inputs.current={...visual,sound:data.sensor_settings?.enabled.sound===false?0:Math.max(visual.sound,Math.min(1,data.environment.raw.sound/32))};
            } else if(data.event==='tracking'){
              pending=false;setOwnPressure(data.pressure);setHandFound(data.hand);
              if(data.available===false)setError('Hand tracking is unavailable on the backend. Use the finger pads below.');
              const c=overlay.current,v=video.current;if(!c||!v)return;
              const ctx=c.getContext('2d');if(!ctx)return;
              c.width=640;c.height=480;ctx.clearRect(0,0,640,480);
              if(data.hand&&data.landmarks){const lm=data.landmarks;FINGERS.forEach((f,i)=>{const a=lm[4],b=lm[f.tip];ctx.strokeStyle=f.colour;ctx.fillStyle=f.colour;ctx.lineWidth=3;ctx.beginPath();ctx.arc(b[0]*640,b[1]*480,data.pressure[i]>0?8:4,0,Math.PI*2);ctx.fill();if(data.pressure[i]>0){ctx.beginPath();ctx.moveTo(a[0]*640,a[1]*480);ctx.lineTo(b[0]*640,b[1]*480);ctx.stroke();}});}
            }
          }catch{/* Ignore incomplete messages. */}
        };
        ws.onerror=()=>ws.close();
        ws.onclose=()=>{if(stopped)return;silence();pending=false;setStatus('Connection lost · reconnecting…');retry=setTimeout(connect,2000);};
      }catch(e){if(stopped)return;silence();setStatus('Could not join room');setError(e instanceof Error?e.message:'Room backend unavailable');}
    }
    void connect();
    const tick=setInterval(()=>{
      const ws=socket.current;if(!ws||ws.readyState!==WebSocket.OPEN)return;
      if(Date.now()-lastSnapshot>1800){audio.current?.update([]);fingers.current=emptyFingers();setStatus('Waiting for room updates…');}
      if(Date.now()-lastSnapshot>8000){ws.close();return;}
      const selected=choices.current;
      if(media.current&&video.current?.readyState&&video.current.readyState>=2){
        if(pending&&Date.now()-lastFrame<2000)return;
        if(ws.bufferedAmount>150000)return;
        const c=capture.current||(capture.current=document.createElement('canvas'));c.width=640;c.height=480;
        c.getContext('2d')?.drawImage(video.current,0,0,640,480);
        const jpeg=c.toDataURL('image/jpeg',.72).split(',')[1];pending=true;lastFrame=Date.now();
        ws.send(JSON.stringify({event:'frame',jpeg,notes:selected.notes,octave:selected.octave}));
      }else{
        pending=false;
        ws.send(JSON.stringify({event:'input',pressure:selected.pressed.map(v=>v?1:0),notes:selected.notes,octave:selected.octave}));
      }
    },160);
    return()=>{stopped=true;controller.abort();clearTimeout(retry);clearInterval(tick);current?.close();socket.current=null;audio.current?.update([]);};
  },[code]);
  useEffect(()=>()=>{cameraGeneration.current++;media.current?.getTracks().forEach(t=>t.stop());audio.current?.dispose();},[]);
  async function startCamera(){
    const generation=++cameraGeneration.current;setStarting(true);setPressed([false,false,false,false]);setError('');
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera needs HTTPS or localhost. Open this room on your phone using a secure frontend URL.');
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480},aspectRatio:{ideal:4/3}},audio:false});
      if(generation!==cameraGeneration.current){stream.getTracks().forEach(t=>t.stop());return;}
      media.current=stream;if(video.current){video.current.srcObject=stream;await video.current.play();}setRunning(true);
    }catch(e){media.current?.getTracks().forEach(t=>t.stop());media.current=null;setError(e instanceof Error?e.message:'Camera unavailable');}
    finally{if(generation===cameraGeneration.current)setStarting(false);}
  }
  function stopCamera(){cameraGeneration.current++;media.current?.getTracks().forEach(t=>t.stop());media.current=null;if(video.current)video.current.srcObject=null;setRunning(false);setStarting(false);setOwnPressure([0,0,0,0]);overlay.current?.getContext('2d')?.clearRect(0,0,640,480);}
  function toggleSound(){try{if(listen){audio.current?.dispose();audio.current=null;setListen(false);}else{audio.current=createRoomAudio();audio.current.enable();audio.current.update(people.current);setListen(true);}}catch{setError('Could not start audio. Try again in another browser.');}}
  async function invite(){try{await navigator.clipboard.writeText(window.location.href);setCopied(true);setTimeout(()=>setCopied(false),2000);}catch{setError(`Share room code ${code} or the address in your browser.`);}}
  function save(){try{const a=document.createElement('a');a.download=`room-${code}-${Date.now()}.png`;a.href=canvas.current!.toDataURL('image/png');a.click();}catch{setError('Capture unavailable in this browser.');}}
  return <main className="room-stage">
    <ArtworkCanvas inputs={inputs} clock={clock} paused={false} canvasRef={canvas} gestureInput={fingers}/>
    <header className="room-header"><Link href="/">← Leave room</Link><div><span>SHARED COMPOSITION</span><strong>{code}</strong></div><div className="room-header-actions"><button onClick={invite}>{copied?'Copied!':'Copy invite ↗'}</button><button onClick={()=>setQrOpen(true)}>QR code ⧉</button></div></header>
    <section className="room-presence"><span className={online?'room-online':''}/><p>{status}<small>{online?`${state?.participants.length||1} participant${state?.participants.length===1?'':'s'} · ${state?.environment.devices||0} connected sensors`:'Your notes are silent while disconnected'}</small></p></section>
    <section className="room-sensors" aria-label="Shared sensor controls"><details><summary>Sensors · {state?.environment.devices||0} connected</summary><label>Source<select aria-label="Room sensor source" disabled={!online} value={state?.sensor_settings?.source||'all'} onChange={e=>socket.current?.send(JSON.stringify({event:'sensors',source:e.target.value}))}><option value="all">All connected sensors</option><option value="room">Assigned to this room</option><option value="off">Sensors off</option></select></label><p>Shared setting · changes apply to everyone in this room.</p>{['sound','distance','light','colour'].map(key=><label key={key}><input type="checkbox" disabled={!online} checked={state?.sensor_settings?.enabled[key]??true} onChange={e=>socket.current?.send(JSON.stringify({event:'sensors',enabled:{[key]:e.target.checked}}))}/>{key}</label>)}<p>Sound {Math.round(state?.environment.raw.sound||0)} raw · Distance {state?.environment.raw.distanceCm?.toFixed(0)??'—'} cm · Light {state?.environment.raw.lux?.toFixed(0)??'—'} lx</p></details></section>
    <div className="room-actions"><button onClick={toggleSound} aria-pressed={listen}>{listen?'Mute room':'Listen to room ♫'}</button><button onClick={save}>Capture artwork ↓</button></div>
    <aside className={`room-self${largeCamera?' room-self-expanded':''}`} aria-label="Your camera and instrument">
      <div className="room-self-heading"><strong>Your corner</strong><button onClick={()=>setLargeCamera(v=>!v)} aria-pressed={largeCamera}>{largeCamera?'Smaller camera':'Enlarge camera'}</button></div>
      <div className="room-local-video"><video ref={video} autoPlay playsInline muted/><canvas ref={overlay}/>{!running&&<div><span>✧</span><p>{starting?'Opening camera…':'Your camera, your contribution.'}</p><small>Pinch each finger to your thumb.</small></div>}</div>
      <div className="room-camera-actions"><button disabled={starting||!online} onClick={running?stopCamera:startCamera}>{running?'Stop camera':starting?'Opening…':'Start camera'}</button><label>Register<select aria-label="Musical register" value={octave} onChange={e=>setOctave(+e.target.value)}><option value={-1}>Low</option><option value={0}>Middle</option><option value={1}>High</option></select></label></div>
      <p className="room-tracking-hint" aria-live="polite">{running?(handFound?'Hand tracked · touch a fingertip to your thumb':'Show your whole hand · keep wrist and fingertips in view'):'Camera is off · you can also use the finger pads'}</p><details><summary>Finger notes & pads</summary><p>Touch a finger to your thumb, or hold a pad with the camera off. Everyone plays C major pentatonic.</p><div className="room-pads">{FINGERS.map((f,i)=><div key={f.name}><button disabled={running||!online} className={(running?ownPressure[i]>0:pressed[i])?'active':''} style={{'--finger-colour':f.colour} as React.CSSProperties} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);setPressed(p=>p.map((v,j)=>j===i?true:v));}} onPointerUp={()=>setPressed(p=>p.map((v,j)=>j===i?false:v))} onPointerCancel={()=>setPressed(p=>p.map((v,j)=>j===i?false:v))} onLostPointerCapture={()=>setPressed(p=>p.map((v,j)=>j===i?false:v))} onKeyDown={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();setPressed(p=>p.map((v,j)=>j===i?true:v));}}} onKeyUp={()=>setPressed(p=>p.map((v,j)=>j===i?false:v))} onBlur={()=>setPressed(p=>p.map((v,j)=>j===i?false:v))}>{f.name}</button><select aria-label={`${f.name} room note`} value={notes[i]} onChange={e=>setNotes(p=>p.map((v,j)=>i===j?+e.target.value:v))}>{scale.map((n,j)=><option key={n} value={j}>{n}</option>)}</select></div>)}</div></details>
      <p className="room-privacy">Camera frames go to your backend for hand tracking. Other participants receive only gesture values and musical notes. No microphone audio is sent.</p>
    </aside>
    {qrOpen&&<div className="room-qr-backdrop" onClick={e=>{if(e.target===e.currentTarget)setQrOpen(false);}}><section role="dialog" aria-modal="true" aria-labelledby="room-qr-title" className="room-qr-dialog"><button className="room-qr-close" aria-label="Close QR code" onClick={()=>setQrOpen(false)}>×</button><p className="room-qr-kicker">SCAN TO JOIN · ROOM {code}</p><div className="room-qr-frame"><ShareQr size={216} level="M" title={`Join room ${code}`}/></div><h2 id="room-qr-title">Point a phone camera at the code.</h2><p className="room-qr-hint">It opens this room — code <strong>{code}</strong>. No app needed.</p></section></div>}
    {error&&<div className="room-error" role="alert">{error}<Link href="/">Back to home</Link></div>}
  </main>;
}
export default function RoomStudio(){return <Suspense fallback={<main className="room-stage">Opening room…</main>}><Room/></Suspense>;}
