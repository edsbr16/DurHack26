"""Ephemeral, code-invited art rooms; no image or audio storage."""
import secrets
import time
from dataclasses import dataclass, field

NOTES = (261.63, 293.66, 329.63, 392.0, 440.0)  # C major pentatonic

@dataclass
class Member:
    id: str = field(default_factory=lambda: secrets.token_hex(8))
    pressure: list = field(default_factory=lambda: [0., 0., 0., 0.])
    notes: list = field(default_factory=lambda: [0, 2, 3, 4])
    octave: int = 0
    updated: float = 0
    seen: float = 0

@dataclass
class Room:
    code: str
    epoch: float
    touched: float
    members: dict = field(default_factory=dict)
    sensor_source: str = "all"
    sensors: dict = field(default_factory=lambda: {"sound": True, "distance": True, "light": True, "colour": True})
    # Random 24-bit pattern seed: every room renders its own unique artwork.
    # Fixed once at creation so all participants always share one pattern.
    seed: float = 0.
    # The creator's tab keeps the host key (returned once by POST /api/rooms);
    # presenting it at join marks that member as the room's host.
    host_key: str = field(default_factory=lambda: secrets.token_urlsafe(16))
    host_id: str = ""

class RoomStore:
    def __init__(self, clock=time.time):
        self.clock = clock
        self.rooms = {}

    def prune(self):
        now = self.clock()
        self.rooms = {k: r for k, r in self.rooms.items() if now-r.touched < 3600 and now-r.epoch < 21600}
        for r in self.rooms.values():
            r.members = {t: m for t, m in r.members.items() if now-m.seen < 120}
            self.rehost(r)

    def create(self):
        self.prune()
        if len(self.rooms) >= 128:
            raise ValueError('Room capacity reached. Try again later.')
        code = ''.join(secrets.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for _ in range(6))
        while code in self.rooms:
            code = ''.join(secrets.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for _ in range(6))
        now = self.clock()
        self.rooms[code] = Room(code, now, now, seed=secrets.randbits(24) / 2 ** 24)
        return self.rooms[code]

    def join(self, code, host_key=None):
        self.prune()
        room = self.rooms.get(code.strip().upper())
        if room is None:
            raise KeyError('Room not found or expired. Check the code.')
        if len(room.members) >= 16:
            raise ValueError('This room is full (16 participants).')
        token = secrets.token_urlsafe(24)
        room.members[token] = Member(seen=self.clock())
        if isinstance(host_key, str) and secrets.compare_digest(host_key, room.host_key):
            room.host_id = room.members[token].id
        room.touched = self.clock()
        return room, token, room.members[token]

    def reseed(self, room):
        """Host-triggered: give the room a fresh pattern shared by everyone."""
        room.seed = secrets.randbits(24) / 2 ** 24

    def rehost(self, room):
        """Keep exactly one host: when the host is gone, the earliest
        remaining member (join order) takes over."""
        if room.host_id not in {m.id for m in room.members.values()}:
            room.host_id = next(iter(room.members.values())).id if room.members else ''

    def snapshot(self, room, connected):
        now = self.clock()
        people = []
        for token, m in room.members.items():
            if token not in connected:
                continue
            p = m.pressure if now-m.updated < 1.2 else [0., 0., 0., 0.]
            people.append({'id': m.id, 'pressure': p, 'frequencies': [NOTES[n]*2**m.octave for n in m.notes]})
        pressure = [min(1., sum(p['pressure'][i] for p in people)) for i in range(4)]
        pitch = max((min(1., max(0., (f/261.63-1)/3)) for p in people for f, a in zip(p['frequencies'], p['pressure']) if a > 0), default=0)
        return {'event': 'room_state', 'code': room.code, 'epoch': room.epoch, 'server_time': now,
                'participants': people, 'fingers': {'pressure': pressure, 'pitch': pitch},
                'pattern': {'seed': room.seed}, 'host': room.host_id}


def finger_pressure(landmarks, previous):
    import math
    if not landmarks or len(landmarks) < 21:
        return [0., 0., 0., 0.]
    def d(a, b):
        return math.hypot(landmarks[a][0]-landmarks[b][0], landmarks[a][1]-landmarks[b][1])
    scale = d(0, 9)
    if scale < .0001:
        return [0., 0., 0., 0.]
    result = []
    for i, tip in enumerate((8, 12, 16, 20)):
        score = min(1., max(0., (d(4, tip)/scale-.15)/.6))
        result.append(1-score if score < (.28 if previous[i] > 0 else .20) else 0.)
    return result
