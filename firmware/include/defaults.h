#pragma once
// Public firmware never includes locally generated credentials.
#if __has_include("secrets.h") && !defined(TEMPERATURE_PUBLIC_BUILD)
#include "secrets.h"
#endif
#ifndef ONE_WIRE_PIN
#define ONE_WIRE_PIN 16
#endif
#ifndef DEVICE_ID
#define DEVICE_ID "box-01"
#endif
#ifndef WIFI_SSID
#define WIFI_SSID ""
#endif
#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD ""
#endif
#ifndef BRIDGE_URL
#define BRIDGE_URL ""
#endif
#ifndef DEVICE_TOKEN
#define DEVICE_TOKEN ""
#endif
