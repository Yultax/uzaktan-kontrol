# uzaktan-kontrol

VDS'e tarayıcıdan terminal erişimi. Dışarıdan bilkenters'ın "Kütüphane" sayfası gibi görünür; giriş yapınca terminal ("Okuma Salonu") açılır. Kullanıcıyla Türkçe konuş.

## Canlı sistem

- Adres: https://bilkent.codes — Cloudflare Tunnel üzerinden. Alan adı name.com'da, DNS'i Cloudflare'de (hesap `Officialyultax@gmail.com`, nameserver `lakas` / `simone.ns.cloudflare.com`). Tünel `kutuphane` (ID `ff1bdcb4-9851-47fb-af67-b829ee0ed5c1`), rotaları `bilkent.codes` ve `www.bilkent.codes → http://127.0.0.1:7680` (`www`, Cloudflare'deki Redirect Rule ile 301 `bilkent.codes`'a döner); rota ve DNS kaydı Cloudflare panelinde durur (Networking → Tunnels), sunucuda yalnızca jetonla kurulu `cloudflared` servisi var.
- VPS `45.141.150.210` (Ubuntu 24.04). Caddy tünelin ucunu yalnızca `127.0.0.1:7680`'de dinler; 80/443 kapalı, dışarıya açık tek port SSH (22). Eski adres `kutuphane.bilkenters.com` 2026-10-02'de kaldırıldı (Vercel'deki DNS kaydı silindi); `bilkenters.com` artık bu projeyle ilgili değil, yalnızca vitrindeki linklerin gittiği gerçek site.
- Tünelde Caddy'ye her istek `127.0.0.1`'den gelir: gerçek istemci IP'si `CF-Connecting-IP`'den okunur (Caddyfile'da `trusted_proxies` + `client_ip_headers`) ve API'ye `X-Forwarded-For` olarak verilir. fail2ban tünel trafiğini banlayamaz; giriş denemelerini API'nin sınırı ve Cloudflare tutar.
- Kurulum `kurulum.sh` ile yapılır; betik dosyaları GitHub'daki `main`'in son commit'inden çeker.
- Otomatik güncelleme: `guncelle.sh` sunucuda `/usr/local/sbin/kutuphane-guncelle` olarak kurulu, `kutuphane-guncelle.timer` 3 dakikada bir çalıştırır. `main`'e push edilen `web/site/`, `web/yedek.html`, `web/test.html`, `web/static/kutuphane.js` ve `server/kutuphane_api.py` birkaç dakika içinde **kendiliğinden yayına girer**; yani `main`'e push etmek canlıya almak demektir. API değiştiyse servis yeniden başlar, sağlık kontrolünden geçemezse eski dosyaya dönülür ve o commit atlanır (`/var/lib/kutuphane/hatali`). Günlük: `journalctl -u kutuphane-guncelle`.
- Otomatik güncellemenin **dokunmadığı** her şey (Caddyfile, cloudflared, ttyd, systemd birimleri, fail2ban, `guncelle.sh`'nin kendisi, `kurulum.sh`) ancak sunucuda `kurulum.sh` yeniden çalışınca yayına girer. Bir değişikliğin hangi yoldan yayına gireceğini kullanıcıya her seferinde açıkça söyle.
- Kullanıcının sunucuya tek erişim yolu çoğu zaman bu sitedeki terminaldir (SSH yalnızca anahtarla; anahtar kullanıcının Mac'inde `~/.ssh/vds_kutuphane`). Girişi ya da Cloudflare → cloudflared → Caddy → ttyd → tmux zincirini bozabilecek değişiklikten önce geri dönüş yolunu planla.
- Sunucuda yeniden kurulum (root olarak, sunucuda): `curl -fsSLo k https://raw.githubusercontent.com/Yultax/uzaktan-kontrol/main/kurulum.sh; bash k` — site şifresini sorar; `cloudflared` servisi kurulu değilse tünel jetonunu da sorar (Cloudflare paneli → tünel `kutuphane` → kurulum komutundaki `eyJ...`). `DIRECT_DOMAIN=ad.ornek.com bash k` tünelin yanında bir adresi doğrudan HTTPS ile de açar (80/443 açılır, IP görünür; yalnızca acil yedek için); `TUNNEL=0` tünelsiz kurar. Tünel bozulursa geri dönüş: SSH ile girip `journalctl -u cloudflared`'e bak; eski Caddyfile'lar `/etc/caddy/Caddyfile.eski-bilkenters` ve `Caddyfile.gecis` olarak duruyor.

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

- Sol sekme paneli: `web/static/kutuphane.js` içinde, `/api/sekmeler` ve `/api/sekme` uçlarını kullanır. Yeni sekme düğmesi (+) başlıkta, daraltma ve çıkış altta; kapatma × satırın sağ üstünde, fare gelince belirir, ilk tık satırı kırmızıya çevirip ×'i çöp kutusu yapar, 3 saniye içindeki ikinci tık kapatır; sekme durumu satırın solundaki çizgiyle gösterilir (yeşil çalışıyor, sarı bekliyor); altta CPU/RAM/disk üç küçük halka. Renkler sitenin lacivert/krem tonlarından (`#kp` üstündeki `--kp-*` değişkenleri); yeşil, sarı, kırmızı yalnızca durum bildirir. Kopyalama: tmux fare seçimini bırakınca OSC 52 yollar (`set-clipboard external`), `kutuphane.js` bunu panoya yazar; ttyd kendi başına yazmaz. Açık gelir (`?panel=0` kapatır, `?panel=1` geri açar, tercih `localStorage`'da; dar ekranda daraltılmış başlar). Panel `/api/sekmeler`'i sorduğu sürece API tmux'un üst sekme çubuğunu gizler (`status off`, yalnızca `main` oturumunda); 90 saniye soru gelmezse ya da `?panel=0` ile çubuk geri gelir. Sunucuda tarayıcı yok; görsel doğrulamayı kullanıcı yapar. "Claude bekliyor" göstergesi tmux pencere seçeneği `@kp_durum`'a bakar; onu `~/.claude/settings.json`'daki Stop/Notification hook'ları yazar (repo dışı, README'de), sekme görüntülenince API siler. Kullanım limitleri sistem halkalarının üstünde küçük bir tablodur (satır Claude/Codex, sütun 5 saat/hafta): çubuk dolu yüzdeyi, üstündeki dik işaret pencerede geçen süreyi gösterir; tabloya tıklamak yüzde yerine sıfırlanmaya kalan süreyi yazar (`kutuphane.panel.kalan`). Claude değerleri `~/.claude/kullanim.json`'dan okunur; onu `~/.claude/statusline.sh` (repo dışı, README'de) Claude Code'un durum satırına verdiği `rate_limits`'ten yazar. API Anthropic'e istek atmaz; sayı yalnızca bu sunucudaki bir Claude oturumu yanıt aldıkça yenilenir, dosya yoksa Claude satırı "—" gösterir. Codex satırı ayrı çalışır: API (`codex_usage`) panel sorarken en çok 2 dakikada bir yerel `codex app-server`'a `account/rateLimits/read` sorar (model çağrısı yok, kullanım harcanmaz; değer hesabın tamamını yansıtır). `app-server` deneysel bir arayüz, Codex güncellemesiyle değişebilir; yanıt alınamazsa ya da Codex kurulu/girişli değilse Codex satırı gizlenir.
- Oturum: `/api/giris` doğru kullanıcı/şifrede HMAC imzalı `bk_oturum` çerezi yazar (kalıcı değil, tarayıcı kapanınca gider). Caddy korunan her istekte `forward_auth` ile `/api/yetki`'ye sorar; oturum yoksa sayfalar `/kutuphane`'ye yönlenir, diğer istekler 403.
- Siteden çıkınca oturum biter: çerez tek başına yetmez, oturum API'de de yaşamalı (`logins`, `/etc/kutuphane/oturumlar.json`'a yazılır ki API yeniden başlayınca düşmesin). Açık sayfa (`web/static/kutuphane.js`) 20 saniyede bir `/api/nabiz` atar; sayfa kapanınca `/api/ayril` gider ve aynı oturumla açık başka sayfa yoksa oturum 15 saniye sonra düşer (pay, sayfa yenilemesi için). Haber ulaşmazsa 150 saniye nabızsız kalan oturum düşer. Paneldeki "çıkış" `/api/cikis` ile hemen kapatır. Süreler `kutuphane_api.py` başındaki `LOGIN_*` / `LEAVE_GRACE` sabitleri; kısaltırken arka plandaki sekmenin dakikada bir nabız atabildiğini unutma.
- Şifre: `/etc/kutuphane/auth.json` (scrypt). Değiştirmek: `printf '%s' "$P" | sudo -u arda python3 /opt/kutuphane/kutuphane_api.py --sifre-ayarla KULLANICI_ADI` (son kelime sitedeki kullanıcı adı; Linux kullanıcısı `arda`'dan bağımsızdır, `kurulum.sh` mevcut adı korur, `WEB_USER=...` ile değiştirilebilir).
- Cloudflare `.js`/`.css` gibi uzantıları kendiliğinden kenarda önbelleğe alır ve oturum sormadan verir; bu yüzden Caddyfile oturum arkasındaki her yanıta `Cache-Control: no-store` koyar (2026-10-02'de `/static/kutuphane.js` bu yolla girişsiz okunabiliyordu). Korunan bölgeye yeni yol eklerken bunu bozma; kuşku olursa `curl -I` ile `cf-cache-status`'a bak.
- Giriş deneme sınırı API'de (IP başına 10 dakikada 5). fail2ban (Caddy log'unda 401) yalnızca doğrudan yayında etkili.
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

- `bilkent.codes` geçişi 2026-10-02'de tamamlandı; sunucudaki Caddyfile ve `cloudflared` elle kuruldu (`kurulum.sh`'nin üreteceğiyle aynı Caddyfile), `kurulum.sh`'nin yeni tünel adımları sunucuda baştan sona henüz çalıştırılmadı.
- Cloudflare'de açık olanlar: Always Use HTTPS, yalnızca TLS 1.3 (min TLS 1.3), HSTS (12 ay, includeSubDomains, preload kapalı), nosniff, HTTP/3, ECH, Bot Fight Mode, `/api/giris` hız sınırı kuralı (IP başına 10 sn'de 5 istek → 10 sn blok; Free planın tek seçeneği).
- Cloudflare Access (e-postaya tek kullanımlık kod) kurulmadı: Zero Trust Free planı $0 ama etkinleştirmek için kart/PayPal ve fatura adresi istiyor, bunu kullanıcı girmeli. Kurulursa yalnızca oturum arkasındaki yollar korunmalı, `/kutuphane`, `/giris`, `/site/*`, `/api/giris`, `/api/oturum` Bypass kalmalı; yine de `bilkent.codes/` yabancıya Cloudflare giriş ekranı gösterir (kamuflaj ödünü, kullanıcıyla konuş).
- Trafik dolgusu (padding) yok: ttyd'de böyle bir seçenek bulunmuyor. Ağdaki gözlemci içeriği ve (ECH + şifreli DNS ile) alan adını göremez, ama paket boyutu/zamanlamasından etkileşimli oturum olduğunu sezebilir; tam çözüm istemcide VPN/WARP.
- Vitrin/giriş sayfasını Vercel'den yayınlama isteği var; terminal Vercel'de çalışamaz (WebSocket/pty yok), VPS'te veya tunnel arkasında kalmalı.
