# uzaktan-kontrol

VDS sunucusuna tarayıcıdan tam terminal erişimi: **ttyd + tmux + Caddy (HTTPS) + bilkenters giriş sayfası**, üstüne Claude Code.

- Siteye giren herkes önce **bilkenters Kütüphane** vitrinini görür (`/kutuphane`). "Giriş Yap" → `/giris` mektup ekranı; doğru kullanıcı adı/şifre ile üye kartı basılır ve terminale geçilir. Kayıt ve şifre sıfırlama bilerek çalışmaz (API hatası gösterir).

- Tarayıcıda gerçek terminal (xterm.js): renkler, animasyonlar, SSH gibi — ama SSH değil, sadece HTTPS (443).
- tmux sayesinde sekme kapansa da oturum ve çalışan işler devam eder.
- Üstte tıklanabilir sekme çubuğu: `[+ yeni]` yeni terminal, `[böl]` yan yana böl, `×` sekmeyi kapat.
- **Sol sekme paneli (deneme):** adrese `?panel=1` ekleyince açılır ve o tarayıcıda hatırlanır, `?panel=0` kapatır. Sekmeye geçme, yeni sekme, kapatma (iki tıkla) ve daraltma; üstteki çubuk aynen durur.
- **Görsel yapıştırma:** Cmd+V veya sürükle-bırak → görsel sunucuya yüklenir, yolu terminale yapıştırılır (Claude Code görsel olarak ekler).
- **WebSocket'siz yedek mod (`/yedek`):** WebSocket engelliyse ana sayfa otomatik olarak buraya geçer; HTTP long-poll ile aynı tmux oturumuna bağlanır.
- **Bağlantı testi (`/test`):** Bulunduğun ağda WebSocket çalışıyor mu gösterir.
- Güvenlik: oturum çerezi (HttpOnly, Secure, HMAC imzalı, 30 gün) + Caddy `forward_auth` ile terminal/API/WebSocket korunur; giriş denemesi sınırı (IP başına 10 dakikada 5) + fail2ban (10 hatalı giriş = 1 saat ban), şifre scrypt ile saklanır, ttyd ve API sadece `127.0.0.1` dinler, WebSocket origin kontrolü (`-O`), API'de CSRF koruması.

## Yapı

| Yol | Ne |
|---|---|
| `/kutuphane` | `web/site/index.html` — bilkenters Kütüphane vitrini (herkese açık) |
| `/giris` | `web/site/giris.html` — giriş/kayıt ekranı + giriş başarılı geçişi (herkese açık) |
| `/site/*` | vitrin ve giriş sayfasının CSS/JS/logo dosyaları (herkese açık) |
| `/` | ttyd (WebSocket terminal), `web/static/kutuphane.js` enjekte edilmiş — oturum yoksa `/kutuphane`'ye yönlenir |
| `/yedek` | `web/yedek.html` — HTTP long-poll terminal |
| `/test` | `web/test.html` — WebSocket testi |
| `/api/giris`, `/api/oturum` | giriş ve oturum durumu (herkese açık) |
| `/api/*` | `server/kutuphane_api.py` (127.0.0.1:7682) — yedek terminal + görsel yükleme + Caddy'nin sorduğu `/api/yetki` |
| `/static/*` | `kutuphane.js`, xterm.js |

## Kurulum

1. Alan adında bir **A kaydı** oluştur: `terminal.ornek.com → SUNUCU_IP`
2. Sunucuda root olarak:

   ```bash
   curl -fsSLo k https://raw.githubusercontent.com/Yultax/uzaktan-kontrol/main/kurulum.sh; bash k
   ```

3. Script alan adını ve şifreyi sorar. Bitince `https://terminal.ornek.com` adresine gir, **Giriş Yap** → kullanıcı adı (`arda`, büyük/küçük harf fark etmez) + bu şifre.
4. Terminalde `claude` yaz. İlk girişte verilen linki istediğin cihazda açıp kodu yapıştır.

## Yönetim

```bash
systemctl status ttyd caddy kutuphane-api fail2ban
journalctl -u caddy -f                  # sertifika / erişim logları
fail2ban-client status caddy-auth       # banlanan IP'ler
fail2ban-client set caddy-auth unbanip 1.2.3.4
nano /etc/caddy/Caddyfile               # alan adı / şifre değişikliği, sonra: systemctl reload caddy
systemctl list-timers kutuphane-guncelle.timer   # otomatik güncelleme ne zaman çalıştı / çalışacak
journalctl -u kutuphane-guncelle -n 20           # son güncellemeler
```

**Otomatik güncelleme:** sunucu 3 dakikada bir GitHub'daki `main`'e bakar (`guncelle.sh`); yeni commit varsa site dosyalarını (`web/site`, `yedek.html`, `test.html`, `static/kutuphane.js`) ve API'yi yeniler. Caddyfile, ttyd ve paketlere dokunmaz; onlar için `kurulum.sh` yeniden çalıştırılır. Kapatmak: `systemctl disable --now kutuphane-guncelle.timer`.

Şifre değiştirmek (eski oturumlar da düşer):

```bash
read -rs P; printf '%s' "$P" | sudo -u arda python3 /opt/kutuphane/kutuphane_api.py --sifre-ayarla arda
passwd arda   # Linux/sudo şifresi ayrı; istersen aynı yap
```

Yüklenen görseller: `/home/arda/uploads/`
