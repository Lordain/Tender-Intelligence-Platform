#!/usr/bin/env bash
# One-time setup of the self-hosted server (Ubuntu 22.04 / 24.04), run as root
# from a checkout of this repository:
#
#   sudo bash /srv/latintender/repo/deploy/setup-server.sh
#
# Installs Node.js 22, Caddy (HTTPS), poppler (pdftotext for document
# analysis), a swap file for `next build` on a small machine, the systemd
# service, the Caddy site and the cron jobs that replace vercel.json's crons.
# Safe to run again: every step checks before it changes anything.
set -euo pipefail

APP_USER=latintender
APP_DIR=/srv/latintender
REPO_DIR="$APP_DIR/repo"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "$(id -u)" -ne 0 ]; then echo "请用 sudo 运行" >&2; exit 1; fi

echo "== 系统更新和基础软件"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https unattended-upgrades poppler-utils fail2ban
# SSH answers to the whole internet with a password; fail2ban bans an address
# after repeated failed logins (its sshd jail is on by default on Ubuntu).
systemctl enable --now fail2ban >/dev/null
# Security updates install themselves.
dpkg-reconfigure -f noninteractive unattended-upgrades
# vercel.json's cron schedules are UTC; so are the ones in deploy/crontab.
timedatectl set-timezone UTC

echo "== Node.js 22"
# Checked at /usr/bin/node, the path latintender.service starts: another Node
# elsewhere on PATH would satisfy `command -v` and leave the service broken.
if ! [ -x /usr/bin/node ] || ! /usr/bin/node -v | grep -q '^v22\.'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
/usr/bin/node -v

echo "== Caddy（自动申请和续期 HTTPS 证书）"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

echo "== 交换空间（小内存机器编译时不至于内存不足）"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== 运行网站的用户和目录"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$APP_USER"
mkdir -p "$APP_DIR/releases" "$APP_DIR/shared" "$APP_DIR/logs"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
if [ ! -f "$APP_DIR/shared/.env" ]; then
  install -o "$APP_USER" -g "$APP_USER" -m 600 /dev/null "$APP_DIR/shared/.env"
  echo "   已创建空的 $APP_DIR/shared/.env，请按 deploy/README.md 填入环境变量"
fi
chmod 600 "$APP_DIR/shared/.env"

echo "== systemd 服务（开机自启、崩溃自动重启）"
install -m 644 "$HERE/latintender.service" /etc/systemd/system/latintender.service
systemctl daemon-reload
systemctl enable latintender >/dev/null

# The deploy script restarts the service as $APP_USER; nothing else is allowed.
cat > /etc/sudoers.d/latintender <<EOF
$APP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart latintender, /usr/bin/systemctl is-active latintender
EOF
chmod 440 /etc/sudoers.d/latintender
visudo -cf /etc/sudoers.d/latintender >/dev/null

echo "== Caddy 站点配置"
install -m 644 "$HERE/Caddyfile" /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile >/dev/null
systemctl reload caddy || systemctl restart caddy

echo "== 日志轮转（deploy.log、cron.log 每周归档，保留 8 周）"
cat > /etc/logrotate.d/latintender <<EOF
$APP_DIR/logs/*.log {
  weekly
  rotate 8
  compress
  missingok
  notifempty
  copytruncate
}
EOF

echo "== 定时任务（替代 vercel.json 里的 crons）"
install -m 644 "$HERE/crontab" /etc/cron.d/latintender
chmod 755 "$HERE/cron-call.sh"  # cron calls it through bash anyway (deploy/crontab)

echo
echo "完成。下一步：填好 $APP_DIR/shared/.env，然后以 $APP_USER 身份运行"
echo "  sudo -u $APP_USER bash $REPO_DIR/deploy/deploy.sh"
