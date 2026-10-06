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
    // Panel yalnızca alttaki « düğmesiyle daralır; tercih tarayıcıda saklanır. Tercih yoksa dar ekranda dar başlar
    var dar = window.innerWidth < 700;
    try {
      var kayitliDar = localStorage.getItem('kutuphane.panel.dar');
      if (kayitliDar !== null) dar = kayitliDar === '1';
    } catch (e) {}

    var css = document.createElement('style');
    css.textContent =
      '#kp{position:fixed;left:0;top:0;bottom:0;z-index:9000;display:flex;flex-direction:column;' +
        'box-sizing:border-box;background:#111113;border-right:1px solid #232327;color:#e4e4e7;' +
        'font:12.5px/1.35 ui-monospace,Menlo,Monaco,monospace;user-select:none;-webkit-user-select:none}' +
      '#kp *{box-sizing:border-box}' +
      '#kp-ust{flex:none;display:flex;align-items:center;gap:6px;padding:10px 10px 8px}' +
      '#kp-baslik{flex:1;color:#8b8b94;font-size:11px;letter-spacing:.08em;text-transform:uppercase}' +
      '#kp button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer}' +
      '#kp #kp-yeni{position:relative;flex:none;width:24px;height:24px;border-radius:6px;color:#a6e3a1;' +
        'transition:background .2s,transform .15s}' +
      '#kp #kp-yeni:before,#kp #kp-yeni:after{content:"";position:absolute;left:50%;top:50%;width:12px;height:2px;' +
        'margin:-1px 0 0 -6px;border-radius:1px;background:currentColor;transition:transform .35s cubic-bezier(.34,1.56,.64,1)}' +
      '#kp #kp-yeni:after{transform:rotate(90deg)}' +
      '#kp #kp-yeni:hover{background:#26262b}' +
      '#kp #kp-yeni:hover:before{transform:rotate(90deg)}' +
      '#kp #kp-yeni:hover:after{transform:rotate(180deg)}' +
      '#kp #kp-yeni:active{transform:scale(.86)}' +
      '@keyframes kp-don{0%{transform:scale(.8) rotate(0);box-shadow:0 0 0 0 rgba(166,227,161,.55)}' +
        '100%{transform:scale(1) rotate(180deg);box-shadow:0 0 0 9px rgba(166,227,161,0)}}' +
      '#kp #kp-yeni.kp-don{animation:kp-don .5s cubic-bezier(.34,1.56,.64,1)}' +
      '#kp-liste{flex:1;min-height:0;overflow-y:auto;padding:0 8px;scrollbar-width:thin}' +
      '.kp-s{position:relative;display:flex;align-items:center;gap:9px;width:100%;margin:0 0 4px;padding:7px 6px 7px 11px;' +
        'border-radius:8px;cursor:pointer;border:1px solid transparent;transition:background .15s,border-color .15s}' +
      '@keyframes kp-gir{0%{opacity:0;max-height:0;padding-top:0;padding-bottom:0;margin-bottom:0;' +
        'transform:translateX(-14px);background-color:rgba(166,227,161,.2)}' +
        '60%{opacity:1;max-height:60px;transform:none;background-color:rgba(166,227,161,.12)}100%{max-height:60px}}' +
      '.kp-s.kp-gir{overflow:hidden;animation:kp-gir .5s cubic-bezier(.22,1,.36,1)}' +
      '.kp-s:hover{background:#1a1a1d}' +
      '.kp-s.kp-aktif{background:#26262b;border-color:#34343a}' +
      '.kp-no{display:none;flex:none;width:24px;height:24px;line-height:24px;text-align:center;border-radius:6px;' +
        'background:#1f1f23;color:#8b8b94;font-weight:700}' +
      '.kp-aktif .kp-no{background:#89b4fa;color:#111113}' +
      // durum çizgisi: yeşil = sekmede bir şey çalışıyor, yanıp sönen sarı = Claude seni bekliyor
      '.kp-s:before{content:"";position:absolute;left:2px;top:10px;bottom:10px;width:3px;border-radius:2px;' +
        'background:transparent;transition:background .3s}' +
      '.kp-mesgul:before{background:#a6e3a1;box-shadow:0 0 6px rgba(166,227,161,.5)}' +
      '.kp-mesgul .kp-no{box-shadow:inset 0 -2px 0 #a6e3a1}' +
      '@keyframes kp-yan{50%{opacity:.2}}' +
      '.kp-bekliyor:before{background:#f9e2af;box-shadow:0 0 6px rgba(249,226,175,.6);animation:kp-yan 1s ease-in-out infinite}' +
      '.kp-bekliyor .kp-no{background:#f9e2af;color:#111113;animation:kp-yan 1s ease-in-out infinite}' +
      '.kp-bekliyor .kp-ad{color:#f9e2af}' +
      '@media (prefers-reduced-motion:reduce){.kp-bekliyor:before,.kp-bekliyor .kp-no,.kp-s.kp-gir,' +
        '#kp #kp-yeni.kp-don,.kp-yuksek svg,.kp-gb i.kp-parla:after{animation:none}' +
        '.kp-hd,.kp-gb i,#kp #kp-yeni:before,#kp #kp-yeni:after{transition:none}}' +
      '#kp .kp-giris{width:100%;min-width:0;font:inherit;color:#fff;background:#111113;border:1px solid #89b4fa;' +
        'border-radius:4px;padding:1px 4px;outline:none;user-select:text;-webkit-user-select:text}' +
      '.kp-ram{flex:none;align-self:flex-end;color:#8b8b94;font-size:11px;line-height:1.35}' +
      '.kp-m{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}' +
      '.kp-ad,.kp-alt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.kp-ad{color:#e4e4e7}' +
      '.kp-aktif .kp-ad{font-weight:700;color:#fff}' +
      '.kp-alt{color:#8b8b94;font-size:11px}' +
      '.kp-dal{color:#a6e3a1}' +
      // kapatma düğmesi satırın sağ üstünde, fare satıra gelince belirir (dokunmatikte hep görünür)
      '#kp .kp-x{position:absolute;top:5px;right:5px;min-width:18px;height:18px;padding:0 4px;border-radius:5px;' +
        'background:#34343a;color:#a1a1aa;font-size:13px;line-height:18px;opacity:0;transform:scale(.7);' +
        'pointer-events:none;transition:opacity .15s,transform .15s,background .15s,color .15s}' +
      '#kp .kp-s:hover .kp-x,#kp .kp-x.kp-emin{opacity:1;transform:none;pointer-events:auto}' +
      '@media (hover:none){#kp .kp-x{opacity:1;transform:none;pointer-events:auto}.kp-ad{padding-right:22px}}' +
      '#kp .kp-x:hover{background:#45454d;color:#f38ba8}' +
      '#kp .kp-x.kp-emin{background:#f38ba8;color:#111113;font-weight:700;font-size:11px}' +
      '#kp-cl{flex:none;display:flex;flex-direction:column;gap:8px;padding:10px 12px 10px 10px;' +
        'border-top:1px solid #232327;color:#8b8b94;font-size:11px}' +
      '#kp-sis{flex:none;display:flex;align-items:center;gap:12px;padding:10px 12px 4px 10px;' +
        'border-top:1px solid #232327;color:#8b8b94;font-size:11px}' +
      '.kp-halka{position:relative;flex:none;width:58px;height:58px}' +
      '.kp-halka svg{display:block;width:100%;height:100%;transform:rotate(-90deg)}' +
      '.kp-halka circle{fill:none;stroke-width:4}' +
      '.kp-hz{stroke:#26262b}' +
      '.kp-hd{stroke:#a6e3a1;stroke-linecap:round;stroke-dasharray:125.66;stroke-dashoffset:125.66;stroke-opacity:0;' +
        'transition:stroke-dashoffset .9s cubic-bezier(.22,1,.36,1),stroke .5s,stroke-opacity .3s}' +
      '.kp-hy{position:absolute;left:0;top:0;right:0;bottom:0;display:flex;flex-direction:column;' +
        'align-items:center;justify-content:center;line-height:1.15}' +
      '.kp-hy .kp-gd{color:#e4e4e7;font-size:13px;font-weight:700}' +
      '.kp-hy .kp-ge{font-size:9px;letter-spacing:.1em}' +
      '.kp-orta .kp-hd{stroke:#f9e2af}' +
      '.kp-yuksek .kp-hd{stroke:#f38ba8}' +
      '@keyframes kp-soluk{50%{opacity:.55}}' +
      '.kp-yuksek svg{animation:kp-soluk 1.4s ease-in-out infinite}' +
      '.kp-cubuklar{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px}' +
      '.kp-gu{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px}' +
      '.kp-ge{letter-spacing:.06em}' +
      '.kp-gd{color:#e4e4e7}' +
      '.kp-gb{display:block;height:5px;border-radius:3px;background:#26262b;overflow:hidden}' +
      '.kp-gb i{position:relative;display:block;height:100%;width:0;border-radius:3px;background:#a6e3a1;overflow:hidden;' +
        'transition:width .9s cubic-bezier(.22,1,.36,1),background-color .5s}' +
      '.kp-orta .kp-gb i{background:#f9e2af}' +
      '.kp-yuksek .kp-gb i{background:#f38ba8}' +
      '@keyframes kp-parla{0%{transform:translateX(-100%)}100%{transform:translateX(260%);opacity:0}}' +
      '.kp-gb i.kp-parla:after{content:"";position:absolute;left:0;top:0;bottom:0;width:40%;' +
        'background:linear-gradient(90deg,transparent,rgba(255,255,255,.6),transparent);animation:kp-parla .9s ease-out forwards}' +
      '#kp-alt{flex:none;display:flex;gap:6px;padding:8px}' +
      '#kp #kp-cikis,#kp #kp-daralt{padding:7px 8px;border-radius:8px;border:1px solid #232327;color:#8b8b94;' +
        'transition:background .15s,border-color .15s,color .15s}' +
      '#kp #kp-cikis{flex:1;text-align:left}' +
      '#kp #kp-daralt{min-width:30px}' +
      '#kp #kp-cikis:hover,#kp #kp-daralt:hover{background:#1a1a1d;border-color:#34343a;color:#e4e4e7}' +
      '#kp #kp-cikis:hover{color:#f38ba8}' +
      '#kp.kp-dar #kp-baslik,#kp.kp-dar .kp-m,#kp.kp-dar .kp-x,#kp.kp-dar #kp-cikis,' +
        '#kp.kp-dar .kp-s:before,#kp.kp-dar .kp-ram,#kp.kp-dar #kp-sis,#kp.kp-dar #kp-cl{display:none}' +
      '#kp.kp-dar .kp-no{display:block}' +
      '#kp.kp-dar #kp-ust{justify-content:center;padding:10px 0 8px}' +
      '#kp.kp-dar #kp-liste{padding:0 6px}' +
      '#kp.kp-dar .kp-s{justify-content:center;padding:4px 0;gap:0}' +
      '#kp.kp-dar #kp-alt{padding:8px 6px}' +
      '#kp.kp-dar #kp-daralt{flex:1;padding:6px 0}';
    document.head.appendChild(css);

    var kp = document.createElement('div');
    kp.id = 'kp';
    kp.innerHTML =
      '<div id="kp-ust"><span id="kp-baslik">Sekmeler</span>' +
      '<button id="kp-yeni" type="button" title="Yeni sekme" aria-label="Yeni sekme"></button></div>' +
      '<div id="kp-liste"></div>' +
      '<div id="kp-cl" title="Claude kullanım limitleri">' +
      '<div class="kp-g" data-g="c5"><div class="kp-gu"><span class="kp-ge">Claude · 5 saat</span><span class="kp-gd">—</span></div>' +
      '<span class="kp-gb"><i></i></span></div>' +
      '<div class="kp-g" data-g="c7"><div class="kp-gu"><span class="kp-ge">Claude · hafta</span><span class="kp-gd">—</span></div>' +
      '<span class="kp-gb"><i></i></span></div>' +
      '</div>' +
      '<div id="kp-sis">' +
      '<div class="kp-halka" data-g="cpu" title="İşlemci kullanımı"><svg viewBox="0 0 48 48" aria-hidden="true">' +
      '<circle class="kp-hz" cx="24" cy="24" r="20"/><circle class="kp-hd" cx="24" cy="24" r="20"/></svg>' +
      '<span class="kp-hy"><span class="kp-gd"></span><span class="kp-ge">CPU</span></span></div>' +
      '<div class="kp-cubuklar">' +
      '<div class="kp-g" data-g="ram"><div class="kp-gu"><span class="kp-ge">RAM</span><span class="kp-gd"></span></div>' +
      '<span class="kp-gb"><i></i></span></div>' +
      '<div class="kp-g" data-g="disk"><div class="kp-gu"><span class="kp-ge">Disk</span><span class="kp-gd"></span></div>' +
      '<span class="kp-gb"><i></i></span></div>' +
      '</div></div>' +
      '<div id="kp-alt">' +
      '<button id="kp-cikis" type="button" title="Oturumu kapat">çıkış</button>' +
      '<button id="kp-daralt" type="button" title="Paneli daralt / genişlet"></button></div>';
    document.body.appendChild(kp);
    var liste = kp.querySelector('#kp-liste');
    var daralt = kp.querySelector('#kp-daralt');
    var yeni = kp.querySelector('#kp-yeni');
    var baslik = kp.querySelector('#kp-baslik');
    yeni.addEventListener('animationend', function () { yeni.classList.remove('kp-don'); });

    function sigdir() {
      var t = term();
      try { if (t && t.fit) t.fit(); } catch (e) {}
      try { window.dispatchEvent(new Event('resize')); } catch (e) {}
    }

    function yerles() {
      var w = dar ? DAR : GENIS;
      kp.style.width = w + 'px';
      kp.className = dar ? 'kp-dar' : '';
      daralt.textContent = dar ? '»' : '«';
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
    var emin = null, eminZaman = null;   // kapatma iki tıkla: önce ×, sonra "sil?"
    var son = [], kurulu = null, satirlar = {};
    var giren = {};                      // yeni açılan sekmeler: satırı kayarak gelir
    function kur(sekmeler) {
      liste.textContent = '';
      satirlar = {};
      duzenlenen = null;
      sekmeler.forEach(function (s) {
        var r = { satir: yap('div', 'kp-s'), no: yap('span', 'kp-no'),
                  isim: yap('span', ''), alt: yap('span', 'kp-alt'),
                  yol: yap('span', ''), dal: yap('span', 'kp-dal'), ram: yap('span', 'kp-ram'), x: null };
        var m = yap('span', 'kp-m'), ad = yap('span', 'kp-ad');
        r.satir.setAttribute('data-no', s.no);
        r.satir.addEventListener('animationend', function (e) {
          if (e.animationName !== 'kp-gir') return;
          delete giren[s.no];
          r.satir.classList.remove('kp-gir');
        });
        ad.appendChild(r.isim);
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
          r.x.title = 'Sekmeyi kapat';
          r.x.setAttribute('data-kapat', s.no);
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
      yaz(baslik, 'Sekmeler (' + son.length + ')');
      son.forEach(function (s) {
        var r = satirlar[s.no];
        var sinif = 'kp-s' + (s.aktif ? ' kp-aktif' : '') + (s.bekliyor ? ' kp-bekliyor' : (s.cpu >= 5 ? ' kp-mesgul' : '')) +
          (giren[s.no] ? ' kp-gir' : '');
        if (r.satir.className !== sinif) r.satir.className = sinif;
        r.satir.title = gorunenAd(s) + ' — ' + s.dizin + (s.dal ? ' (' + s.dal + ')' : '') +
          (s.ram ? ' — RAM ' + boy(s.ram) + ', CPU %' + (s.cpu || 0) : '') +
          (s.bekliyor ? ' — seni bekliyor' : '') + ' (ad vermek için çift tıkla)';
        yaz(r.no, String(s.no));
        yaz(r.isim, gorunenAd(s) + (s.bolme > 1 ? ' (' + s.bolme + ')' : ''));
        // ad uygulamanın başlığından geliyorsa hangi programın çalıştığı alt satırda kalsın
        yaz(r.yol, (gorunenAd(s) !== s.ad && s.komut ? s.komut + ' · ' : '') + s.dizin);
        yaz(r.dal, s.dal ? '  ' + s.dal : '');
        yaz(r.ram, boy(s.ram));
        if (r.x) {
          var xs = 'kp-x' + (emin === s.no ? ' kp-emin' : '');
          if (r.x.className !== xs) r.x.className = xs;
          yaz(r.x, emin === s.no ? 'sil?' : '×');
        }
      });
    }

    // Halka (CPU) ve çubuklar (RAM, disk): dolgu CSS geçişiyle, sayı da eski değerden yenisine kayarak gelir
    var CEVRE = 125.66;                  // 2π·20: halkanın çevresi
    var gostergeler = {};
    Array.prototype.forEach.call(kp.querySelectorAll('[data-g]'), function (g) {
      gostergeler[g.getAttribute('data-g')] = { kutu: g, halka: g.querySelector('.kp-hd'), cubuk: g.querySelector('.kp-gb i'),
                                                deger: g.querySelector('.kp-gd'), yuzde: null, sayi: 0, kare: 0 };
    });
    function say(g, hedef, bicim) {
      var bas = g.sayi, t0 = Date.now();
      cancelAnimationFrame(g.kare);
      if (document.hidden || !window.requestAnimationFrame) { g.sayi = hedef; return yaz(g.deger, bicim(hedef)); }
      (function adim() {
        var p = Math.min(1, (Date.now() - t0) / 700);
        g.sayi = bas + (hedef - bas) * (1 - Math.pow(1 - p, 3));
        yaz(g.deger, bicim(g.sayi));
        if (p < 1) g.kare = requestAnimationFrame(adim);
      })();
    }
    function gosterge(ad, yuzde, sayi, bicim) {
      var g = gostergeler[ad];
      if (!g || !(yuzde >= 0)) return;
      yuzde = Math.min(100, yuzde);
      if (g.halka) {
        g.halka.style.strokeDashoffset = (CEVRE * (1 - yuzde / 100)).toFixed(2);
        g.halka.style.strokeOpacity = yuzde > 0 ? '1' : '0';   // %0'da yuvarlak uç nokta gibi kalmasın
      } else {
        g.cubuk.style.width = yuzde + '%';
        if (g.yuzde !== null && Math.abs(yuzde - g.yuzde) >= 3) {   // belirgin değişimde üstünden ışık geçer
          g.cubuk.classList.remove('kp-parla');
          void g.cubuk.offsetWidth;
          g.cubuk.classList.add('kp-parla');
        }
      }
      g.kutu.classList.toggle('kp-orta', yuzde >= 60 && yuzde < 85);
      g.kutu.classList.toggle('kp-yuksek', yuzde >= 85);
      g.yuzde = yuzde;
      say(g, sayi, bicim);
    }
    function yuzdeYaz(v) { return '%' + Math.round(v); }
    function sistem(d) {
      if (!d) return;
      gosterge('cpu', d.cpu, d.cpu, yuzdeYaz);
      if (d.ram_toplam > 0) {
        gosterge('ram', 100 * d.ram / d.ram_toplam, d.ram, function (v) { return (boy(v) || '0M') + '/' + boy(d.ram_toplam); });
      }
      gosterge('disk', d.disk, d.disk, yuzdeYaz);
    }
    // Claude limitleri: dolu yüzde + pencerenin sıfırlanmasına kalan süre; veri gelene kadar "—" kalır
    function sure(sn) {
      var dk = Math.ceil(sn / 60);
      if (dk >= 1440) return Math.floor(dk / 1440) + 'g ' + Math.floor(dk % 1440 / 60) + 'sa';
      if (dk >= 60) return Math.floor(dk / 60) + 'sa ' + (dk % 60) + 'dk';
      return dk + 'dk';
    }
    function claude(d) {
      if (!d) return;
      [['c5', d.bes_saat], ['c7', d.hafta]].forEach(function (c) {
        var p = c[1];
        if (!p) return;
        gosterge(c[0], p.yuzde, p.yuzde, function (v) { return '%' + Math.round(v) + (p.kalan > 0 ? ' · ' + sure(p.kalan) : ''); });
      });
    }

    function goster(j) {
      if (!j || !Array.isArray(j.sekmeler)) return;
      son = j.sekmeler;
      ciz();
      sistem(j.sistem);
      claude(j.claude);
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
      if (el.closest('#kp-daralt')) {
        dar = !dar;
        try { localStorage.setItem('kutuphane.panel.dar', dar ? '1' : '0'); } catch (err) {}
        yerles();
        return odak();
      }
      if (el.closest('#kp-yeni')) {
        yeni.classList.remove('kp-don');
        void yeni.offsetWidth;
        yeni.classList.add('kp-don');
        islem('yeni');
        return odak();
      }
      if (el.closest('#kp-cikis')) return cikis();
      var x = el.closest('[data-kapat]');
      if (x) {
        var no = Number(x.getAttribute('data-kapat'));
        clearTimeout(eminZaman);
        if (emin === no) {
          emin = null;
          islem('kapat', no);
        } else {
          emin = no;
          ciz();
          eminZaman = setTimeout(function () { emin = null; ciz(); }, 3000);
        }
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
