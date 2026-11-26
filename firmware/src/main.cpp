#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h>
#include <esp_system.h>
#include "defaults.h"

// GPIO16: 3.3 V external power; 4.7 kOhm pull-up from DQ to 3.3 V.
OneWire oneWire(ONE_WIRE_PIN);
DallasTemperature sensor(&oneWire);
DeviceAddress address;
bool found = false;
bool converting = false;
bool previousPowerOnValue = false;
uint32_t conversionStart = 0, lastCycle = 0, lastWifiAttempt = 0;
uint32_t sequenceNumber = 0;
String bootId;

void publish(float temperature, const char* status, uint32_t sampledAt) {
  JsonDocument frame;
  frame["schema_version"] = 1;
  frame["device_id"] = DEVICE_ID;
  frame["boot_id"] = bootId;
  frame["sensor_id"] = "ds18b20-0";
  frame["source"] = "ds18b20";
  frame["sequence"] = sequenceNumber++;
  frame["sample_age_ms"] = static_cast<uint32_t>(millis() - sampledAt);
  frame["status"] = status;
  if (strcmp(status, "ok") == 0) frame["temperature_c"] = temperature;
  else frame["temperature_c"] = nullptr;
  String body;
  serializeJson(frame, body);
  Serial0.println(body); // USB-UART bridge on UART0.
#if ARDUINO_USB_CDC_ON_BOOT
  Serial.println(body);  // Native USB CDC / USB Serial-JTAG on supported ESP32-S3 boards.
#endif
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.setConnectTimeout(1500);
  http.setTimeout(1500);
  http.begin(BRIDGE_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
  const int code = http.POST(body);
  if (code != 200) Serial0.printf("bridge_http_status=%d\n", code);
  http.end();
}

void setup() {
  Serial0.begin(115200);
#if ARDUINO_USB_CDC_ON_BOOT
  Serial.begin(115200);
#endif
  delay(150);
  char id[32];
  snprintf(id, sizeof(id), "%08lx-%08lx", static_cast<unsigned long>(esp_random()), static_cast<unsigned long>(esp_random()));
  bootId = id;
  sensor.begin();
  sensor.setWaitForConversion(false);
  if (strlen(WIFI_SSID) && strcmp(WIFI_SSID,"YOUR_WIFI_SSID") != 0) {
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  } else { WiFi.mode(WIFI_OFF); }
  lastWifiAttempt = millis();
  Serial0.println("temperature-emotion-box firmware 0.4.0 / protocol 1");
}

void loop() {
  const uint32_t now = millis();
  if (strlen(WIFI_SSID) && strcmp(WIFI_SSID,"YOUR_WIFI_SSID") != 0 && WiFi.status() != WL_CONNECTED && static_cast<uint32_t>(now - lastWifiAttempt) >= 15000) {
    lastWifiAttempt = now;
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }
  if (!converting && static_cast<uint32_t>(now - lastCycle) >= 2000) {
    lastCycle = now;
    // Rediscovery allows unplug/replug recovery without rebooting the ESP32.
    found = sensor.getAddress(address, 0);
    if (!found) { previousPowerOnValue = false; publish(0, "disconnected", now); }
    else {
      sensor.setResolution(address, 12);
      sensor.requestTemperaturesByAddress(address);
      conversionStart = now;
      converting = true;
    }
  }
  if (converting && static_cast<uint32_t>(now - conversionStart) >= 800) {
    converting = false;
    const float value = sensor.getTempC(address); // DallasTemperature validates scratchpad CRC.
    const uint32_t sampledAt = millis();
    if (value == DEVICE_DISCONNECTED_C) { previousPowerOnValue = false; publish(0, "disconnected", sampledAt); }
    else if (!isfinite(value) || value < -55 || value > 125) { previousPowerOnValue = false; publish(0, "sensor_error", sampledAt); }
    else if (value == 85.0f && !previousPowerOnValue) {
      // A single 85 C reading may be the power-up sentinel. Require a second completed conversion.
      previousPowerOnValue = true;
      publish(0, "sensor_error", sampledAt);
    } else { previousPowerOnValue = value == 85.0f; publish(value, "ok", sampledAt); }
  }
  delay(5);
}
