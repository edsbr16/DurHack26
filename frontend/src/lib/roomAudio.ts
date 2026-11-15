export type RoomVoice = {id:string; pressure:number[]; frequencies:number[]};
export function createRoomAudio() {
  const context = new AudioContext();
  void context.resume();
  const master = context.createGain();master.gain.value=0;
  const limiter=context.createDynamicsCompressor();
  master.connect(limiter);limiter.connect(context.destination);
  const voices=new Map<string,{osc:OscillatorNode;gain:GainNode}[]>();
  let audible=false,closed=false;
  return {
    enable(){audible=true;void context.resume();},
    update(people:RoomVoice[]){
      if(closed)return;
      const ids=new Set(people.map(p=>p.id));
      for(const [id,group] of voices)if(!ids.has(id)){group.forEach(v=>{v.osc.stop();v.osc.disconnect();v.gain.disconnect();});voices.delete(id);}
      let active=0;
      people.forEach(p=>{
        let group=voices.get(p.id);
        if(!group){group=Array.from({length:4},()=>{const osc=context.createOscillator(),gain=context.createGain();osc.type='sine';gain.gain.value=0;osc.connect(gain);gain.connect(master);osc.start();return{osc,gain};});voices.set(p.id,group);}
        group.forEach((v,i)=>{const pressure=p.pressure[i]||0;if(pressure>0)active++;v.osc.frequency.setTargetAtTime(p.frequencies[i]||261.63,context.currentTime,.06);v.gain.gain.setTargetAtTime(pressure*.25,context.currentTime,.04);});
      });
      master.gain.setTargetAtTime(audible?.22/Math.sqrt(Math.max(1,active)):0,context.currentTime,.08);
    },
    dispose(){if(closed)return;closed=true;voices.forEach(group=>group.forEach(v=>{v.osc.stop();v.osc.disconnect();v.gain.disconnect();}));voices.clear();master.disconnect();limiter.disconnect();void context.close();},
  };
}
