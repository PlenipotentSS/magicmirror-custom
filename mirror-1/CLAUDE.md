# Mirror 1 — Pi 1

**Content:** Weather, Calendars, Claude Briefing, System Info, Gif
**Port:** 8080
**Config:** `mirror-1/config.js`

---

## SSH Access

```
Host:  10.10.10.220
User:  magicmirror
Auth:  private key (no password)
Home:  /home/magicmirror
```

```bash
ssh magicmirror@10.10.10.220
```

---

## Deploy — Config & CSS

```bash
scp mirror-1/config.js  magicmirror@10.10.10.220:~/MagicMirror/config/config.js
scp mirror-1/custom.css magicmirror@10.10.10.220:~/MagicMirror/config/custom.css
```

## Deploy — Custom Modules

```bash
# MMM-ClaudeBriefing
scp MagicMirror/modules/MMM-ClaudeBriefing/MMM-ClaudeBriefing.js \
    MagicMirror/modules/MMM-ClaudeBriefing/node_helper.js \
    magicmirror@10.10.10.220:~/MagicMirror/modules/MMM-ClaudeBriefing/

# MMM-Gif
scp MagicMirror/modules/MMM-Gif/MMM-Gif.js \
    MagicMirror/modules/MMM-Gif/MMM-Gif.css \
    magicmirror@10.10.10.220:~/MagicMirror/modules/MMM-Gif/

# MMM-SysInfo
scp -r MagicMirror/modules/MMM-SysInfo \
    magicmirror@10.10.10.220:~/MagicMirror/modules/

# GIF assets (if changed)
scp MagicMirror/modules/MMM-Gif/gifs/*.gif \
    magicmirror@10.10.10.220:~/MagicMirror/modules/MMM-Gif/gifs/
```

## Deploy — Tesla Token (if expired)

```bash
scp MagicMirror/modules/MMM-TeslaEnergy/token.json \
    magicmirror@10.10.10.220:~/MagicMirror/modules/MMM-TeslaEnergy/token.json
```

## Restart After Deploy

```bash
ssh magicmirror@10.10.10.220 "pm2 restart all"
```

## View Logs

```bash
ssh magicmirror@10.10.10.220 "pm2 logs --lines 50"
```

---

## Pi Details

- **Hardware:** Raspberry Pi 4
- **OS:** Raspberry Pi OS (64-bit)
- **Node:** v18.20.4 (system node — MagicMirror runs on Pi's own node)
- **PM2 process name:** `MagicMirror`
- **MagicMirror path:** `~/MagicMirror`
- **Display:** Portrait mode, 1080×1920

---

## Modules on This Mirror

| Module                      | Position    | Notes                          |
|-----------------------------|-------------|--------------------------------|
| MMM-SysInfo                 | top_left    | CPU, mem, temp                 |
| MMM-OpenWeatherMapForecast  | top_left    | Seattle weather, updateInterval in minutes |
| calendar (hidden)           | —           | Feeds CalendarExt3Agenda       |
| MMM-CalendarExt3Agenda      | top_right   | Calendar, days 0–4             |
| MMM-CalendarExt3Agenda      | top_center  | Calendar, days 0–4             |
| MMM-ClaudeBriefing          | top_left    | Claude AI briefing, 8hr refresh |
| MMM-Gif                     | bottom_right| pauseInterval: 63s             |
| MMM-Remote-Control          | —           | http://10.10.10.220:8080/remote.html |
| MMM-Universal-Pir           | bottom_bar  | GPIO 24 (pin 18), screen off via xrandr HDMI-1 |
