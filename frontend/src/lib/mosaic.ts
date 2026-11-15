import type { ArtworkState } from './artwork';
export const MOSAIC_COLUMNS = 96;
export const MOSAIC_ROWS = 64;
export const TILE_COUNT = MOSAIC_COLUMNS * MOSAIC_ROWS;
export const LIVE_TILE = 32 * MOSAIC_COLUMNS + 48;
export type MosaicFeed = { state: ArtworkState | null; offset: number; epoch: number };
export function tileSeed(index: number): number {
  let x = Math.imul(index + 1, 374761393);
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967295;
}
type Colour = [number,number,number];
const palettes: Colour[][] = [
  [[10,31,42],[21,85,96],[69,150,145],[191,211,166],[235,205,142],[196,99,74]],
  [[26,22,49],[69,54,103],[130,92,150],[196,143,161],[234,197,156],[209,125,94]],
  [[14,43,52],[32,94,105],[103,168,169],[224,216,173],[221,158,110],[151,81,68]],
  [[18,37,49],[38,91,111],[99,158,176],[211,217,183],[225,183,116],[173,112,65]],
  [[32,25,48],[89,51,89],[173,99,122],[230,173,151],[231,219,177],[92,146,138]],
  [[10,38,42],[26,91,86],[77,146,111],[184,194,127],[226,210,152],[194,132,83]],
];
const smooth=(x:number)=>{const v=Math.max(0,Math.min(1,x));return v*v*(3-2*v);};
type Scene = {family:number; seed:number; palette:Colour[]; rotation:number; scale:number};
export type MosaicFrame = {from:Scene;to:Scene;blend:number;seconds:number};
function scene(cycle:number):Scene {
  const positive=((cycle%6)+6)%6;
  const seed=tileSeed(cycle+7001);
  return {family:positive,seed,palette:palettes[(positive+Math.floor(seed*3))%palettes.length],rotation:(seed-.5)*1.5,scale:.8+seed*.65};
}
/** New spatial forms every 12 s, with six-second flowing transitions.
 * Each cycle has new parameters, so this isn't a repeated set of static images.
 * Construct once per frame, not once per tile. */
export function createMosaicFrame(seconds:number):MosaicFrame {
  const cycle=Math.floor(seconds/12),phase=seconds-cycle*12;
  return {from:scene(cycle),to:scene(cycle+1),blend:smooth((phase-6)/6),seconds};
}
function field(scene:Scene,x:number,y:number,t:number):number {
  const ca=Math.cos(scene.rotation),sa=Math.sin(scene.rotation);
  const px=(x*ca-y*sa)*scene.scale,py=(x*sa+y*ca)*scene.scale;
  const drift=scene.seed*20;
  const u=px+.18*Math.sin(py*3+t*.23+drift);
  const v=py+.16*Math.cos(px*4-t*.19+drift);
  switch(scene.family) {
    case 0: // Braided currents: streams split, cross and gather.
      return .5+.33*Math.sin(v*9+Math.sin(u*3-t*.4)*2.4+t*.6)+.14*Math.sin(u*8+v*4-t*.5);
    case 1: { // Blooms: independent centres swell and dissolve.
      const a=Math.hypot(u-.55*Math.sin(t*.22+drift),v-.35*Math.cos(t*.17));
      const b=Math.hypot(u+.6*Math.cos(t*.13),v+.45*Math.sin(t*.2+drift));
      return .5+.27*Math.sin(a*15-t*.7)+.22*Math.cos(b*11+t*.5);
    }
    case 2: { // Dunes and a travelling sun: a landscape rather than a vortex.
      const horizon=v+.3*Math.sin(u*2.8+t*.2)+.12*Math.cos(u*7-t*.27);
      const sun=Math.exp(-((u-.55*Math.sin(t*.1))**2+(v+.5)**2)*10);
      return .46+.33*Math.sin(horizon*13+t*.45)+sun*.35;
    }
    case 3: { // Cellular gardens: soft islands, moving gaps and expanding edges.
      const a=Math.hypot(u+.65*Math.sin(t*.18),v-.38*Math.cos(t*.21));
      const b=Math.hypot(u-.7*Math.cos(t*.15+drift),v+.55*Math.sin(t*.14));
      const islands=Math.exp(-a*a*3)+Math.exp(-b*b*4);
      return .16+islands*.56+.20*Math.sin(Math.min(a,b)*16-t*.9);
    }
    case 4: // Woven interference: diamonds become lattices and break apart.
      return .5+.34*Math.sin((u+v)*7+t*.4)*Math.cos((u-v)*9-t*.5)+.14*Math.sin(v*5+t*.35);
    default: // Cloudbanks: broad colour masses stretch into wisps.
      return .5+.23*Math.sin(u*3+t*.28)+.2*Math.cos(v*5+Math.sin(u*4+t*.22)*1.8)+.11*Math.sin(u*9-v*6-t*.5);
  }
}
function sample(scene:Scene,index:number,t:number):Colour {
  const x=((index%MOSAIC_COLUMNS)-48)/32;
  const y=(Math.floor(index/MOSAIC_COLUMNS)-32)/32;
  const seed=tileSeed(index);
  // Individual simulated environments contribute slower local variation.
  const local=.075*Math.sin(t*(.26+seed*.18)+seed*40)+(seed-.5)*.07;
  const position=Math.max(0,Math.min(4.999, (field(scene,x,y,t)+local)*5));
  const low=Math.floor(position),f=position-low;
  const shimmer=.9+.1*Math.sin(t*.5+seed*90);
  return scene.palette[low].map((value,c)=>(value+(scene.palette[low+1][c]-value)*f)*shimmer) as Colour;
}
export function simulatedTile(index:number,seconds:number,frame=createMosaicFrame(seconds)):Colour {
  const a=sample(frame.from,index,seconds);
  if(frame.blend===0)return a.map(Math.round) as Colour;
  const b=sample(frame.to,index,seconds);
  // A spatially staggered dissolve makes tiles transform in waves, not as a slideshow.
  const stagger=(tileSeed(index)-.5)*.35*Math.sin(frame.blend*Math.PI);
  const blend=smooth(frame.blend+stagger);
  return a.map((value,c)=>Math.round(value+(b[c]-value)*blend)) as Colour;
}
export function liveTileResponse(state: ArtworkState, seconds: number) {
  const clamp=(v:number)=>Math.max(0,Math.min(1,v));
  // Use measured raw ranges too: the original 10–100 sound mapping discarded
  // the 0–10 readings this board actually sends. Raw analog counts are not dB.
  const energy=Math.max(state.visual.sound,clamp(state.raw.sound/32));
  const proximity=state.raw.distanceCm==null ? .65 : clamp((120-state.raw.distanceCm)/118);
  const light=state.raw.lux==null ? state.visual.brightness : clamp(Math.log1p(state.raw.lux)/Math.log(1001));
  const pulse=1+.16*energy*Math.sin(seconds*6);
  return {
    size:(.25+.65*proximity)*pulse,
    rotation:state.visual.gesture*.35,
    energy,
    brightness:.06+.94*light,
  };
}
export function liveTileColour(state: ArtworkState, seconds: number): Colour {
  const response=liveTileResponse(state,seconds);
  return state.visual.colour.map(c=>Math.round(Math.max(0,Math.min(255,c*255*response.brightness)))) as Colour;
}
