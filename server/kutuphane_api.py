#!/usr/bin/env python3
"""kutuphane API: WebSocket'siz (HTTP long-poll) terminal + görsel yükleme.

Caddy'nin arkasında 127.0.0.1:7682 dinler; kimlik doğrulama Caddy'de (basic auth).
Sadece Python standart kütüphanesi kullanır.

  POST /api/open    {"cols":..,"rows":..}      -> {"sid":..}   (tmux "main" oturumuna bağlanır)
  GET  /api/read    ?sid=&offset=              -> ham çıktı; X-Start / X-Next / X-Alive başlıkları
  POST /api/write   ?sid=   (gövde: girdi)
  POST /api/resize  ?sid=   {"cols":..,"rows":..}
  POST /api/close   ?sid=
  POST /api/upload  (gövde: görsel)            -> {"path":..}
"""
import fcntl
import json
import os
import pty
import secrets
import signal
import struct
import termios
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HOST, PORT = "127.0.0.1", int(os.environ.get("KUTUPHANE_PORT", "7682"))
HOME = os.path.expanduser("~")
UPLOAD_DIR = os.path.join(HOME, "uploads")
TMUX_CMD = (os.environ["KUTUPHANE_CMD"].split() if os.environ.get("KUTUPHANE_CMD")
            else ["tmux", "-u", "new", "-A", "-s", os.environ.get("KUTUPHANE_SESSION", "main")])
BUF_MAX = 2 * 1024 * 1024       # oturum başına tutulan çıktı
POLL_TIMEOUT = 25               # long-poll süresi (proxy'ler genelde 30-60 sn'de keser)
IDLE_TIMEOUT = 90               # bu kadar sessiz kalan oturum kapatılır (tmux yaşamaya devam eder)
MAX_SESSIONS = 8
MAX_UPLOAD = 25 * 1024 * 1024
IMAGE_EXT = {"image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp"}


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
        return self.rfile.read(length) if length else b""

    def _session(self, qs):
        sid = (qs.get("sid") or [""])[0]
        with sessions_lock:
            return sessions.get(sid)

    def _same_origin(self):
        # CSRF koruması: özel başlık zorunlu (çapraz sitelerde preflight'a takılır) + Origin kontrolü
        if self.headers.get("X-Kutuphane") != "1":
            return False
        origin = self.headers.get("Origin")
        host = self.headers.get("X-Forwarded-Host") or self.headers.get("Host")
        return origin is None or urlparse(origin).netloc == host

    # --- uç noktalar ---
    def do_GET(self):
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
        if url.path == "/api/health":
            return self._send(200, {"ok": True, "sessions": len(sessions)})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        url = urlparse(self.path)
        qs = parse_qs(url.query)
        if not self._same_origin():
            return self._send(403, {"error": "forbidden"})
        try:
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
    signal.signal(signal.SIGCHLD, signal.SIG_DFL)
    threading.Thread(target=janitor, daemon=True).start()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    server.daemon_threads = True
    server.serve_forever()
