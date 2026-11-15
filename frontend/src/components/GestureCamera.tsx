"use client";
import { useEffect, useRef, useState } from 'react';
import { HandCameraPublisher } from '../lib/handCamera';
import { FINGERS, analyseFingers, emptyTracking, type FingerTracking, type FingerVisual } from '../lib/fingerGestures';
import { createFingerSynth, type FingerSynth } from '../lib/fingerSynth';

type Session = { publisher:HandCameraPublisher; socket:WebSocket|null; timer:ReturnType<typeof setTimeout>|null; watchdog:ReturnType<typeof setInterval>|null; closed:boolean };
const noteChoices=[['C4',261.63],['D4',293.66],['E4',329.63],['F4',349.23],['G4',392],['A4',440],['B4',493.88],['C5',523.25]] as const;
const connections=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];

export function GestureCamera({visualRef}:{room:string;visualRef:React.RefObject<FingerVisual>}) {
  const video=useRef<HTMLVideoElement|null>(null);
  const overlay=useRef<HTMLCanvasElement|null>(null);
  const tracking=useRef<FingerTracking>(emptyTracking());
  const landmarks=useRef<number[][]|null>(null);
  const lastEvent=useRef(0);
  const synth=useRef<FingerSynth|null>(null);
  const session=useRef<Session|null>(null);
  const notes=useRef<number[]>(FINGERS.map(f=>f.frequency));
  const [summary,setSummary]=useState(emptyTracking);
  const [status,setStatus]=useState('Camera is off');
  const [error,setError]=useState('');
  const [running,setRunning]=useState(false);
  const [starting,setStarting]=useState(false);
  const [test,setTest]=useState(false);
  const [audible,setAudible]=useState(false);
  const [selected,setSelected]=useState<string[]>(FINGERS.map(f=>f.note));

  function apply(value:FingerTracking) {
    const frequency=Math.max(261.63,...value.active.map((on,i)=>on?notes.current[i]:0));
    value.pitch=Math.min(1,Math.max(0,Math.log2(frequency/261.63)));
    tracking.current=value; visualRef.current={pressure:value.pressure,pitch:value.pitch};
    synth.current?.update(value);
  }
  function release() {
    const s=session.current;
    if(s) {s.closed=true;if(s.timer)clearTimeout(s.timer);if(s.watchdog)clearInterval(s.watchdog);s.socket?.close();s.publisher.stop();session.current=null;}
    synth.current?.dispose();synth.current=null;
    landmarks.current=null;tracking.current=emptyTracking();visualRef.current={pressure:[0,0,0,0],pitch:0};
    if(video.current)video.current.srcObject=null;
  }
  useEffect(()=>{
    const sampled=setInterval(()=>{
      const next=tracking.current;
      setSummary(prev=>prev.hand===next.hand && prev.active.every((v,i)=>v===next.active[i]) ? prev : {...next});
    },250);
    return ()=>{
      clearInterval(sampled);
      const s=session.current;
      if(s){s.closed=true;if(s.timer)clearTimeout(s.timer);if(s.watchdog)clearInterval(s.watchdog);s.socket?.close();s.publisher.stop();}
      synth.current?.dispose();
      visualRef.current={pressure:[0,0,0,0],pitch:0};
    };
  },[visualRef]);
  useEffect(()=>{
    let frame=0;
    function draw() {
      frame=requestAnimationFrame(draw);
      const c=overlay.current,v=video.current;if(!c||!v)return;
      const ctx=c.getContext('2d');if(!ctx)return;
      const w=c.clientWidth,h=c.clientHeight,dpr=Math.min(window.devicePixelRatio||1,2);
      if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);}
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
      const lm=landmarks.current;if(!lm||lm.length<21||!v.videoWidth)return;
      const scale=Math.min(w/v.videoWidth,h/v.videoHeight),dw=v.videoWidth*scale,dh=v.videoHeight*scale;
      const pt=(i:number)=>[(w-dw)/2+lm[i][0]*dw,(h-dh)/2+lm[i][1]*dh];
      ctx.lineWidth=1.5;ctx.strokeStyle='#ffffff66';ctx.beginPath();
      connections.forEach(([a,b])=>{const p=pt(a),q=pt(b);ctx.moveTo(p[0],p[1]);ctx.lineTo(q[0],q[1]);});ctx.stroke();
      const thumb=pt(4);ctx.fillStyle='#fff7df';ctx.beginPath();ctx.arc(thumb[0],thumb[1],5,0,Math.PI*2);ctx.fill();
      FINGERS.forEach((finger,i)=>{
        const p=pt(finger.tip),on=tracking.current.active[i];
        ctx.fillStyle=finger.colour;ctx.beginPath();ctx.arc(p[0],p[1],on?7:4,0,Math.PI*2);ctx.fill();
        if(on){ctx.strokeStyle=finger.colour;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(thumb[0],thumb[1]);ctx.lineTo(p[0],p[1]);ctx.stroke();}
      });
    }
    frame=requestAnimationFrame(draw);return()=>cancelAnimationFrame(frame);
  },[]);

  async function start() {
    release();setStarting(true);setTest(false);setError('');setAudible(false);setStatus('Connecting camera…');
    if(!navigator.mediaDevices?.getUserMedia){setError('Camera access needs HTTPS or localhost in a supported browser.');setStarting(false);return;}
    try {
      synth.current=createFingerSynth();synth.current.setNotes(notes.current);
      const publisher=new HandCameraPublisher({
        onTracking:message=>{
          lastEvent.current=Date.now();landmarks.current=message.hand?message.landmarks:null;
          if(message.available===false)setError('Hand tracking is unavailable on the backend. Check MediaPipe installation.');
          apply(analyseFingers(message.hand,message.landmarks,tracking.current));
        },
        onConnectionStateChange:state=>{
          if(session.current?.publisher!==publisher)return;
          if(state==='connected')setStatus('Camera connected · show a hand');
          if(state==='failed'||state==='disconnected'||state==='closed'){apply(emptyTracking());setStatus('Camera disconnected');if(state==='failed')setError('Video connection failed. Stop, then start the camera again.');}
        }});
      const s:Session={publisher,socket:null,timer:null,watchdog:null,closed:false};session.current=s;
      s.watchdog=setInterval(()=>{if(Date.now()-lastEvent.current>700){apply(emptyTracking());landmarks.current=null;}},200);
      const stream=await publisher.start();
      if(s.closed||session.current!==s){publisher.stop();return;}
      if(video.current){video.current.srcObject=stream;await video.current.play();}
      setRunning(true);setStatus('Tracking connected · show your whole hand');
    }catch(e){release();setRunning(false);setError(e instanceof Error?e.message:'Could not start the camera.');setStatus('Camera is off');}
    finally{setStarting(false);}
  }
  function stop(){release();setRunning(false);setStarting(false);setAudible(false);setStatus('Camera is off');}
  function toggleAudio(){
    try{if(!synth.current){synth.current=createFingerSynth();synth.current.setNotes(notes.current);synth.current.update(tracking.current);}synth.current.setEnabled(!audible);setAudible(!audible);}
    catch(e){setError(e instanceof Error?e.message:'Audio unavailable');}
  }
  function changeNote(index:number,note:string){
    notes.current[index]=noteChoices.find(n=>n[0]===note)![1];synth.current?.setNotes(notes.current);
    setSelected(prev=>prev.map((v,i)=>i===index?note:v));apply({...tracking.current});
  }
  function testFinger(index:number,on:boolean){
    const next={...tracking.current,hand:true,active:[...tracking.current.active],pressure:[...tracking.current.pressure]} as FingerTracking;
    next.active[index]=on;next.pressure[index]=on?1:0;apply(next);
  }
  return <section className="gesture-camera" aria-label="Camera and finger instrument">
    <div className="gesture-heading"><div><p>YOUR HANDS, YOUR INSTRUMENT</p><h2>Shape it. Hear it.</h2></div><span className={running?'gesture-connected':''}>{test?'TEST MODE':running?'LIVE':'CAMERA OFF'}</span></div>
    <div className="gesture-video"><video ref={video} autoPlay playsInline muted /><canvas ref={overlay} aria-label="All-finger hand tracking overlay" />{!running&&<div className="gesture-video-empty"><span aria-hidden="true">✧</span><p>{starting?'Connecting…':test?'Test mode · use the finger pads below':'Your camera appears here'}</p><small>Touch a fingertip to your thumb.</small></div>}</div>
    <div className="gesture-camera-actions"><button className="studio-button primary" disabled={starting} onClick={running?stop:start}>{starting?'Connecting…':running?'Stop camera':'Start camera'}</button><button className="studio-button" aria-pressed={audible} onClick={toggleAudio}>{audible?'Mute notes':'Enable notes'}</button></div>
    <p className="gesture-tracking-status" aria-live="polite">{test?'Simulated gestures · local preview':summary.hand?'Hand tracked · touch fingers to your thumb':status}</p>
    <div className="gesture-finger-list">{FINGERS.map((finger,i)=><div key={finger.name} className={summary.active[i]?'finger-active':''} style={{'--finger-colour':finger.colour} as React.CSSProperties}><span className="finger-dot"/><span>{finger.name}<small>{finger.effect}</small></span><label><span className="sr-only">{finger.name} finger note</span><select value={selected[i]} onChange={e=>changeNote(i,e.target.value)}>{noteChoices.map(([note])=><option key={note}>{note}</option>)}</select></label>{test&&<button aria-label={`Test ${finger.name.toLowerCase()} finger`} aria-pressed={summary.active[i]} onClick={()=>testFinger(i,!tracking.current.active[i])}>{summary.active[i]?'Release':'Play'}</button>}</div>)}</div>
    <label className="gesture-test-switch"><input type="checkbox" checked={test} onChange={e=>{stop();setTest(e.target.checked);}}/>Test finger controls without camera</label>
    <p className="gesture-help">Higher notes make finer textures. Combine touches to layer sound and visuals. Notes are off until you enable them.</p>
    <p className="gesture-permission">Starting the camera shares video with your backend for hand tracking. No microphone access is requested.</p>
    {error&&<p className="gesture-error" role="alert">{error}</p>}
  </section>;
}
