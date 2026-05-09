# Steven's Magic Mirror — Project Overview

Smart home mirror system for Steven & Leah Stevenson in Queen Anne, Seattle, WA.
Built on MagicMirror² running on Raspberry Pi 4 units connected to portrait-mode monitors.

---

## Repo Structure

```
magicmirror-custom/
├── CLAUDE.md                  ← you are here
├── package.json               ← root workspace (turbo + npm scripts)
├── turbo.json                 ← turbo task config
├── .nvmrc                     ← node v24.15.0
├── .gitmodules                ← MagicMirror² pinned as submodule
├── mirror-1/                  ← Pi 1 (weather, calendars, Claude briefing)
│   ├── CLAUDE.md              ← Pi 1 SSH + deploy instructions
│   ├── config.js              ← MagicMirror config, port 8080 (gitignored)
│   ├── config.example.js      ← template — copy to config.js and fill in values
│   ├── custom.css             ← styles for this Pi
│   └── index.html             ← patched MagicMirror entry (browser-mode class)
├── mirror-2/                  ← Pi 2 (clock, energy, cars, network)
│   ├── CLAUDE.md              ← Pi 2 SSH + deploy instructions
│   ├── config.js              ← MagicMirror config, port 8081 (gitignored)
│   ├── config.example.js      ← template — copy to config.js and fill in values
│   ├── custom.css             ← styles for this Pi
│   └── index.html             ← patched MagicMirror entry (browser-mode class)
├── modules/                   ← ALL modules live here (source of truth)
│   ├── MMM-ClaudeBriefing/    ← custom
│   ├── MMM-TeslaEnergy/       ← custom
│   ├── MMM-RivianCar/         ← custom
│   ├── MMM-LucidCar/          ← custom
│   ├── MMM-SenseEnergy/       ← custom
│   ├── MMM-LevitonPanel/      ← custom
│   ├── MMM-UnifiNetwork/      ← custom
│   ├── MMM-UnifiProtect/      ← custom
│   ├── MMM-Synology/          ← custom
│   ├── MMM-PingStatus/        ← custom
│   ├── MMM-Gif/               ← custom
│   ├── MMM-SysInfo/           ← custom
│   ├── MMM-DadJoke/           ← custom
│   ├── MMM-FlumeWater/        ← custom
│   ├── MMM-AQI/               ← community (git clone)
│   ├── MMM-CalendarExt3Agenda/ ← community (git clone)
│   ├── MMM-DigClock/          ← community (git clone)
│   ├── MMM-MyCommute/         ← community (git clone)
│   ├── MMM-OpenWeatherMapForecast/ ← community (git clone)
│   └── MMM-Universal-Pir/    ← community (git clone)
├── MagicMirror/               ← MagicMirror² core (git submodule — do not edit)
│   └── modules/               ← symlinks only, each → ../../modules/MMM-*
│                                 created by scripts/setup.sh
└── scripts/
    ├── setup.sh               ← one-time local setup after cloning
    ├── deploy.sh              ← deploy config + modules to Pi(s) via scp
    └── modules.sh             ← install community modules on a fresh Pi
```

---

## First-time Setup (after cloning)

```bash
git clone --recurse-submodules <repo-url>
cd magicmirror-custom
nvm use
npm install
npm run setup
```

`npm run setup` (`scripts/setup.sh`) will:
1. Run `git submodule update --init --recursive` and `npm install` inside `MagicMirror/`
2. Create all symlinks from `MagicMirror/modules/MMM-*` → `modules/MMM-*`
3. Copy `mirror-1/index.html` into `MagicMirror/` (browser-mode class patch)

Then create your config files:
```bash
cp mirror-1/config.example.js mirror-1/config.js   # fill in API keys + calendar URLs
cp mirror-2/config.example.js mirror-2/config.js   # fill in passwords + API keys
```

---

## Running Locally (dev)

```bash
nvm use                    # switches to v24.15.0 per .nvmrc
npm install                # install turbo

npm start                  # start both mirrors in parallel
npm run start:mirror-1     # mirror 1 only (port 8080)
npm run start:mirror-2     # mirror 2 only (port 8081)
```

MagicMirror² uses `MM_CONFIG_FILE` env var to select a config. Each mirror's
`package.json` sets this to the absolute path of its own `config.js` before
starting `node serveronly` from within the `MagicMirror/` directory.

---

## Deploying to a Pi

```bash
npm run deploy             # deploy both mirrors
npm run deploy:mirror-1    # mirror 1 only
npm run deploy:mirror-2    # mirror 2 only
```

`scripts/deploy.sh` copies `config.js`, `custom.css`, `index.html`,
`start-mirror.sh`, and all custom modules via scp, then restarts PM2.

- Mirror 1: `magicmirror@10.10.10.220`
- Mirror 2: `magicmirror@10.10.10.85`

Private key access is configured — no password needed.

---

## Creating a New Custom Module

**All custom modules must be created in `modules/` at the repo root, never directly
inside `MagicMirror/modules/`.** After creating the module:

