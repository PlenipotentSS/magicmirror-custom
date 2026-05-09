# Magic Mirror Project 
**As of: May 6, 2026**
**Location:** Queen Anne, Seattle, WA (America/Los_Angeles)

---

## Overview

A two-mirror smart home display system built on [MagicMirror²](https://magicmirror.builders/), running on two Raspberry Pi 4 units connected to portrait-mode monitors (1080×1920). Both mirrors display live home, energy, calendar, and AI data. All custom module source code lives in a single monorepo (`magicmirror-custom/`) managed with Turborepo, with modules symlinked into the MagicMirror² core directory.

---

## Hardware

| Unit     | IP             | Display      | Purpose                              |
|----------|----------------|--------------|--------------------------------------|
| Mirror 1 | 10.10.10.220   | Portrait LCD | Weather, calendars, Claude briefing  |
| Mirror 2 | 10.10.10.85    | Portrait LCD | Energy, cars, network, NAS, clock    |

- **OS:** Raspberry Pi OS 64-bit
- **Runtime:** Node.js v18 (system node on Pi), managed via PM2
- **Display driver:** `vc4-kms-v3d` (KMS) — requires `xrandr` for display on/off (not `xset` or `vcgencmd`)
- **PIR sensor:** HC-SR501 wired to GPIO 24 (pin 18) on both Pis — triggers screen off/on via `xrandr`
  - Mirror 1: `xrandr --output HDMI-1 --off/--auto`
  - Mirror 2: `xrandr --output HDMI-2 --off/--auto`

---

## Repo Structure

```
magicmirror-custom/
├── package.json              ← root workspace (turbo), Node v24.15.0
├── turbo.json
├── .nvmrc                    ← v24.15.0
├── mirror-1/                 ← Pi 1 config, port 8080
│   ├── config.js
│   └── custom.css
├── mirror-2/                 ← Pi 2 config, port 8081
│   ├── config.js
│   └── custom.css
├── modules/                  ← ALL custom module source (authoritative)
│   ├── MMM-ClaudeBriefing/
│   ├── MMM-TeslaEnergy/
│   ├── MMM-SenseEnergy/
│   ├── MMM-LevitonPanel/
│   ├── MMM-UnifiNetwork/
│   ├── MMM-UnifiProtect/
│   ├── MMM-LucidCar/
│   ├── MMM-RivianCar/
│   ├── MMM-Gif/
│   ├── MMM-SysInfo/
│   ├── MMM-DigClock/
│   ├── MMM-AQI/
│   ├── MMM-PingStatus/
│   ├── MMM-Synology/
│   ├── MMM-MyCommute/
│   ├── MMM-OpenWeatherMapForecast/
│   ├── MMM-CalendarExt3Agenda/
│   └── MMM-Universal-Pir/
└── MagicMirror/              ← MagicMirror² core (git submodule / install)
    ├── config/config.js      ← legacy single-mirror config (kept in sync with mirror-1)
    ├── config/custom.css
    └── modules/              ← symlinks only → ../../modules/MMM-*/
```

Deployment is via `scp` + `ssh pm2 restart all`. No CI pipeline; dev machine is the build station.

---

## Mirror 1 — Displays

| Module                     | Zone         | Description                                      |
|----------------------------|--------------|--------------------------------------------------|
| MMM-SysInfo                | top_left     | CPU %, memory, CPU temperature                   |
| MMM-OpenWeatherMapForecast | top_left     | Seattle 5-day weather (OpenWeatherMap API)       |
| MMM-CalendarExt3Agenda     | top_right    | Google Calendar (iCal), days 0–4                 |
| MMM-CalendarExt3Agenda     | top_center   | Google Calendar (iCal), days 0–4                 |
| MMM-ClaudeBriefing         | top_left     | AI-generated daily briefing (Anthropic API)      |
| MMM-Gif                    | bottom_right | Animated gif slide, pauseInterval 63s            |
| MMM-Remote-Control         | —            | Web remote at :8080/remote.html                  |
| MMM-Universal-Pir          | bottom_bar   | PIR motion → display on/off                      |

---

## Mirror 2 — Displays

| Module              | Zone          | Description                                                     |
|---------------------|---------------|-----------------------------------------------------------------|
| MMM-DigClock        | top_left      | Digital clock + date (America/Los_Angeles)                      |
| MMM-SysInfo         | top_left      | CPU %, memory, CPU temperature                                  |
| MMM-AQI             | top_center    | Air Quality Index — Queen Anne (EPA/OpenAQ)                     |
| MMM-TeslaEnergy     | top_center    | Tesla Powerwall — solar kW/kWh, battery %, grid, home load      |
| MMM-LevitonPanel    | top_center    | Leviton Smart Load Center (upstairs panel) — circuits, totals   |
| MMM-SenseEnergy     | top_center    | Sense Energy Monitor (basement panel) — realtime watts          |
| MMM-UnifiNetwork    | top_right     | UniFi WAN status, client count, device health                   |
| MMM-UnifiProtect    | top_left      | UniFi Protect — sensor grid, camera health, smart detections    |
| MMM-LucidCar        | bottom_right  | Lucid Air — battery %, range, charge state, lock, windows       |
| MMM-RivianCar       | bottom_left   | Rivian R1S — battery %, range, charge state, lock, windows      |
| MMM-MyCommute       | top_center    | Google Maps commute estimate (weekdays 06:30–09:00)             |
| MMM-PingStatus      | top_right     | Ping/uptime monitor for key home hosts                          |
| MMM-Synology        | top_right     | Synology NAS health — disk status, RAID, volume usage           |
| MMM-Gif             | bottom_right  | Animated gif slide, pauseInterval 156s (offset from mirror-1)   |
| MMM-Remote-Control  | —             | Web remote at :8081/remote.html                                 |
| MMM-Universal-Pir   | bottom_bar    | PIR motion → display on/off                                     |

---

## Custom Modules — Technical Detail

### MMM-ClaudeBriefing
- **What:** Calls Anthropic API every 8 hours to generate a personalized household briefing
- **Stack:** node_helper.js → Anthropic REST API (`claude-sonnet-4-6` model)
- **Logic:** Waits 30s debounce after last `CALENDAR_EVENTS` notification before fetching, so it incorporates latest calendar data. Also receives `OPENWEATHER_ONE_CALL_FORECAST_WEATHER_UPDATE` and injects a "last updated" timestamp into the weather module's DOM.
- **Extras:** Has a `jokes.json` file for fallback content

### MMM-TeslaEnergy
- **What:** Shows live Tesla Powerwall + solar data
- **Stack:** node_helper.js → Tesla Fleet API (OAuth2 + PKCE)
- **Auth:** `credentials.json` + `token.json` on disk; auto-refreshes with 3 retries (5s delay). Has `authorize.js` script for manual re-auth.
- **Fetches:** `live_status` (realtime watts) + `calendar_history` (daily kWh) in parallel
- **Gotcha:** Tesla WAF (Akamai) blocks Node's default User-Agent — all requests use a browser UA header

### MMM-SenseEnergy
- **What:** Realtime household energy from Sense Energy Monitor
- **Stack:** node_helper.js → Sense REST auth + WebSocket realtime feed (`clientrt.sense.com`)
- **APIs:** `api.sense.com/apiservice/api/v1/` for auth + trends; `wss://clientrt.sense.com/monitors/{id}/realtimefeed` for live data

### MMM-LevitonPanel
- **What:** Shows circuit-level power for the upstairs Leviton Smart Load Center
- **Stack:** node_helper.js → WebSocket connection to Leviton My Leviton API (`my.leviton.com/api`)
- **Storage:** `kwh-baseline.json` on disk for daily kWh calculation

### MMM-UnifiNetwork
- **What:** WAN status, client count, device health from UniFi Dream Machine
- **Stack:** node_helper.js → UniFi Network API on UDM at `10.10.10.1`
- **Auth:** API key (Network → Settings → Integrations)
- **Note:** Uses `https.Agent({ rejectUnauthorized: false })` for self-signed cert

### MMM-UnifiProtect
- **What:** UniFi Protect camera/sensor grid — motion, smart detections, camera online status
- **Stack:** node_helper.js → UniFi Protect API on UDM at `10.10.10.13`

### MMM-LucidCar
- **What:** Lucid Air vehicle status — battery, range, charging, lock/window state
- **Stack:** node_helper.js → Lucid Motors gRPC API (proto files bundled in `proto/`)
- **Auth:** username/password → token saved to `token.json`; auto-refreshes
- **Display:** SVG car image (side profile)

### MMM-RivianCar
- **What:** Rivian R1S vehicle status — battery, range, charging, lock state
- **Stack:** node_helper.js → Rivian GraphQL API
- **Auth:** username/password + UUID device ID → token saved to `token.json`
- **Display:** PNG car image

### MMM-SysInfo
- **What:** Local Raspberry Pi system stats
- **Stack:** node_helper.js → Node.js `os` module + `execSync` for vcgencmd CPU temp
- **Displays:** CPU %, used/total memory, CPU temperature (°F)

### MMM-Gif
- **What:** Animated GIF slides across the bottom of the screen on a loop
- **Config:** `gifs[]` array, `travelDuration`, `pauseInterval`, `width`, `bottomOffset`
- **Files:** GIF assets live in `modules/MMM-Gif/gifs/`
- **Timing:** Mirror 1 = 63s pause, Mirror 2 = 156s pause (intentionally offset)

### MMM-AQI
- **What:** Air Quality Index for Queen Anne
- **Stack:** node_helper.js → EPA/OpenAQ API
- **Includes:** CSS, translations, screenshot assets

### MMM-PingStatus
- **What:** Monitors connectivity/uptime of key hosts via ICMP ping
- **Stack:** node_helper.js → `ping` npm package

### MMM-Synology
- **What:** Synology NAS health — volumes, RAID, disk status
- **Stack:** node_helper.js → Synology DSM REST API (HTTPS, self-signed cert)
- **Auth:** username/password → session ID (`sid`)

### MMM-MyCommute
- **What:** Commute time estimate to specific destination
- **Stack:** node_helper.js → Google Maps Directions API
- **Schedule:** Only active weekdays 06:30–09:00

### MMM-DigClock
- **What:** Large digital clock with date display
- **Community module** (justjim1220/MMM-DigClock), no backend

### MMM-OpenWeatherMapForecast
- **What:** 5-day weather forecast for Seattle
- **Community module** — `updateInterval` is in **minutes** (module multiplies internally)

### MMM-CalendarExt3Agenda
- **What:** Google Calendar agenda view
- **Community module** — reads iCal URLs; each used for each partner

### MMM-Universal-Pir
- **What:** PIR motion sensor → triggers screen on/off
- **Community module** with custom config
- **Wiring:** HC-SR501 — 5V pin 2, GND pin 6, OUT pin 18 (GPIO 24) — same on both Pis
- **Command:** Uses `gpiomon -b` (both edges) for reliable detection
- **Screen control:** `DISPLAY=:0 xrandr --output HDMI-{1|2} --off` / `--auto`
- **Note:** Must also run `xset -dpms` to prevent display from re-blanking after wake

---

## External Services & APIs

| Service            | Module(s)                    | Protocol          | Notes                                          |
|--------------------|------------------------------|-------------------|------------------------------------------------|
| Anthropic Claude   | MMM-ClaudeBriefing           | REST/HTTPS        | claude-sonnet-4-6 model, 8hr refresh           |
| OpenWeatherMap     | MMM-OpenWeatherMapForecast   | REST/HTTPS        | One Call API                                   |
| Google Calendar    | MMM-CalendarExt3Agenda       | iCal (HTTPS)      | Two calendars:                                 |
| Tesla Fleet API    | MMM-TeslaEnergy              | REST/HTTPS OAuth2 | PKCE flow, Akamai WAF — custom UA required     |
| Sense Energy       | MMM-SenseEnergy              | REST + WebSocket  | `api.sense.com` + `clientrt.sense.com`         |
| Leviton            | MMM-LevitonPanel             | REST + WebSocket  | `my.leviton.com/api`                           |
| UniFi Network      | MMM-UnifiNetwork             | REST/HTTPS        | UDM at 10.10.10.1, self-signed cert            |
| UniFi Protect      | MMM-UnifiProtect             | REST/HTTPS        | UDM at 10.10.10.13                             |
| Lucid Motors       | MMM-LucidCar                 | gRPC              | Proto files bundled, token auth                |
| Rivian             | MMM-RivianCar                | GraphQL/HTTPS     | Token auth with UUID device ID                 |
| Google Maps        | MMM-MyCommute                | REST/HTTPS        | Directions API, weekday mornings only          |
| EPA / OpenAQ       | MMM-AQI                      | REST/HTTPS        | Queen Anne air quality                         |
| Synology DSM       | MMM-Synology                 | REST/HTTPS        | NAS at 10.10.10.64, self-signed cert           |

---

## Network / Infrastructure Context

- **Router/Firewall:** UniFi Dream Machine at `10.10.10.1`
- **UniFi Protect NVR:** `10.10.10.13`
- **Synology NAS:** `10.10.10.64`
- **Mirror 1 Pi:** `10.10.10.220`
- **Mirror 2 Pi:** `10.10.10.85`
- **Subnet:** 10.10.10.0/24 (home LAN)
- All Pi access is via SSH private key, no password
- PM2 manages the MagicMirror² process and handles auto-restart on reboot

---

## Key Engineering Decisions & Gotchas

- **Custom modules always live in `modules/` (repo root)**, then symlinked into `MagicMirror/modules/` with absolute paths — relative symlinks break when MagicMirror changes working directory
- **`this.data` is reserved** in MagicMirror — custom modules use `this.data2` instead
- **`MM_CONFIG_FILE` must be an absolute path** — MagicMirror strips its own root from the value
- **Calendar `waitFetch`** default (5s) is too short for Pi's slow iCal fetches — both mirrors use 25s
- **PIR display control** — KMS driver (`vc4-kms-v3d`) means neither `xset dpms` nor `vcgencmd display_power` work; must use `xrandr`. Also must run `xset -dpms` alongside `xrandr --auto` when waking the display, or it re-blanks immediately.
- **Electron flags on Pi:** `ELECTRON_OZONE_PLATFORM_HINT=x11` + `--no-sandbox` required
- **Tesla WAF:** Akamai blocks Node's default User-Agent — all Tesla API calls include a real browser UA
- **OpenWeatherMap `updateInterval`** is in minutes in this community module (not milliseconds)
- **`gpiomon -b`** (both edges) required for PIR — rising-only misses transitions

---
