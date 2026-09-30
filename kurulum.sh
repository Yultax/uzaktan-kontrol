#!/usr/bin/env bash
# Web terminal kurulumu: ttyd + tmux + Caddy (HTTPS + şifre) + Claude Code
# Ubuntu 22.04/24.04 veya Debian 12 üzerinde root olarak çalıştır:
#   curl -fsSLo k URL; bash k
# İsteğe bağlı: DOMAIN=ornek.com DEV_USER=ben bash k
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Root olarak çalıştır." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
DEV_USER="${DEV_USER:-arda}"
WEB_USER="$DEV_USER"

# Şifre script'e gömülmez; kurulum sırasında sorulur
if [[ -z "${WEB_PASS:-}" ]]; then
  while true; do
    read -rsp "Site/kullanici sifresi ($DEV_USER icin): " WEB_PASS </dev/tty; echo
    read -rsp "Tekrar: " WEB_PASS2 </dev/tty; echo
    [[ -n "$WEB_PASS" && "$WEB_PASS" == "$WEB_PASS2" ]] && break
    echo "Sifreler uyusmadi, tekrar dene."
  done
fi

echo "==> Paketler"
apt-get update -y
apt-get install -y curl git tmux sudo ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https

PUBLIC_IP="$(curl -4 -fsS https://api.ipify.org)"
if [[ -z "${DOMAIN:-}" ]]; then
  echo "Alan adinin A kaydi $PUBLIC_IP adresine yonlenmis olmali."
  read -rp "Alan adi (orn. terminal.ornek.com, bos = ${PUBLIC_IP//./-}.sslip.io): " DOMAIN </dev/tty
  DOMAIN="${DOMAIN:-${PUBLIC_IP//./-}.sslip.io}"
fi

echo "==> Swap (2 GB RAM için gerekli)"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Kullanıcı: $DEV_USER"
if ! id "$DEV_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$DEV_USER"
fi
echo "$DEV_USER:$WEB_PASS" | chpasswd
usermod -aG sudo "$DEV_USER"

# tmux: renkler tam, fare tekerleğiyle kaydırma
cat >"/home/$DEV_USER/.tmux.conf" <<'EOF'
set -g default-terminal "tmux-256color"
set -ga terminal-overrides ",xterm-256color:RGB"
set -g mouse on
set -g history-limit 50000
set -g status off
EOF
chown "$DEV_USER:$DEV_USER" "/home/$DEV_USER/.tmux.conf"

echo "==> ttyd"
ARCH="$(uname -m)"
curl -fsSL -o /usr/local/bin/ttyd "https://github.com/tsl0922/ttyd/releases/latest/download/ttyd.${ARCH}"
chmod +x /usr/local/bin/ttyd

cat >/etc/systemd/system/ttyd.service <<EOF
[Unit]
Description=ttyd web terminal
After=network.target

[Service]
User=$DEV_USER
WorkingDirectory=/home/$DEV_USER
Environment=HOME=/home/$DEV_USER
Environment=TERM=xterm-256color
ExecStart=/usr/local/bin/ttyd -i 127.0.0.1 -p 7681 -W -t fontSize=15 -t titleFixed=Terminal tmux new -A -s main
Restart=always

[Install]
WantedBy=multi-user.target
EOF

echo "==> Caddy"
if ! command -v caddy &>/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' >/etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

HASH="$(caddy hash-password --plaintext "$WEB_PASS")"
cat >/etc/caddy/Caddyfile <<EOF
$DOMAIN {
	basic_auth {
		$WEB_USER $HASH
	}
	reverse_proxy 127.0.0.1:7681
}
EOF

echo "==> Claude Code ($DEV_USER için)"
sudo -iu "$DEV_USER" bash -c 'curl -fsSL https://claude.ai/install.sh | bash'
grep -q '.local/bin' "/home/$DEV_USER/.bashrc" || echo 'export PATH="$HOME/.local/bin:$PATH"' >> "/home/$DEV_USER/.bashrc"

# ufw açıksa web portlarını aç
if command -v ufw &>/dev/null && ufw status | grep -q active; then
  ufw allow 80/tcp
  ufw allow 443/tcp
fi

systemctl daemon-reload
systemctl enable --now ttyd
systemctl restart caddy

echo
echo "================ KURULUM TAMAM ================"
echo "Adres:     https://$DOMAIN"
echo "Kullanici: $WEB_USER  (sudo sifresi de ayni)"
echo "Terminalde: claude"
