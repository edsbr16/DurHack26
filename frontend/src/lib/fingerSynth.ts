import { FINGERS, type FingerVisual } from './fingerGestures';
export function createFingerSynth() {
  const context=new AudioContext();
  void context.resume();
  const destination=context.createMediaStreamDestination();
  const master=context.createGain(); master.gain.value=0;
  master.connect(context.destination); master.connect(destination);
  const voices=FINGERS.map(f=>{
    const oscillator=context.createOscillator(); oscillator.type='sine'; oscillator.frequency.value=f.frequency;
    const gain=context.createGain(); gain.gain.value=0;
    oscillator.connect(gain); gain.connect(master); oscillator.start();
    return {oscillator,gain};
  });
  let disposed=false;
  return {
    outputStream:destination.stream,
    setEnabled(enabled:boolean) { if(!disposed) master.gain.setTargetAtTime(enabled ? .18 : 0,context.currentTime,.035); },
    setNotes(frequencies:number[]) { if(!disposed) voices.forEach((v,i)=>v.oscillator.frequency.setTargetAtTime(frequencies[i],context.currentTime,.04)); },
    update(value:FingerVisual) { if(!disposed) voices.forEach((v,i)=>v.gain.gain.setTargetAtTime(value.pressure[i]*.22,context.currentTime,.035)); },
    dispose() { if(disposed)return; disposed=true; voices.forEach(v=>{v.oscillator.stop();v.oscillator.disconnect();v.gain.disconnect();}); master.disconnect();destination.stream.getTracks().forEach(t=>t.stop());void context.close(); },
  };
}
export type FingerSynth = ReturnType<typeof createFingerSynth>;
