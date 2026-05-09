#!/usr/bin/env bash
# scripts/setup.sh — One-time local setup after cloning this repo.
#
# Usage (from repo root):
#   bash scripts/setup.sh

set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"

echo "▶ Initialising submodule"
git -C "$REPO" submodule update --init --recursive

echo "▶ Installing MagicMirror dependencies"
cd "$REPO/MagicMirror" && npm install --silent && cd "$REPO"

echo "▶ Creating module symlinks in MagicMirror/modules/"
MODULES_SRC="$REPO/modules"
MODULES_DST="$REPO/MagicMirror/modules"

MODULES=(
  MMM-AQI
  MMM-CalendarExt3Agenda
  MMM-ClaudeBriefing
  MMM-DadJoke
  MMM-DigClock
  MMM-FlumeWater
  MMM-Gif
  MMM-LevitonPanel
  MMM-LucidCar
  MMM-MyCommute
  MMM-OpenWeatherMapForecast
  MMM-PingStatus
  MMM-RivianCar
  MMM-SenseEnergy
  MMM-Synology
  MMM-SysInfo
  MMM-TeslaEnergy
  MMM-UnifiNetwork
  MMM-UnifiProtect
  MMM-Universal-Pir
)

for mod in "${MODULES[@]}"; do
  target="$MODULES_DST/$mod"
  if [ -L "$target" ]; then
    rm "$target"
  fi
  ln -s "$MODULES_SRC/$mod" "$target"
  echo "  $mod"
done

echo "▶ Copying per-mirror files into submodule"
# index.html (browser-mode patch)
cp "$REPO/mirror-1/index.html" "$REPO/MagicMirror/index.html"

# config/ files are deployed via 'npm run deploy' — not copied here
# since they contain secrets and are gitignored.

echo ""
echo "✓ Setup complete."
echo ""
echo "Next steps:"
echo "  1. Copy mirror-1/config.example.js → mirror-1/config.js and fill in your values"
echo "  2. Copy mirror-2/config.example.js → mirror-2/config.js and fill in your values"
echo "  3. npm start               — start both mirrors locally"
echo "  4. npm run deploy:mirror-1 — deploy to Pi 1"
echo "  5. npm run deploy:mirror-2 — deploy to Pi 2"
