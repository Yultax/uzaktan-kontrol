#!/usr/bin/env python3
"""kutuphane API: giriş/oturum + WebSocket'siz (HTTP long-poll) terminal + görsel yükleme.

Caddy'nin arkasında 127.0.0.1:7682 dinler. Giriş sayfası /api/giris'e yollar; doğru şifrede
imzalı bir oturum çerezi yazılır. Caddy korunan her istekte forward_auth ile /api/yetki'ye sorar.
Sadece Python standart kütüphanesi kullanır.

  POST /api/giris   {"kullanici":..,"sifre":..} -> {"ok":true} + çerez  (herkese açık)
  GET  /api/oturum                             -> {"giris":bool}        (herkese açık)
  GET  /api/yetki                              -> 200 / 302 / 403       (Caddy forward_auth)
  POST /api/open    {"cols":..,"rows":..}      -> {"sid":..}   (tmux "main" oturumuna bağlanır)
  GET  /api/read    ?sid=&offset=              -> ham çıktı; X-Start / X-Next / X-Alive başlıkları
  POST /api/write   ?sid=   (gövde: girdi)
  POST /api/resize  ?sid=   {"cols":..,"rows":..}
  POST /api/close   ?sid=
  POST /api/upload  (gövde: görsel)            -> {"path":..}
  GET  /api/sekmeler                           -> {"sekmeler":[{"no","ad","aktif","komut","dizin","dal","bolme","ram","cpu"}],
                                                   "sistem":{"cpu","ram","ram_toplam","disk"}}
  POST /api/sekme   {"islem":"sec|yeni|kapat|bol|cubuk","no":..} -> güncel sekme listesi  (sol panel)
"""
import fcntl
import hashlib
import hmac
import json
import os
import pty
import secrets
import signal
import struct
import subprocess
import sys
import termios
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HOST, PORT = "127.0.0.1", int(os.environ.get("KUTUPHANE_PORT", "7682"))
HOME = os.path.expanduser("~")
UPLOAD_DIR = os.path.join(HOME, "uploads")
TMUX_SESSION = os.environ.get("KUTUPHANE_SESSION", "main")
TMUX_CMD = (os.environ["KUTUPHANE_CMD"].split() if os.environ.get("KUTUPHANE_CMD")
            else ["tmux", "-u", "new", "-A", "-s", TMUX_SESSION])
BUF_MAX = 2 * 1024 * 1024       # oturum başına tutulan çıktı
POLL_TIMEOUT = 25               # long-poll süresi (proxy'ler genelde 30-60 sn'de keser)
IDLE_TIMEOUT = 90               # bu kadar sessiz kalan oturum kapatılır (tmux yaşamaya devam eder)
MAX_SESSIONS = 8
MAX_UPLOAD = 25 * 1024 * 1024
IMAGE_EXT = {"image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp"}
AUTH_FILE = os.environ.get("KUTUPHANE_AUTH", "/etc/kutuphane/auth.json")
COOKIE = "bk_oturum"
SESSION_TTL = 30 * 24 * 3600    # oturum çerezi 30 gün geçerli
FAIL_WINDOW = 600               # bu sürede
FAIL_MAX = 5                    # bu kadar hatalı giriş -> geçici blok (fail2ban da ayrıca izler)
LOGIN_PAGE = "/kutuphane"
PANEL_TIMEOUT = 90              # sol panel bu kadar süre sormazsa üstteki sekme çubuğu geri gelir


# ---------- kimlik ----------
def hash_password(password, salt):
    return hashlib.scrypt(password.encode(), salt=salt, n=2 ** 14, r=8, p=1, dklen=32)


def set_password(user, password):
    """auth.json'u yazar; yeni gizli anahtar = eski oturumlar düşer."""
    salt = secrets.token_bytes(16)
    data = {"user": user, "salt": salt.hex(), "hash": hash_password(password, salt).hex(),
            "secret": secrets.token_hex(32)}
    os.makedirs(os.path.dirname(AUTH_FILE), exist_ok=True)
    tmp = AUTH_FILE + ".tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(data, f)
    os.replace(tmp, AUTH_FILE)


