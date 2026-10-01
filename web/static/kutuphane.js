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
      '.kp-no{flex:none;width:24px;height:24px;line-height:24px;text-align:center;border-radius:6px;' +
        'background:#1f1f23;color:#8b8b94;font-weight:700}' +
      '.kp-aktif .kp-no{background:#89b4fa;color:#111113}' +
      '.kp-m{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}' +
      '.kp-ad,.kp-alt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.kp-ad{color:#e4e4e7}' +
      '.kp-aktif .kp-ad{font-weight:700;color:#fff}' +
      '.kp-alt{color:#8b8b94;font-size:11px}' +
      '.kp-dal{color:#a6e3a1}' +
      '#kp .kp-x{flex:none;min-width:22px;height:22px;padding:0 5px;border-radius:6px;color:#6b6b74;font-size:14px}' +
      '#kp .kp-x:hover{background:#3a3a41;color:#f38ba8}' +
      '#kp .kp-x.kp-emin{background:#f38ba8;color:#111113;font-weight:700;font-size:12px}' +
      '#kp-alt{flex:none;display:flex;gap:6px;padding:8px}' +
      '#kp #kp-yeni,#kp #kp-bol{padding:7px 8px;border-radius:8px;border:1px solid #232327;color:#8b8b94}' +
      '#kp #kp-yeni{flex:1;text-align:left;color:#a6e3a1}' +
      '#kp #kp-yeni:hover,#kp #kp-bol:hover{background:#1a1a1d;border-color:#34343a;color:#e4e4e7}' +
      '#kp.kp-dar #kp-baslik,#kp.kp-dar .kp-m,#kp.kp-dar .kp-x,#kp.kp-dar .kp-yazi,#kp.kp-dar #kp-bol{display:none}' +
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

    var emin = null, eminZaman = null;   // kapatma iki tıkla: önce ×, sonra "sil?"
    function ciz(sekmeler) {
      liste.textContent = '';
      sekmeler.forEach(function (s) {
        var satir = document.createElement('div');
        satir.className = 'kp-s' + (s.aktif ? ' kp-aktif' : '');
        satir.title = s.no + ' ' + s.ad + ' — ' + s.dizin + (s.dal ? ' (' + s.dal + ')' : '');
        satir.setAttribute('data-no', s.no);

        var no = document.createElement('span');
        no.className = 'kp-no';
        no.textContent = s.no;

        var m = document.createElement('span');
        m.className = 'kp-m';
        var ad = document.createElement('span');
        ad.className = 'kp-ad';
        ad.textContent = s.ad + (s.bolme > 1 ? ' (' + s.bolme + ')' : '');
        var alt = document.createElement('span');
        alt.className = 'kp-alt';
        alt.textContent = s.dizin;
        if (s.dal) {
          var dal = document.createElement('span');
          dal.className = 'kp-dal';
          dal.textContent = '  ' + s.dal;
          alt.appendChild(dal);
        }
        m.appendChild(ad);
        m.appendChild(alt);

        satir.appendChild(no);
        satir.appendChild(m);
        if (sekmeler.length > 1) {
          var x = document.createElement('button');
          x.type = 'button';
          x.className = 'kp-x' + (emin === s.no ? ' kp-emin' : '');
          x.textContent = emin === s.no ? 'sil?' : '×';
          x.title = 'Sekmeyi kapat';
          x.setAttribute('data-kapat', s.no);
          satir.appendChild(x);
        }
        liste.appendChild(satir);
      });
    }

    // Liste değişmediyse yeniden çizme: imlecin altındaki satır tıklama sırasında yenilenmesin
    var son = [], sonMetin = '';
    function goster(sekmeler) {
      if (!Array.isArray(sekmeler)) return;
      var metin = JSON.stringify(sekmeler);
      if (metin === sonMetin) return;
      son = sekmeler;
      sonMetin = metin;
      ciz(son);
    }

    // Sekme arka plandayken de sorar: API paneli açık saysın, üstteki çubuk gidip gelmesin
    function yenile() {
      fetch('/api/sekmeler', { headers: H, cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { if (j) goster(j.sekmeler); })
        .catch(function () {});
    }

    function islem(ad, no) {
      return fetch('/api/sekme', {
        method: 'POST',
        headers: { 'X-Kutuphane': '1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ islem: ad, no: no }),
      }).then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
          goster(j.sekmeler);
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
    kp.addEventListener('mousedown', function (e) { e.preventDefault(); });

    kp.addEventListener('click', function (e) {
      var el = e.target;
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
          ciz(son);
          eminZaman = setTimeout(function () { emin = null; ciz(son); }, 3000);
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
