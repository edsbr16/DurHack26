"""UNO Q: receive sensor JSON over Bridge, forward it using verified HTTPS."""
import json
import logging
import os
import ssl
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BACKEND_URL = os.environ.get('BACKEND_URL', 'https://durhack26.tend-to.dev').rstrip('/')
DEVICE_ID = os.environ.get('DEVICE_ID', 'uno-q-1')  # Use a different ID on each board.
ROOM = os.environ.get('ARTWORK_ROOM', 'PUBLIC')
logger = logging.getLogger('sensor_sender')


class SensorSender:
    """Keep only the newest reading; never do network work in the RPC callback."""
    def __init__(self, endpoint, device_id, room, opener=urlopen, clock=time.monotonic):
        if not endpoint.startswith('https://'):
            raise ValueError('Sensor endpoint must use HTTPS')
        self.endpoint = endpoint
        self.device_id = device_id
        self.room = room
        self.opener = opener
        self.clock = clock
        self.context = ssl.create_default_context()
        self.lock = threading.Lock()
        self.pending = None
        self.failures = 0
        self.retry_at = 0
        self.first_reading = True

    def receive(self, payload: str):
        try:
            data = json.loads(payload)
            if not isinstance(data, dict) or 'sound' not in data:
                raise ValueError('Expected sensor JSON containing sound')
            data.update(device_id=self.device_id, room=self.room)
            encoded = json.dumps(data, allow_nan=False).encode('utf-8')
        except (TypeError, ValueError) as exc:
            logger.warning('Ignored invalid reading: %s', exc)
            return
        with self.lock:
            self.pending = (encoded, self.clock())
            if self.first_reading:
                logger.info('Bridge reading received; sending live data')
                self.first_reading = False

    def step(self):
        with self.lock:
            item = self.pending
        if item is None or self.clock() < self.retry_at:
            return
        # Never keep replaying an old reading if the sketch stops.
        if self.clock() - item[1] > 5:
            with self.lock:
                if self.pending is item:
                    self.pending = None
            return
        request = Request(self.endpoint, data=item[0], method='POST',
                          headers={'Content-Type': 'application/json'})
        try:
            with self.opener(request, timeout=5, context=self.context) as response:
                if not 200 <= response.status < 300:
                    raise OSError(f'Unexpected HTTP status {response.status}')
                response.read(4096)
                logger.info('HTTP %s — sensor reading accepted (%s / %s)',
                            response.status, self.device_id, self.room)
            self.failures = 0
            self.retry_at = 0
            with self.lock:
                if self.pending is item:
                    self.pending = None
        except (HTTPError, URLError, OSError, TimeoutError) as exc:
            self.failures = min(self.failures + 1, 5)
            delay = min(10, 2 ** (self.failures - 1))
            self.retry_at = self.clock() + delay
            logger.warning('HTTPS send failed: %s; retrying latest reading in %ss', exc, delay)


def main():
    from arduino.app_utils import App, Bridge
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(name)s: %(message)s')
    sender = SensorSender(BACKEND_URL + '/api/data', DEVICE_ID, ROOM)
    Bridge.provide('sensor_data', sender.receive)
    logger.info('Sensor sender ready: %s/api/data; waiting for the sketch', BACKEND_URL)

    def loop():
        sender.step()
        time.sleep(.05)

    App.run(user_loop=loop)


if __name__ == '__main__':
    main()
