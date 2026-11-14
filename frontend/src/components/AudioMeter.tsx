"use client";

import React, { useEffect, useState } from "react";

interface AudioMeterProps {
  stream?: MediaStream | null;
  serverLevel?: number; // 0 to 100 level from backend websocket
  className?: string;
}

export const AudioMeter: React.FC<AudioMeterProps> = ({
  stream,
  serverLevel,
  className = "",
}) => {
  const [localLevel, setLocalLevel] = useState<number>(0);

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) {
      setLocalLevel(0);
      return;
    }

    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let microphone: MediaStreamAudioSourceNode | null = null;
    let javascriptNode: ScriptProcessorNode | null = null;
    let isCancelled = false;

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioContext = new AudioCtx();
      analyser = audioContext.createAnalyser();
      analyser.smoothingTimeConstant = 0.5;
      analyser.fftSize = 256;

      microphone = audioContext.createMediaStreamSource(stream);
      javascriptNode = audioContext.createScriptProcessor(512, 1, 1);

      microphone.connect(analyser);
      analyser.connect(javascriptNode);
      javascriptNode.connect(audioContext.destination);

      javascriptNode.onaudioprocess = () => {
        if (isCancelled) return;
        const array = new Uint8Array(analyser!.frequencyBinCount);
        analyser!.getByteFrequencyData(array);
        let values = 0;
        const length = array.length;
        for (let i = 0; i < length; i++) {
          values += array[i];
        }
        const average = values / length;
        const normalized = Math.min(100, Math.round((average / 128) * 100));
        setLocalLevel(normalized);
      };
    } catch {
      // AudioContext may be blocked before user interaction
    }

    return () => {
      isCancelled = true;
      if (javascriptNode) javascriptNode.onaudioprocess = null;
      if (microphone) microphone.disconnect();
      if (analyser) analyser.disconnect();
      if (javascriptNode) javascriptNode.disconnect();
      if (audioContext && audioContext.state !== "closed") {
        audioContext.close();
      }
    };
  }, [stream]);

  const level = serverLevel !== undefined ? serverLevel : localLevel;
  const bars = 6;
  const activeBars = Math.ceil((level / 100) * bars);

  return (
    <div className={`flex items-end gap-1 h-4 ${className}`} title={`Audio: ${level}%`}>
      {Array.from({ length: bars }).map((_, i) => {
        const isActive = i < activeBars;
        let color = "bg-emerald-500";
        if (i >= 4) color = "bg-amber-400";
        if (i >= 5) color = "bg-rose-500";

        return (
          <div
            key={i}
            className={`w-1 rounded-sm transition-all duration-75 ${
              isActive ? color : "bg-neutral-700/60"
            }`}
            style={{
              height: `${((i + 1) / bars) * 100}%`,
              opacity: isActive ? 1 : 0.35,
            }}
          />
        );
      })}
    </div>
  );
};
