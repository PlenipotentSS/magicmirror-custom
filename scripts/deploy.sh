#!/usr/bin/env bash
# scripts/deploy.sh — Deploy config and custom modules to Pi(s)
#
# Usage:
#   npm run deploy              — deploy to all configured mirrors
#   npm run deploy:mirror-1     — deploy to mirror-1 only
#   npm run deploy:mirror-2     — deploy to mirror-2 only

set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"

# ── Mirror definitions ────────────────────────────────────────────────────────
MIRROR_1_HOST="magicmirror@10.10.10.220"
MIRROR_2_HOST="magicmirror@10.10.10.85"

REMOTE_MM="~/MagicMirror"

# ── Helpers ───────────────────────────────────────────────────────────────────
# Resolve symlinks so rsync always copies real files, not symlink metadata.
# Excludes token/credential files so live Pi tokens are never overwritten.
scp_module() {
  local src
  src="$(realpath "$REPO/modules/$1")"
  local host="$2"
  echo "  $1"
  rsync -a --delete \
    --exclude="token.json" \
    --exclude="credentials.json" \
    --exclude="jokes.json" \
    --exclude="jokes-state.json" \
    --exclude="solar_log.json" \
    --exclude="kwh-history.json" \
    --exclude="kwh-baseline.json" \
    --exclude="kwh-today.json" \
    -e ssh "$src" "$host:$REMOTE_MM/modules/"
}

scp_file() { scp -q "$1" "$2"; }
remote()   { ssh "$1" "${@:2}"; }

deploy_mirror() {
  local mirror="$1"
  local host="$2"

  if [[ "$host" == *"<PI"* ]]; then
    echo "⚠  $mirror: host not configured (edit scripts/deploy.sh to set the IP), skipping."
    return
  fi

  echo ""
  echo "▶ Deploying $mirror → $host"

  # ── Config & CSS ─────────────────────────────────────────────────────────
  echo "  config.js + custom.css + index.html + start-mirror.sh"
  scp_file "$REPO/$mirror/config.js"       "$host:$REMOTE_MM/config/config.js"
  scp_file "$REPO/$mirror/custom.css"      "$host:$REMOTE_MM/config/custom.css"
  scp_file "$REPO/$mirror/index.html"      "$host:$REMOTE_MM/index.html"
  scp_file "$REPO/$mirror/start-mirror.sh" "$host:~/start-mirror.sh"
  remote "$host" "chmod +x ~/start-mirror.sh"

  # ── Shared custom modules (both mirrors) ─────────────────────────────────
  # Note: community modules (MMM-Remote-Control, MMM-Universal-Pir, etc.) are
  # installed via git on the Pi (see scripts/modules.sh) and should not be scp'd.
  scp_module MMM-Gif     "$host"
  scp_module MMM-SysInfo "$host"

  # ── Mirror-specific custom modules ───────────────────────────────────────
  if [[ "$mirror" == "mirror-1" ]]; then
    scp_module MMM-ClaudeBriefing "$host"
  fi

  if [[ "$mirror" == "mirror-2" ]]; then
    scp_module MMM-TeslaEnergy  "$host"
    scp_module MMM-RivianCar    "$host"
    scp_module MMM-LucidCar     "$host"
    scp_module MMM-LevitonPanel "$host"
    remote "$host" "cd $REMOTE_MM/modules/MMM-LevitonPanel && npm install --silent"
    scp_module MMM-SenseEnergy  "$host"
    remote "$host" "cd $REMOTE_MM/modules/MMM-SenseEnergy && npm install --ignore-scripts --silent"
    scp_module MMM-UnifiNetwork "$host"
    remote "$host" "cd $REMOTE_MM/modules/MMM-UnifiNetwork && npm install --silent"
    scp_module MMM-UnifiProtect "$host"
    remote "$host" "cd $REMOTE_MM/modules/MMM-UnifiProtect && npm install --silent"
    scp_module MMM-Synology     "$host"
    remote "$host" "cd $REMOTE_MM/modules/MMM-Synology && npm install --silent"
    scp_module MMM-PingStatus   "$host"
    scp_module MMM-DadJoke      "$host"
    scp_module MMM-FlumeWater   "$host"
  fi

  # ── Restart ───────────────────────────────────────────────────────────────
  echo "  restarting PM2"
  remote "$host" "PATH=/usr/local/bin:\$PATH pm2 restart MagicMirror --silent || pm2 start ~/start-mirror.sh --name MagicMirror && pm2 save --silent"

  echo "✓ $mirror deployed"
}

# ── Main ──────────────────────────────────────────────────────────────────────
TARGET="${1:-all}"

case "$TARGET" in
  mirror-1)
    deploy_mirror mirror-1 "$MIRROR_1_HOST"
    ;;
  mirror-2)
    deploy_mirror mirror-2 "$MIRROR_2_HOST"
    ;;
  all)
    deploy_mirror mirror-1 "$MIRROR_1_HOST"
    deploy_mirror mirror-2 "$MIRROR_2_HOST"
    ;;
  *)
    echo "Usage: $0 [mirror-1|mirror-2|all]"
    exit 1
    ;;
esac

echo ""
echo "Done."
