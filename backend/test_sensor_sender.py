import importlib.util
from pathlib import Path
import json
import unittest
from urllib.error import URLError

spec = importlib.util.spec_from_file_location('sensor_sender', Path(__file__).resolve().parents[1] / 'arduino/python/main.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Reply:
    status = 200
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def read(self, *args): return b'{"status":"ok"}'


class SenderTests(unittest.TestCase):
    def setUp(self):
        self.now = 0
        self.calls = []
        def opener(request, **options):
            self.calls.append((json.loads(request.data), options))
            return Reply()
        self.sender = module.SensorSender('https://durhack26.tend-to.dev/api/data', 'board-1', 'PUBLIC', opener, lambda: self.now)

    def test_latest_reading_and_identity_reach_verified_https(self):
        self.sender.receive('{"sound":10}')
        self.sender.receive('{"sound":30,"distanceCm":null}')
        self.sender.step()
        data, options = self.calls[0]
        self.assertEqual(data, {'sound':30, 'distanceCm':None, 'device_id':'board-1', 'room':'PUBLIC'})
        self.assertTrue(options['context'].check_hostname)
        self.assertIsNone(self.sender.pending)

    def test_backoff_keeps_newest_reading_instead_of_backlog(self):
        def fail(*args, **kwargs): raise URLError('offline')
        original = self.sender.opener
        self.sender.opener = fail
        self.sender.receive('{"sound":10}')
        self.sender.step()
        self.sender.receive('{"sound":80}')
        self.sender.opener = original
        self.sender.step()
        self.assertFalse(self.calls)
        self.now = 1
        self.sender.step()
        self.assertEqual(self.calls[0][0]['sound'], 80)

    def test_stale_and_invalid_readings_are_not_posted(self):
        for value in ['not json', '[]', '{"sound":NaN}']:
            self.sender.receive(value)
        self.sender.step()
        self.assertFalse(self.calls)
        self.sender.receive('{"sound":20}')
        self.now = 6
        self.sender.step()
        self.assertFalse(self.calls)

    def test_reading_arriving_during_request_is_not_lost(self):
        def opener(request, **options):
            self.sender.receive('{"sound":60}')
            return Reply()
        self.sender.opener = opener
        self.sender.receive('{"sound":20}')
        self.sender.step()
        self.assertEqual(json.loads(self.sender.pending[0])['sound'],60)


if __name__ == '__main__': unittest.main()
