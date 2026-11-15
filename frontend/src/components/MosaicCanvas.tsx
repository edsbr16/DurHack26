"use client";
import { useEffect, useRef } from 'react';
import { LIVE_TILE, MOSAIC_COLUMNS as COLS, MOSAIC_ROWS as ROWS, TILE_COUNT, tileSeed, createMosaicFrame, simulatedTile, liveTileColour, liveTileResponse, type MosaicFeed } from '../lib/mosaic';
export function MosaicCanvas({ canvasRef, feed, populated, paused, locate }: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  feed: React.RefObject<MosaicFeed>;
  populated: boolean; paused: boolean; locate: boolean;
}) {
  const options = useRef({ populated, paused, locate });
  useEffect(() => { options.current = { populated, paused, locate }; }, [populated, paused, locate]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let frame = 0, previous = -Infinity;
    const seeds = Array.from({length:TILE_COUNT}, (_,i) => tileSeed(i));
    const previousColours = new Map<number, number[]>();
    function draw(now: number) {
      frame = requestAnimationFrame(draw);
      if (options.current.paused || now - previous < 32) return;
      previous = now;
      const width = canvas!.clientWidth, height = canvas!.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      if (canvas!.width !== Math.round(width * dpr) || canvas!.height !== Math.round(height * dpr)) {
        canvas!.width = Math.round(width * dpr); canvas!.height = Math.round(height * dpr);
      }
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.fillStyle = '#111f25'; ctx!.fillRect(0,0,width,height);
      const cell = Math.max(width / COLS, height / ROWS);
      const left = (width - cell * COLS) / 2, top = (height - cell * ROWS) / 2;
      const seconds = (Date.now()/1000 + feed.current.offset - feed.current.epoch);
      const evolution = createMosaicFrame(seconds);
      const state = feed.current.state;
      const live = !!state && state.devices > 0;
      const response = live ? liveTileResponse(state!,seconds) : null;
      for (let i=0; i<TILE_COUNT; i++) {
        const col = i % COLS, row = Math.floor(i / COLS);
        const x = left + (col + .5) * cell, y = top + (row + .5) * cell;
        if (x < -cell || x > width + cell || y < -cell || y > height + cell) continue;
        const isLive = i === LIVE_TILE && live;
        const target = isLive ? liveTileColour(state!,seconds) : options.current.populated ? simulatedTile(i,seconds,evolution) : [24,39,45];
        const colour = !isLive && !options.current.populated ? target : previousColours.get(i) || target;
        for (let j=0; j<3; j++) colour[j] += (target[j] - colour[j]) * .13;
        previousColours.set(i, colour);
        const seed = seeds[i];
        const size = cell * (.85 + seed * .075) * (isLive ? response!.size : options.current.populated ? 1 + .035 * Math.sin(seconds*.8+seed*17) : 1);
        ctx!.save(); ctx!.translate(x,y);
        ctx!.rotate((seed - .5) * .095 + (isLive ? response!.rotation : options.current.populated ? .025*Math.sin(seconds*.5+seed*9) : 0));
        ctx!.fillStyle = `rgb(${colour.map(Math.round).join(',')})`;
        ctx!.fillRect(-size/2,-size/2,size,size);
        ctx!.fillStyle = 'rgba(255,255,240,.085)'; ctx!.fillRect(-size/2,-size/2,size,Math.max(.6,cell*.045));
        ctx!.fillStyle = 'rgba(0,0,0,.12)'; ctx!.fillRect(-size/2,size/2-1,size,1);
        // A tactile glint, with no external texture or image source.
        ctx!.fillStyle = `rgba(255,255,235,${seed * .065})`;
        ctx!.fillRect(-size*.3,-size*.25,size*.38,size*.5);
        ctx!.restore();
      }
      if (live) {
        const x = left + (48 + .5) * cell, y = top + (32 + .5) * cell;
        const radius = options.current.locate ? Math.max(48,cell*4) : cell*.85;
        ctx!.strokeStyle = options.current.locate ? '#fff9df' : 'rgba(255,255,240,.7)';
        ctx!.lineWidth = options.current.locate ? 1.5 : .8;
        ctx!.strokeRect(x-radius,y-radius,radius*2,radius*2);
        if (options.current.locate) {
          ctx!.fillStyle = '#101d25e6'; ctx!.fillRect(x-78,y-radius-39,156,27);
          ctx!.fillStyle = '#fff7df'; ctx!.font = '10px system-ui'; ctx!.textAlign='center';
          ctx!.fillText(state!.devices === 1 ? 'YOUR LIVE SENSOR' : 'COMBINED LIVE INPUT',x,y-radius-22);
          // Magnify the actual response, not a fixed solid-colour replacement.
          ctx!.fillStyle='#0b1d24';ctx!.fillRect(x-radius+1,y-radius+1,radius*2-2,radius*2-2);
          const c=previousColours.get(LIVE_TILE)||liveTileColour(state!,seconds);
          const side=(radius*2-12)*response!.size;
          ctx!.save();ctx!.translate(x,y);ctx!.rotate(response!.rotation);
          ctx!.fillStyle=`rgb(${c.map(Math.round).join(',')})`;
          ctx!.fillRect(-side/2,-side/2,side,side);
          ctx!.fillStyle='rgba(255,255,240,.15)';ctx!.fillRect(-side/2,-side/2,side,2);
          if(response!.energy>.01){
            ctx!.strokeStyle=`rgba(245,239,210,${response!.energy*.8})`;
            ctx!.lineWidth=1+response!.energy*2;
            ctx!.beginPath();ctx!.arc(0,0,radius*(.45+.4*(.5+.5*Math.sin(seconds*6))),0,Math.PI*2);ctx!.stroke();
          }
          ctx!.restore();
        }
      }
      const vignette = ctx!.createRadialGradient(width/2,height/2,Math.min(width,height)*.2,width/2,height/2,Math.max(width,height)*.8);
      vignette.addColorStop(0,'#0000'); vignette.addColorStop(1,'#04101577');
      ctx!.fillStyle=vignette; ctx!.fillRect(0,0,width,height);
    }
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [canvasRef, feed]);
  return <canvas ref={canvasRef} className="mosaic-canvas" aria-label="Living mosaic. One live sensor tile among explicitly simulated participants." />;
}
