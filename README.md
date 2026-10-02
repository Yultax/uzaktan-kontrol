# uzaktan-kontrol

VDS sunucusuna tarayıcıdan tam terminal erişimi: **ttyd + tmux + Caddy + Cloudflare Tunnel + bilkenters giriş sayfası**, üstüne Claude Code.

- Siteye giren herkes önce **bilkenters Kütüphane** vitrinini görür (`/kutuphane`). "Giriş Yap" → `/giris` mektup ekranı; doğru kullanıcı adı/şifre ile üye kartı basılır ve terminale geçilir. Kayıt ve şifre sıfırlama bilerek çalışmaz (API hatası gösterir).

- Tarayıcıda gerçek terminal (xterm.js): renkler, animasyonlar, SSH gibi — ama SSH değil, sadece HTTPS (443).
- Site dışarıya **Cloudflare Tunnel** ile açılır: sunucuda 80/443 dinlenmez, alan adı Cloudflare'e çözülür, sunucunun IP'si görünmez.
- tmux sayesinde sekme kapansa da oturum ve çalışan işler devam eder.
- Üstte tıklanabilir sekme çubuğu: `[+ yeni]` yeni terminal, `[böl]` yan yana böl, `×` sekmeyi kapat.
- **Sol sekme paneli:** açık gelir; adrese `?panel=0` ekleyince kapanır ve o tarayıcıda hatırlanır, `?panel=1` geri açar. Dar ekranda (telefon) daraltılmış başlar. Sekmeye geçme, yeni sekme (başlıktaki `+`), kapatma (fare satıra gelince sağ üstte çıkan `×`, iki tıkla), daraltma (alttaki `«`) ve çıkış; başlıkta sekme sayısı, her sekmede klasör, git dalı, RAM kullanımı ve çalışıyor göstergesi (solda yeşil çizgi), altta sistemin CPU (halka) ve RAM/disk (çubuk) durumu görünür. Sekme adına çift tıklayıp ad verilebilir; ad verilmemişse Claude'un sekmeye verdiği başlık gösterilir. Arka plandaki bir sekmede Claude işini bitirir ya da onay beklerse satırın adı sararır, solundaki çizgi sarı yanıp söner (aşağıdaki hook kurulu olmalı). Panel açıkken üstteki çubuk gizlenir, panel 90 saniye sessiz kalırsa kendiliğinden geri gelir.
- **Kopyalama:** metni fareyle sürükleyip bırakmak (ya da kelimeye çift, satıra üç tıklamak) yeter; seçilen metin panoya yazılır ve "Kopyalandı" bildirimi çıkar. Seçimi tmux yapar (kaydırılmış geçmişte de çalışır), sayfa tmux'un yolladığı OSC 52'yi panoya yazar. Shift (Mac'te Option) basılı sürüklemek tarayıcının kendi seçimini kullanır.
- **Görsel yapıştırma:** Cmd+V veya sürükle-bırak → görsel sunucuya yüklenir, yolu terminale yapıştırılır (Claude Code görsel olarak ekler).
- **WebSocket'siz yedek mod (`/yedek`):** WebSocket engelliyse ana sayfa otomatik olarak buraya geçer; HTTP long-poll ile aynı tmux oturumuna bağlanır.
- **Bağlantı testi (`/test`):** Bulunduğun ağda WebSocket çalışıyor mu gösterir.
- **Siteden çıkınca oturum biter:** sekme kapanınca ya da başka siteye gidilince oturum 15 saniye içinde düşer (sayfayı yenilemek düşürmez), tekrar girmek için yeniden giriş gerekir. Sayfa haber veremeden kapanırsa (çökme, ağ kesintisi, uyuyan bilgisayar) 150 saniye sonra kendiliğinden düşer. Paneldeki **çıkış** hemen kapatır.
- Güvenlik: oturum çerezi (HttpOnly, Secure, HMAC imzalı, kalıcı değil) + sunucuda tutulan oturum + Caddy `forward_auth` ile terminal/API/WebSocket korunur; giriş denemesi sınırı (IP başına 10 dakikada 5; fail2ban yalnızca doğrudan yayında işe yarar, tünelde istekler `127.0.0.1`'den gelir), şifre scrypt ile saklanır, ttyd ve API sadece `127.0.0.1` dinler, WebSocket origin kontrolü (`-O`), API'de CSRF koruması.

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

1. Cloudflare'de (alan adı Cloudflare DNS'inde olmalı) **Networking → Tunnels** altında bir tünel aç, rotası: `ALAN_ADI → http://127.0.0.1:7680`. Kurulum komutundaki `eyJ...` jetonunu kopyala. (Canlı sistemde tünelin adı `kutuphane`, alan adı `bilkent.codes`.)
2. Sunucuda root olarak:

   ```bash
   curl -fsSLo k https://raw.githubusercontent.com/Yultax/uzaktan-kontrol/main/kurulum.sh; bash k
   ```

3. Script şifreyi ve (cloudflared kurulu değilse) tünel jetonunu sorar. Bitince `https://ALAN_ADI` adresine gir, **Giriş Yap** → kullanıcı adı (ilk kurulumda `arda`, `WEB_USER=...` ile başka verilebilir; büyük/küçük harf fark etmez) + bu şifre.
4. Terminalde `claude` yaz. İlk girişte verilen linki istediğin cihazda açıp kodu yapıştır.

Seçenekler: `DIRECT_DOMAIN=eski.ornek.com bash k` tünelin yanında o adresi doğrudan HTTPS ile de yayınlar (A kaydı sunucuya bakmalı; geçiş ya da yedek için). `TUNNEL=0 bash k` tünelsiz, eski usul kurar: alan adını sorar, Caddy 80/443'ü kendisi dinler.

## Yönetim

```bash
systemctl status ttyd caddy kutuphane-api cloudflared fail2ban
journalctl -u cloudflared -f            # tünel bağlantısı
journalctl -u caddy -f                  # sertifika / erişim logları
fail2ban-client status caddy-auth       # banlanan IP'ler
fail2ban-client set caddy-auth unbanip 1.2.3.4
nano /etc/caddy/Caddyfile               # sonra: systemctl reload caddy (alan adı Cloudflare'de tünel rotasından değişir)
systemctl list-timers kutuphane-guncelle.timer   # otomatik güncelleme ne zaman çalıştı / çalışacak
journalctl -u kutuphane-guncelle -n 20           # son güncellemeler
```

**Otomatik güncelleme:** sunucu 3 dakikada bir GitHub'daki `main`'e bakar (`guncelle.sh`); yeni commit varsa site dosyalarını (`web/site`, `yedek.html`, `test.html`, `static/kutuphane.js`) ve API'yi yeniler. Caddyfile, ttyd ve paketlere dokunmaz; onlar için `kurulum.sh` yeniden çalıştırılır. Kapatmak: `systemctl disable --now kutuphane-guncelle.timer`.

Şifre değiştirmek (eski oturumlar da düşer):

```bash
read -rs P; printf '%s' "$P" | sudo -u arda python3 /opt/kutuphane/kutuphane_api.py --sifre-ayarla KULLANICI_ADI   # sitedeki kullanıcı adı da buradan değişir
passwd arda   # Linux/sudo şifresi ayrı; istersen aynı yap
```

Yüklenen görseller: `/home/arda/uploads/`

"Claude bekliyor" göstergesi için `~/.claude/settings.json` içine şu hook'lar eklenir (sunucuya özel ayar, `kurulum.sh` kurmaz):

```json
"hooks": {
  "Stop": [{ "hooks": [{ "type": "command", "command": "[ -n \"$TMUX_PANE\" ] && tmux set-option -w -t \"$TMUX_PANE\" @kp_durum bekliyor 2>/dev/null || true" }] }],
  "Notification": [{ "matcher": "permission_prompt|elicitation_dialog", "hooks": [{ "type": "command", "command": "[ -n \"$TMUX_PANE\" ] && tmux set-option -w -t \"$TMUX_PANE\" @kp_durum bekliyor 2>/dev/null || true" }] }]
}
```
