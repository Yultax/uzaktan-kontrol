# uzaktan-kontrol

VDS sunucusuna tarayıcıdan tam terminal erişimi: **ttyd + tmux + Caddy (HTTPS + şifre)**, üstüne Claude Code.

- Tarayıcıda gerçek terminal (xterm.js): renkler, animasyonlar, SSH gibi.
- tmux sayesinde sekme kapansa da oturum ve çalışan işler devam eder.
- Caddy otomatik Let's Encrypt sertifikası alır ve basic auth ile korur.
- ttyd sadece `127.0.0.1:7681` dinler, dışarıya yalnızca Caddy (80/443) açıktır.

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
systemctl status ttyd caddy     # durum
journalctl -u caddy -f          # sertifika / erişim logları
nano /etc/caddy/Caddyfile       # alan adı / şifre değişikliği, sonra: systemctl reload caddy
```

Şifre değiştirmek: `caddy hash-password` çıktısını Caddyfile'daki hash ile değiştir, `passwd arda` ile Linux şifresini de güncelle.
