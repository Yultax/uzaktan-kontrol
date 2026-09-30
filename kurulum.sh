#!/usr/bin/env bash
# Web terminal kurulumu: ttyd + tmux + Caddy (HTTPS) + bilkenters giriş sayfası + Claude Code
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
apt-get install -y curl git tmux sudo ca-certificates gnupg

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

# Ek dosyalar: repo klonlandıysa yanından, yoksa GitHub'dan
# raw.githubusercontent "main" adresini birkaç dakika önbellekte tutar; son commit'e sabitle ki eski dosya gelmesin
REPO_REF="$(curl -fsSL -H 'Accept: application/vnd.github.sha' https://api.github.com/repos/Yultax/uzaktan-kontrol/commits/main 2>/dev/null || echo main)"
REPO_RAW="https://raw.githubusercontent.com/Yultax/uzaktan-kontrol/$REPO_REF"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fetch() {
  if [[ -f "$SCRIPT_DIR/$1" ]]; then cp "$SCRIPT_DIR/$1" "$2"; else curl -fsSL -o "$2" "$REPO_RAW/$1"; fi
}

# tmux: tıklanabilir sekme çubuğu, renkler, fare
fetch config/tmux.conf "/home/$DEV_USER/.tmux.conf"
chown "$DEV_USER:$DEV_USER" "/home/$DEV_USER/.tmux.conf"

# Web dosyaları: /test, /yedek, görsel yapıştırma scripti, xterm.js
mkdir -p /var/www/kutuphane/static/vendor
# Vitrin (/kutuphane) ve giriş (/giris) sayfaları — bilkenters tasarımı
SITE_FILES="index.html giris.html styles.css assets/logo.png
  tokens/fonts.css tokens/colors.css tokens/typography.css tokens/spacing.css
  tokens/effects.css tokens/motion.css tokens/base.css
  kutuphane/kutuphane.css kutuphane/kutuphane.js kutuphane/posts.js
  giris/giris.css giris/gecis.css giris/giris.js"
for f in $SITE_FILES; do
  mkdir -p "/var/www/kutuphane/site/$(dirname "$f")"
  fetch "web/site/$f" "/var/www/kutuphane/site/$f"
done
fetch web/test.html /var/www/kutuphane/test.html
fetch web/yedek.html /var/www/kutuphane/yedek.html
fetch web/static/kutuphane.js /var/www/kutuphane/static/kutuphane.js
XTERM="https://cdn.jsdelivr.net/npm"
curl -fsSL -o /var/www/kutuphane/static/vendor/xterm.js "$XTERM/@xterm/xterm@5.5.0/lib/xterm.js"
curl -fsSL -o /var/www/kutuphane/static/vendor/xterm.css "$XTERM/@xterm/xterm@5.5.0/css/xterm.css"
curl -fsSL -o /var/www/kutuphane/static/vendor/addon-fit.js "$XTERM/@xterm/addon-fit@0.10.0/lib/addon-fit.js"

echo "==> kutuphane-api (giris/oturum + WebSocket'siz yedek mod + gorsel yukleme)"
mkdir -p /opt/kutuphane
fetch server/kutuphane_api.py /opt/kutuphane/kutuphane_api.py
# Giriş şifresi: scrypt özeti + oturum imza anahtarı, sadece API kullanıcısı okuyabilir
install -d -o "$DEV_USER" -g "$DEV_USER" -m 700 /etc/kutuphane
printf '%s' "$WEB_PASS" | sudo -u "$DEV_USER" python3 /opt/kutuphane/kutuphane_api.py --sifre-ayarla "$DEV_USER"
cat >/etc/systemd/system/kutuphane-api.service <<EOF
[Unit]
Description=kutuphane API (HTTP terminal + upload)
After=network.target

[Service]
User=$DEV_USER
WorkingDirectory=/home/$DEV_USER
Environment=HOME=/home/$DEV_USER
Environment=LANG=C.UTF-8
ExecStart=/usr/bin/python3 /opt/kutuphane/kutuphane_api.py
Restart=always
KillMode=process

[Install]
WantedBy=multi-user.target
EOF

echo "==> ttyd"
ARCH="$(uname -m)"
# Önce geçici dosyaya indir, sonra yerine taşı: ttyd çalışırken üstüne yazmak "Text file busy" verir
curl -fsSL -o /usr/local/bin/ttyd.new "https://github.com/tsl0922/ttyd/releases/latest/download/ttyd.${ARCH}"
chmod +x /usr/local/bin/ttyd.new
mv -f /usr/local/bin/ttyd.new /usr/local/bin/ttyd

