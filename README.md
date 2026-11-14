# DurHack26 — Real-Time Central WebRTC Camera & Audio Streaming Platform

A real-time media application that allows anyone to connect with their smartphone via a web browser and stream their camera and microphone feeds directly to a central Python backend server, similar to Zoom or Google Meet.

The platform provides a **Host Control Dashboard** that displays a dynamic multi-camera video grid with live audio VU meters, connection stats (FPS, resolution, motion score), full-resolution snapshots, and a QR code generator for instant mobile phone onboarding.

---

## 🏗️ Architecture

```
┌─────────────────────────────────┐
│     Smartphone (Browser)        │
│  - iOS Safari / Android Chrome  │
│  - getUserMedia (Cam + Mic)     │
│  - WebRTC PeerConnection (RTP)  │
└────────────────┬────────────────┘
                 │
                 │ WebRTC Sub-200ms RTP Stream (Video + Audio)
                 ▼
┌────────────────────────────────────────────────────────┐
│             Central Python Backend                     │
│  - FastAPI + aiortc                                    │
│  - Direct Ingestion of H.264 / VP8 & Opus RTP streams  │
│  - VideoFrameProcessor (FPS, motion, JPEG snapshot)    │
│  - AudioFrameProcessor (RMS volume meter)              │
│  - MediaRelay (Selective Forwarding to Viewers)        │
│  - WebSocket Hub (/api/ws for real-time events)        │
│  - Extensible AI / CV processing hooks (OpenCV, etc.)  │
└────────────────┬───────────────────────────────────────┘
                 │
                 │ WebRTC Relayed Tracks + WebSocket Events
                 ▼
┌────────────────────────────────────────────────────────┐
│             Central Host Dashboard                     │
│  - Next.js 16 + React 19 + Tailwind CSS                │
│  - Dynamic multi-camera gallery grid (1..N feeds)      │
│  - Individual volume controls & Audio VU meters        │
│  - Solo mode, fullscreen view, server-side snapshots   │
│  - QR Code scanner invite modal                        │
└────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### 1. Launch Everything

Run the helper script from the root directory:
```bash
./start.sh
```
This will start:
- **FastAPI Backend**: `http://localhost:8000` (API Docs at `http://localhost:8000/docs`)
- **Next.js Frontend**: `http://localhost:3000`

Or start them individually:
```bash
# Backend only
./start.sh backend

# Frontend only
./start.sh frontend
```

---

## 📱 Connecting with a Smartphone

### Important: Mobile Browser HTTPS Requirement
Mobile browsers (Safari on iOS and Chrome on Android) strictly require a **Secure Context (`https://` or `localhost`)** to access `navigator.mediaDevices.getUserMedia` (camera and microphone). When testing on a local WiFi network using an IP address (e.g. `http://192.168.1.X:3000`), mobile browsers disable camera access.

### Recommended Solutions for Mobile Testing:

#### Option A: Cloudflare Tunnel (Free, Instant, No Account Needed)
In a separate terminal, expose the frontend and backend:
```bash
# Expose frontend (gives a free https://*.trycloudflare.com URL)
cloudflared tunnel --url http://localhost:3000
```
Open the generated HTTPS URL on your phone or scan the QR code from the dashboard!

#### Option B: ngrok
```bash
ngrok http 3000
```

#### Option C: Production Deployment (Vultr VPS)
Deploy to the included Vultr Terraform infrastructure with SSL / Let's Encrypt (see [Deployment](#-deployment-to-vultr-vps)).

---

## 🖥️ Application Features & Routes

| Route | Purpose | Key Features |
| :--- | :--- | :--- |
| `/` | **Home Portal** | Overview, system status indicator, quick launch links, backend settings. |
| `/stream` | **Mobile Phone Streamer** | Fullscreen camera viewfinder, front/back camera switch, mic mute, video pause, screen wake lock (prevents phone sleep), audio VU meter. |
| `/dashboard` | **Central Host Dashboard** | Adaptive multi-camera grid (Zoom/Meet gallery view), audio meters, individual mute/listen controls, solo view, full-res snapshots, instant QR code modal. |

---

## 🧠 Extensible AI & Computer Vision Hooks

The backend receives raw video frames directly in Python. You can find the frame ingestion pipeline in `backend/ai_processor.py`:

```python
# backend/ai_processor.py
def process_video_frame(self, frame: av.VideoFrame):
    # Convert directly to PIL or NumPy RGB/BGR array
    img = frame.to_image()
    # Or: np_array = frame.to_ndarray(format="bgr24")
    
    # Plug in OpenCV / YOLO / Face detection / Multimodal AI models here!
```

---

## 🌐 API Endpoints

- `POST /api/publish`: WebRTC signaling endpoint for phone camera/mic publishers.
- `POST /api/view/{stream_id}`: WebRTC signaling endpoint for dashboard viewers.
- `GET /api/streams`: List of currently active phone streams and real-time statistics.
- `GET /api/stream/{stream_id}/snapshot.jpg`: Captures the latest high-resolution JPEG frame from the server.
- `DELETE /api/stream/{stream_id}`: Remotely disconnects a stream.
- `WS /api/ws`: WebSocket channel for stream join/leave events, audio level meters, and stats.
- `GET /api/health`: Health status and connection counts.

---

## ☁️ Deployment to Vultr VPS

The repository includes Terraform definitions in the `terraform/` folder configured for a Vultr cloud instance:
- Ports `22` (SSH), `80` (HTTP), `443` (HTTPS), and UDP ports `10000:60000` (WebRTC media) are opened in `terraform/vultr.tf`.
- To deploy:
  ```bash
  cd terraform
  cp terraform.tfvars.example terraform.tfvars
  # Add your vultr_api_key and ssh key
  terraform init
  ./deploy.sh
  ```
