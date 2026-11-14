import asyncio
import json
import logging
from typing import Dict, Set, Optional, Any
from aiortc import RTCPeerConnection, MediaStreamTrack
from aiortc.contrib.media import MediaRelay
from fastapi import WebSocket

from ai_processor import VideoFrameProcessor, AudioFrameProcessor

logger = logging.getLogger("stream_manager")


class StreamInfo:
    def __init__(
        self,
        stream_id: str,
        client_name: str,
        device_info: dict,
        pc: RTCPeerConnection,
    ):
        self.stream_id = stream_id
        self.client_name = client_name
        self.device_info = device_info
        self.pc = pc
        self.relay = MediaRelay()
        
        self.raw_video_track: Optional[MediaStreamTrack] = None
        self.raw_audio_track: Optional[MediaStreamTrack] = None
        
        self.video_processor = VideoFrameProcessor(stream_id)
        self.audio_processor = AudioFrameProcessor(stream_id)
        
        self.video_task: Optional[asyncio.Task] = None
        self.audio_task: Optional[asyncio.Task] = None
        
        self.active_viewers: Set[RTCPeerConnection] = set()

    def to_dict(self) -> dict:
        return {
            "stream_id": self.stream_id,
            "client_name": self.client_name,
            "device_info": self.device_info,
            "has_video": self.raw_video_track is not None,
            "has_audio": self.raw_audio_track is not None,
            "fps": self.video_processor.fps,
            "width": self.video_processor.width,
            "height": self.video_processor.height,
            "total_frames": self.video_processor.frame_count,
            "volume_level": self.audio_processor.volume_level,
            "motion_score": self.video_processor.motion_score,
            "hand": self.video_processor.tracker.present,
            "pinch": self.video_processor.tracker.pinch,
            "viewers_count": len(self.active_viewers),
        }

    async def close(self):
        if self.video_task and not self.video_task.done():
            self.video_task.cancel()
        if self.audio_task and not self.audio_task.done():
            self.audio_task.cancel()
        
        for viewer in list(self.active_viewers):
            try:
                await viewer.close()
            except Exception:
                pass
        self.active_viewers.clear()

        try:
            await self.pc.close()
        except Exception:
            pass


class StreamManager:
    def __init__(self):
        self.streams: Dict[str, StreamInfo] = {}
        self.ws_clients: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def register_stream(
        self,
        stream_id: str,
        client_name: str,
        device_info: dict,
        pc: RTCPeerConnection,
    ) -> StreamInfo:
        async with self._lock:
            # If an existing stream with this ID exists, clean it up first
            if stream_id in self.streams:
                await self.streams[stream_id].close()

            info = StreamInfo(stream_id, client_name, device_info, pc)
            self.streams[stream_id] = info
            logger.info(f"Registered stream: {stream_id} ({client_name})")

        await self.broadcast_event({
            "event": "stream_joined",
            "stream": info.to_dict(),
        })
        return info

    async def remove_stream(self, stream_id: str):
        async with self._lock:
            info = self.streams.pop(stream_id, None)
            if info:
                await info.close()
                logger.info(f"Removed stream: {stream_id}")

        if info:
            await self.broadcast_event({
                "event": "stream_left",
                "stream_id": stream_id,
            })

    def get_stream(self, stream_id: str) -> Optional[StreamInfo]:
        return self.streams.get(stream_id)

    def list_streams(self) -> list:
        return [info.to_dict() for info in self.streams.values()]

    async def register_ws(self, ws: WebSocket):
        self.ws_clients.add(ws)
        # Send current list of active streams immediately
        await ws.send_json({
            "event": "init",
            "streams": self.list_streams(),
        })

    def unregister_ws(self, ws: WebSocket):
        self.ws_clients.discard(ws)

    async def broadcast_event(self, data: dict):
        if not self.ws_clients:
            return
        dead_clients = []
        msg = json.dumps(data)
        for ws in self.ws_clients:
            try:
                await ws.send_text(msg)
            except Exception:
                dead_clients.append(ws)
        for ws in dead_clients:
            self.ws_clients.discard(ws)

    async def start_frame_processing(self, info: StreamInfo):
        """
        Subscribes to incoming video and audio tracks, processes frames,
        and periodically pushes stats and audio levels over WebSocket.
        """
        async def process_video():
            if not info.raw_video_track:
                return
            relayed = info.relay.subscribe(info.raw_video_track)
            last_stats_push = 0
            last_pinch_push = 0
            while True:
                try:
                    frame = await relayed.recv()
                    stats = info.video_processor.process_video_frame(frame)
                    now = asyncio.get_event_loop().time()
                    # Pinch tracking overlay data — fast cadence so fingertip
                    # dots feel live on the dashboard / streamer preview.
                    if now - last_pinch_push >= 0.08:
                        last_pinch_push = now
                        await self.broadcast_event({
                            "event": "pinch_update",
                            "stream_id": info.stream_id,
                            **info.video_processor.tracker.to_event_fields(),
                        })
                    if now - last_stats_push >= 1.0:
                        last_stats_push = now
                        await self.broadcast_event({
                            "event": "stats_update",
                            "stream_id": info.stream_id,
                            "fps": stats["fps"],
                            "width": stats["width"],
                            "height": stats["height"],
                            "total_frames": stats["total_frames"],
                            "motion_score": stats["motion_score"],
                        })
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.debug(f"Video loop finished/error for {info.stream_id}: {e}")
                    break

        async def process_audio():
            if not info.raw_audio_track:
                return
            relayed = info.relay.subscribe(info.raw_audio_track)
            last_meter_push = 0
            while True:
                try:
                    frame = await relayed.recv()
                    data = info.audio_processor.process_audio_frame(frame)
                    now = asyncio.get_event_loop().time()
                    if now - last_meter_push >= 0.2:  # 5 times per sec
                        last_meter_push = now
                        await self.broadcast_event({
                            "event": "audio_level",
                            "stream_id": info.stream_id,
                            "volume_level": data["volume_level"],
                        })
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.debug(f"Audio loop finished/error for {info.stream_id}: {e}")
                    break

        if info.raw_video_track and (not info.video_task or info.video_task.done()):
            info.video_task = asyncio.create_task(process_video())
        if info.raw_audio_track and (not info.audio_task or info.audio_task.done()):
            info.audio_task = asyncio.create_task(process_audio())


stream_manager = StreamManager()
