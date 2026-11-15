import unittest
from sensor_state import SensorState


class SensorStateTests(unittest.TestCase):
    def setUp(self):
        self.now = 1000
        self.state = SensorState(clock=lambda: self.now)

    def put(self, device="a", room="PUBLIC", **values):
        self.state.put({"device_id": device, "room": room, "sound": 10,
                        "distanceCm": 30, "lux": 100, "colour": None, **values})

    def test_public_combines_devices_but_room_excludes_other_rooms(self):
        self.put(room="friends", sound=20)
        self.put(device="b", room="OTHER", sound=80)
        self.assertEqual(self.state.snapshot()["raw"]["sound"], 50)
        room = self.state.snapshot(" friends ")
        self.assertEqual(room["devices"], 1)
        self.assertEqual(room["raw"]["sound"], 20)
        self.assertEqual(self.state.snapshot("EMPTY")["devices"], 0)

    def test_updates_replace_device_and_expire(self):
        self.put(sound=20)
        self.put(sound=80)
        self.assertEqual(self.state.snapshot()["devices"], 1)
        self.assertEqual(self.state.snapshot()["raw"]["sound"], 80)
        self.now += 16
        self.assertEqual(self.state.snapshot()["devices"], 0)
        self.assertEqual(self.state.snapshot()["visual"]["sound"], 0)

    def test_invalid_distance_does_not_contaminate_average(self):
        self.put(distanceCm=1023.855)
        self.put(device="b", distanceCm=20)
        self.assertEqual(self.state.snapshot()["raw"]["distanceCm"], 20)
        self.put(device="b", distanceCm=None)
        self.assertIsNone(self.state.snapshot()["raw"]["distanceCm"])
        self.assertEqual(self.state.snapshot()["visual"]["scale"], 1)

    def test_low_rgb_values_preserve_hue_and_black_falls_back(self):
        self.put(colour={"r": 1, "g": 2, "b": 0})
        self.assertEqual(self.state.snapshot()["visual"]["colour"], [.5, 1, 0])
        self.put(colour={"r": 0, "g": 0, "b": 0})
        self.assertEqual(self.state.snapshot()["visual"]["colour"], [.65, .38, .95])

    def test_bounded_controls_and_null_readings(self):
        self.put(sound=65535, lux=1000000, distanceCm=2)
        visual = self.state.snapshot()["visual"]
        self.assertEqual(visual["sound"], 1)
        self.assertEqual(visual["brightness"], 1)
        self.assertEqual(visual["scale"], 2.4)
        self.put(sound=0, lux=None, distanceCm=None)
        self.assertEqual(self.state.snapshot()["visual"]["sound"], 0)
        self.assertEqual(self.state.snapshot()["visual"]["brightness"], .7)


if __name__ == "__main__":
    unittest.main()