def load_auth():
    try:
        with open(AUTH_FILE) as f:
            a = json.load(f)
        return a["user"], bytes.fromhex(a["salt"]), bytes.fromhex(a["hash"]), bytes.fromhex(a["secret"])
    except (OSError, ValueError, KeyError):
        return None


def sign(secret, user, exp):
    return hmac.new(secret, f"{user}.{exp}".encode(), hashlib.sha256).hexdigest()


def make_token(auth):
    user, _, _, secret = auth
    exp = int(time.time()) + SESSION_TTL
    return f"{exp}.{sign(secret, user, exp)}"


def valid_token(token):
    auth = load_auth()
    if not auth or not token or "." not in token:
        return False
    exp, sig = token.split(".", 1)
    if not exp.isdigit() or int(exp) < time.time():
        return False
    return hmac.compare_digest(sig, sign(auth[3], auth[0], int(exp)))


fails = {}                      # ip -> hatalı giriş zamanları
fails_lock = threading.Lock()


def recent_fails(ip, add=False):
    now = time.time()
    with fails_lock:
        lst = [t for t in fails.get(ip, []) if now - t < FAIL_WINDOW]
        if add:
            lst.append(now)
        if lst:
            fails[ip] = lst
        else:
            fails.pop(ip, None)
        return lst


class Session:
    def __init__(self, cols, rows):
        self.id = secrets.token_urlsafe(18)
        pid, fd = pty.fork()
        if pid == 0:  # çocuk: tmux istemcisi
            os.environ["TERM"] = "xterm-256color"
            os.environ.setdefault("LANG", "C.UTF-8")
            os.chdir(HOME)
            os.execvp(TMUX_CMD[0], TMUX_CMD)
        self.pid, self.fd = pid, fd
        self.resize(cols, rows)
        self.buf = bytearray()
        self.base = 0  # buf[0]'ın mutlak ofseti
        self.alive = True
        self.last_seen = time.time()
        self.cond = threading.Condition()
        self.write_lock = threading.Lock()
        threading.Thread(target=self._reader, daemon=True).start()

    def _reader(self):
        while True:
            try:
                data = os.read(self.fd, 65536)
            except OSError:
                data = b""
            with self.cond:
                if not data:
                    self.alive = False
                    self.cond.notify_all()
                    break
                self.buf += data
                if len(self.buf) > BUF_MAX:
                    drop = len(self.buf) - BUF_MAX
                    del self.buf[:drop]
                    self.base += drop
                self.cond.notify_all()
        try:
            os.waitpid(self.pid, 0)
        except ChildProcessError:
            pass

    def read(self, offset, timeout):
        self.last_seen = time.time()
        deadline = time.time() + timeout
        with self.cond:
            while self.alive and offset >= self.base + len(self.buf):
                remaining = deadline - time.time()
                if remaining <= 0:
                    break
                self.cond.wait(remaining)
            start = min(max(offset, self.base), self.base + len(self.buf))
            data = bytes(self.buf[start - self.base:])
            return start, data, self.base + len(self.buf), self.alive

    def write(self, data):
        self.last_seen = time.time()
        with self.write_lock:
            view = memoryview(data)
            while view:
                n = os.write(self.fd, view)
                view = view[n:]

    def resize(self, cols, rows):
        cols = max(10, min(int(cols), 1000))
        rows = max(5, min(int(rows), 500))
        fcntl.ioctl(self.fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))

    def close(self):
        if self.alive:
            try:
                os.kill(self.pid, signal.SIGHUP)
            except ProcessLookupError:
                pass


sessions = {}
sessions_lock = threading.Lock()


# ---------- sekmeler (sol panel) ----------
WIN_FIELDS = ("window_index", "window_active", "window_panes", "window_name",
              "pane_current_command", "pane_current_path")
