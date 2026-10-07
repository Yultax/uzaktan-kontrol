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
    var kalanGoster = false;             // limit hücreleri yüzde yerine sıfırlanmaya kalan süreyi gösterir
    try {
      var kayitliDar = localStorage.getItem('kutuphane.panel.dar');
      if (kayitliDar !== null) dar = kayitliDar === '1';
      kalanGoster = localStorage.getItem('kutuphane.panel.kalan') === '1';
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
      // limitler: satır = araç, sütun = pencere. Çubuk dolu yüzdeyi, üstündeki işaret pencerede geçen süreyi gösterir;
      // dolgu işaretin ilerisindeyse limit sıfırlanmadan bitecek hızda harcanıyor demektir
      '#kp-cl{display:flex;flex-direction:column;gap:7px;font-size:11px;cursor:pointer}' +
      '.kp-lr{display:grid;grid-template-columns:68px 1fr 1fr;column-gap:8px;align-items:center}' +
      '.kp-lb{color:var(--kp-soluk);font-size:10px;letter-spacing:.06em;text-transform:uppercase}' +
      '.kp-l{display:flex;align-items:center;gap:6px;min-width:0}' +
      '.kp-lc{position:relative;flex:1;height:4px;border-radius:2px;background:var(--kp-iz)}' +
      '.kp-lc i{display:block;height:100%;width:0;max-width:100%;border-radius:2px;background:var(--kp-vurgu);' +
        'transition:width .4s ease-out,background-color .3s}' +
      '.kp-lc b{position:absolute;top:-3px;bottom:-3px;width:2px;margin-left:-1px;border-radius:1px;' +
        'background:var(--kp-parlak);box-shadow:0 0 0 1px var(--kp-zemin)}' +
      '.kp-ld{flex:none;min-width:28px;text-align:right}' +
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
      '.kp-orta .kp-lc i{background:var(--kp-uyari)}' +
      '.kp-yuksek .kp-hd{stroke:var(--kp-tehlike)}' +
      '.kp-yuksek .kp-lc i{background:var(--kp-tehlike)}' +
      '.kp-yuksek .kp-od,.kp-yuksek .kp-ld{color:var(--kp-tehlike)}' +
      '#kp-alt{flex:none;display:flex;align-items:center;padding:6px 8px;border-top:1px solid var(--kp-cizgi)}' +
      '#kp #kp-cikis{display:flex;align-items:center;gap:7px;height:26px;margin-right:auto;padding:0 8px 0 6px;' +
        'border-radius:6px;color:var(--kp-soluk);transition:background .12s,color .12s}' +
      '#kp #kp-cikis:hover{background:var(--kp-yuzey);color:var(--kp-tehlike)}' +
      '#kp-daralt .kp-i{transition:transform .2s}' +
      '#kp.kp-dar #kp-daralt .kp-i{transform:rotate(180deg)}' +
      '@media (prefers-reduced-motion:reduce){.kp-bekliyor:before,.kp-s.kp-gir,.kp-s.kp-emin:after{animation:none}' +
        '.kp-hd,.kp-lc i,#kp-daralt .kp-i{transition:none}}' +
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
      cop: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 8.5h6l.5-8.5M6.8 7.2v3.3M9.2 7.2v3.3"/>',
      dal: '<circle cx="4.5" cy="3.5" r="1.5"/><circle cx="4.5" cy="12.5" r="1.5"/><circle cx="11.5" cy="5.5" r="1.5"/>' +
        '<path d="M4.5 5v6M11.5 7c0 3-7 1.5-7 4"/>',
      cikis: '<path d="M6.5 2.5h-3v11h3M10 5l3 3-3 3M13 8H6.5"/>',
      daralt: '<path d="M8 4.5L4.5 8 8 11.5M12 4.5L8.5 8 12 11.5"/>',
    };
    function ikon(ad, sinif) {
      return '<svg class="kp-i' + (sinif ? ' ' + sinif : '') + '" viewBox="0 0 16 16" aria-hidden="true">' + IKON[ad] + '</svg>';
    }
    function limitSatiri(on, ad) {
      function hucre(g) {
        return '<span class="kp-l" data-g="' + g + '"><span class="kp-lc"><i></i><b hidden></b></span>' +
          '<span class="kp-ld">—</span></span>';
      }
      var baslik = on === 'ag' ? 'Antigravity · Gemini havuzu' : on === 'ao' ? 'Antigravity · Claude/GPT havuzu' : ad;
      return '<div class="kp-lr" data-l="' + on + '" title="' + baslik + '"' + (on !== 'c' ? ' hidden' : '') + '><span>' + ad + '</span>' +
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
      '<div class="kp-lr kp-lb" title="Tıkla: yüzde / sıfırlanmaya kalan süre"><span></span><span>5 saat</span><span>Hafta</span></div>' +
      limitSatiri('c', 'Claude') + limitSatiri('x', 'Codex') +
      limitSatiri('ag', 'AG Gemini') + limitSatiri('ao', 'AG C/G') +
      '</div>' +
      '<div id="kp-sis">' + olcer('cpu', 'CPU') + olcer('ram', 'RAM') + olcer('disk', 'Disk') + '</div>' +
      '</div>' +
      '<div id="kp-alt">' +
      '<button id="kp-cikis" type="button" title="Oturumu kapat">' + ikon('cikis') + 'Çıkış</button>' +
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
                                                isaret: g.querySelector('.kp-lc b'), deger: g.querySelector('.kp-od,.kp-ld') };
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
    var PENCERE = { '5': 18000, '7': 604800 };   // pencere uzunluğu (sn): geçen süre işareti buna göre yerleşir
    var limitler = { c: null, x: null, ag: null, ao: null };
    function sure(sn) {
      var dk = Math.ceil(sn / 60);
      if (dk >= 1440) return Math.floor(dk / 1440) + 'g ' + Math.floor(dk % 1440 / 60) + 'sa';
      if (dk >= 60) return Math.floor(dk / 60) + 'sa ' + (dk % 60) + 'dk';
      return dk + 'dk';
    }
    function kisaSure(sn) {
      var dk = Math.ceil(sn / 60);
      if (dk >= 1440) return Math.round(dk / 1440) + 'g';
      if (dk >= 60) return Math.round(dk / 60) + 'sa';
      return dk + 'dk';
    }
    function limit(on, d) {
      var varMi = false;
      limitler[on] = d;
      [['5', d && d.bes_saat, '5 saat'], ['7', d && d.hafta, 'hafta']].forEach(function (c) {
        var p = c[1], g = gostergeler[on + c[0]];
        if (!g) return;
        if (!p || !(p.yuzde >= 0)) {
          g.cubuk.style.width = '0';
          g.isaret.hidden = true;
          g.kutu.classList.remove('kp-orta', 'kp-yuksek');
          g.kutu.removeAttribute('title');
          return yaz(g.deger, '—');
        }
        varMi = true;
        var gecen = p.kalan > 0 ? 100 * (1 - p.kalan / PENCERE[c[0]]) : -1;
        g.isaret.hidden = !(gecen >= 0 && gecen <= 100);
        if (!g.isaret.hidden) g.isaret.style.left = gecen.toFixed(1) + '%';
        gosterge(on + c[0], p.yuzde, kalanGoster && p.kalan > 0 ? kisaSure(p.kalan) : '%' + p.yuzde,
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
    function yenile() {
      fetch('/api/sekmeler', { headers: H, cache: 'no-store' })
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
      if (el.closest('#kp-cl')) {
        kalanGoster = !kalanGoster;
        try { localStorage.setItem('kutuphane.panel.kalan', kalanGoster ? '1' : '0'); } catch (err) {}
        limit('c', limitler.c);
        limit('x', limitler.x);
        limit('ag', limitler.ag);
        limit('ao', limitler.ao);
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
