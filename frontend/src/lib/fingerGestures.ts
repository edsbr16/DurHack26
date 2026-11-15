export const FINGERS = [
  {name:'Index',tip:8,note:'C4',frequency:261.63,effect:'Ripples',colour:'#67b6ad'},
  {name:'Middle',tip:12,note:'E4',frequency:329.63,effect:'Grain',colour:'#d19173'},
  {name:'Ring',tip:16,note:'G4',frequency:392,effect:'Ribbons',colour:'#c4b16c'},
  {name:'Little',tip:20,note:'B4',frequency:493.88,effect:'Sparkles',colour:'#a99aca'},
] as const;
export type FingerVisual = { pressure: [number,number,number,number]; pitch:number };
export const emptyFingers = (): FingerVisual => ({pressure:[0,0,0,0],pitch:0});
export type FingerTracking = FingerVisual & { active:[boolean,boolean,boolean,boolean]; hand:boolean };
export const emptyTracking = (): FingerTracking => ({...emptyFingers(),active:[false,false,false,false],hand:false});
// Match the existing backend/overlay constants; apply the same geometry to every pair.
const ENTER=.20, EXIT=.28;
export function analyseFingers(hand:boolean, landmarks: number[][] | null, previous: FingerTracking): FingerTracking {
  if (!hand || !Array.isArray(landmarks) || landmarks.length<21 || landmarks.some(p=>!Array.isArray(p) || p.length<2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return emptyTracking();
  const distance=(a:number,b:number)=>Math.hypot(landmarks[a][0]-landmarks[b][0],landmarks[a][1]-landmarks[b][1]);
  const scale=distance(0,9);
  if (scale<.0001) return emptyTracking();
  const scores=FINGERS.map(f=>Math.max(0,Math.min(1,(distance(4,f.tip)/scale-.15)/.6)));
  const active=scores.map((s,i)=>s<ENTER || (previous.active[i] && s<EXIT)) as FingerTracking['active'];
  const pressure=scores.map((s,i)=>active[i] ? 1-s : 0) as FingerTracking['pressure'];
  const highest=Math.max(-1,...active.map((on,i)=>on?i:-1));
  return {hand:true,active,pressure,pitch:highest<0?0:highest/3};
}
