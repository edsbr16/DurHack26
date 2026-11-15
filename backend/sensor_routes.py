"""Additive sensor routes for the existing FastAPI camera backend."""
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sensor_state import SensorState, room_key

router = APIRouter()

sensor_state = SensorState()


class SensorColour(BaseModel):
    r: float = Field(ge=0, le=255)
    g: float = Field(ge=0, le=255)
    b: float = Field(ge=0, le=255)


class SensorPayload(BaseModel):
    device_id: str = Field(default="uno-q", min_length=1, max_length=80)
    room: str = Field(default="PUBLIC", max_length=32)
    sound: float = Field(ge=0, le=65535)
    distanceCm: Optional[float] = Field(default=None, ge=0, le=100000)
    lux: Optional[float] = Field(default=None, ge=0, le=1000000)
    ir: Optional[float] = Field(default=None, ge=0, le=1000000)
    colour: Optional[SensorColour] = None


@router.post("/api/data")
async def receive_sensor_data(payload: SensorPayload):
    sensor_state.put(payload.model_dump() if hasattr(payload, "model_dump") else payload.dict())
    return {"status": "ok", "room": room_key(payload.room)}


@router.get("/api/artwork")
async def get_artwork_state(
    room: str = Query(default="PUBLIC", max_length=32),
    sound_floor: float = Query(default=10, ge=0, le=65534),
    sound_ceiling: float = Query(default=100, gt=0, le=65535),
):
    if sound_ceiling <= sound_floor:
        raise HTTPException(status_code=422, detail="Sound ceiling must exceed floor")
    state = sensor_state.snapshot(room, sound_floor, sound_ceiling)
    from stream_manager import stream_manager
    # Only numeric tracking information contributes to the generated image.
    streams = [s for s in stream_manager.streams.values()
               if room_key(room) == "PUBLIC" or room_key(s.room) == room_key(room)]
    hands = [s.video_processor.tracker for s in streams if s.video_processor.tracker.present]
    state["visual"]["gesture"] = sum(1 - h.pinch for h in hands) / len(hands) if hands else 0
    state["hands"] = len(hands)
    return JSONResponse(state, headers={"Cache-Control": "no-store"})

