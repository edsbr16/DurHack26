"use client";
import { useEffect, useRef, useState } from "react";
import type { VisualInputs } from "../lib/artwork";

// Original procedural image. No camera textures or frame feedback.
const fragment = `
precision highp float;
uniform vec2 resolution;
uniform float time, energy, zoom, light, gesture;
uniform vec3 tint;
void main() {
  vec2 p = (gl_FragCoord.xy / resolution - .5) * vec2(1.5, 1.0);
  p /= zoom;
  float t = time * .16;
  float angle = .3 * sin(t * .35) + gesture * 1.7 * exp(-dot(p,p) * 2.);
  p = mat2(cos(angle),-sin(angle),sin(angle),cos(angle)) * p;
  vec2 q = p;
  for(int i=1; i<5; i++) {
    float f = float(i);
    q += (.12 + energy * .1) / f * vec2(
      sin(q.y * (3. + f) + t * .7 + f),
      cos(q.x * (4. + f) - t * .6));
  }
  float wave = sin(q.x * 13. + q.y * 7. + t);
  float ripple = sin(length(p) * 32. - time * 1.5) * energy;
  float bands = .5 + .5 * sin(wave * 2.3 + q.y * 8. + ripple);
  vec3 a = vec3(.025,.04,.075);
  vec3 b = mix(vec3(.24,.30,.68), tint, .85);
  vec3 c = mix(vec3(.95,.69,.48), tint.brg, .4);
  vec3 colour = mix(a, b, smoothstep(.02,.75,bands));
  colour = mix(colour,c,pow(bands,9.) * .8);
  float line = pow(.5 + .5 * sin(q.x * 60. + q.y * 22. + t), 28.);
  colour += line * .10 * b;
  colour *= (.55 + light * .65);
  colour *= 1. - .25 * smoothstep(.15,.95,length(p * zoom));
  gl_FragColor = vec4(colour,1.);
}`;
export function ArtworkCanvas({ inputs, clock, paused, canvasRef }: {
  inputs: React.RefObject<VisualInputs>;
  clock: React.RefObject<{ offset: number; epoch: number }>;
  paused: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}) {
  const pauseRef = useRef(paused);
  const [error, setError] = useState("");
  useEffect(() => { pauseRef.current = paused; }, [paused]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fallbackEpoch = Date.now() / 1000;
    const gl = canvas.getContext("webgl", { antialias: false, preserveDrawingBuffer: true });
    if (!gl) { setError("WebGL unavailable. Enable graphics acceleration or try another browser."); return; }
    let frame = 0;
    let disposed = false;
    const shaders: WebGLShader[] = [];
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    try {
      const compile = (type: number, source: string) => {
        const shader = gl.createShader(type)!;
        shaders.push(shader);
        gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || "Shader compilation failed");
        return shader;
      };
      program = gl.createProgram()!;
      gl.attachShader(program, compile(gl.VERTEX_SHADER, "attribute vec2 position; void main(){gl_Position=vec4(position,0.,1.);}"));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Artwork shader could not start");
      gl.useProgram(program);
      buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, "position");
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      const uniforms = Object.fromEntries(["resolution","time","energy","zoom","light","gesture","tint"].map(n => [n, gl.getUniformLocation(program!, n)]));
      const current = { ...inputs.current, colour: [...inputs.current.colour] };
      let last = performance.now();
      function draw(now: number) {
        if (disposed) return;
        frame = requestAnimationFrame(draw);
        const dt = Math.min((now - last) / 1000, .1); last = now;
        if (pauseRef.current) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const width = Math.max(1, Math.floor(canvas!.clientWidth * dpr));
        const height = Math.max(1, Math.floor(canvas!.clientHeight * dpr));
        if (canvas!.width !== width || canvas!.height !== height) { canvas!.width = width; canvas!.height = height; }
        gl!.viewport(0, 0, width, height);
        const mix = 1 - Math.exp(-dt * 5);
        for (const k of ["sound", "scale", "brightness", "gesture"] as const) current[k] += (inputs.current[k] - current[k]) * mix;
        current.colour = current.colour.map((v, i) => v + (inputs.current.colour[i] - v) * mix);
        gl!.uniform2f(uniforms.resolution, width, height);
        gl!.uniform1f(uniforms.time, Date.now() / 1000 + clock.current.offset - (clock.current.epoch || fallbackEpoch));
        gl!.uniform1f(uniforms.energy, current.sound);
        gl!.uniform1f(uniforms.zoom, current.scale);
        gl!.uniform1f(uniforms.light, current.brightness);
        gl!.uniform1f(uniforms.gesture, current.gesture);
        gl!.uniform3f(uniforms.tint, current.colour[0], current.colour[1], current.colour[2]);
        gl!.drawArrays(gl!.TRIANGLES, 0, 6);
      }
      frame = requestAnimationFrame(draw);
    } catch (e) { setError(e instanceof Error ? e.message : "Artwork could not start"); }
    const lost = (event: Event) => { event.preventDefault(); setError("Graphics connection lost. Reload to restart the artwork."); };
    canvas.addEventListener("webglcontextlost", lost);
    return () => {
      disposed = true; cancelAnimationFrame(frame);
      canvas.removeEventListener("webglcontextlost", lost);
      shaders.forEach(shader => gl.deleteShader(shader));
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
    };
  }, [canvasRef, clock, inputs]);
  return <><canvas ref={canvasRef} className="composition-canvas" aria-label="Generative artwork responding to environmental sensors" />{error && <div role="alert" className="art-error">{error}</div>}</>;
}
