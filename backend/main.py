import asyncio
import logging
import uuid
from typing import Optional, Dict, Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel
from aiortc import RTCPeerConnection, RTCSessionDescription, RTCConfiguration, RTCIceServer

from stream_manager import stream_manager, StreamInfo

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("webrtc_server")

app = FastAPI(
    title="WebRTC Camera Stream Central Backend",
    description="Central backend receiving low-latency mobile camera and audio feeds for monitoring and AI processing.",
    version="1.0.0",
)

# Enable CORS for frontend clients (phone & dashboard)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Public STUN servers for NAT traversal
RTC_CONFIG = RTCConfiguration(
    iceServers=[
        RTCIceServer(urls=["stun:stun.l.google.com:19302"]),
        RTCIceServer(urls=["stun:stun1.l.google.com:19302"]),
    ]
)


class OfferModel(BaseModel):
    sdp: str
    type: str
    stream_id: Optional[str] = None
    client_name: Optional[str] = None
    device_info: Optional[Dict[str, Any]] = None


@app.get("/api/health")
async def health_check():
    return {
        "status": "online",
        "active_streams": len(stream_manager.streams),
        "connected_ws_clients": len(stream_manager.ws_clients),
    }


@app.get("/api/streams")
async def list_streams():
    """Returns list of currently active phone camera/audio streams."""
    return stream_manager.list_streams()


@app.get("/api/stream/{stream_id}/snapshot.jpg")
async def get_stream_snapshot(stream_id: str):
    """Returns the latest captured video frame as a JPEG image."""
    stream_info = stream_manager.get_stream(stream_id)
    if not stream_info or not stream_info.video_processor.latest_jpeg:
        raise HTTPException(status_code=404, detail="No snapshot available for this stream")
    return Response(content=stream_info.video_processor.latest_jpeg, media_type="image/jpeg")


@app.delete("/api/stream/{stream_id}")
async def kick_stream(stream_id: str):
    """Disconnects and removes a stream."""
    stream_info = stream_manager.get_stream(stream_id)
    if not stream_info:
        raise HTTPException(status_code=404, detail="Stream not found")
    await stream_manager.remove_stream(stream_id)
    return {"status": "ok", "message": f"Stream {stream_id} terminated"}


@app.post("/api/publish")
async def publish_stream(offer_data: OfferModel):
    """
    WebRTC Signaling Endpoint for mobile phone streamers.
    Receives SDP offer, sets up incoming audio/video tracks, and returns SDP answer.
    """
    stream_id = offer_data.stream_id or str(uuid.uuid4())[:8]
    client_name = offer_data.client_name or f"Streamer-{stream_id[:4]}"
    device_info = offer_data.device_info or {}

    logger.info(f"Incoming publish offer from {client_name} (ID: {stream_id})")

    pc = RTCPeerConnection(RTC_CONFIG)
    stream_info = await stream_manager.register_stream(
        stream_id=stream_id,
        client_name=client_name,
        device_info=device_info,
        pc=pc,
    )

    @pc.on("track")
    def on_track(track):
        logger.info(f"[{stream_id}] Track attached: {track.kind}")
        if track.kind == "video":
            stream_info.raw_video_track = track
        elif track.kind == "audio":
            stream_info.raw_audio_track = track

        @track.on("ended")
        async def on_ended():
            logger.info(f"[{stream_id}] Track ended: {track.kind}")

        # Start asynchronous frame ingestion for metrics, snapshots, and AI
        asyncio.create_task(stream_manager.start_frame_processing(stream_info))

    @pc.on("connectionstatechange")
    async def on_connectionstatechange():
        logger.info(f"[{stream_id}] Publisher connection state changed: {pc.connectionState}")
        if pc.connectionState in ["failed", "closed", "disconnected"]:
            await stream_manager.remove_stream(stream_id)

    try:
        offer = RTCSessionDescription(sdp=offer_data.sdp, type=offer_data.type)
        await pc.setRemoteDescription(offer)
        answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        return {
            "sdp": pc.localDescription.sdp,
            "type": pc.localDescription.type,
            "stream_id": stream_id,
        }
    except Exception as e:
        logger.error(f"Error establishing publish connection: {e}")
        await stream_manager.remove_stream(stream_id)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/view/{stream_id}")
async def view_stream(stream_id: str, offer_data: OfferModel):
    """
    WebRTC Signaling Endpoint for dashboard viewers.
    Subscribes the viewer to the specified publisher's relayed video and audio tracks.
    """
    stream_info = stream_manager.get_stream(stream_id)
    if not stream_info:
        raise HTTPException(status_code=404, detail=f"Stream '{stream_id}' not found")

    viewer_pc = RTCPeerConnection(RTC_CONFIG)
    stream_info.active_viewers.add(viewer_pc)

    @viewer_pc.on("connectionstatechange")
    async def on_viewer_state():
        logger.info(f"Viewer state for [{stream_id}]: {viewer_pc.connectionState}")
        if viewer_pc.connectionState in ["failed", "closed", "disconnected"]:
            stream_info.active_viewers.discard(viewer_pc)
            try:
                await viewer_pc.close()
            except Exception:
                pass

    # Forward video and audio tracks via aiortc MediaRelay
    if stream_info.raw_video_track:
        viewer_pc.addTrack(stream_info.relay.subscribe(stream_info.raw_video_track))
    if stream_info.raw_audio_track:
        viewer_pc.addTrack(stream_info.relay.subscribe(stream_info.raw_audio_track))

    try:
        offer = RTCSessionDescription(sdp=offer_data.sdp, type=offer_data.type)
        await viewer_pc.setRemoteDescription(offer)
        answer = await viewer_pc.createAnswer()
        await viewer_pc.setLocalDescription(answer)

        return {
            "sdp": viewer_pc.localDescription.sdp,
            "type": viewer_pc.localDescription.type,
            "stream_id": stream_id,
        }
    except Exception as e:
        logger.error(f"Error setting up viewer connection: {e}")
        stream_info.active_viewers.discard(viewer_pc)
        try:
            await viewer_pc.close()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=str(e))


@app.websocket("/api/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket channel for live notifications:
    stream joins, stream disconnects, real-time FPS/resolution stats, and audio levels.
    """
    await websocket.accept()
    await stream_manager.register_ws(websocket)
    try:
        while True:
            # We can receive ping/pong or client messages
            data = await websocket.receive_text()
            # If client sends a ping, reply with pong
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug(f"WebSocket client error: {e}")
    finally:
        stream_manager.unregister_ws(websocket)


@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Server shutting down, closing all peer connections...")
    for stream_id in list(stream_manager.streams.keys()):
        await stream_manager.remove_stream(stream_id)
