import {getBackendWsUrl} from './config';
type Tracking={hand:boolean;landmarks:number[][]|null;available:boolean};
export class HandCameraPublisher {
  private stream:MediaStream|null=null;
  private socket:WebSocket|null=null;
  private timer:ReturnType<typeof setInterval>|null=null;
  private closed=false;
  constructor(private options:{onTracking:(data:Tracking)=>void;onConnectionStateChange:(state:RTCPeerConnectionState)=>void}){}
  async start(){
    this.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480},aspectRatio:{ideal:4/3}},audio:false});
    if(this.closed){this.stream.getTracks().forEach(t=>t.stop());throw new Error('Camera stopped');}
    const video=document.createElement('video');video.muted=true;video.playsInline=true;video.srcObject=this.stream;await video.play();
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
    const ws=new WebSocket(`${getBackendWsUrl()}/api/hand/ws`);this.socket=ws;
    await new Promise<void>((resolve,reject)=>{
      const timeout=setTimeout(()=>{reject(new Error('Hand-tracking connection timed out'));ws.close();},8000);
      ws.onopen=()=>{clearTimeout(timeout);resolve();};
      ws.onerror=()=>{clearTimeout(timeout);reject(new Error('Hand-tracking endpoint unavailable. Update the backend.'));};
      ws.onclose=()=>{clearTimeout(timeout);reject(new Error('Hand-tracking endpoint closed. Update the backend.'));};
    });
    if(this.closed){ws.close();throw new Error('Camera stopped');}
    let pending=false,last=Date.now();
    ws.onmessage=e=>{try{const data=JSON.parse(e.data);pending=false;if(data.event==='tracking')this.options.onTracking(data);}catch{/* Ignore malformed packets. */}};
    ws.onclose=()=>{if(!this.closed)this.options.onConnectionStateChange('disconnected');};
    this.options.onConnectionStateChange('connected');
    this.timer=setInterval(()=>{
      if(this.closed||ws.readyState!==WebSocket.OPEN||video.readyState<2)return;
      if(pending){if(Date.now()-last>5000)ws.close();return;}
      canvas.getContext('2d')?.drawImage(video,0,0,640,480);pending=true;last=Date.now();
      ws.send(JSON.stringify({jpeg:canvas.toDataURL('image/jpeg',.72).split(',')[1]}));
    },160);
    return this.stream;
  }
  stop(){this.closed=true;if(this.timer)clearInterval(this.timer);this.socket?.close();this.stream?.getTracks().forEach(t=>t.stop());}
}
