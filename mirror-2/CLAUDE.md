# Mirror 2 — Pi 2

**Content:** Clock, Tesla Energy, System Info, Gif
**Port:** 8081
**Config:** `mirror-2/config.js`

---

## SSH Access

```
Host:  10.10.10.85
User:  magicmirror
Auth:  private key (no password)
Home:  /home/magicmirror
```

```bash
ssh magicmirror@10.10.10.85
```

---

## First-Time Pi Setup

```bash
# Install nvm + Node 18
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 18 && nvm use 18 && nvm alias default 18

# Clone MagicMirror
git clone https://github.com/MichMich/MagicMirror.git ~/MagicMirror
cd ~/MagicMirror && npm install

# Install community modules
cd ~/MagicMirror/modules
git clone https://github.com/justjim1220/MMM-DigClock.git && cd MMM-DigClock && npm install && cd ..
git clone https://github.com/Jopyth/MMM-Remote-Control.git && cd MMM-Remote-Control && npm install && cd ..
# (add others as needed — see modules-to-install/modules.sh)
```

---

## Deploy — Config & CSS

```bash
scp mirror-2/config.js  magicmirror@10.10.10.85:~/MagicMirror/config/config.js
scp mirror-2/custom.css magicmirror@10.10.10.85:~/MagicMirror/config/custom.css
```

## Deploy — Custom Modules

```bash
# MMM-TeslaEnergy (full module)
scp -r modules/MMM-TeslaEnergy \
    magicmirror@10.10.10.85:~/MagicMirror/modules/
ssh magicmirror@10.10.10.85 "cd ~/MagicMirror/modules/MMM-TeslaEnergy && npm install"

# MMM-Gif
scp modules/MMM-Gif/MMM-Gif.js \
    modules/MMM-Gif/MMM-Gif.css \
    magicmirror@10.10.10.85:~/MagicMirror/modules/MMM-Gif/

# MMM-SysInfo
scp -r modules/MMM-SysInfo \
    magicmirror@10.10.10.85:~/MagicMirror/modules/

# GIF assets
scp modules/MMM-Gif/gifs/*.gif \
    magicmirror@10.10.10.85:~/MagicMirror/modules/MMM-Gif/gifs/

# MMM-UnifiNetwork (WAN status, clients, device health)
scp -r modules/MMM-UnifiNetwork \
    magicmirror@10.10.10.85:~/MagicMirror/modules/
ssh magicmirror@10.10.10.85 "cd ~/MagicMirror/modules/MMM-UnifiNetwork && npm install"

# MMM-UnifiProtect (UniFi Protect sensors & cameras)
scp -r modules/MMM-UnifiProtect \
    magicmirror@10.10.10.85:~/MagicMirror/modules/
ssh magicmirror@10.10.10.85 "cd ~/MagicMirror/modules/MMM-UnifiProtect && npm install"

# MMM-LevitonPanel (Leviton Smart Load Center — Main Panel)
scp -r modules/MMM-LevitonPanel \
    magicmirror@10.10.10.85:~/MagicMirror/modules/
ssh magicmirror@10.10.10.85 "cd ~/MagicMirror/modules/MMM-LevitonPanel && npm install"
```

## Deploy — MMM-SenseEnergy

```bash
scp -r modules/MMM-SenseEnergy \
    magicmirror@10.10.10.85:~/MagicMirror/modules/
ssh magicmirror@10.10.10.85 "cd ~/MagicMirror/modules/MMM-SenseEnergy && npm install --ignore-scripts"
```

Credentials go in `mirror-2/config.js` → MMM-SenseEnergy.email / password.

## Deploy — MMM-LucidCar

