"use client";
import { useEffect, useRef, useState } from "react";
import type { FingerVisual } from "../lib/fingerGestures";
import type { VisualInputs } from "../lib/artwork";

// Original procedural image. No camera textures or frame feedback.
// A shared seed picks one of three pattern families (flow, rings, weave) and
// its constants. The family is derived in JavaScript with exact float64 math,
// so every device picks the same family from the same seed; the shader only
// consumes the result. pattern = (family, variation1, variation2).
const fragment = `
precision highp float;
uniform vec2 resolution;
uniform float time, energy, zoom, light, gesture;
uniform vec3 tint;
uniform vec3 pattern;
uniform vec4 fingers;
uniform float notePitch;
float grain(vec2 g) { return fract(sin(dot(floor(g), vec2(12.9898,78.233))) * 43758.5453); }
vec3 base() { return mix(vec3(.24,.30,.68), tint, .85); }
vec3 palette(float bands, float glow) {
  vec3 colour = mix(vec3(.025,.04,.075), base(), smoothstep(.02,.75,bands));
  return mix(colour, mix(vec3(.95,.69,.48), tint.brg, .4), pow(bands, 9.) * glow);
}
vec3 flow(vec2 p, float t, float v, float w) {
  vec2 q = p;
  for(int i=1; i<5; i++) {
    float f = float(i);
    q += (.12 + energy * .1) / f * vec2(
      sin(q.y * (2.5 + w * 2.5 + f) + t * .7 + f),
      cos(q.x * (3.5 + v * 2.5 + f) - t * .6));
  }
  float density = 1. + notePitch * 2.;
  float ripple = sin(length(p) * (26. + v * 12.) - time * 1.5) * energy;
  ripple += fingers.x * sin(length(p) * 24. * density - time * 2.) * .65;
  ripple += fingers.z * sin(q.x * 22. * density + q.y * 9. + t) * .75;
  float bands = .5 + .5 * sin(sin(q.x * (10. + w * 9.) + q.y * (5. + v * 7.) + t) * (1.8 + w * 1.2) + q.y * 8. + ripple);
  vec3 colour = palette(bands, .8);
  colour += pow(.5 + .5 * sin(q.x * (48. + v * 26.) + q.y * 22. + t), 28.) * .10 * base();
  colour += fingers.y * (grain(q * (80. + notePitch * 120.)) - .5) * .24;
  colour += fingers.w * pow(max(0., sin(q.x * 65. * density) * cos(q.y * 61. * density + time)), 18.) * vec3(.6,.5,.9);
  return colour;
}
vec3 rings(vec2 p, float t, float v, float w) {
  float density = 1. + notePitch * 2.;
  vec2 d = p - vec2(.32 * sin(t * (.25 + w * .3)), .26 * cos(t * (.3 + v * .25)));
  float r = length(d);
  float arms = sin(atan(d.y + .0001, d.x + .0001) * (4. + floor(w * 5.)) + t * (1. + v));
  float rings = sin(r * (20. + v * 16.) - time * (1. + w) - energy * 3.5 + arms * (1.2 + v));
  rings += fingers.x * sin(r * 30. * density - time * 2.2 + arms) * .5;
  rings += fingers.z * cos(r * 15. * density - time * 1.4 - arms) * .4;
  float bands = .5 + .5 * sin(rings * (1.5 + w * .8) + arms * .9);
  vec3 colour = palette(bands, .85);
  colour += pow(max(0., sin(arms * 2. + rings)), 22.) * .12 * base();
  colour += fingers.y * (grain(d * (90. + notePitch * 90.) + r) - .5) * .22;
  colour += fingers.w * pow(max(0., cos(r * (34. + v * 10.) * density - time * 2.)), 14.) * vec3(.6,.5,.9);
  return colour;
}
vec3 weave(vec2 p, float t, float v, float w) {
  float density = 1. + notePitch * 2.;
  float a1 = .45 + v * 1.1;
  float a2 = a1 + 1.5708 + (w - .5) * .6;
  vec2 dir1 = vec2(cos(a1), sin(a1));
  vec2 dir2 = vec2(cos(a2), sin(a2));
  float warp = .4 + energy * .5;
  float train1 = sin(dot(p, dir1) * (7. + v * 6.) + sin(dot(p, dir2) * 2. + t * .9) * warp + t);
  float train2 = sin(dot(p, dir2) * (8. + w * 6.) - sin(dot(p, dir1) * 2. - t * .8) * warp - t * .7);
  float knots = train1 * train2;
  knots += fingers.x * sin(dot(p, dir1) * 18. * density - time * 2.) * .45;
  knots += fingers.z * cos(dot(p, dir2) * 15. * density + time * 1.6) * .45;
  float bands = .5 + .5 * sin(knots * (1.4 + v * .9) + length(p) * (1.5 + w * 2.5));
  vec3 colour = palette(bands, .9);
  colour += pow(abs(knots), 5.) * .14 * base();
  colour += fingers.y * (grain(p * (70. + notePitch * 110.) + t) - .5) * .22;
  colour += fingers.w * pow(max(0., train1 + train2 * .5), 12.) * vec3(.55,.45,.85);
  return colour;
}
void main() {
  vec2 p = (gl_FragCoord.xy / resolution - .5) * vec2(1.5, 1.0);
  p /= zoom;
  float t = time * .16;
  float angle = .3 * sin(t * .35) + gesture * 1.7 * exp(-dot(p,p) * 2.);
  p = mat2(cos(angle),-sin(angle),sin(angle),cos(angle)) * p;
  float family = pattern.x, v = pattern.y, w = pattern.z;
  vec3 colour = family < 1.5 ? flow(p, t, v, w) : family < 2.5 ? rings(p, t, v, w) : weave(p, t, v, w);
  colour *= (.55 + light * .65);
  colour *= 1. - .25 * smoothstep(.15,.95,length(p * zoom));
  gl_FragColor = vec4(colour,1.);
}`;
export function ArtworkCanvas({ inputs, clock, paused, canvasRef, gestureInput, seed }: {
  inputs: React.RefObject<VisualInputs>;
  gestureInput?: React.RefObject<FingerVisual>;
  clock: React.RefObject<{ offset: number; epoch: number }>;
  paused: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  seed?: React.RefObject<number>;
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
      const uniforms = Object.fromEntries(["resolution","time","energy","zoom","light","gesture","tint","pattern","fingers","notePitch"].map(n => [n, gl.getUniformLocation(program!, n)]));
      const current = { ...inputs.current, colour: [...inputs.current.colour] };
      const fingerPressure = [0,0,0,0];
      let notePitch = 0;
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
        // Derive the family and variations from the shared seed here, in exact
        // float64 arithmetic, so every participant resolves them identically.
        const s = seed?.current ?? 0;
        gl!.uniform3f(uniforms.pattern, Math.floor((s * 991.73) % 3), (s * 613.97) % 1, (s * 251.31) % 1);
        gl!.uniform3f(uniforms.tint, current.colour[0], current.colour[1], current.colour[2]);
        for (let i=0;i<4;i++) fingerPressure[i] += ((gestureInput?.current.pressure[i] || 0) - fingerPressure[i]) * mix;
        notePitch += ((gestureInput?.current.pitch || 0) - notePitch) * mix;
        gl!.uniform4f(uniforms.fingers,...fingerPressure as [number,number,number,number]);
        gl!.uniform1f(uniforms.notePitch,notePitch);
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
  }, [canvasRef, clock, inputs, gestureInput, seed]);
  return <><canvas ref={canvasRef} className="composition-canvas" aria-label="Generative artwork responding to environmental sensors" />{error && <div role="alert" className="art-error">{error}</div>}</>;
}
