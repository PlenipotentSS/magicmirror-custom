#!/usr/bin/env bash
# scripts/modules.sh
# Run this on a fresh Pi from inside ~/MagicMirror/modules/
# to install all community modules needed by either mirror.
#
# Usage:
#   cd ~/MagicMirror/modules
#   bash ~/scripts/modules.sh
#
# Custom modules are deployed from your dev machine via:
#   npm run deploy:mirror-1
#   npm run deploy:mirror-2

set -euo pipefail

# ─────────────────────────────────────────────────────────────
# BOTH MIRRORS
# ─────────────────────────────────────────────────────────────

# Remote Control
git clone https://github.com/Jopyth/MMM-Remote-Control.git
cd MMM-Remote-Control && npm install && cd ..

# PIR Motion Sensor — screen on/off
git clone https://gitlab.com/khassel/MMM-Universal-Pir.git
cd MMM-Universal-Pir && npm install && cd ..

# ─────────────────────────────────────────────────────────────
# MIRROR 1 — Weather, Calendars, Claude Briefing
# ─────────────────────────────────────────────────────────────

# Weather Forecast
git clone https://github.com/MarcLandis/MMM-OpenWeatherMapForecast.git
cd MMM-OpenWeatherMapForecast && npm install && cd ..

# Calendar Agenda
git clone https://github.com/MMRIZE/MMM-CalendarExt3Agenda.git
cd MMM-CalendarExt3Agenda && npm install --omit=dev && cd ..

# ─────────────────────────────────────────────────────────────
# MIRROR 2 — Clock, Energy, Cars, Network
# ─────────────────────────────────────────────────────────────

# Digital Clock
git clone https://github.com/justjim1220/MMM-DigClock.git
cd MMM-DigClock && npm install && cd ..

# Air Quality Index
git clone https://github.com/ryck/MMM-AQI.git
cd MMM-AQI && npm install && cd ..

# Commute / Google Maps Traffic
git clone https://github.com/jclarke0000/MMM-MyCommute.git
cd MMM-MyCommute && npm install && cd ..

echo ""
echo "✓ Community modules installed."
echo ""
echo "Next: run deploy from your dev machine to push custom modules:"
echo "  npm run deploy:mirror-1"
echo "  npm run deploy:mirror-2"
