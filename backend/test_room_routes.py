import unittest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
import room_routes

app = FastAPI()
app.include_router(room_routes.router)

class RoomRouteTests(unittest.TestCase):
    def setUp(self):
        room_routes.store.rooms.clear()
        room_routes.sockets.clear()
        room_routes.last_broadcast.clear()
        self.client = TestClient(app)

    def create_join(self, code=None):
        if code is None: code = self.client.post('/api/rooms').json()['code']
        response = self.client.post('/api/rooms/join', json={'code': code})
        self.assertEqual(response.status_code, 200)
        return code, response.json()['token']

    def until(self, ws, predicate):
        for _ in range(20):
            data = ws.receive_json()
            if predicate(data): return data
        self.fail('Expected room state did not arrive')

    def test_two_people_share_notes_leave_releases_and_other_room_isolated(self):
        code, a = self.create_join()
        _, b = self.create_join(code)
        other, c = self.create_join()
        with self.client.websocket_connect(f'/api/rooms/{code}/ws') as wa:
            wa.send_json({'token': a});wa.receive_json()
            with self.client.websocket_connect(f'/api/rooms/{other}/ws') as wc:
                wc.send_json({'token': c});wc.receive_json()
                with self.client.websocket_connect(f'/api/rooms/{code}/ws') as wb:
                    wb.send_json({'token': b})
                    self.until(wb, lambda d: len(d['participants']) == 2)
                    wa.send_json({'event':'input','pressure':[1,0,0,0],'notes':[0,2,3,4],'octave':1})
                    shared = self.until(wb, lambda d: d['fingers']['pressure'][0] == 1)
                    self.assertEqual(shared['participants'][0]['frequencies'][0], 523.26)
                    self.assertNotIn('landmarks', str(shared))
                    self.assertNotIn('jpeg', str(shared))
                    isolated = self.until(wc, lambda d: d['code'] == other)
                    self.assertEqual(isolated['fingers']['pressure'], [0,0,0,0])
                    self.assertEqual(len(isolated['participants']), 1)
                self.until(wa, lambda d: len(d['participants']) == 1)

    def test_sensor_source_and_channel_switches_are_shared(self):
        from sensor_routes import sensor_state
        sensor_state.put({'room':'PUBLIC','device_id':'test-public','sound':32,'distanceCm':30,'lux':200})
        code, token = self.create_join()
        with self.client.websocket_connect(f'/api/rooms/{code}/ws') as ws:
            ws.send_json({'token':token})
            data = ws.receive_json()
            self.assertGreaterEqual(data['environment']['devices'], 1)
            ws.send_json({'event':'sensors','enabled':{'sound':False,'distance':False}})
            data = self.until(ws, lambda d: not d['sensor_settings']['enabled']['sound'])
            self.assertEqual(data['environment']['visual']['sound'], 0)
            self.assertEqual(data['environment']['visual']['scale'], 1)
            ws.send_json({'event':'sensors','source':'room'})
            data = self.until(ws, lambda d: d['sensor_settings']['source']=='room')
            self.assertEqual(data['environment']['devices'], 0)
        sensor_state.devices.clear()

    def test_room_lookup_rejects_unknown_without_allocating_members(self):
        code = self.client.post('/api/rooms').json()['code']
        self.assertEqual(self.client.get(f'/api/rooms/{code}').json()['code'], code)
        self.assertEqual(len(room_routes.store.rooms[code].members), 0)
        self.assertEqual(self.client.get('/api/rooms/XXXXXX').status_code, 404)

    def test_bad_auth_and_invalid_input(self):
        code, token = self.create_join()
        with self.client.websocket_connect(f'/api/rooms/{code}/ws') as ws:
            ws.send_json({'token':'wrong'})
            with self.assertRaises(WebSocketDisconnect) as exc: ws.receive_json()
            self.assertEqual(exc.exception.code, 1008)
        with self.client.websocket_connect(f'/api/rooms/{code}/ws') as ws:
            ws.send_json({'token':token});ws.receive_json()
            ws.send_json({'event':'input','pressure':[500,0,0,0],'notes':[999,2,3,4]})
            data = ws.receive_json()
            self.assertEqual(data['fingers']['pressure'], [0,0,0,0])
        self.assertEqual(self.client.post('/api/rooms/join',json={'code':'XXXXXX'}).status_code,404)

if __name__ == '__main__': unittest.main()
