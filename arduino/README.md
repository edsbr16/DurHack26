# DurHack26 — UNO Q source in VS Code

The current App Lab app was exported from the connected UNO Q and imported here
on 15 November 2026. These are the actual sketch, Python and dependency files,
not the earlier placeholder sketch. The export did not change the board.

Open `/Users/ericadasilva/Library/CloudStorage/OneDrive-DurhamUniversity/Durham University/Year 3/Durhack/DurHack26` in VS Code so `frontend/`,
`backend/` and `arduino/` are in the same workspace. Do not edit the older
OneDrive checkout in parallel.

## Edit and update via App Lab

1. Edit `arduino/sketch/sketch.ino` or `arduino/python/main.py` and save.
2. In VS Code choose **Terminal > Run Task > Arduino: Build App Lab update package**.
3. In App Lab choose **Create new App > Import App** and select the ZIP printed
   by that task (inside `arduino/.exports/`). Import it as a separate app if App
   Lab reports an existing-name conflict; retain the existing working app.
4. Run the imported app in App Lab to compile/upload the sketch and start Python.

Alternatively copy the changed sketch into the existing App Lab app and Run.
The package task works without SSH, using App Lab's existing board connection.
It is an explicit transfer: saving in VS Code alone does not update the UNO Q.

## Direct SSH from VS Code

Use **Terminal > Run Task > Arduino: Open board SSH terminal** and enter
`arduino@BOARD_IP` using the current IP in App Lab > Settings. The Mac and board
must be able to reach each other. App Lab reported **No network connected**
during setup; its last displayed IP was `10.168.153.208`. `arduino.local` did not
resolve, so direct SSH has not been established or tested.

The official App CLI stores apps under `/home/arduino/ArduinoApps` by default;
this app's identifier is `durhack26`. Verify the folder on the board before
editing remotely. VS Code's Remote - SSH extension is already installed.
Do not maintain both a remote edited copy and a local edited copy independently.

## Sensor API

The sketch publishes JSON using `Bridge.notify("sensor_data", ...)`. Python
registers `Bridge.provide("sensor_data", ...)` and forwards each latest reading to
`https://durhack26.tend-to.dev/api/data` with certificate-verified HTTPS.

The sensor callback does not wait for HTTP. The sender retains only the latest
reading, retries with bounded backoff, and drops readings older than five seconds.
Python logs show `Sensor sender ready`, `Bridge reading received` and `HTTP 200`
when the pipeline is working. The serial monitor continues showing raw JSON.

Set a distinct `DEVICE_ID` in `python/main.py` for each board. `ROOM` defaults to
`PUBLIC`. These and `BACKEND_URL` may also be set through environment variables.
A successful curl test validates backend reachability; hardware compilation and
live Bridge delivery must still be verified by running the updated app.