# ttyd'nin kendi sayfasını al, <head> başına kutuphane.js ekle
/usr/local/bin/ttyd -i 127.0.0.1 -p 7690 true >/dev/null 2>&1 &
TTYD_TMP=$!
sleep 1
curl -fsS --compressed http://127.0.0.1:7690/ \
  | sed 's|<head>|<head><script src="/static/kutuphane.js"></script>|' >/var/www/kutuphane/ttyd-index.html
kill "$TTYD_TMP" 2>/dev/null || true
grep -q 'kutuphane.js' /var/www/kutuphane/ttyd-index.html

cat >/etc/systemd/system/ttyd.service <<EOF
[Unit]
Description=ttyd web terminal
After=network.target

[Service]
User=$DEV_USER
WorkingDirectory=/home/$DEV_USER
Environment=HOME=/home/$DEV_USER
Environment=TERM=xterm-256color
Environment=LANG=C.UTF-8
ExecStart=/usr/local/bin/ttyd -i 127.0.0.1 -p 7681 -W -O -I /var/www/kutuphane/ttyd-index.html -t fontSize=15 -t titleFixed=Terminal -t macOptionClickForcesSelection=true -t rightClickSelectsWord=false tmux -u new -A -s main
Restart=always
KillMode=process

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

mkdir -p /var/log/caddy
chown caddy:caddy /var/log/caddy
cat >/etc/caddy/Caddyfile <<EOF
$DOMAIN {
	log {
		output file /var/log/caddy/access.log
		format json
	}
	# Herkese açık: vitrin, giriş sayfası ve giriş API'si
	handle /site/* {
		root * /var/www/kutuphane
		file_server
	}
	handle /kutuphane {
		root * /var/www/kutuphane
		rewrite * /site/index.html
		file_server
	}
	handle /giris {
		root * /var/www/kutuphane
		rewrite * /site/giris.html
		file_server
	}
	@herkes path /api/giris /api/oturum
	handle @herkes {
		reverse_proxy 127.0.0.1:7682
	}
	# Geri kalan her şey oturum ister; yoksa sayfalar /kutuphane'ye yönlenir
	handle {
		forward_auth 127.0.0.1:7682 {
			uri /api/yetki
			header_up -Upgrade
			header_up -Connection
		}
		handle /api/* {
			reverse_proxy 127.0.0.1:7682
		}
		handle /static/* {
			root * /var/www/kutuphane
			file_server
		}
		handle /test {
			root * /var/www/kutuphane
			rewrite * /test.html
			file_server
		}
		handle /yedek {
			root * /var/www/kutuphane
			rewrite * /yedek.html
			file_server
		}
		handle {
			reverse_proxy 127.0.0.1:7681
		}
	}
}
EOF

echo "==> fail2ban (10 hatali giris = 1 saat ban; /api/giris hatalari 401 olarak loglanir)"
apt-get install -y fail2ban
cat >/etc/fail2ban/filter.d/caddy-auth.conf <<'EOF'
[Definition]
failregex = ^.*"remote_ip":"<HOST>".*"status":401
ignoreregex =
datepattern = "ts":{EPOCH}
EOF
cat >/etc/fail2ban/jail.d/caddy-auth.conf <<'EOF'
[caddy-auth]
enabled  = true
port     = http,https
filter   = caddy-auth
logpath  = /var/log/caddy/access.log
backend  = auto
maxretry = 10
findtime = 600
bantime  = 3600
EOF
touch /var/log/caddy/access.log
chown caddy:caddy /var/log/caddy/access.log

echo "==> Claude Code ($DEV_USER için)"
sudo -iu "$DEV_USER" bash -c 'curl -fsSL https://claude.ai/install.sh | bash'
grep -q '.local/bin' "/home/$DEV_USER/.bashrc" || echo 'export PATH="$HOME/.local/bin:$PATH"' >> "/home/$DEV_USER/.bashrc"

# ufw açıksa web portlarını aç
if command -v ufw &>/dev/null && ufw status | grep -q active; then
  ufw allow 80/tcp
  ufw allow 443/tcp
fi

systemctl daemon-reload
systemctl enable --now ttyd kutuphane-api
systemctl restart kutuphane-api  # yeniden kurulumda yeni API kodu yüklensin
systemctl restart caddy
systemctl enable fail2ban
systemctl restart fail2ban

echo
echo "================ KURULUM TAMAM ================"
echo "Adres:     https://$DOMAIN"
echo "Giris:     https://$DOMAIN/giris"
echo "Kullanici: $DEV_USER  (sudo sifresi de ayni)"
echo "Terminalde: claude"