```bash
# 1. Create the module
mkdir modules/MMM-MyModule
# ... add MMM-MyModule.js, node_helper.js, MMM-MyModule.css, package.json

# 2. Add symlink (use absolute path — relative symlinks break at MM startup)
ln -s "$(pwd)/modules/MMM-MyModule" MagicMirror/modules/MMM-MyModule

# 3. Add to the MODULES list in scripts/setup.sh

# 4. Add to the mirror-specific block in scripts/deploy.sh
```

---

## What Each Mirror Shows

### Mirror 1 (Pi 1 — `mirror-1/`)
- System info (top left)
- Seattle weather forecast (top left, below system)
- Person 1 calendar agenda (top right)
- Person 2 calendar agenda (top center)
- Claude AI daily briefing (top left, below weather)
- Animated gif at screen bottom (pauseInterval: 63s)

### Mirror 2 (Pi 2 — `mirror-2/`)
- System info (top left)
- Digital clock with date (top left, below system)
- Tesla Energy — solar, Powerwall, grid, home (top center)
- Leviton smart panel — upstairs circuits (top center)
- Sense energy monitor — basement panel (top center)
- UniFi Network — WAN, clients, device health (top right)
- UniFi Protect — sensors, cameras, smart detect (top left)
- Commute traffic — weekdays only (top center)
- Ping/uptime status (top right)
- Synology NAS health (top right)
- Rivian R1S status (bottom left)
- Lucid Air status (bottom right)
- Air quality index (top center)
- Animated gif at screen bottom (pauseInterval: 156s, offset from mirror-1)

Both mirrors have MMM-Remote-Control and MMM-Universal-Pir (PIR wired to GPIO 24 on both Pis).

---

## Custom Modules

### MMM-ClaudeBriefing
- Calls Anthropic API every 8 hours
- Waits 30s debounce after last CALENDAR_EVENTS notification before fetching
- Receives weather data from OPENWEATHER_ONE_CALL_FORECAST_WEATHER_UPDATE and injects
  a "last updated" timestamp into the weather module's DOM
- Model: claude-sonnet-4-6

### MMM-TeslaEnergy
- OAuth2 + PKCE via Tesla Fleet API
- Token stored in `modules/MMM-TeslaEnergy/token.json` (gitignored)
- Auto-refreshes on expiry with 3 retries (5s delay each)
- Fetches `live_status` (realtime watts) + `calendar_history` (daily kWh) in parallel
- `token.json` must be manually refreshed if the Pi was offline long enough for the
  refresh token to expire — run `node authorize.js` or refresh from dev machine and scp

### MMM-Gif
- Animated gif slides across the bottom of the screen
- Config options: `gifs[]`, `travelDuration`, `pauseInterval`, `width`, `bottomOffset`
- Gif files live in `modules/MMM-Gif/gifs/`

---

## API Keys & Credentials

| Service            | Location                                                   |
|--------------------|------------------------------------------------------------|
| Anthropic          | `mirror-1/config.js` → MMM-ClaudeBriefing.apiKey          |
| OpenWeatherMap     | `mirror-1/config.js` → MMM-OpenWeatherMapForecast.apikey  |
| Google Calendars   | `mirror-1/config.js` → calendar.calendars[].url (iCal)    |
| Google Maps        | `mirror-2/config.js` → MMM-MyCommute.apikey               |
| AQI               | `mirror-2/config.js` → MMM-AQI.token                      |
| Tesla Fleet API    | `modules/MMM-TeslaEnergy/credentials.json` (gitignored)   |
| Tesla token        | `modules/MMM-TeslaEnergy/token.json` (gitignored)         |
| Rivian token       | `modules/MMM-RivianCar/token.json` (gitignored)           |
| Lucid token        | `modules/MMM-LucidCar/token.json` (gitignored)            |
| Vehicle/service passwords | `mirror-2/config.js` (gitignored)                  |

---

## Key Decisions & Gotchas

- `MMM-OpenWeatherMapForecast` uses `updateInterval` in **minutes** (not ms) — the module multiplies internally
- `custom.css` is loaded from `MagicMirror/config/custom.css` by MagicMirror's loader.js — not `css/custom.css`
- Electron on Pi requires `ELECTRON_OZONE_PLATFORM_HINT=x11` and `--no-sandbox` flags
- `this.data` is a reserved MagicMirror internal property — custom modules must use a different name (e.g. `this.data2`)
- Calendar `waitFetch` default (5s) is too short for Pi's slow iCal fetches — both mirrors use 25s
- Tesla WAF (Akamai) blocks Node's default User-Agent — all Tesla API calls include a browser User-Agent header
- `MM_CONFIG_FILE` must be an absolute path; MagicMirror strips its own root path from the value
- **PIR display control**: Both Pis use `vc4-kms-v3d` (KMS driver). Neither `xset dpms` nor `vcgencmd display_power` work with this driver. Use `xrandr` instead:
  - Mirror 1: `DISPLAY=:0 xrandr --output HDMI-1 --off` / `--auto`
  - Mirror 2: `DISPLAY=:0 xrandr --output HDMI-2 --off` / `--auto`
  - The HDMI output name differs between Pis — confirmed via `DISPLAY=:0 xrandr`
- **PIR gpiomon**: Use `gpiomon -b` (both edges), not `-r` (rising only) — rising edge alone misses some PIR transitions
- **PIR wiring**: HC-SR501 — 5V→pin 2, GND→pin 6, OUT→pin 18 (GPIO 24)
