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

  // ---------- sol sekme paneli ----------
  // Deneme aşamasında kapalı gelir: adrese ?panel=1 ekleyince açılır ve tarayıcıda hatırlanır,
  // ?panel=0 kapatır. Panel açıkken üstteki sekme çubuğunu API gizler; panel susarsa geri gelir.
  function panelIstendi() {
    try {
      var q = new URLSearchParams(location.search);
      if (q.has('panel')) {
        if (q.get('panel') === '0') {
          localStorage.removeItem('kutuphane.panel');
          fetch('/api/sekme', {
            method: 'POST',
            headers: { 'X-Kutuphane': '1', 'Content-Type': 'application/json' },
            body: JSON.stringify({ islem: 'cubuk' }),
          }).catch(function () {});
        } else {
          localStorage.setItem('kutuphane.panel', '1');
        }
      }
      return localStorage.getItem('kutuphane.panel') === '1';
    } catch (e) { return false; }
  }

  function panelKur() {
    var GENIS = 236, DAR = 44;
    // Panel yalnızca « düğmesiyle daralır; tercih tarayıcıda saklanır
    var dar = false;
    try { dar = localStorage.getItem('kutuphane.panel.dar') === '1'; } catch (e) {}

    var css = document.createElement('style');
    css.textContent =
      '#kp{position:fixed;left:0;top:0;bottom:0;z-index:9000;display:flex;flex-direction:column;' +
        'box-sizing:border-box;background:#111113;border-right:1px solid #232327;color:#e4e4e7;' +
        'font:12.5px/1.35 ui-monospace,Menlo,Monaco,monospace;user-select:none;-webkit-user-select:none}' +
      '#kp *{box-sizing:border-box}' +
      '#kp-ust{flex:none;display:flex;align-items:center;gap:6px;padding:10px 10px 8px}' +
      '#kp-baslik{flex:1;color:#8b8b94;font-size:11px;letter-spacing:.08em;text-transform:uppercase}' +
      '#kp button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer}' +
      '#kp #kp-daralt{width:24px;height:24px;border-radius:6px;color:#8b8b94}' +
      '#kp #kp-daralt:hover{background:#26262b;color:#e4e4e7}' +
      '#kp-liste{flex:1;min-height:0;overflow-y:auto;padding:0 8px;scrollbar-width:thin}' +
      '.kp-s{display:flex;align-items:center;gap:9px;width:100%;margin:0 0 4px;padding:7px 6px 7px 7px;' +
        'border-radius:8px;cursor:pointer;border:1px solid transparent}' +
      '.kp-s:hover{background:#1a1a1d}' +
      '.kp-s.kp-aktif{background:#26262b;border-color:#34343a}' +
      '.kp-no{display:none;flex:none;width:24px;height:24px;line-height:24px;text-align:center;border-radius:6px;' +
        'background:#1f1f23;color:#8b8b94;font-weight:700}' +
      '.kp-aktif .kp-no{background:#89b4fa;color:#111113}' +
      '.kp-nokta{flex:none;width:8px;height:8px;margin:0 2px;border-radius:50%;background:#3a3a41}' +
      '.kp-mesgul .kp-nokta{background:#a6e3a1;box-shadow:0 0 6px rgba(166,227,161,.6)}' +
      '.kp-mesgul .kp-no{box-shadow:inset 0 -2px 0 #a6e3a1}' +
      '.kp-sira{color:#6b6b74;margin-right:6px;font-weight:400}' +
      '@keyframes kp-yan{50%{opacity:.2}}' +
      '.kp-bekliyor .kp-nokta{background:#f9e2af;box-shadow:0 0 6px rgba(249,226,175,.7);animation:kp-yan 1s ease-in-out infinite}' +
      '.kp-bekliyor .kp-no{background:#f9e2af;color:#111113;animation:kp-yan 1s ease-in-out infinite}' +
      '.kp-bekliyor .kp-ad{color:#f9e2af}' +
      '@media (prefers-reduced-motion:reduce){.kp-bekliyor .kp-nokta,.kp-bekliyor .kp-no{animation:none}}' +
      '#kp .kp-giris{width:100%;min-width:0;font:inherit;color:#fff;background:#111113;border:1px solid #89b4fa;' +
        'border-radius:4px;padding:1px 4px;outline:none;user-select:text;-webkit-user-select:text}' +
      '.kp-ram{flex:none;color:#8b8b94;font-size:11px}' +
      '.kp-m{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}' +
      '.kp-ad,.kp-alt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.kp-ad{color:#e4e4e7}' +
      '.kp-aktif .kp-ad{font-weight:700;color:#fff}' +
      '.kp-alt{color:#8b8b94;font-size:11px}' +
      '.kp-dal{color:#a6e3a1}' +
      '#kp .kp-x{flex:none;min-width:22px;height:22px;padding:0 5px;border-radius:6px;color:#6b6b74;font-size:14px}' +
      '#kp .kp-x:hover{background:#3a3a41;color:#f38ba8}' +
      '#kp .kp-x.kp-emin{background:#f38ba8;color:#111113;font-weight:700;font-size:12px}' +
      '#kp-sis{flex:none;padding:8px 10px 2px;border-top:1px solid #232327;color:#8b8b94;font-size:11px}' +
      '.kp-g{display:flex;align-items:center;gap:8px;height:18px}' +
      '.kp-ge{flex:none;width:30px}' +
      '.kp-gb{flex:1;height:4px;border-radius:2px;background:#26262b;overflow:hidden}' +
      '.kp-gb i{display:block;height:100%;width:0;border-radius:2px;background:#a6e3a1;transition:width .4s}' +
      '.kp-gb i.kp-orta{background:#f9e2af}' +
      '.kp-gb i.kp-yuksek{background:#f38ba8}' +
      '.kp-gd{flex:none;min-width:34px;text-align:right;color:#e4e4e7}' +
      '#kp-alt{flex:none;display:flex;gap:6px;padding:8px}' +
      '#kp #kp-yeni,#kp #kp-bol{padding:7px 8px;border-radius:8px;border:1px solid #232327;color:#8b8b94}' +
      '#kp #kp-yeni{flex:1;text-align:left;color:#a6e3a1}' +
      '#kp #kp-yeni:hover,#kp #kp-bol:hover{background:#1a1a1d;border-color:#34343a;color:#e4e4e7}' +
      '#kp.kp-dar #kp-baslik,#kp.kp-dar .kp-m,#kp.kp-dar .kp-x,#kp.kp-dar .kp-yazi,#kp.kp-dar #kp-bol,' +
        '#kp.kp-dar .kp-nokta,#kp.kp-dar .kp-ram,#kp.kp-dar #kp-sis{display:none}' +
      '#kp.kp-dar .kp-no{display:block}' +
      '#kp.kp-dar #kp-ust{justify-content:center;padding:10px 0 8px}' +
      '#kp.kp-dar #kp-liste{padding:0 6px}' +
      '#kp.kp-dar .kp-s{justify-content:center;padding:4px 0;gap:0}' +
      '#kp.kp-dar #kp-alt{padding:8px 6px}' +
      '#kp.kp-dar #kp-yeni{text-align:center;padding:6px 0}';
    document.head.appendChild(css);

    var kp = document.createElement('div');
    kp.id = 'kp';
    kp.innerHTML =
      '<div id="kp-ust"><span id="kp-baslik">Sekmeler</span>' +
      '<button id="kp-daralt" type="button" title="Paneli daralt / genişlet"></button></div>' +
      '<div id="kp-liste"></div>' +
      '<div id="kp-sis">' +
      '<div class="kp-g" data-g="cpu"><span class="kp-ge">CPU</span><span class="kp-gb"><i></i></span><span class="kp-gd"></span></div>' +
      '<div class="kp-g" data-g="ram"><span class="kp-ge">RAM</span><span class="kp-gb"><i></i></span><span class="kp-gd"></span></div>' +
      '<div class="kp-g" data-g="disk"><span class="kp-ge">Disk</span><span class="kp-gb"><i></i></span><span class="kp-gd"></span></div>' +
      '</div>' +
      '<div id="kp-alt">' +
      '<button id="kp-yeni" type="button" title="Yeni sekme">+<span class="kp-yazi"> yeni sekme</span></button>' +
      '<button id="kp-bol" type="button" title="Sekmeyi yan yana böl">böl</button></div>';
    document.body.appendChild(kp);
    var liste = kp.querySelector('#kp-liste');
    var daralt = kp.querySelector('#kp-daralt');

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
    var son = [], kurulu = '', satirlar = {};
    function kur(sekmeler) {
      liste.textContent = '';
      satirlar = {};
      duzenlenen = null;
      sekmeler.forEach(function (s) {
        var r = { satir: yap('div', 'kp-s'), nokta: yap('span', 'kp-nokta'), no: yap('span', 'kp-no'),
                  sira: yap('span', 'kp-sira'), isim: yap('span', ''), alt: yap('span', 'kp-alt'),
                  yol: yap('span', ''), dal: yap('span', 'kp-dal'), ram: yap('span', 'kp-ram'), x: null };
        var m = yap('span', 'kp-m'), ad = yap('span', 'kp-ad');
        r.satir.setAttribute('data-no', s.no);
        ad.appendChild(r.sira);
        ad.appendChild(r.isim);
        r.alt.appendChild(r.yol);
        r.alt.appendChild(r.dal);
        m.appendChild(ad);
        m.appendChild(r.alt);
        r.satir.appendChild(r.nokta);
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
      if (yapi !== kurulu) { kur(son); kurulu = yapi; }
      son.forEach(function (s) {
        var r = satirlar[s.no];
        var sinif = 'kp-s' + (s.aktif ? ' kp-aktif' : '') + (s.bekliyor ? ' kp-bekliyor' : (s.cpu >= 5 ? ' kp-mesgul' : ''));
        if (r.satir.className !== sinif) r.satir.className = sinif;
        r.satir.title = s.no + ' ' + gorunenAd(s) + ' — ' + s.dizin + (s.dal ? ' (' + s.dal + ')' : '') +
          (s.ram ? ' — RAM ' + boy(s.ram) + ', CPU %' + (s.cpu || 0) : '') +
          (s.bekliyor ? ' — seni bekliyor' : '') + ' (ad vermek için çift tıkla)';
        yaz(r.no, String(s.no));
        yaz(r.sira, String(s.no));
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

    var gostergeler = {};
    Array.prototype.forEach.call(kp.querySelectorAll('.kp-g'), function (g) {
      gostergeler[g.getAttribute('data-g')] = { cubuk: g.querySelector('i'), deger: g.querySelector('.kp-gd') };
    });
    function gosterge(ad, yuzde, metin) {
      var g = gostergeler[ad];
      if (!g || !(yuzde >= 0)) return;
      yuzde = Math.min(100, yuzde);
      g.cubuk.style.width = yuzde + '%';
      g.cubuk.className = yuzde >= 85 ? 'kp-yuksek' : (yuzde >= 60 ? 'kp-orta' : '');
      yaz(g.deger, metin);
    }
    function sistem(d) {
      if (!d) return;
      gosterge('cpu', d.cpu, '%' + d.cpu);
      if (d.ram_toplam > 0) gosterge('ram', 100 * d.ram / d.ram_toplam, boy(d.ram) + '/' + boy(d.ram_toplam));
      gosterge('disk', d.disk, '%' + d.disk);
    }

    function goster(j) {
      if (!j || !Array.isArray(j.sekmeler)) return;
      son = j.sekmeler;
      ciz();
      sistem(j.sistem);
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
        islem('yeni');
        return odak();
      }
      if (el.closest('#kp-bol')) {
        islem('bol');
        return odak();
      }
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
