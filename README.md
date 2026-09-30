# uzaktan-kontrol

VDS sunucusuna tarayıcıdan tam terminal erişimi: **ttyd + tmux + Caddy (HTTPS + şifre)**, üstüne Claude Code.

- Tarayıcıda gerçek terminal (xterm.js): renkler, animasyonlar, SSH gibi — ama SSH değil, sadece HTTPS (443).
- tmux sayesinde sekme kapansa da oturum ve çalışan işler devam eder.
- Üstte tıklanabilir sekme çubuğu: `[+ yeni]` yeni terminal, `[böl]` yan yana böl.
- **Görsel yapıştırma:** Cmd+V veya sürükle-bırak → görsel sunucuya yüklenir, yolu terminale yapıştırılır (Claude Code görsel olarak ekler).
- **WebSocket'siz yedek mod (`/yedek`):** WebSocket engelliyse ana sayfa otomatik olarak buraya geçer; HTTP long-poll ile aynı tmux oturumuna bağlanır.
- **Bağlantı testi (`/test`):** Bulunduğun ağda WebSocket çalışıyor mu gösterir.
- Güvenlik: Caddy basic auth + fail2ban (10 hatalı giriş = 1 saat ban), ttyd ve API sadece `127.0.0.1` dinler, WebSocket origin kontrolü (`-O`), API'de CSRF koruması.

## Yapı

| Yol | Ne |
|---|---|
| `/` | ttyd (WebSocket terminal), `web/static/kutuphane.js` enjekte edilmiş |
| `/yedek` | `web/yedek.html` — HTTP long-poll terminal |
| `/test` | `web/test.html` — WebSocket testi |
| `/api/*` | `server/kutuphane_api.py` (127.0.0.1:7682) — yedek terminal + görsel yükleme |
| `/static/*` | `kutuphane.js`, xterm.js |

## Kurulum

1. Alan adında bir **A kaydı** oluştur: `terminal.ornek.com → SUNUCU_IP`
2. Sunucuda root olarak:

   ```bash
   curl -fsSLo k https://raw.githubusercontent.com/Yultax/uzaktan-kontrol/main/kurulum.sh; bash k
   ```

3. Script alan adını ve şifreyi sorar. Bitince `https://terminal.ornek.com` adresine gir.
4. Terminalde `claude` yaz. İlk girişte verilen linki istediğin cihazda açıp kodu yapıştır.

## Yönetim

```bash
systemctl status ttyd caddy kutuphane-api fail2ban
journalctl -u caddy -f                  # sertifika / erişim logları
fail2ban-client status caddy-auth       # banlanan IP'ler
fail2ban-client set caddy-auth unbanip 1.2.3.4
nano /etc/caddy/Caddyfile               # alan adı / şifre değişikliği, sonra: systemctl reload caddy
```

Şifre değiştirmek: `caddy hash-password` çıktısını Caddyfile'daki hash ile değiştir, `passwd arda` ile Linux şifresini de güncelle.

Yüklenen görseller: `/home/arda/uploads/`
