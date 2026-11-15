#include <Arduino_Modulino.h>
#include <ArduinoJson.h>
#include <Arduino_RouterBridge.h>

#define SOUND_SENSOR_PIN A0

const int trigPin = 9;
const int echoPin = 10;

ModulinoLight light;
bool lightReady = false;

void setup() {
  Bridge.begin();
  Monitor.begin();
  delay(2000);

  Monitor.println("1: Monitor ready");

  pinMode(SOUND_SENSOR_PIN, INPUT);
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  digitalWrite(trigPin, LOW);

  Monitor.println("2: Pins configured");

  Modulino.begin();
  Monitor.println("3: Modulino system ready");

  lightReady = light.begin();
  Monitor.println("4: Light initialization returned");

  if (lightReady) {
    Monitor.println("Light detected");
  } else {
    Monitor.println("Light not detected");
  }
}

void loop() {
  Monitor.println("5: Loop running");
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

  // Linux-side Python handles certificate-verified HTTPS.
  Bridge.notify("sensor_data", payload.c_str());

  delay(500);

}
