#include <Arduino_Modulino.h>
#include <ArduinoJson.h>
#include <Arduino_RouterBridge.h>

#define SOUND_SENSOR_PIN A0

const int trigPin = 9;
const int echoPin = 10;

ModulinoLight light;
bool lightReady = false;

BridgeTCPClient<> network(Bridge);

// Configure these for your team's HTTP backend.
// Use an IP or hostname only: no http:// and no path.
const char SERVER_HOST[] = "REPLACE_WITH_SERVER_IP";
const int SERVER_PORT = 3000;
const char SERVER_PATH[] = "/api/data";

// Turn on after configuring the backend above.
const bool SEND_HTTP = false;

void setup() {
  Bridge.begin();
  Monitor.begin(115200);

  pinMode(SOUND_SENSOR_PIN, INPUT);
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  digitalWrite(trigPin, LOW);

  Modulino.begin();
  lightReady = light.begin();

  if (lightReady) {
    Monitor.println("Light sensor initialized.");
  } else {
    Monitor.println("Light unavailable; other sensors will continue.");
  }
}

void sendJson(const String &payload) {
  network.stop();

  // RouterBridge's example checks for negative connection errors.
  if (network.connect(SERVER_HOST, SERVER_PORT) < 0) {
    Monitor.println("HTTP connection failed.");
    network.stop();
    return;
  }

  network.print("POST ");
  network.print(SERVER_PATH);
  network.println(" HTTP/1.1");

  network.print("Host: ");
  network.print(SERVER_HOST);
  network.print(":");
  network.println(SERVER_PORT);

  network.println("Content-Type: application/json");
  network.println("Connection: close");
  network.print("Content-Length: ");
  network.println(payload.length());
  network.println();
  network.print(payload);

  // Print the HTTP response for debugging.
  unsigned long started = millis();

  while (millis() - started < 5000) {
    int available = network.available();

    if (available > 0) {
      uint8_t buffer[128];
      size_t count = available > 128 ? 128 : available;
      int received = network.read(buffer, count);

      if (received > 0) {
        Monitor.write(buffer, received);
      }
    } else if (!network.connected()) {
      break;
    }

    delay(10);
  }

  network.stop();
  Monitor.println();
}

void loop() {
  JsonDocument doc;

  // SOUND: raw analog value, not decibels.
  doc["sound"] = analogRead(SOUND_SENSOR_PIN);

  // DISTANCE
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  unsigned long duration = pulseIn(echoPin, HIGH, 30000UL);

  if (duration == 0) {
    doc["distanceCm"] = nullptr;
  } else {
    doc["distanceCm"] = duration * 0.0343f / 2.0f;
  }

  // LIGHT AND COLOUR
  if (lightReady && light.update()) {
    ModulinoColor color = light.getColor();
    uint32_t packed = static_cast<uint32_t>(color);

    doc["lux"] = light.getLux();
    doc["ir"] = light.getIR();
    doc["colour"]["r"] = (packed >> 24) & 0xFF;
    doc["colour"]["g"] = (packed >> 16) & 0xFF;
    doc["colour"]["b"] = (packed >> 8) & 0xFF;
  } else {
    doc["lux"] = nullptr;
    doc["ir"] = nullptr;
    doc["colour"] = nullptr;
  }

  String payload;
  serializeJson(doc, payload);

  Monitor.println(payload);

  if (SEND_HTTP) {
    sendJson(payload);
  }

  delay(500);
}