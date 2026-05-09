#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
export DISPLAY=:0
export XAUTHORITY="$HOME/.Xauthority"
export ELECTRON_OZONE_PLATFORM_HINT=x11
# Wake display on every start/restart (works with vc4-kms-v3d KMS driver)
xrandr --output HDMI-1 --auto 2>/dev/null || true
xset s off
xset s noblank
xset -dpms
cd ~/MagicMirror
./node_modules/.bin/electron js/electron.js --no-sandbox
