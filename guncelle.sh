#!/usr/bin/env bash
# Otomatik güncelleme: GitHub'daki main değiştiyse site dosyalarını ve API'yi yeniler.
# kurulum.sh bunu /usr/local/sbin/kutuphane-guncelle olarak kurar; systemd timer 3 dakikada bir çalıştırır.
# Caddyfile, ttyd, tmux ve paketlere dokunmaz; onlar (ve bu betiğin kendisi) için kurulum.sh yeniden çalıştırılır.
set -euo pipefail
umask 022

REPO="Yultax/uzaktan-kontrol"
WWW="${WWW:-/var/www/kutuphane}"
OPT="${OPT:-/opt/kutuphane}"
STATE="${STATE:-/var/lib/kutuphane}"
API="$OPT/kutuphane_api.py"

SHA="$(curl -fsSL -m 30 -H 'Accept: application/vnd.github.sha' "https://api.github.com/repos/$REPO/commits/main")"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "GitHub'dan gecerli bir SHA gelmedi" >&2; exit 1; }
[[ "$SHA" == "$(cat "$STATE/sha" 2>/dev/null || true)" ]] && exit 0
# API'si ayağa kalkmayan commit'i her 3 dakikada yeniden deneme; main ilerleyince tekrar bakılır
[[ "$SHA" == "$(cat "$STATE/hatali" 2>/dev/null || true)" ]] && exit 0

mkdir -p "$STATE"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fsSL -m 120 "https://codeload.github.com/$REPO/tar.gz/$SHA" \
  | tar -xz -C "$TMP" --strip-components=1 --no-same-owner
for f in web/site/index.html web/site/giris.html web/yedek.html web/test.html \
         web/static/kutuphane.js server/kutuphane_api.py; do
  [[ -s "$TMP/$f" ]] || { echo "Arsivde eksik dosya: $f" >&2; exit 1; }
done

hatali() {
  echo "$SHA" >"$STATE/hatali"
  echo "$1; $SHA atlandi" >&2
  exit 1
}

# API: bozuk kod girişi kilitler, o yüzden önce derle, sonra sağlık kontrolü; kalkmazsa eskisine dön
API_NOTU=""
if ! cmp -s "$TMP/server/kutuphane_api.py" "$API"; then
  python3 -m py_compile "$TMP/server/kutuphane_api.py" || hatali "Yeni API derlenmedi"
  cp -f "$API" "$API.eski"
  cp "$TMP/server/kutuphane_api.py" "$API.yeni"
  mv -f "$API.yeni" "$API"
  systemctl restart kutuphane-api
  if ! curl -fsS -o /dev/null -m 5 --retry 10 --retry-delay 1 --retry-connrefused \
       http://127.0.0.1:7682/api/health; then
    mv -f "$API.eski" "$API"
    systemctl restart kutuphane-api
    hatali "Yeni API ayaga kalkmadi, eskisine donuldu"
  fi
  rm -f "$API.eski"
  API_NOTU=" (API yeniden baslatildi)"
fi

# Site: yanına kur, sonra yer değiştir; yarım kopyalanmış sayfa hiç yayında olmasın
rm -f "$TMP/web/site/vercel.json"  # Vercel önizleme ayarı, sunucuda yayınlanmaz
rm -rf "$WWW/site.yeni" "$WWW/site.eski"
cp -r "$TMP/web/site" "$WWW/site.yeni"
if [[ -d "$WWW/site" ]]; then mv "$WWW/site" "$WWW/site.eski"; fi
mv "$WWW/site.yeni" "$WWW/site"
rm -rf "$WWW/site.eski"

for f in yedek.html test.html static/kutuphane.js; do
  cp "$TMP/web/$f" "$WWW/$f.yeni"
  mv -f "$WWW/$f.yeni" "$WWW/$f"
done

echo "$SHA" >"$STATE/sha"
rm -f "$STATE/hatali"
echo "Guncellendi: $SHA$API_NOTU"
