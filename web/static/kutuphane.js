// kutuphane: görsel yapıştır/sürükle-bırak + WebSocket engelliyse yedek moda geçiş.
// ttyd sayfasına <head> başında, yedek sayfaya da normal şekilde yüklenir.
(function () {
  'use strict';
  var H = { 'X-Kutuphane': '1' };
  var isFallback = document.documentElement.getAttribute('data-mode') === 'yedek';

  // ---------- küçük bildirim ----------
  var toastEl;
  function toast(msg, ms) {
    if (!document.body) return;
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999;max-width:calc(100vw - 32px);' +
        'background:#313244;color:#cdd6f4;font:13px/1.4 ui-monospace,Menlo,monospace;padding:10px 14px;' +
        'border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.4);transition:opacity .2s;pointer-events:none';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.opacity = '1';
    clearTimeout(toastEl._t);
    if (ms !== 0) toastEl._t = setTimeout(function () { toastEl.style.opacity = '0'; }, ms || 2500);
  }

  // ---------- görsel yükleme ----------
  function term() { return window.kutuphaneTerm || window.term; }

  function upload(file) {
    return fetch('/api/upload', {
      method: 'POST',
      headers: { 'X-Kutuphane': '1', 'Content-Type': file.type },
      body: file,
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
        return j.path;
      });
    });
  }

  function handleImages(files) {
    var imgs = files.filter(function (f) { return f && /^image\//.test(f.type); });
    if (!imgs.length) return false;
    toast('Görsel yükleniyor…', 0);
    imgs.reduce(function (p, f) {
      return p.then(function () {
        return upload(f).then(function (path) {
          var t = term();
          if (t) { t.paste(path + ' '); t.focus(); }
        });
      });
    }, Promise.resolve()).then(function () {
      toast(imgs.length > 1 ? imgs.length + ' görsel eklendi' : 'Görsel eklendi');
    }).catch(function (e) {
      toast('Yükleme hatası: ' + e.message, 5000);
    });
    return true;
  }

  document.addEventListener('paste', function (e) {
    var items = Array.prototype.slice.call((e.clipboardData && e.clipboardData.items) || []);
    var files = items.filter(function (i) { return i.kind === 'file'; }).map(function (i) { return i.getAsFile(); });
    if (handleImages(files)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  document.addEventListener('dragover', function (e) {
    if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') !== -1) e.preventDefault();
  }, true);
  document.addEventListener('drop', function (e) {
    var files = Array.prototype.slice.call((e.dataTransfer && e.dataTransfer.files) || []);
    if (files.length) { e.preventDefault(); e.stopImmediatePropagation(); handleImages(files); }
  }, true);

  // ---------- kopyalama ----------
  // Fareyle sürükleyince (ya da çift/üç tıklayınca) seçimi tmux yapar ve bırakınca metni OSC 52 ile
  // tarayıcıya yollar. Sayfa bunu panoya yazmazsa seçim kaybolur ve hiçbir şey kopyalanmamış olur.
  var bekleyenKopya = null;
  function eskiKopya(metin) {
    var kutu = document.createElement('textarea'), oldu = false;
    kutu.value = metin;
    kutu.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(kutu);
    kutu.select();
    try { oldu = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(kutu);
    var t = term();
    try { if (t) t.focus(); } catch (e) {}
    return oldu;
  }
  function panoyaYaz(metin) {
    var yeni = navigator.clipboard && navigator.clipboard.writeText;
    return (yeni ? navigator.clipboard.writeText(metin) : Promise.reject()).catch(function () {
      if (!eskiKopya(metin)) throw new Error('pano');
    });
  }
  function kopyalandi(metin) { toast('Kopyalandı (' + metin.length + ' karakter)', 1500); }
  function kopyala(metin) {
    if (!metin) return;
    panoyaYaz(metin).then(function () {
      bekleyenKopya = null;
      kopyalandi(metin);
    }, function () {
      // tarayıcı şu an izin vermedi (ör. Safari): ilk tıklama ya da tuşta yeniden denenir
      bekleyenKopya = metin;
      toast('Kopyalamak için bir kez tıkla ya da bir tuşa bas', 6000);
    });
  }
  ['pointerdown', 'keydown'].forEach(function (olay) {
    document.addEventListener(olay, function () {
      if (bekleyenKopya === null) return;
      var metin = bekleyenKopya;
      bekleyenKopya = null;
      panoyaYaz(metin).then(function () { kopyalandi(metin); }, function () {});
    }, true);
  });
  function osc52(veri) {
    var i = veri.indexOf(';'), yuk = veri.slice(i + 1);
    if (i < 0 || yuk === '?') return true;   // pano okuma isteği: asla yanıtlanmaz
    try {
      var ikili = atob(yuk), bayt = new Uint8Array(ikili.length);
      for (var k = 0; k < ikili.length; k++) bayt[k] = ikili.charCodeAt(k);
      kopyala(new TextDecoder().decode(bayt));
    } catch (e) {}
    return true;
  }
  // Terminal sayfadan sonra kurulur (ve yeniden kurulabilir): hazır olunca bağlan
  var kancali = null;
  function kancala() {
    var t = term();
    if (!t || t === kancali || !t.parser || !t.parser.registerOscHandler) return;
    kancali = t;
    try { t.parser.registerOscHandler(52, osc52); } catch (e) {}
  }
  kancala();
  setInterval(kancala, 1000);

  // ---------- oturum: sayfa açıkken yaşar, sayfadan çıkınca biter ----------
  // Sunucu oturumu ancak nabız geldikçe açık tutar. Sayfa kapanınca haber verilir; haber ulaşmazsa
  // (çökme, ağ kesintisi) nabız kesildiği için oturum yine kendiliğinden düşer.
  var sayfa = Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  var JH = { 'X-Kutuphane': '1', 'Content-Type': 'application/json' };
  var oturumBitti = false;
  function girise() {
    if (oturumBitti) return;
    oturumBitti = true;
    location.replace('/kutuphane');
  }
  function nabiz() {
    if (oturumBitti) return;
    fetch('/api/nabiz', { method: 'POST', headers: JH, cache: 'no-store', body: JSON.stringify({ sayfa: sayfa }) })
      .then(function (r) { if (r.status === 403) girise(); })
      .catch(function () {});
  }
  function cikis() {
    fetch('/api/cikis', { method: 'POST', headers: H, cache: 'no-store' })
      .catch(function () {})
      .then(girise);
  }
  nabiz();
  setInterval(nabiz, 20000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) nabiz(); });
  window.addEventListener('pageshow', function (e) { if (e.persisted) nabiz(); });
  window.addEventListener('pagehide', function () {
    if (oturumBitti) return;
    try {
      fetch('/api/ayril', { method: 'POST', headers: JH, keepalive: true, body: JSON.stringify({ sayfa: sayfa }) })
        .catch(function () {});
    } catch (e) {}
  });

  // ---------- sol sekme paneli ----------
  // Açık gelir: adrese ?panel=0 ekleyince kapanır ve tarayıcıda hatırlanır, ?panel=1 geri açar.
  // Panel açıkken üstteki sekme çubuğunu API gizler; panel susarsa geri gelir.
  function panelIstendi() {
    var kapali = false;
    try {
      var q = new URLSearchParams(location.search);
      if (q.has('panel')) {
        kapali = q.get('panel') === '0';
        if (kapali) {
          fetch('/api/sekme', {
            method: 'POST',
            headers: { 'X-Kutuphane': '1', 'Content-Type': 'application/json' },
            body: JSON.stringify({ islem: 'cubuk' }),
          }).catch(function () {});
        }
        localStorage.setItem('kutuphane.panel', kapali ? '0' : '1');
      }
      kapali = localStorage.getItem('kutuphane.panel') === '0';
    } catch (e) {}
    return !kapali;
  }

  function panelKur() {
    var GENIS = 236, DAR = 44;
    // Panel yalnızca alttaki düğmeyle daralır; tercih tarayıcıda saklanır. Tercih yoksa dar ekranda dar başlar
    var dar = window.innerWidth < 700;
    try {
      var kayitliDar = localStorage.getItem('kutuphane.panel.dar');
      if (kayitliDar !== null) dar = kayitliDar === '1';
    } catch (e) {}

    var css = document.createElement('style');
    css.textContent =
      // Renkler sitenin lacivert panosundan; yeşil/sarı/kırmızı yalnızca durum bildirir
      '#kp{--kp-zemin:#0D1322;--kp-yuzey:#141C30;--kp-secili:#1C2742;--kp-cizgi:#1D2740;--kp-iz:#283350;' +
        '--kp-yazi:#E8E3D8;--kp-parlak:#FBF8F1;--kp-soluk:#8791A8;--kp-vurgu:#6C95F5;' +
        '--kp-iyi:#6FBF8E;--kp-uyari:#F4C96A;--kp-tehlike:#EC6F60;--kp-tehlike-zemin:rgba(236,111,96,.14);' +
        '--kp-mono:ui-monospace,Menlo,Monaco,Consolas,monospace;' +
        'position:fixed;left:0;top:0;bottom:0;z-index:9000;display:flex;flex-direction:column;' +
        'box-sizing:border-box;background:var(--kp-zemin);border-right:1px solid var(--kp-cizgi);color:var(--kp-yazi);' +
        'font:12.5px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;' +
        'font-variant-numeric:tabular-nums;user-select:none;-webkit-user-select:none}' +
      '#kp *{box-sizing:border-box}' +
      '#kp [hidden]{display:none!important}' +
      '#kp button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer}' +
      '#kp button:focus-visible{outline:2px solid var(--kp-vurgu);outline-offset:1px}' +
      '.kp-i{display:block;flex:none;width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.5;' +
        'stroke-linecap:round;stroke-linejoin:round}' +
      '#kp .kp-dugme{flex:none;display:flex;align-items:center;justify-content:center;width:26px;height:26px;' +
        'border-radius:6px;color:var(--kp-soluk);transition:background .12s,color .12s}' +
      '#kp .kp-dugme:hover{background:var(--kp-secili);color:var(--kp-parlak)}' +
      '#kp-ust{flex:none;display:flex;align-items:center;gap:6px;padding:10px 8px 6px 14px}' +
      '#kp-baslik{flex:1;color:var(--kp-soluk);font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase}' +
      '#kp-sayi{margin-left:3px;color:var(--kp-yazi)}' +
      '#kp-liste{flex:1;min-height:0;overflow-y:auto;padding:0 8px 8px;scrollbar-width:thin;' +
        'scrollbar-color:var(--kp-iz) transparent}' +
      '.kp-s{position:relative;display:flex;align-items:center;gap:8px;width:100%;margin:0 0 2px;' +
        'padding:7px 8px 7px 13px;border-radius:7px;cursor:pointer;transition:background .12s}' +
      '@keyframes kp-gir{from{opacity:0}}' +
      '.kp-s.kp-gir{animation:kp-gir .25s ease-out}' +
      '.kp-s:hover{background:var(--kp-yuzey)}' +
      '.kp-s.kp-aktif{background:var(--kp-secili)}' +
      '.kp-no{display:none;flex:none;width:26px;height:26px;line-height:26px;text-align:center;border-radius:6px;' +
        'background:var(--kp-yuzey);color:var(--kp-soluk);font-weight:600}' +
      '.kp-aktif .kp-no{background:var(--kp-vurgu);color:var(--kp-zemin)}' +
      // durum çizgisi: yeşil = sekmede bir şey çalışıyor, ağır ağır solan sarı = Claude seni bekliyor
      '.kp-s:before{content:"";position:absolute;left:4px;top:9px;bottom:9px;width:3px;border-radius:2px;' +
        'background:transparent;transition:background .2s}' +
      '.kp-mesgul:before{background:var(--kp-iyi)}' +
      '.kp-mesgul .kp-no{box-shadow:inset 0 -2px 0 var(--kp-iyi)}' +
      '@keyframes kp-yan{50%{opacity:.35}}' +
      '.kp-bekliyor:before{background:var(--kp-uyari);animation:kp-yan 2.4s ease-in-out infinite}' +
      '.kp-bekliyor .kp-no{background:var(--kp-uyari);color:var(--kp-zemin)}' +
      '.kp-bekliyor .kp-ad{color:var(--kp-uyari)}' +
      '#kp .kp-giris{width:100%;min-width:0;font:inherit;color:var(--kp-parlak);background:var(--kp-zemin);' +
        'border:1px solid var(--kp-vurgu);border-radius:4px;padding:1px 4px;outline:none;' +
        'user-select:text;-webkit-user-select:text}' +
      '.kp-m{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}' +
      '.kp-ad,.kp-yol,.kp-dal-ad{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.kp-ad{color:var(--kp-yazi)}' +
      '.kp-aktif .kp-ad{font-weight:600;color:var(--kp-parlak)}' +
      '.kp-alt{display:flex;align-items:center;gap:7px;min-width:0;color:var(--kp-soluk);font:11px/1.35 var(--kp-mono)}' +
      '.kp-yol{flex:0 1 auto;min-width:0}' +
      '.kp-dal{flex:0 1 auto;min-width:0;max-width:55%;display:flex;align-items:center;gap:2px}' +
      '.kp-dal .kp-i{width:11px;height:11px}' +
      '.kp-ram{flex:none;align-self:flex-end;color:var(--kp-soluk);font:11px/1.35 var(--kp-mono)}' +
      // kapatma düğmesi satırın sağ üstünde, fare satıra gelince belirir (dokunmatikte hep görünür).
      // İlk tık satırı kırmızıya çevirip × yerine çöp kutusu koyar, alttaki çizgi tükenmeden ikinci tık kapatır
      '#kp .kp-x{position:absolute;top:5px;right:5px;display:flex;align-items:center;justify-content:center;' +
        'width:20px;height:20px;border-radius:5px;background:var(--kp-iz);color:var(--kp-soluk);opacity:0;' +
        'pointer-events:none;transition:opacity .12s,background .12s,color .12s}' +
      '.kp-x .kp-i{width:12px;height:12px}' +
      '.kp-x .kp-i-cop,.kp-emin .kp-x .kp-i-x{display:none}' +
      '.kp-emin .kp-x .kp-i-cop{display:block}' +
      '#kp .kp-s:hover .kp-x,#kp .kp-emin .kp-x{opacity:1;pointer-events:auto}' +
      '@media (hover:none){#kp .kp-x{opacity:1;pointer-events:auto}.kp-ad{padding-right:24px}}' +
      '#kp .kp-x:hover{color:var(--kp-tehlike)}' +
      '#kp .kp-emin .kp-x{background:var(--kp-tehlike);color:var(--kp-zemin)}' +
      '.kp-s.kp-emin,.kp-s.kp-emin:hover{background:var(--kp-tehlike-zemin)}' +
      '@keyframes kp-sure{to{transform:scaleX(0)}}' +
      '.kp-s.kp-emin:after{content:"";position:absolute;left:13px;right:8px;bottom:3px;height:2px;border-radius:1px;' +
        'background:var(--kp-tehlike);transform-origin:left;animation:kp-sure 3s linear forwards}' +
      '#kp-durum{flex:none;display:flex;flex-direction:column;gap:13px;padding:11px 14px 12px;' +
        'border-top:1px solid var(--kp-cizgi)}' +
      // limitler: çubuk ve yanındaki sayı aynı kullanılan yüzdeyi gösterir
      '#kp-cl{display:flex;flex-direction:column;gap:8px;font-size:11px}' +
      '.kp-lr{display:grid;grid-template-columns:22px minmax(0,1fr) minmax(0,1fr);column-gap:8px;align-items:center}' +
      '.kp-lb{color:var(--kp-soluk);font-size:9px;font-weight:600;letter-spacing:.08em;text-transform:uppercase}' +
      '.kp-li{position:relative;display:flex;align-items:center;justify-content:center;width:20px;height:20px;color:var(--kp-soluk);' +
        'transition:transform .2s ease,color .2s}' +
      '.kp-li .kp-logo{display:block;width:16px;height:16px;flex:none}' +
      '.kp-li-pair{gap:0}.kp-li-pair>.kp-logo{width:10px;height:10px}' +
      '.kp-li-source{position:absolute;right:-1px;bottom:-1px;display:grid;place-items:center;width:9px;height:9px;' +
        'border-radius:50%;background:var(--kp-zemin)}.kp-li-source .kp-logo{width:8px;height:8px}' +
      '.kp-lr[data-l]:hover .kp-li{transform:scale(1.08)}' +
      '.kp-l{display:flex;align-items:center;gap:5px;min-width:0}' +
      '.kp-lc{position:relative;flex:1;height:6px;border-radius:4px;background:var(--kp-iz);overflow:hidden;' +
        'box-shadow:inset 0 1px 2px rgba(0,0,0,.2)}' +
      '.kp-lc i{position:relative;display:block;height:100%;width:0;max-width:100%;border-radius:4px;' +
        'background:linear-gradient(90deg,var(--kp-vurgu),#B7C8FF);box-shadow:0 0 7px rgba(143,166,255,.35);' +
        'transition:width .7s cubic-bezier(.22,.8,.25,1),background .3s,box-shadow .3s}' +
      '.kp-lc i:after{content:"";position:absolute;inset:0;width:45%;' +
        'background:linear-gradient(90deg,transparent,rgba(255,255,255,.4),transparent);' +
        'transform:translateX(-140%);opacity:0}' +
      '.kp-lr[data-l]:hover .kp-lc i:after{opacity:1;animation:kp-isilti .85s ease-out}' +
      '@keyframes kp-isilti{to{transform:translateX(280%);opacity:0}}' +
      '.kp-ld{flex:none;min-width:31px;text-align:right;font-size:11px;font-weight:650;letter-spacing:.01em;' +
        'font-variant-numeric:tabular-nums;transition:color .25s}' +
      // sistem: üç küçük halka, yanında değer ve ad
      '#kp-sis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}' +
      '.kp-o{display:flex;align-items:center;gap:7px;min-width:0}' +
      '.kp-o svg{display:block;flex:none;width:24px;height:24px;transform:rotate(-90deg)}' +
      '.kp-o circle{fill:none;stroke-width:3}' +
      '.kp-hz{stroke:var(--kp-iz)}' +
      '.kp-hd{stroke:var(--kp-vurgu);stroke-linecap:round;stroke-dasharray:56.55;stroke-dashoffset:56.55;' +
        'stroke-opacity:0;transition:stroke-dashoffset .4s ease-out,stroke .3s}' +
      '.kp-oy{display:flex;flex-direction:column;min-width:0;line-height:1.2}' +
      '.kp-od{font-size:12px;font-weight:600}' +
      '.kp-oe{color:var(--kp-soluk);font-size:10px;letter-spacing:.06em;text-transform:uppercase}' +
      '.kp-orta .kp-hd{stroke:var(--kp-uyari)}' +
      '.kp-orta .kp-lc i{background:var(--kp-uyari);box-shadow:0 0 7px var(--kp-uyari)}' +
      '.kp-yuksek .kp-hd{stroke:var(--kp-tehlike)}' +
      '.kp-yuksek .kp-lc i{background:var(--kp-tehlike);box-shadow:0 0 7px var(--kp-tehlike)}' +
      '.kp-yuksek .kp-od,.kp-yuksek .kp-ld{color:var(--kp-tehlike)}' +
      '#kp-alt{flex:none;display:flex;align-items:center;padding:6px 8px;border-top:1px solid var(--kp-cizgi)}' +
      '#kp #kp-cikis{display:flex;align-items:center;gap:7px;height:26px;margin-right:auto;padding:0 8px 0 6px;' +
        'border-radius:6px;color:var(--kp-soluk);transition:background .12s,color .12s}' +
      '#kp #kp-cikis:hover{background:var(--kp-yuzey);color:var(--kp-tehlike)}' +
      '#kp-daralt .kp-i{transition:transform .2s}' +
      '#kp.kp-dar #kp-daralt .kp-i{transform:rotate(180deg)}' +
      '#kp #kp-yenile{flex:none;display:flex;align-items:center;justify-content:center;width:28px;height:26px;' +
        'margin-right:4px;border-radius:6px;color:var(--kp-soluk);transition:background .15s,color .15s}' +
      '#kp #kp-yenile:hover{background:var(--kp-secili);color:var(--kp-parlak)}' +
      '#kp-yenile.kp-yeniliyor .kp-i{animation:kp-don .8s ease-in-out}' +
      '@keyframes kp-don{to{transform:rotate(360deg)}}' +
      '@media (prefers-reduced-motion:reduce){.kp-bekliyor:before,.kp-s.kp-gir,.kp-s.kp-emin:after{animation:none}' +
        '.kp-hd,.kp-lc i,#kp-daralt .kp-i{transition:none}.kp-lr[data-l]:hover .kp-lc i:after,' +
        '#kp-yenile.kp-yeniliyor .kp-i{animation:none}}' +
      '#kp.kp-dar #kp-baslik,#kp.kp-dar .kp-m,#kp.kp-dar .kp-x,#kp.kp-dar #kp-cikis,#kp.kp-dar .kp-s:before,' +
        '#kp.kp-dar .kp-s:after,#kp.kp-dar .kp-ram,#kp.kp-dar #kp-durum{display:none}' +
      '#kp.kp-dar .kp-no{display:block}' +
      '#kp.kp-dar #kp-ust{justify-content:center;padding:10px 0 6px}' +
      '#kp.kp-dar #kp-liste{padding:0 0 8px}' +
      '#kp.kp-dar .kp-s{justify-content:center;margin:0;padding:3px 0;background:none}' +
      '#kp.kp-dar #kp-alt{justify-content:center;padding:6px 0}';
    document.head.appendChild(css);

    var IKON = {
      arti: '<path d="M8 3.5v9M3.5 8h9"/>',
      x: '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>',
      yenile: '<path d="M13.2 7.1A5.7 5.7 0 0 0 3 5.3L2 6.5M2 3.5v3h3M2.8 9a5.7 5.7 0 0 0 10.2 1.8l1-1.2m0 3v-3h-3"/>',
      cop: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 8.5h6l.5-8.5M6.8 7.2v3.3M9.2 7.2v3.3"/>',
      dal: '<circle cx="4.5" cy="3.5" r="1.5"/><circle cx="4.5" cy="12.5" r="1.5"/><circle cx="11.5" cy="5.5" r="1.5"/>' +
        '<path d="M4.5 5v6M11.5 7c0 3-7 1.5-7 4"/>',
      cikis: '<path d="M6.5 2.5h-3v11h3M10 5l3 3-3 3M13 8H6.5"/>',
      daralt: '<path d="M8 4.5L4.5 8 8 11.5M12 4.5L8.5 8 12 11.5"/>',
    };
    function ikon(ad, sinif) {
      return '<svg class="kp-i' + (sinif ? ' ' + sinif : '') + '" viewBox="0 0 16 16" aria-hidden="true">' + IKON[ad] + '</svg>';
    }
    // Brand vectors downloaded from https://github.com/simple-icons/simple-icons (Claude, Gemini),
    // https://github.com/lobehub/lobe-icons (Codex), and https://antigravity.google/press (Antigravity).
    // Inline to avoid runtime third-party requests.
    var KOTA_IKON = {
      claude: {view: '0 0 24 24', renk: '#D97757', d: 'm4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z'},
      codex: {view: '0 0 24 24', renk: '#F2F0E8', rule: 'evenodd', d: 'M8.086.457a6.105 6.105 0 013.046-.415c1.333.153 2.521.72 3.564 1.7a.117.117 0 00.107.029c1.408-.346 2.762-.224 4.061.366l.063.03.154.076c1.357.703 2.33 1.77 2.918 3.198.278.679.418 1.388.421 2.126a5.655 5.655 0 01-.18 1.631.167.167 0 00.04.155 5.982 5.982 0 011.578 2.891c.385 1.901-.01 3.615-1.183 5.14l-.182.22a6.063 6.063 0 01-2.934 1.851.162.162 0 00-.108.102c-.255.736-.511 1.364-.987 1.992-1.199 1.582-2.962 2.462-4.948 2.451-1.583-.008-2.986-.587-4.21-1.736a.145.145 0 00-.14-.032c-.518.167-1.04.191-1.604.185a5.924 5.924 0 01-2.595-.622 6.058 6.058 0 01-2.146-1.781c-.203-.269-.404-.522-.551-.821a7.74 7.74 0 01-.495-1.283 6.11 6.11 0 01-.017-3.064.166.166 0 00.008-.074.115.115 0 00-.037-.064 5.958 5.958 0 01-1.38-2.202 5.196 5.196 0 01-.333-1.589 6.915 6.915 0 01.188-2.132c.45-1.484 1.309-2.648 2.577-3.493.282-.188.55-.334.802-.438.286-.12.573-.22.861-.304a.129.129 0 00.087-.087A6.016 6.016 0 015.635 2.31C6.315 1.464 7.132.846 8.086.457zm-.804 7.85a.848.848 0 00-1.473.842l1.694 2.965-1.688 2.848a.849.849 0 001.46.864l1.94-3.272a.849.849 0 00.007-.854l-1.94-3.393zm5.446 6.24a.849.849 0 000 1.695h4.848a.849.849 0 000-1.696h-4.848z'},
      gemini: {view: '0 0 24 24', renk: '#8E75B2', d: 'M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81'},
      antigravity: {view: '0 28 180 126', renk: '#F2F0E8', d: 'M144.248 149.062C151.748 154.688 162.998 150.938 152.685 140.625C121.748 110.625 128.31 28.125 89.8727 28.125C51.4352 28.125 57.9977 110.625 27.0602 140.625C15.8102 151.875 27.9977 154.688 35.4977 149.062C64.5602 129.375 62.6852 94.6875 89.8727 94.6875C117.06 94.6875 115.185 129.375 144.248 149.062Z'}
    };
    function kotaLogo(ad) {
      var m = KOTA_IKON[ad];
      return '<svg class="kp-logo" viewBox="' + m.view + '" fill-rule="' + (m.rule || 'nonzero') + '" aria-hidden="true"><path fill="' + m.renk + '" d="' + m.d + '"/></svg>';
    }
    function limitSatiri(on, ad, ikonAdi) {
      function hucre(g) {
        return '<span class="kp-l" data-g="' + g + '"><span class="kp-lc"><i></i></span>' +
          '<span class="kp-ld">—</span></span>';
      }
      var baslik = on === 'ag' ? 'Antigravity · Gemini havuzu' : on === 'ao' ? 'Antigravity · Claude/GPT havuzu' : ad;
      var logos = ikonAdi === 'mix' ? kotaLogo('claude') + kotaLogo('codex') +
        '<span class="kp-li-source">' + kotaLogo('antigravity') + '</span>' :
        ikonAdi === 'gemini' ? kotaLogo('gemini') + '<span class="kp-li-source">' + kotaLogo('antigravity') + '</span>' : kotaLogo(ikonAdi);
      var isaret = '<span class="kp-li' + (ikonAdi === 'mix' ? ' kp-li-pair' : '') + '" role="img" aria-label="' + baslik + '" title="' + baslik + '">' + logos + '</span>';
      return '<div class="kp-lr" data-l="' + on + '"' + (on !== 'c' ? ' hidden' : '') + '>' + isaret +
        hucre(on + '5') + hucre(on + '7') + '</div>';
    }
    function olcer(g, ad) {
      return '<div class="kp-o" data-g="' + g + '"><svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<circle class="kp-hz" cx="12" cy="12" r="9"/><circle class="kp-hd" cx="12" cy="12" r="9"/></svg>' +
        '<span class="kp-oy"><span class="kp-od">—</span><span class="kp-oe">' + ad + '</span></span></div>';
    }

    var kp = document.createElement('div');
    kp.id = 'kp';
    kp.innerHTML =
      '<div id="kp-ust"><span id="kp-baslik">Sekmeler<span id="kp-sayi"></span></span>' +
      '<button id="kp-yeni" class="kp-dugme" type="button" title="Yeni sekme" aria-label="Yeni sekme">' + ikon('arti') + '</button></div>' +
      '<div id="kp-liste"></div>' +
      '<div id="kp-durum">' +
      '<div id="kp-cl">' +
      '<div class="kp-lr kp-lb" title="Çubuk ve sayı kullanılan yüzdeyi gösterir; sıfırlanma süresi için değerin üzerine gel"><span>%</span><span>5 saat</span><span>Hafta</span></div>' +
      limitSatiri('c', 'Claude', 'claude') + limitSatiri('x', 'Codex', 'codex') +
      limitSatiri('ag', 'Antigravity · Gemini', 'gemini') + limitSatiri('ao', 'Antigravity · Claude/GPT', 'mix') +
      '</div>' +
      '<div id="kp-sis">' + olcer('cpu', 'CPU') + olcer('ram', 'RAM') + olcer('disk', 'Disk') + '</div>' +
      '</div>' +
      '<div id="kp-alt">' +
      '<button id="kp-cikis" type="button" title="Oturumu kapat">' + ikon('cikis') + 'Çıkış</button>' +
      '<button id="kp-yenile" type="button" title="Kota ve sistem ölçümlerini şimdi yenile" aria-label="Kota göstergelerini şimdi yenile">' + ikon('yenile') + '</button>' +
      '<button id="kp-daralt" class="kp-dugme" type="button" title="Paneli daralt / genişlet" aria-label="Paneli daralt / genişlet">' +
      ikon('daralt') + '</button></div>';
    document.body.appendChild(kp);
    var liste = kp.querySelector('#kp-liste');
    var sayi = kp.querySelector('#kp-sayi');

    function sigdir() {
      var t = term();
      try { if (t && t.fit) t.fit(); } catch (e) {}
      try { window.dispatchEvent(new Event('resize')); } catch (e) {}
    }

    function yerles() {
      var w = dar ? DAR : GENIS;
      kp.style.width = w + 'px';
      kp.classList.toggle('kp-dar', dar);
      document.body.style.setProperty('margin-left', w + 'px', 'important');
      sigdir();
      setTimeout(sigdir, 300);
    }

    function boy(b) {
      if (!(b > 0)) return '';
      return b >= 1073741824 ? (b / 1073741824).toFixed(1) + 'G' : Math.round(b / 1048576) + 'M';
    }
    function yaz(el, metin) { if (el.textContent !== metin) el.textContent = metin; }
    function yap(etiket, sinif) {
      var e = document.createElement(etiket);
      e.className = sinif;
      return e;
    }

    // Satırlar yalnızca sekme listesi değişince yeniden kurulur; RAM/CPU gibi sık değişenler
    // yerinde güncellenir ki imlecin altındaki satır tıklama sırasında yok olmasın.
    var RAM_ESIK = 50 * 1048576;         // bundan az RAM satırda yazılmaz (boş kabuklar kalabalık etmesin)
    var emin = null, eminZaman = null;   // kapatma iki tıkla: önce ×, sonra çöp kutusu
    var son = [], kurulu = null, satirlar = {};
    var giren = {};                      // yeni açılan sekmeler: satırı belirerek gelir
    function kur(sekmeler) {
      liste.textContent = '';
      satirlar = {};
      duzenlenen = null;
      sekmeler.forEach(function (s) {
        var r = { satir: yap('div', 'kp-s'), no: yap('span', 'kp-no'),
                  isim: yap('span', ''), alt: yap('span', 'kp-alt'),
                  yol: yap('span', 'kp-yol'), dal: yap('span', 'kp-dal'), dalAd: yap('span', 'kp-dal-ad'),
                  ram: yap('span', 'kp-ram'), x: null };
        var m = yap('span', 'kp-m'), ad = yap('span', 'kp-ad');
        r.satir.setAttribute('data-no', s.no);
        r.satir.addEventListener('animationend', function (e) {
          if (e.animationName !== 'kp-gir') return;
          delete giren[s.no];
          r.satir.classList.remove('kp-gir');
        });
        ad.appendChild(r.isim);
        r.dal.innerHTML = ikon('dal');
        r.dal.appendChild(r.dalAd);
        r.alt.appendChild(r.yol);
        r.alt.appendChild(r.dal);
        m.appendChild(ad);
        m.appendChild(r.alt);
        r.satir.appendChild(r.no);
        r.satir.appendChild(m);
        r.satir.appendChild(r.ram);
        if (sekmeler.length > 1) {
          r.x = yap('button', 'kp-x');
          r.x.type = 'button';
          r.x.setAttribute('data-kapat', s.no);
          r.x.innerHTML = ikon('x', 'kp-i-x') + ikon('cop', 'kp-i-cop');
          r.satir.appendChild(r.x);
        }
        liste.appendChild(r.satir);
        satirlar[s.no] = r;
      });
    }

    // Elle verilen ad önce gelir; yoksa uygulamanın (ör. Claude) sekmeye verdiği başlık, o da yoksa tmux adı
    function gorunenAd(s) { return s.adli ? s.ad : (s.baslik || s.ad); }

    // Çift tıkla yeniden adlandır: Enter kaydeder, Esc vazgeçer, boş bırakmak otomatik ada döndürür
    var duzenlenen = null;
    function adlandir(no) {
      var r = satirlar[no], s = son.filter(function (x) { return x.no === no; })[0];
      if (!r || !s || duzenlenen !== null) return;
      duzenlenen = no;
      var giris = yap('input', 'kp-giris');
      giris.type = 'text';
      giris.maxLength = 40;
      giris.value = s.adli ? s.ad : '';
      giris.placeholder = gorunenAd(s);
      r.isim.style.display = 'none';
      r.isim.parentNode.appendChild(giris);
      var bitti = false;
      function bitir(kaydet) {
        if (bitti) return;
        bitti = true;
        duzenlenen = null;
        var ad = giris.value.trim();
        if (giris.parentNode) giris.parentNode.removeChild(giris);
        r.isim.style.display = '';
        if (kaydet && (ad || s.adli)) islem('adlandir', no, ad);
        odak();
      }
      giris.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); bitir(true); }
        else if (e.key === 'Escape') { e.preventDefault(); bitir(false); }
      });
      giris.addEventListener('blur', function () { bitir(true); });
      giris.focus();
    }

    function ciz() {
      var yapi = son.map(function (s) { return s.no; }).join(',');
      if (yapi !== kurulu) {
        var eski = kurulu === null ? null : kurulu.split(',');
        kur(son);
        kurulu = yapi;
        if (eski) son.forEach(function (s) {
          if (eski.indexOf(String(s.no)) !== -1) return;
          giren[s.no] = true;
          setTimeout(function () { delete giren[s.no]; }, 900);   // animasyon kapalıysa da temizlensin
          try { satirlar[s.no].satir.scrollIntoView({ block: 'nearest' }); } catch (e) {}
        });
      }
      yaz(sayi, String(son.length));
      son.forEach(function (s) {
        var r = satirlar[s.no];
        var sinif = 'kp-s' + (s.aktif ? ' kp-aktif' : '') + (s.bekliyor ? ' kp-bekliyor' : (s.cpu >= 5 ? ' kp-mesgul' : '')) +
          (emin === s.no ? ' kp-emin' : '') + (giren[s.no] ? ' kp-gir' : '');
        if (r.satir.className !== sinif) r.satir.className = sinif;
        r.satir.title = gorunenAd(s) + ' — ' + s.dizin + (s.dal ? ' (' + s.dal + ')' : '') +
          (s.ram ? ' — RAM ' + boy(s.ram) + ', CPU %' + (s.cpu || 0) : '') +
          (s.bekliyor ? ' — seni bekliyor' : '') + ' (ad vermek için çift tıkla)';
        yaz(r.no, String(s.no));
        yaz(r.isim, gorunenAd(s) + (s.bolme > 1 ? ' (' + s.bolme + ')' : ''));
        // ad uygulamanın başlığından geliyorsa hangi programın çalıştığı alt satırda kalsın
        yaz(r.yol, (gorunenAd(s) !== s.ad && s.komut ? s.komut + ' · ' : '') + s.dizin);
        r.dal.hidden = !s.dal;
        yaz(r.dalAd, s.dal || '');
        yaz(r.ram, s.ram >= RAM_ESIK ? boy(s.ram) : '');
        if (r.x) r.x.title = emin === s.no ? 'Kapatmak için yeniden tıkla' : 'Sekmeyi kapat';
      });
    }

    // Halkalar (CPU, RAM, disk) ve limit çubukları: dolgu CSS geçişiyle yerine oturur
    var CEVRE = 56.55;                   // 2π·9: halkanın çevresi
    var gostergeler = {};
    Array.prototype.forEach.call(kp.querySelectorAll('[data-g]'), function (g) {
      gostergeler[g.getAttribute('data-g')] = { kutu: g, halka: g.querySelector('.kp-hd'), cubuk: g.querySelector('.kp-lc i'),
                                                deger: g.querySelector('.kp-od,.kp-ld') };
    });
    function gosterge(ad, yuzde, metin, ipucu) {
      var g = gostergeler[ad];
      if (!g || !(yuzde >= 0)) return;
      yuzde = Math.min(100, yuzde);
      if (g.halka) {
        g.halka.style.strokeDashoffset = (CEVRE * (1 - yuzde / 100)).toFixed(2);
        g.halka.style.strokeOpacity = yuzde > 0 ? '1' : '0';   // %0'da yuvarlak uç nokta gibi kalmasın
      } else {
        g.cubuk.style.width = yuzde + '%';
      }
      g.kutu.classList.toggle('kp-orta', yuzde >= 60 && yuzde < 85);
      g.kutu.classList.toggle('kp-yuksek', yuzde >= 85);
      yaz(g.deger, metin);
      if (g.kutu.title !== ipucu) g.kutu.title = ipucu;
    }
    function sistem(d) {
      if (!d) return;
      gosterge('cpu', d.cpu, '%' + d.cpu, 'İşlemci kullanımı: %' + d.cpu);
      if (d.ram_toplam > 0) {
        var ry = Math.round(100 * d.ram / d.ram_toplam);
        gosterge('ram', ry, boy(d.ram) || '0M', 'Bellek: ' + (boy(d.ram) || '0M') + ' / ' + boy(d.ram_toplam) + ' (%' + ry + ')');
      }
      gosterge('disk', d.disk, '%' + d.disk, 'Disk doluluğu: %' + d.disk);
    }
    // Kullanım limitleri: dolu yüzde + pencerenin sıfırlanmasına kalan süre.
    // Codex ve Antigravity satırları veri yoksa (kurulu/girişli değil) gizlenir.
    function sure(sn) {
      var dk = Math.ceil(sn / 60);
      if (dk >= 1440) return Math.floor(dk / 1440) + 'g ' + Math.floor(dk % 1440 / 60) + 'sa';
      if (dk >= 60) return Math.floor(dk / 60) + 'sa ' + (dk % 60) + 'dk';
      return dk + 'dk';
    }
    function limit(on, d) {
      var varMi = false;
      [['5', d && d.bes_saat, '5 saat'], ['7', d && d.hafta, 'hafta']].forEach(function (c) {
        var p = c[1], g = gostergeler[on + c[0]];
        if (!g) return;
        if (!p || !(p.yuzde >= 0)) {
          g.cubuk.style.width = '0';
          g.kutu.classList.remove('kp-orta', 'kp-yuksek');
          g.kutu.removeAttribute('title');
          return yaz(g.deger, '—');
        }
        varMi = true;
        gosterge(on + c[0], p.yuzde, '%' + p.yuzde,
          ({x: 'Codex', ag: 'Antigravity Gemini', ao: 'Antigravity Claude/GPT', c: 'Claude'}[on]) + ' · ' + c[2] + ': %' + p.yuzde + ' kullanıldı' +
          (p.kalan > 0 ? ', ' + sure(p.kalan) + ' sonra sıfırlanır' : ''));
      });
      if (on !== 'c') kp.querySelector('[data-l="' + on + '"]').hidden = !varMi;
    }

    function goster(j) {
      if (!j || !Array.isArray(j.sekmeler)) return;
      son = j.sekmeler;
      ciz();
      sistem(j.sistem);
      limit('c', j.claude);
      limit('x', j.codex);
      limit('ag', j.antigravity && j.antigravity.gemini);
      limit('ao', j.antigravity && j.antigravity.other);
    }

    // Sekme arka plandayken de sorar: API paneli açık saysın, üstteki çubuk gidip gelmesin
    function yenile(zorla) {
      if (zorla) {
        var tus = kp.querySelector('#kp-yenile');
        if (tus) {
          tus.classList.add('kp-yeniliyor');
          setTimeout(function () { tus.classList.remove('kp-yeniliyor'); }, 900);
        }
      }
      fetch('/api/sekmeler' + (zorla ? '?yenile=1' : ''), { headers: H, cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { goster(j); })
        .catch(function () {});
    }

    function islem(ad, no, yeniAd) {
      return fetch('/api/sekme', {
        method: 'POST',
        headers: { 'X-Kutuphane': '1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ islem: ad, no: no, ad: yeniAd }),
      }).then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
          goster(j);
        });
      }).catch(function (e) {
        toast('Sekme işlemi olmadı: ' + e.message, 4000);
        yenile();
      });
    }

    function odak() {
      var t = term();
      try { if (t) t.focus(); } catch (e) {}
    }

    // Panele basmak terminalin odağını almasın
    kp.addEventListener('mousedown', function (e) {
      if (!e.target.closest('.kp-giris')) e.preventDefault();
    });

    kp.addEventListener('dblclick', function (e) {
      var satir = e.target.closest('.kp-s');
      if (satir && !e.target.closest('[data-kapat]') && !dar) adlandir(Number(satir.getAttribute('data-no')));
    });

    kp.addEventListener('click', function (e) {
      var el = e.target;
      if (el.closest('.kp-giris')) return;
      var x = el.closest('[data-kapat]');
      var bekleyen = emin;
      clearTimeout(eminZaman);
      emin = null;                       // başka bir yere basmak bekleyen kapatma onayından vazgeçmektir
      if (x) {
        var no = Number(x.getAttribute('data-kapat'));
        if (bekleyen === no) {
          islem('kapat', no);
        } else {
          emin = no;
          ciz();
          eminZaman = setTimeout(function () { emin = null; ciz(); }, 3000);
        }
        return odak();
      }
      if (bekleyen !== null) ciz();
      if (el.closest('#kp-daralt')) {
        dar = !dar;
        try { localStorage.setItem('kutuphane.panel.dar', dar ? '1' : '0'); } catch (err) {}
        yerles();
        return odak();
      }
      if (el.closest('#kp-yeni')) {
        islem('yeni');
        return odak();
      }
      if (el.closest('#kp-cikis')) return cikis();
      if (el.closest('#kp-yenile')) {
        yenile(true);
        return odak();
      }
      var satir = el.closest('.kp-s');
      if (satir) {
        islem('sec', Number(satir.getAttribute('data-no')));
        odak();
      }
    });

    yerles();
    yenile();
    setInterval(yenile, 2000);
    document.addEventListener('visibilitychange', yenile);
  }

  if (panelIstendi()) {
    var panelBaslat = function () {
      try { panelKur(); } catch (e) { try { document.body.style.removeProperty('margin-left'); } catch (e2) {} }
    };
    if (document.body) panelBaslat();
    else document.addEventListener('DOMContentLoaded', panelBaslat);
  }

  // ---------- WebSocket izleme (sadece ana/ttyd sayfasında) ----------
  if (isFallback || !window.WebSocket) return;
  try { if (new URLSearchParams(location.search).has('ws')) return; } catch (e) {}

  var NativeWS = window.WebSocket;
  var everOpened = false, redirecting = false, closes = [];

  function goFallback(reason) {
    if (redirecting) return;
    redirecting = true;
    toast(reason + ' → yedek moda geçiliyor…', 0);
    setTimeout(function () { location.href = '/yedek'; }, 1500);
  }

  window.WebSocket = class extends NativeWS {
    constructor(url, protocols) {
      super(url, protocols);
      this.addEventListener('open', function () { everOpened = true; });
      this.addEventListener('close', function () {
        var now = Date.now();
        closes = closes.filter(function (t) { return now - t < 60000; });
        closes.push(now);
        if (!everOpened) goFallback('WebSocket açılamadı');
        else if (closes.length >= 3) goFallback('WebSocket sürekli kopuyor');
      });
    }
  };

  setTimeout(function () { if (!everOpened) goFallback('WebSocket yanıt vermiyor'); }, 8000);
})();