WIN_FORMAT = "\t".join("#{%s}" % f for f in WIN_FIELDS)


def tmux(*args):
    try:
        r = subprocess.run(["tmux", *args], capture_output=True, text=True, timeout=5)
    except subprocess.SubprocessError as e:
        raise OSError(str(e))
    if r.returncode:
        raise OSError(r.stderr.strip() or "tmux hatasi")
    return r.stdout


# Sol panel açıkken üstteki tmux sekme çubuğu gizlenir (aynı sekmeler iki yerde görünmesin).
# Panel /api/sekmeler'i sormayı bırakırsa (kapandı, bozuldu, ?panel=0) janitor çubuğu geri getirir.
panel = {"seen": time.time(), "hidden": None}   # hidden None: API yeni başladı, durum bilinmiyor
panel_lock = threading.Lock()


def set_bar_hidden(hidden):
    with panel_lock:
        if panel["hidden"] is hidden:
            return
        panel["hidden"] = hidden
    try:
        if hidden:
            tmux("set-option", "-t", "=" + TMUX_SESSION + ":", "status", "off")
        else:
            tmux("set-option", "-u", "-t", "=" + TMUX_SESSION + ":", "status")
    except OSError:
        pass


branches = {}                   # dizin -> (zaman, git dalı); her sorguda git çalıştırmamak için


def git_branch(path):
    now = time.time()
    hit = branches.get(path)
    if hit and now - hit[0] < 10:
        return hit[1]
    try:
        r = subprocess.run(["git", "--no-optional-locks", "-C", path, "symbolic-ref", "--short", "-q", "HEAD"],
                           capture_output=True, text=True, timeout=2)
        branch = r.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        branch = ""
    if len(branches) > 200:
        branches.clear()
    branches[path] = (now, branch)
    return branch


# ---------- kaynak kullanımı (sol panel) ----------
CLK_TCK = os.sysconf("SC_CLK_TCK")
PAGE_SIZE = os.sysconf("SC_PAGE_SIZE")
usage = {"t": 0.0, "procs": {}, "cpu": None, "wins": {}, "sys": {}}
usage_lock = threading.Lock()


def read_procs():
    """pid -> (ppid, işlemci tik sayısı, RSS bayt)"""
    procs = {}
    for name in os.listdir("/proc"):
        if not name.isdigit():
            continue
        try:
            with open("/proc/%s/stat" % name) as f:
                data = f.read()
            # komut adı parantez içinde ve boşluk içerebilir: son ')' sonrasını böl
            rest = data[data.rindex(")") + 2:].split()
            procs[int(name)] = (int(rest[1]), int(rest[11]) + int(rest[12]), int(rest[21]) * PAGE_SIZE)
        except (OSError, ValueError, IndexError):
            continue
    return procs


