"""Room isolation, code lifetime, musical bounds and release checks."""
import unittest
from room_state import RoomStore, NOTES

class RoomTests(unittest.TestCase):
    def setUp(self):
        self.now = 1000.
        self.store = RoomStore(lambda: self.now)

    def test_join_codes_and_invalid_rooms(self):
        room = self.store.create()
        self.assertEqual(len(room.code), 6)
        joined, token, member = self.store.join(room.code.lower())
        self.assertIs(joined, room)
        self.assertIs(room.members[token], member)
        with self.assertRaises(KeyError): self.store.join('XXXXXX')

    def test_room_isolation_and_only_connected_members(self):
        a, b = self.store.create(), self.store.create()
        _, ta, ma = self.store.join(a.code)
        _, tb, mb = self.store.join(b.code)
        ma.pressure, mb.pressure = [1, 0, 0, 0], [0, 1, 0, 0]
        ma.updated = mb.updated = self.now
        snap = self.store.snapshot(a, {ta})
        self.assertEqual(snap['fingers']['pressure'], [1, 0, 0, 0])
        self.assertEqual([p['id'] for p in snap['participants']], [ma.id])
        self.assertNotIn(tb, str(snap))
        self.assertNotIn('token', str(snap))
        self.assertEqual(self.store.snapshot(a, {})['participants'], [])

    def test_shared_pentatonic_register_and_stale_notes_release(self):
        room = self.store.create()
        _, token, member = self.store.join(room.code)
        member.octave = -1
        member.pressure = [1, 1, 1, 1]
        member.updated = self.now
        snap = self.store.snapshot(room, {token})
        self.assertEqual(snap['participants'][0]['frequencies'], [NOTES[n]/2 for n in member.notes])
        self.now += 1.3
        snap = self.store.snapshot(room, {token})
        self.assertEqual(snap['fingers']['pressure'], [0, 0, 0, 0])

    def test_idle_room_expiry_and_capacity(self):
        room = self.store.create()
        for _ in range(16): self.store.join(room.code)
        with self.assertRaises(ValueError): self.store.join(room.code)
        self.now += 3601
        with self.assertRaises(KeyError): self.store.join(room.code)

if __name__ == '__main__': unittest.main()
