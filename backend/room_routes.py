"""Room-only websocket: shared numbers and notes, own tracking reply only."""
import asyncio
import base64
import io
import time
from typing import Optional
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from room_state import RoomStore, finger_pressure

router = APIRouter()
store = RoomStore()
sockets = {}  # code -> token -> socket; never exposed through the legacy stream API
last_broadcast = {}

class JoinRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6)
    host_key: Optional[str] = Field(default=None, max_length=64)

@router.post('/api/rooms')
async def create_room():
    try:
        room = store.create()
        return {'code': room.code, 'epoch': room.epoch, 'host_key': room.host_key}
    except ValueError as e:
        raise HTTPException(429, str(e))

@router.post('/api/rooms/join')
async def join_room(body: JoinRequest):
    try:
        room, token, member = store.join(body.code, body.host_key)
        return {'code': room.code, 'token': token, 'member_id': member.id}
    except KeyError as e:
        raise HTTPException(404, str(e.args[0]))
    except ValueError as e:
        raise HTTPException(409, str(e))

@router.get('/api/rooms/{code}')
async def check_room(code: str):
    store.prune()
    room = store.rooms.get(code.strip().upper())
    if room is None:
        raise HTTPException(404, 'Room not found or expired. Check the code.')
    if len(room.members) >= 16:
        raise HTTPException(409, 'Room is full.')
    return {'code': room.code}


async def broadcast(room, force=False):
    now = time.monotonic()
    if not force and now-last_broadcast.get(room.code, 0) < .12:
        return
    last_broadcast[room.code] = now
    connections = dict(sockets.get(room.code, {}))
    payload = store.snapshot(room, connections)
    # Room settings are shared so every participant sees the same composition.
    from sensor_routes import sensor_state
    environment = sensor_state.snapshot('PUBLIC' if room.sensor_source == 'all' else room.code)
    if room.sensor_source == 'off':
        from sensor_state import SensorState
        environment = SensorState().snapshot(room.code)
    visual = environment['visual']
    if not room.sensors['sound']: visual['sound'] = 0
    if not room.sensors['distance']: visual['scale'] = 1
    if not room.sensors['light']: visual['brightness'] = .7
    if not room.sensors['colour']: visual['colour'] = [.65, .38, .95]
    payload['environment'] = environment
    payload['sensor_settings'] = {'source': room.sensor_source, 'enabled': room.sensors}
    async def send(token, ws):
        try:
            await asyncio.wait_for(ws.send_json(payload), 1)
        except Exception:
            if sockets.get(room.code, {}).get(token) is ws:
                sockets[room.code].pop(token, None)
            try:
                await ws.close()
            except Exception:
                pass
    await asyncio.gather(*(send(t, ws) for t, ws in connections.items()))

@router.websocket('/api/rooms/{code}/ws')
async def room_socket(ws: WebSocket, code: str):
    await ws.accept()
    room = None
    token = None
    try:
        auth = await asyncio.wait_for(ws.receive_json(), 8)
        room = store.rooms.get(code.upper())
        token = auth.get('token') if isinstance(auth, dict) else None
        if room is None or token not in room.members:
            await ws.close(code=1008, reason='Join the room first')
            return
        if token in sockets.get(room.code, {}):
            await ws.close(code=1008, reason='Session already connected')
            return
        member = room.members[token]
        sockets.setdefault(room.code, {})[token] = ws
        tracker = None
        last_frame = 0
        await broadcast(room, True)
        while True:
            if time.time()-room.epoch >= 21600 or store.clock()-member.seen > 15:
                await ws.close(code=1000, reason='Room expired')
                break
            try:
                data = await asyncio.wait_for(ws.receive_json(), .2)
            except asyncio.TimeoutError:
                await broadcast(room)
                continue
            if not isinstance(data, dict):
                continue
            member.seen = room.touched = store.clock()
            if data.get('event') == 'pattern' and member.id == room.host_id:
                # Host-only: give everyone in the room a fresh shared pattern.
                store.reseed(room)
            if data.get('event') == 'sensors':
                if data.get('source') in ('all', 'room', 'off'):
                    room.sensor_source = data['source']
                enabled = data.get('enabled')
                if isinstance(enabled, dict):
                    for key in room.sensors:
                        if type(enabled.get(key)) is bool:
                            room.sensors[key] = enabled[key]
            # Note choices are indices in one scale, plus a bounded octave.
            notes = data.get('notes')
            if isinstance(notes, list) and len(notes) == 4 and all(type(n) is int and 0 <= n < 5 for n in notes):
                member.notes = notes
            if type(data.get('octave')) is int and data['octave'] in (-1, 0, 1):
                member.octave = data['octave']
            if data.get('event') == 'input':
                p = data.get('pressure')
                if isinstance(p, list) and len(p) == 4 and all(type(v) in (int, float) and 0 <= v <= 1 for v in p):
                    member.pressure = p
                    member.updated = store.clock()
            elif data.get('event') == 'frame':
                last_frame = time.monotonic()
                encoded = data.get('jpeg')
                if not isinstance(encoded, str) or len(encoded) > 320000:
                    await ws.close(code=1009)
                    break
                try:
                    from PIL import Image
                    import av
                    from hand_tracker import HandTracker, _MP_OK
                    if tracker is None:
                        tracker = HandTracker(independent=True)
                    raw = base64.b64decode(encoded, validate=True)
                    with Image.open(io.BytesIO(raw)) as image:
                        if image.width > 960 or image.height > 720:
                            raise ValueError('Frame too large')
                        frame = av.VideoFrame.from_image(image.convert('RGB'))
                    tracker.maybe_detect(frame)
                    member.pressure = finger_pressure(tracker.landmarks if tracker.present else None, member.pressure)
                    member.updated = store.clock()
                    await ws.send_json({'event': 'tracking', 'hand': tracker.present, 'landmarks': tracker.landmarks,
                                        'pressure': member.pressure, 'available': _MP_OK})
                except (ValueError, OSError):
                    member.pressure = [0., 0., 0., 0.]
            await broadcast(room)
    except (WebSocketDisconnect, asyncio.TimeoutError, ValueError):
        pass
    finally:
        if room and sockets.get(room.code, {}).get(token) is ws:
            sockets[room.code].pop(token, None)
            room.members.pop(token, None)
            store.rehost(room)
            await broadcast(room, True)
            if not sockets[room.code]:
                sockets.pop(room.code, None)
                last_broadcast.pop(room.code, None)

@router.websocket('/api/hand/ws')
async def individual_hand_socket(ws: WebSocket):
    """Own-camera tracking over HTTPS/WSS; no UDP or public video stream."""
    await ws.accept()
    from PIL import Image
    import av
    from hand_tracker import HandTracker, _MP_OK
    tracker = HandTracker(independent=True)
    try:
        while True:
            data = await asyncio.wait_for(ws.receive_json(), 15)
            encoded = data.get('jpeg')
            if not isinstance(encoded, str) or len(encoded) > 320000:
                await ws.close(code=1009)
                return
            try:
                with Image.open(io.BytesIO(base64.b64decode(encoded, validate=True))) as image:
                    if image.width > 960 or image.height > 720:
                        raise ValueError('Frame too large')
                    frame = av.VideoFrame.from_image(image.convert('RGB'))
                tracker.maybe_detect(frame)
                await ws.send_json({'event':'tracking', **tracker.to_event_fields(), 'available':_MP_OK})
            except (ValueError, OSError):
                await ws.send_json({'event':'tracking','hand':False,'landmarks':None,'available':_MP_OK})
    except (WebSocketDisconnect, asyncio.TimeoutError):
        pass