def sample_usage():
    """Sekme başına RAM/CPU ve sistem durumu. Saniyede en fazla bir kez ölçer, arada son ölçümü verir."""
    with usage_lock:
        now = time.time()
        if now - usage["t"] < 1.0:
            return usage["wins"], usage["sys"]
        roots = {}
        try:
            out = tmux("list-panes", "-s", "-t", "=" + TMUX_SESSION, "-F", "#{window_index}\t#{pane_pid}")
        except OSError:
            out = ""
        for line in out.splitlines():
            no, _, pid = line.partition("\t")
            if no.isdigit() and pid.isdigit():
                roots.setdefault(int(no), []).append(int(pid))

        procs = read_procs()
        old, dt = usage["procs"], now - usage["t"]
        children = {}
        for pid, info in procs.items():
            children.setdefault(info[0], []).append(pid)
        wins = {}
        for no, pids in roots.items():
            ram = ticks = 0
            stack, seen = list(pids), set()
            while stack:
                pid = stack.pop()
                if pid in seen or pid not in procs:
                    continue
                seen.add(pid)
                ram += procs[pid][2]
                if pid in old:
                    ticks += max(0, procs[pid][1] - old[pid][1])
                stack.extend(children.get(pid, ()))
            cpu = 100.0 * ticks / CLK_TCK / dt if old and dt > 0 else 0.0
            wins[no] = (ram, round(cpu))

        system = {}
        try:
            with open("/proc/stat") as f:
                v = [int(x) for x in f.readline().split()[1:9]]
            total, idle = sum(v), v[3] + v[4]
            if usage["cpu"] and total > usage["cpu"][0]:
                system["cpu"] = round(100.0 * (1 - (idle - usage["cpu"][1]) / (total - usage["cpu"][0])))
            usage["cpu"] = (total, idle)
            mem = {}
            with open("/proc/meminfo") as f:
                for line in f:
                    k, _, rest = line.partition(":")
                    if k in ("MemTotal", "MemAvailable"):
                        mem[k] = int(rest.split()[0]) * 1024
            system["ram_toplam"] = mem["MemTotal"]
            system["ram"] = mem["MemTotal"] - mem["MemAvailable"]
            d = os.statvfs("/")
            used = d.f_blocks - d.f_bfree
            system["disk"] = round(100.0 * used / (used + d.f_bavail))
        except (OSError, ValueError, KeyError, IndexError, ZeroDivisionError):
            pass
        usage.update(t=now, procs=procs, wins=wins, sys=system)
        return wins, system


def panel_state():
    wins = list_windows()
    per, system = sample_usage()
    for w in wins:
        w["ram"], w["cpu"] = per.get(w["no"], (0, 0))
    return {"sekmeler": wins, "sistem": system}


def list_windows():
    wins = []
    for line in tmux("list-windows", "-t", "=" + TMUX_SESSION, "-F", WIN_FORMAT).splitlines():
        p = line.split("\t")
        if len(p) != len(WIN_FIELDS) or not p[0].isdigit():
            continue
        path = p[5]
        branch = git_branch(path) if path else ""
        if path == HOME or path.startswith(HOME + "/"):
            path = "~" + path[len(HOME):]
        wins.append({"no": int(p[0]), "aktif": p[1] == "1", "bolme": int(p[2] or 1),
                     "ad": p[3], "komut": p[4], "dizin": path, "dal": branch})
    return wins


def window_action(req):
    """(durum kodu, gövde) döner. Son sekme kapatılmaz: kapanırsa tmux oturumu da kapanır."""
    if not isinstance(req, dict):
        return 400, {"error": "bad request"}
    islem, no = req.get("islem"), req.get("no")
    target = "=" + TMUX_SESSION + ":"
    if islem == "yeni":
        tmux("new-window", "-t", target, "-c", "#{pane_current_path}")
    elif islem == "bol":
        tmux("split-window", "-h", "-t", target, "-c", "#{pane_current_path}")
    elif islem == "cubuk":      # panel kapatıldı: üstteki çubuğu beklemeden geri getir
        panel["seen"] = 0
        set_bar_hidden(False)
    elif islem in ("sec", "kapat"):
        wins = list_windows()
        if isinstance(no, bool) or not isinstance(no, int) or no not in [w["no"] for w in wins]:
            return 404, {"error": "sekme yok"}
        if islem == "sec":
            tmux("select-window", "-t", target + str(no))
        elif len(wins) < 2:
            return 409, {"error": "son sekme kapatilamaz"}
        else:
            tmux("kill-window", "-t", target + str(no))
    else:
        return 400, {"error": "bad request"}
    return 200, panel_state()


