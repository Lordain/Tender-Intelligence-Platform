#!/usr/bin/env bash
# Build and switch to a release of `main` (or the ref given), run as the
# latintender user:
#
#   sudo -u latintender bash /srv/latintender/repo/deploy/deploy.sh [ref]
#
# Normally run by .github/workflows/deploy-server.yml, which builds `.next` on
# GitHub's runner and uploads it to incoming/<sha>.tgz first: `next build`
# needs ~2.8 GB, and on this 2 GB server it pushed everything into swap and
# froze the machine (2026-11-20). With that file present this script only
# installs dependencies and unpacks it. Without it, it builds here — and
# refuses to on a machine with too little memory.
#
# Each release is built in its own directory while the current one keeps
# serving, then `current` is switched and the service restarted. If the new
# release does not answer, `current` is switched back. The last three releases
# are kept, so a rollback is: point `current` at an older one and restart.
set -euo pipefail

APP_DIR=/srv/latintender
REPO_DIR="$APP_DIR/repo"
REF="${1:-main}"
LOG="$APP_DIR/logs/deploy.log"

exec > >(tee -a "$LOG") 2>&1
echo "== $(date -u +%FT%TZ) 部署 $REF"

if [ ! -s "$APP_DIR/shared/.env" ]; then echo "$APP_DIR/shared/.env 是空的，先按 deploy/README.md 填好" >&2; exit 1; fi

git -C "$REPO_DIR" fetch --quiet origin "$REF"
SHA="$(git -C "$REPO_DIR" rev-parse FETCH_HEAD)"
REL="$APP_DIR/releases/$SHA"
echo "   版本 $SHA"

if [ ! -f "$REL/.build-ok" ]; then
  rm -rf "$REL"
  mkdir -p "$REL"
  git -C "$REPO_DIR" archive "$SHA" | tar -x -C "$REL"
  # next build inlines NEXT_PUBLIC_* from here, and next start reads the rest.
  ln -sfn "$APP_DIR/shared/.env" "$REL/.env.production.local"
  cd "$REL"
  PREBUILT="$APP_DIR/incoming/$SHA.tgz"
  if [ -f "$PREBUILT" ]; then
    echo "   使用 GitHub 上编译好的版本"
    npm ci --no-audit --no-fund
    tar -xzf "$PREBUILT" -C "$REL"
    [ -f "$REL/.next/BUILD_ID" ] || { echo "!! 编译结果不完整（没有 .next/BUILD_ID）" >&2; exit 1; }
    rm -f "$PREBUILT"
  else
    mem_kb="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"
    if [ "$mem_kb" -lt 3500000 ]; then
      echo "!! 这台服务器内存 $((mem_kb / 1024)) MB，不够在本机编译（约需 3 GB），会把服务器卡死。" >&2
      echo "!! 请在 GitHub 的 Actions 里运行「Deploy to server」，它会在 GitHub 上编译好再传过来。" >&2
      rm -rf "$REL"
      exit 1
    fi
    npm ci --no-audit --no-fund
    NODE_OPTIONS=--max-old-space-size=3072 NEXT_TELEMETRY_DISABLED=1 npx next build
  fi
  touch "$REL/.build-ok"
fi
# Uploads that were never used (a superseded run) are not kept.
find "$APP_DIR/incoming" -name '*.tgz' -mmin +120 -delete 2>/dev/null || true

# Only a real, existing release counts as something to go back to: on the
# first deploy there is no `current`, and `readlink -f` would hand back the
# path itself.
PREVIOUS=""
if [ -L "$APP_DIR/current" ] && [ -d "$(readlink -f "$APP_DIR/current")" ]; then
  PREVIOUS="$(readlink -f "$APP_DIR/current")"
fi
ln -sfn "$REL" "$APP_DIR/current.new"
mv -Tf "$APP_DIR/current.new" "$APP_DIR/current"
sudo /usr/bin/systemctl restart latintender

healthy=false
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null -H "Host: latintender.com" http://127.0.0.1:3000/; then healthy=true; break; fi
  sleep 2
done

if [ "$healthy" != true ]; then
  echo "!! 新版本没有正常响应" >&2
  if [ -n "$PREVIOUS" ] && [ "$PREVIOUS" != "$REL" ]; then
    echo "!! 已切回上一个版本 $PREVIOUS" >&2
    ln -sfn "$PREVIOUS" "$APP_DIR/current.new"
    mv -Tf "$APP_DIR/current.new" "$APP_DIR/current"
    sudo /usr/bin/systemctl restart latintender
  fi
  exit 1
fi

echo "   已上线 $SHA"
# Keep the three newest releases, and never the one being served.
CURRENT="$(readlink -f "$APP_DIR/current")"
ls -1dt "$APP_DIR"/releases/*/ 2>/dev/null | tail -n +4 | while read -r old; do
  old="${old%/}"
  [ "$old" = "$CURRENT" ] || rm -rf "$old"
done
