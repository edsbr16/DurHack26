"""Room-scoped sensor aggregation. No camera/video dependencies."""
import math
import time


def room_key(value):
    return (value or "").strip().upper() or "PUBLIC"


class SensorState:
    def __init__(self, clock=time.time):
        self.clock = clock
        self.devices = {}
        self.started_at = clock()

    def put(self, payload):
        key = (room_key(payload.get("room")), payload.get("device_id") or "uno-q")
        self.devices[key] = {**payload, "received_at": self.clock()}

    def snapshot(self, room=None, sound_floor=10, sound_ceiling=100):
        now = self.clock()
        # Old devices stop contributing even if their browser/board disappears.
        self.devices = {k: v for k, v in self.devices.items() if now - v["received_at"] <= 15}
        room = room_key(room)
        values = [v for (r, _), v in self.devices.items() if room == "PUBLIC" or r == room]

        def average(items, fallback):
            items = [v for v in items if v is not None and math.isfinite(v)]
            return sum(items) / len(items) if items else fallback

        def clamp(value, low=0, high=1):
            return max(low, min(high, value))

        sound = average([v.get("sound") for v in values], 0)
        distance = average([v.get("distanceCm") for v in values
                            if v.get("distanceCm") is not None and 2 <= v["distanceCm"] <= 400], None)
        lux = average([v.get("lux") for v in values], None)
        colours = []
        for v in values:
            c = v.get("colour")
            if c and max(c.values()) > 0:
                # Preserve hue from low readings, use lux separately for brightness.
                peak = max(c.values())
                colours.append([c[channel] / peak for channel in ("r", "g", "b")])
        colour = [average([c[i] for c in colours], default)
                  for i, default in enumerate([0.65, 0.38, 0.95])]
        return {
            "room": room, "devices": len(values), "server_time": now,
            "epoch": self.started_at,
            "received_at": max((v["received_at"] for v in values), default=None),
            "raw": {"sound": sound, "distanceCm": distance, "lux": lux},
            "visual": {
                "sound": clamp((sound - sound_floor) / (sound_ceiling - sound_floor)),
                "scale": 1 if distance is None else 0.65 + 1.75 * (1 - clamp((distance - 10) / 110)),
                "brightness": 0.7 if lux is None else 0.45 + 0.55 * clamp(math.log1p(lux) / math.log(1001)),
                "colour": colour, "gesture": 0,
            },
        }
