# uzaktan-kontrol

VDS'e tarayıcıdan terminal erişimi. Dışarıdan bilkenters'ın "Kütüphane" sayfası gibi görünür; giriş yapınca terminal ("Okuma Salonu") açılır. Kullanıcıyla Türkçe konuş.

## Canlı sistem

- Adres: https://kutuphane.bilkenters.com — VPS `45.141.150.210` (Ubuntu 24.04), Caddy doğrudan bu IP'de. Vercel'de şu an sadece DNS kaydı var (`bilkenters.com` DNS'i Vercel'de, alan adı Unstoppable Domains'te).
- Kurulum `kurulum.sh` ile yapılır; betik dosyaları GitHub'daki `main`'in son commit'inden çeker.
- Otomatik güncelleme: `guncelle.sh` sunucuda `/usr/local/sbin/kutuphane-guncelle` olarak kurulu, `kutuphane-guncelle.timer` 3 dakikada bir çalıştırır. `main`'e push edilen `web/site/`, `web/yedek.html`, `web/test.html`, `web/static/kutuphane.js` ve `server/kutuphane_api.py` birkaç dakika içinde **kendiliğinden yayına girer**; yani `main`'e push etmek canlıya almak demektir. API değiştiyse servis yeniden başlar, sağlık kontrolünden geçemezse eski dosyaya dönülür ve o commit atlanır (`/var/lib/kutuphane/hatali`). Günlük: `journalctl -u kutuphane-guncelle`.
- Otomatik güncellemenin **dokunmadığı** her şey (Caddyfile, ttyd, systemd birimleri, fail2ban, `guncelle.sh`'nin kendisi, `kurulum.sh`) ancak sunucuda `kurulum.sh` yeniden çalışınca yayına girer. Bir değişikliğin hangi yoldan yayına gireceğini kullanıcıya her seferinde açıkça söyle.
- Kullanıcının sunucuya tek erişim yolu çoğu zaman bu sitedeki terminaldir (SSH yalnızca anahtarla). Girişi ya da Caddy → ttyd → tmux zincirini bozabilecek değişiklikten önce geri dönüş yolunu planla.
- Sunucuda yeniden kurulum (root olarak, sunucuda): `curl -fsSLo k https://raw.githubusercontent.com/Yultax/uzaktan-kontrol/main/kurulum.sh; bash k` — şifre ve alan adı sorar (alan adı: `kutuphane.bilkenters.com`).

## Yapı

| Yol | Ne | Erişim |
|---|---|---|
| `/kutuphane` | `web/site/index.html` — bilkenters Kütüphane tasarımı (vitrin) | herkese açık |
| `/giris` | `web/site/giris.html` + `giris/giris.js` — mektup girişi, giriş başarılı animasyonu (`giris/gecis.css`) | herkese açık |
| `/site/*` | vitrin/giriş CSS, JS, logo | herkese açık |
| `/api/giris`, `/api/oturum` | giriş ve oturum durumu | herkese açık |
| `/` | ttyd + tmux `main` (WebSocket). Sekme adı "Okuma Salonu — bilkenters" | oturum gerekli |
| `/yedek` | `web/yedek.html` — WebSocket'siz (long-poll) terminal | oturum gerekli |
| `/api/*` | `server/kutuphane_api.py` (127.0.0.1:7682) | oturum gerekli |

- Sol sekme paneli: `web/static/kutuphane.js` içinde, `/api/sekmeler` ve `/api/sekme` uçlarını kullanır. Deneme aşamasında kapalı gelir (`?panel=1` açar, `?panel=0` kapatır, tercih `localStorage`'da). Sunucuda tarayıcı yok; görsel doğrulamayı kullanıcı yapar.
- Oturum: `/api/giris` doğru kullanıcı/şifrede HMAC imzalı `bk_oturum` çerezi yazar (30 gün). Caddy korunan her istekte `forward_auth` ile `/api/yetki`'ye sorar; oturum yoksa sayfalar `/kutuphane`'ye yönlenir, diğer istekler 403.
- Şifre: `/etc/kutuphane/auth.json` (scrypt). Değiştirmek: `printf '%s' "$P" | sudo -u arda python3 /opt/kutuphane/kutuphane_api.py --sifre-ayarla arda`.
- Giriş deneme sınırı API'de (IP başına 10 dakikada 5) + fail2ban (Caddy log'unda 401).
- Kayıt ve şifre sıfırlama bilerek çalışmaz: hep "API isteği gönderilemedi" hatası verir. Böyle kalmalı.

## Tasarım

- Kaynak: claude.ai/design projesi `13d07788-d0e4-4f3b-b156-a13fb7b7aad8` (bilkenters design system, "pinned paper board"). `web/site/` altındaki `tokens/`, `kutuphane/`, `giris/giris.css` bu tasarımdan birebir alındı; tasarım dilini koru (lacivert pano, kâğıt nesneler, bant, damga, Caveat el yazısı, emoji yok).
- Menü ve footer linkleri gerçek https://www.bilkenters.com sayfalarına gider. Sağ üst buton her zaman "Giriş Yap".
- Amaç fark edilmemek: sayfa başlıkları, sekme adı, simge kütüphane gibi kalmalı; "terminal", "ttyd" gibi kelimeler görünür yerlere yazılmamalı.

## Kurallar

- Terminal tarafına (ttyd, tmux, `yedek.html` davranışı, `web/static/kutuphane.js`) istenmedikçe dokunma; tmux oturumunu asla öldürme.
- `kurulum.sh`'ye eklenen her site dosyası `SITE_FILES` listesine de girmeli.
- Güvenliği gevşeten her değişikliği (açık port, kimlik doğrulamayı atlama, ban kurallarını değiştirme, sunucuya otomatik güncelleme) yapmadan önce kullanıcıya ödünü anlat ve onay al.
- Commit'ler İngilizce, kullanıcıyla konuşma Türkçe.

## Bekleyen konular

- Gizlilik: public Wi-Fi'da hangi sunucuya bağlanıldığı görünmesin. Önerilen yol Cloudflare Tunnel (+ Cloudflare Access), bunun için `bilkenters.com` nameserver'larının Cloudflare'e taşınması gerekiyor (kullanıcı yapacak). Kısa vadede istemcide Cloudflare WARP.
- Vitrin/giriş sayfasını Vercel'den yayınlama isteği var; terminal Vercel'de çalışamaz (WebSocket/pty yok), VPS'te veya tunnel arkasında kalmalı.