```bash
# MMM-LucidCar (gRPC-based Lucid Motors status)
scp -r modules/MMM-LucidCar \
    magicmirror@10.10.10.85:~/MagicMirror/modules/
ssh magicmirror@10.10.10.85 "cd ~/MagicMirror/modules/MMM-LucidCar && npm install"

# Copy a car image (200px wide PNG, side profile of Lucid Air)
# Place it at modules/MMM-LucidCar/lucid-air.png before deploying:
scp modules/MMM-LucidCar/lucid-air.png \
    magicmirror@10.10.10.85:~/MagicMirror/modules/MMM-LucidCar/lucid-air.png
```

Credentials go directly in `mirror-2/config.js` → MMM-LucidCar.username / password.
On first run the module logs in and saves a token to `modules/MMM-LucidCar/token.json`.
The token auto-refreshes; if it goes stale delete `token.json` and restart.

## Deploy — MMM-MyCommute

```bash
scp -r modules/MMM-MyCommute \
    magicmirror@10.10.10.85:~/MagicMirror/modules/
ssh magicmirror@10.10.10.85 "cd ~/MagicMirror/modules/MMM-MyCommute && npm install"
```

API key goes in `mirror-2/config.js` → MMM-MyCommute.apikey.
Remember to replace `YOUR_GOOGLE_MAPS_API_KEY` and the school address placeholder before deploying.

## Deploy — Tesla Token

Pi 2 shares the same Tesla account. Copy the token from Pi 1 or from local:

```bash
# From local machine
scp modules/MMM-TeslaEnergy/token.json \
    magicmirror@10.10.10.85:~/MagicMirror/modules/MMM-TeslaEnergy/token.json

# Or copy credentials so Pi 2 can re-authorize independently
scp modules/MMM-TeslaEnergy/credentials.json \
    magicmirror@10.10.10.85:~/MagicMirror/modules/MMM-TeslaEnergy/credentials.json
```

## Autostart with PM2

```bash
ssh magicmirror@10.10.10.85 "cd ~/MagicMirror && pm2 start npm --name MagicMirror -- start && pm2 startup && pm2 save"
```

## Restart After Deploy

```bash
ssh magicmirror@10.10.10.85 "pm2 restart all"
```

## View Logs

```bash
ssh magicmirror@10.10.10.85 "pm2 logs --lines 50"
```

---

## Pi Details

- **Hardware:** Raspberry Pi 4
- **OS:** Raspberry Pi OS (64-bit)
- **Node:** v18.x (via nvm)
- **PM2 process name:** `MagicMirror`
- **MagicMirror path:** `~/MagicMirror`
- **Display:** Portrait mode, 1080×1920
- **IP:** `10.10.10.85` ← fill in once assigned

---

## Modules on This Mirror

| Module              | Position      | Notes                              |
|---------------------|---------------|------------------------------------|
| MMM-MyCommute       | upper_third   | Weekday 06:30–09:00, needs Google Maps API key |
| MMM-SysInfo         | top_left      | CPU, mem, temp                     |
| MMM-DigClock        | top_left      | Clock + date, America/Los_Angeles  |
| MMM-TeslaEnergy     | bottom_center | Solar kW + kWh today, Powerwall %, grid, home |
| MMM-LevitonPanel    | bottom_left   | Main panel circuits, total watts, daily kWh |
| MMM-UnifiNetwork    | bottom_left   | WAN status, client count, device health  |
| MMM-UnifiProtect    | bottom_left   | Sensor grid, camera health, smart detect |
| MMM-LucidCar        | bottom_right  | Lucid Air battery, range, lock, windows    |
| MMM-Gif             | bottom_right  | pauseInterval: 78s (offset from mirror-1) |
| MMM-Remote-Control  | —             | http://10.10.10.85:8081/remote.html  |
| MMM-Universal-Pir   | bottom_bar    | GPIO 24 (pin 18), screen off via xrandr HDMI-1 |

---

## Notes

- Update `10.10.10.85` throughout this file once the Pi is on the network
- Tesla token auto-refreshes every 8 hours but needs a valid `credentials.json` on disk
- If the Electron display shows Wayland errors: set `ELECTRON_OZONE_PLATFORM_HINT=x11` in the PM2 start command
