# Magic Mirror
## Raspberry Pi 4 + MagicMirror² — Two-mirror setup

---

## Repo Structure

```
magicmirror-custom/
├── package.json               ← root workspace (turbo + npm scripts)
├── turbo.json                 ← turbo task config
├── .nvmrc                     ← node v24.15.0
├── .gitmodules                ← MagicMirror² pinned as submodule
│
├── mirror-1/                  ← Pi 1 (weather, calendars, Claude briefing)
│   ├── config.js              ← MagicMirror config (gitignored — copy from .example)
│   ├── config.example.js      ← template with placeholder values
│   ├── custom.css             ← styles deployed to this Pi
│   ├── index.html             ← patched MagicMirror entry (browser-mode class)
│   └── start-mirror.sh        ← PM2 start script
│
├── mirror-2/                  ← Pi 2 (clock, energy, cars, network)
│   ├── config.js              ← MagicMirror config (gitignored — copy from .example)
│   ├── config.example.js      ← template with placeholder values
│   ├── custom.css             ← styles deployed to this Pi
│   ├── index.html             ← patched MagicMirror entry (browser-mode class)
│   └── start-mirror.sh        ← PM2 start script
│
├── modules/                   ← all custom + community modules (source of truth)
│   ├── MMM-ClaudeBriefing/
│   ├── MMM-TeslaEnergy/
│   ├── MMM-RivianCar/
│   ├── MMM-LucidCar/
│   ├── MMM-SenseEnergy/
│   ├── MMM-LevitonPanel/
│   ├── MMM-UnifiNetwork/
│   ├── MMM-UnifiProtect/
│   ├── MMM-Synology/
│   ├── MMM-PingStatus/
│   ├── MMM-Gif/
│   ├── MMM-SysInfo/
│   ├── MMM-DadJoke/
│   ├── MMM-FlumeWater/
│   ├── MMM-AQI/               ← community (git clone)
│   ├── MMM-CalendarExt3Agenda/ ← community (git clone)
│   ├── MMM-DigClock/          ← community (git clone)
│   ├── MMM-MyCommute/         ← community (git clone)
│   ├── MMM-OpenWeatherMapForecast/ ← community (git clone)
│   └── MMM-Universal-Pir/    ← community (git clone)
│
├── MagicMirror/               ← MagicMirror² core (git submodule, do not edit)
│   └── modules/               ← symlinks only, each → ../../modules/MMM-*
│                                 (created by scripts/setup.sh)
│
└── scripts/
    ├── setup.sh               ← one-time local setup after cloning
    ├── deploy.sh              ← deploy config + modules to Pi(s) via scp
    └── modules.sh             ← install community modules on a fresh Pi
```

---

## First-time local setup

```bash
git clone --recurse-submodules <repo-url>
cd magicmirror-custom
nvm use
npm install
npm run setup
```

`npm run setup` will:
1. Initialise the MagicMirror² submodule and run `npm install` inside it
2. Create symlinks from `MagicMirror/modules/MMM-*` → `modules/MMM-*`
3. Copy `mirror-1/index.html` into `MagicMirror/` (browser-mode patch)

Then create your config files from the templates:
```bash
cp mirror-1/config.example.js mirror-1/config.js
cp mirror-2/config.example.js mirror-2/config.js
# Fill in API keys, passwords, and calendar URLs
```

---

## Running locally (dev)

```bash
npm start                  # start both mirrors in parallel
npm run start:mirror-1     # mirror 1 only (port 8080)
npm run start:mirror-2     # mirror 2 only (port 8081)
```

MagicMirror² uses `MM_CONFIG_FILE` to select a config. Each mirror's `package.json`
sets this to the absolute path of its `config.js` before starting `node serveronly`.

---

## Deploying to a Pi

```bash
npm run deploy             # deploy both mirrors
npm run deploy:mirror-1    # mirror 1 only
npm run deploy:mirror-2    # mirror 2 only
```

Each deploy copies `config.js`, `custom.css`, `index.html`, `start-mirror.sh`, and
all custom modules to the Pi via scp, then restarts PM2.

---

## Setting up a fresh Pi

### 1. Install Node via nvm

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 18 && nvm use 18 && nvm alias default 18
```

### 2. Install MagicMirror²

```bash
git clone https://github.com/MichMich/MagicMirror.git ~/MagicMirror
cd ~/MagicMirror && npm install
```

### 3. Install community modules

```bash
cd ~/MagicMirror/modules
bash ~/scripts/modules.sh
```

### 4. Deploy from dev machine

```bash
npm run deploy:mirror-1    # or mirror-2
```

### 5. Autostart with PM2

```bash
ssh magicmirror@<PI_IP> "cd ~/MagicMirror && pm2 start ~/start-mirror.sh --name MagicMirror && pm2 startup && pm2 save"
```

---

## Adding a new custom module

```bash
# 1. Create the module in the repo
mkdir modules/MMM-MyModule
# ... add MMM-MyModule.js, node_helper.js, package.json

# 2. Add symlink into MagicMirror (use absolute path)
ln -s "$(pwd)/modules/MMM-MyModule" MagicMirror/modules/MMM-MyModule

# 3. Add it to the MODULES list in scripts/setup.sh

# 4. Add it to the mirror-specific deploy block in scripts/deploy.sh
```

---

## API keys & credentials

All secrets go in `mirror-1/config.js` or `mirror-2/config.js` (gitignored).
Use the `.example.js` files as templates.

| Service            | Location                                          |
|--------------------|---------------------------------------------------|
| Anthropic          | `mirror-1/config.js` → MMM-ClaudeBriefing.apiKey |
| OpenWeatherMap     | `mirror-1/config.js` → MMM-OpenWeatherMapForecast.apikey |
| Google Calendars   | `mirror-1/config.js` → calendar.calendars[].url  |
| Tesla Fleet API    | `modules/MMM-TeslaEnergy/credentials.json`        |
| Tesla token        | `modules/MMM-TeslaEnergy/token.json`              |
| Rivian token       | `modules/MMM-RivianCar/token.json`                |
| Lucid token        | `modules/MMM-LucidCar/token.json`                 |

---

## PIR sensor wiring (HC-SR501)

```
HC-SR501 Pin    →    Raspberry Pi Pin
─────────────────────────────────────
VCC             →    Pin 2  (5V)
GND             →    Pin 6  (Ground)
OUT             →    Pin 18 (GPIO 24)
```

---

## Troubleshooting

**Blank screen on start** — check `pm2 logs` for module errors; usually a missing API key or failed `npm install`.

**Tesla not connecting** — re-run `node authorize.js` in `modules/MMM-TeslaEnergy/`. Token may have expired if the Pi was offline for an extended period.

**Screen won't turn off/on with PIR** — both Pis use the `vc4-kms-v3d` KMS driver; use `xrandr` not `vcgencmd` or `xset dpms`:
```bash
DISPLAY=:0 xrandr --output HDMI-1 --off   # mirror-1
DISPLAY=:0 xrandr --output HDMI-1 --auto  # mirror-1 on
DISPLAY=:0 xrandr --output HDMI-2 --off   # mirror-2
DISPLAY=:0 xrandr --output HDMI-2 --auto  # mirror-2 on
```

**Wayland/Electron errors on Pi** — set `ELECTRON_OZONE_PLATFORM_HINT=x11` in the PM2 start command.