def janitor():
    while True:
        time.sleep(15)
        now = time.time()
        with sessions_lock:
            for sid, s in list(sessions.items()):
                if not s.alive or now - s.last_seen > IDLE_TIMEOUT:
                    s.close()
                    if not s.alive or now - s.last_seen > IDLE_TIMEOUT + 30:
                        sessions.pop(sid, None)
        if now - panel["seen"] > PANEL_TIMEOUT:
            set_bar_hidden(False)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "kutuphane"

    def log_message(self, fmt, *args):
        pass

    # --- yardımcılar ---
    def _send(self, code, body=b"", ctype="application/json", headers=None):
        if isinstance(body, (dict, list)):
            body = json.dumps(body).encode()
        self.send_response(code)
        if not self._consumed and int(self.headers.get("Content-Length") or 0):
            # okunmamış gövde bağlantıda kalırsa sonraki istek bozulur: bağlantıyı kapat
            self.close_connection = True
            self.send_header("Connection", "close")
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _body(self, limit=1024 * 1024):
        length = int(self.headers.get("Content-Length") or 0)
        if length > limit:
            raise ValueError("too large")
        self._consumed = True
        return self.rfile.read(length) if length else b""

    def _session(self, qs):
        sid = (qs.get("sid") or [""])[0]
        with sessions_lock:
            return sessions.get(sid)

    def _cookie(self, name):
        for part in (self.headers.get("Cookie") or "").split(";"):
            k, _, v = part.strip().partition("=")
            if k == name:
                return v
        return None

    def _authed(self):
        return valid_token(self._cookie(COOKIE))

    def _client_ip(self):
        # Caddy X-Forwarded-For'a gerçek istemci IP'sini yazar (dışarıdan gelen değere güvenmez)
        return (self.headers.get("X-Forwarded-For") or self.client_address[0]).split(",")[-1].strip()

    def _login(self):
        ip = self._client_ip()
        blocked = recent_fails(ip)
        if len(blocked) >= FAIL_MAX:
            wait = int(FAIL_WINDOW - (time.time() - blocked[0])) + 1
            return self._send(429, {"error": "RATE_LIMIT_EXCEEDED", "retryAfter": wait})
        try:
            req = json.loads(self._body(4096) or b"{}")
        except ValueError:
            return self._send(400, {"error": "bad request"})
        user = str(req.get("kullanici") or "").strip().lower()
        password = str(req.get("sifre") or "")
        auth = load_auth()
        if not auth:
            return self._send(503, {"error": "NO_AUTH_FILE"})
        ok = hmac.compare_digest(user.encode(), auth[0].lower().encode())
        ok = hmac.compare_digest(hash_password(password, auth[1]), auth[2]) and ok
        if not ok:
            recent_fails(ip, add=True)
            time.sleep(1)
            # 401: Caddy log'u -> fail2ban bu satırları sayar
            return self._send(401, {"error": "INVALID_CREDENTIALS"})
        with fails_lock:
            fails.pop(ip, None)
        secure = "" if self.headers.get("X-Forwarded-Proto") == "http" else "; Secure"
        cookie = f"{COOKIE}={make_token(auth)}; Path=/; Max-Age={SESSION_TTL}; HttpOnly; SameSite=Lax{secure}"
        return self._send(200, {"ok": True, "kullanici": auth[0]}, headers={"Set-Cookie": cookie})

    def _same_origin(self):
        # CSRF koruması: özel başlık zorunlu (çapraz sitelerde preflight'a takılır) + Origin kontrolü
        if self.headers.get("X-Kutuphane") != "1":
            return False
        origin = self.headers.get("Origin")
        host = self.headers.get("X-Forwarded-Host") or self.headers.get("Host")
        return origin is None or urlparse(origin).netloc == host

    # --- uç noktalar ---
    def do_GET(self):
        self._consumed = False
        url = urlparse(self.path)
        qs = parse_qs(url.query)
        if url.path == "/api/read":
            if self.headers.get("X-Kutuphane") != "1":
                return self._send(403, {"error": "forbidden"})
            s = self._session(qs)
            if not s:
                return self._send(404, {"error": "no session"})
            offset = int((qs.get("offset") or ["0"])[0])
            start, data, nxt, alive = s.read(offset, POLL_TIMEOUT)
            return self._send(200, data, "application/octet-stream", {
                "X-Start": str(start), "X-Next": str(nxt), "X-Alive": "1" if alive else "0",
            })
        if url.path == "/api/yetki":
            # Caddy forward_auth: 2xx = geçsin. Tarayıcıda sayfa açılıyorsa vitrine yönlendir,
            # diğer istekleri (WebSocket, API, dosya) 403 ile kes. 401 değil: fail2ban saymasın.
            if self._authed():
                return self._send(204)
            accept = self.headers.get("Accept") or ""
            if self.headers.get("X-Forwarded-Method", "GET") == "GET" and "text/html" in accept:
                return self._send(302, headers={"Location": LOGIN_PAGE})
            return self._send(403, {"error": "giris gerekli"})
        if url.path == "/api/oturum":
            return self._send(200, {"giris": self._authed()})
        if url.path == "/api/sekmeler":
            if self.headers.get("X-Kutuphane") != "1":
                return self._send(403, {"error": "forbidden"})
            try:
                state = panel_state()
                panel["seen"] = time.time()
                set_bar_hidden(True)
                return self._send(200, state)
            except OSError as e:
                return self._send(500, {"error": str(e)})
        if url.path == "/api/health":
            return self._send(200, {"ok": True, "sessions": len(sessions)})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        self._consumed = False
        url = urlparse(self.path)
        qs = parse_qs(url.query)
        if not self._same_origin():
            return self._send(403, {"error": "forbidden"})
        try:
            if url.path == "/api/giris":
                return self._login()
            if url.path == "/api/open":
                req = json.loads(self._body() or b"{}")
                with sessions_lock:
                    if len(sessions) >= MAX_SESSIONS:
                        oldest = min(sessions.values(), key=lambda x: x.last_seen)
                        oldest.close()
                        sessions.pop(oldest.id, None)
                    s = Session(req.get("cols", 120), req.get("rows", 30))
                    sessions[s.id] = s
                return self._send(200, {"sid": s.id})

            if url.path == "/api/upload":
                ctype = (self.headers.get("Content-Type") or "").split(";")[0].strip().lower()
                ext = IMAGE_EXT.get(ctype)
                if not ext:
                    return self._send(415, {"error": "sadece png/jpg/gif/webp"})
                data = self._body(MAX_UPLOAD)
                if not data:
                    return self._send(400, {"error": "bos dosya"})
                os.makedirs(UPLOAD_DIR, exist_ok=True)
                name = time.strftime("%Y%m%d-%H%M%S") + "-" + secrets.token_hex(3) + "." + ext
                path = os.path.join(UPLOAD_DIR, name)
                with open(path, "wb") as f:
                    f.write(data)
                return self._send(200, {"path": path})

            if url.path == "/api/sekme":
                try:
                    req = json.loads(self._body(4096) or b"{}")
                except ValueError:
                    return self._send(400, {"error": "bad request"})
                return self._send(*window_action(req))

            s = self._session(qs)
            if not s:
                return self._send(404, {"error": "no session"})
            if url.path == "/api/write":
                s.write(self._body())
                return self._send(204)
            if url.path == "/api/resize":
                req = json.loads(self._body() or b"{}")
                s.resize(req.get("cols", 120), req.get("rows", 30))
                return self._send(204)
            if url.path == "/api/close":
                s.close()
                with sessions_lock:
                    sessions.pop(s.id, None)
                return self._send(204)
        except ValueError:
            return self._send(413, {"error": "too large"})
        except OSError as e:
            return self._send(500, {"error": str(e)})
        self._send(404, {"error": "not found"})


if __name__ == "__main__":
    if sys.argv[1:2] == ["--sifre-ayarla"]:
        # kurulum/şifre değişikliği: echo -n SIFRE | python3 kutuphane_api.py --sifre-ayarla KULLANICI
        set_password(sys.argv[2], sys.stdin.read().rstrip("\n"))
        sys.exit(0)
    signal.signal(signal.SIGCHLD, signal.SIG_DFL)
    threading.Thread(target=janitor, daemon=True).start()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    server.daemon_threads = True
    server.serve_forever()
