import { getBackendUrl } from "./config";

export interface StreamPublisherConfig {
  streamId: string;
  clientName: string;
  room?: string;
  facingMode: "user" | "environment";
  audioEnabled: boolean;
  videoEnabled: boolean;
  /** Process the raw mic stream (e.g. pitch shifting); its audio track gets
      published instead. The raw mic stays local for metering/mute. */
  processAudio?: (raw: MediaStream) => MediaStream;
  /** Optional generated instrument audio, independent of microphone access. */
  generatedAudioStream?: MediaStream;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onError?: (err: Error) => void;
}

export class WebRTCPublisher {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private config: StreamPublisherConfig;

  constructor(config: StreamPublisherConfig) {
    this.config = config;
  }

  public getStream(): MediaStream | null {
    return this.localStream;
  }

  public async start(): Promise<MediaStream> {
    const constraints: MediaStreamConstraints = {
      audio: this.config.audioEnabled ? {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      } : false,
      video: this.config.videoEnabled ? {
        facingMode: { ideal: this.config.facingMode },
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 30, max: 60 },
      } : false,
    };

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.config.onError?.(error);
      throw error;
    }

    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });

    this.pc.onconnectionstatechange = () => {
      if (this.pc) {
        this.config.onConnectionStateChange?.(this.pc.connectionState);
      }
    };

    // Add local tracks to the peer connection. When a processor is supplied,
    // its audio track replaces the raw mic on the wire — the raw stays local
    // (muting it silences the graph too, so the mic toggle still works).
    const publishTracks: MediaStreamTrack[] = [...this.localStream.getVideoTracks()];
    const rawAudio = this.localStream.getAudioTracks();
    if (this.config.processAudio && rawAudio.length > 0) {
      const processed = this.config.processAudio(this.localStream);
      publishTracks.push(processed.getAudioTracks()[0] ?? rawAudio[0]);
    } else {
      publishTracks.push(...rawAudio);
    }
    if (this.config.generatedAudioStream) {
      publishTracks.push(...this.config.generatedAudioStream.getAudioTracks());
    }
    publishTracks.forEach((track) => {
      if (this.localStream && this.pc) {
        this.pc.addTrack(track, this.localStream);
      }
    });

    // Create SDP Offer
    const offer = await this.pc.createOffer({
      offerToReceiveAudio: false,
      offerToReceiveVideo: false,
    });
    await this.pc.setLocalDescription(offer);

    // Wait briefly for ICE candidates to gather
    await this.waitForIceGathering(this.pc);

    // Send offer to backend
    const backendUrl = getBackendUrl();
    const response = await fetch(`${backendUrl}/api/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sdp: this.pc.localDescription?.sdp,
        type: this.pc.localDescription?.type,
        stream_id: this.config.streamId,
        client_name: this.config.clientName,
        room: this.config.room,
        device_info: {
          userAgent: navigator.userAgent,
          facingMode: this.config.facingMode,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to publish stream: ${response.status} ${errorText}`);
    }

    const answer = await response.json();
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));

    return this.localStream;
  }

  public setAudioEnabled(enabled: boolean) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }

  public setVideoEnabled(enabled: boolean) {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }

  public async switchCamera(newFacingMode: "user" | "environment") {
    this.config.facingMode = newFacingMode;
    if (!this.pc || !this.localStream) return;

    try {
      const newMediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: newFacingMode } },
        audio: false,
      });

      const newVideoTrack = newMediaStream.getVideoTracks()[0];
      const senders = this.pc.getSenders();
      const videoSender = senders.find((s) => s.track && s.track.kind === "video");

      if (videoSender && newVideoTrack) {
        await videoSender.replaceTrack(newVideoTrack);
        // Replace in local stream
        const oldVideoTrack = this.localStream.getVideoTracks()[0];
        if (oldVideoTrack) {
          this.localStream.removeTrack(oldVideoTrack);
          oldVideoTrack.stop();
        }
        this.localStream.addTrack(newVideoTrack);
      }
    } catch {
      // If exact facingMode fails, try ideal
      const fallbackStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: newFacingMode } },
        audio: false,
      });
      const newVideoTrack = fallbackStream.getVideoTracks()[0];
      const senders = this.pc.getSenders();
      const videoSender = senders.find((s) => s.track && s.track.kind === "video");
      if (videoSender && newVideoTrack) {
        await videoSender.replaceTrack(newVideoTrack);
        const oldVideoTrack = this.localStream.getVideoTracks()[0];
        if (oldVideoTrack) {
          this.localStream.removeTrack(oldVideoTrack);
          oldVideoTrack.stop();
        }
        this.localStream.addTrack(newVideoTrack);
      }
    }
  }

  public stop() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
  }

  private waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === "complete") {
        resolve();
        return;
      }
      const check = () => {
        if (pc.iceGatheringState === "complete") {
          pc.removeEventListener("icegatheringstatechange", check);
          resolve();
        }
      };
      pc.addEventListener("icegatheringstatechange", check);
      // Timeout fallback (800ms) to avoid blocking
      setTimeout(() => {
        pc.removeEventListener("icegatheringstatechange", check);
        resolve();
      }, 800);
    });
  }
}

export interface StreamViewerConfig {
  streamId: string;
  onTrack?: (stream: MediaStream) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onError?: (err: Error) => void;
}

export class WebRTCViewer {
  private pc: RTCPeerConnection | null = null;
  private remoteStream: MediaStream = new MediaStream();
  private config: StreamViewerConfig;

  constructor(config: StreamViewerConfig) {
    this.config = config;
  }

  public async start(): Promise<MediaStream> {
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });

    this.pc.onconnectionstatechange = () => {
      if (this.pc) {
        this.config.onConnectionStateChange?.(this.pc.connectionState);
      }
    };

    // Receive both video and audio
    this.pc.addTransceiver("video", { direction: "recvonly" });
    this.pc.addTransceiver("audio", { direction: "recvonly" });

    this.pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
      } else {
        this.remoteStream.addTrack(event.track);
      }
      this.config.onTrack?.(this.remoteStream);
    };

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    // Wait briefly for ICE candidates
    await new Promise<void>((resolve) => {
      if (!this.pc || this.pc.iceGatheringState === "complete") {
        resolve();
        return;
      }
      const check = () => {
        if (this.pc?.iceGatheringState === "complete") {
          this.pc.removeEventListener("icegatheringstatechange", check);
          resolve();
        }
      };
      this.pc.addEventListener("icegatheringstatechange", check);
      setTimeout(() => {
        this.pc?.removeEventListener("icegatheringstatechange", check);
        resolve();
      }, 800);
    });

    const backendUrl = getBackendUrl();
    const response = await fetch(`${backendUrl}/api/view/${this.config.streamId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sdp: this.pc.localDescription?.sdp,
        type: this.pc.localDescription?.type,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to view stream: ${response.status} ${errorText}`);
    }

    const answer = await response.json();
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));

    return this.remoteStream;
  }

  public stop() {
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.remoteStream.getTracks().forEach((track) => track.stop());
  }
}
