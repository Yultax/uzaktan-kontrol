"""Önizleme yolu: yalnızca ~/onizleme altı, oturumla, betiksiz. Ağ ve canlı servis gerektirmez."""
import http.client
import importlib.util
import os
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "kutuphane_api", Path(__file__).resolve().parents[1] / "server" / "kutuphane_api.py")
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


class PreviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        root = Path(cls.tmp.name)
        cls.base = root / "onizleme"
        (cls.base / "ambar").mkdir(parents=True)
        (cls.base / "bos").mkdir()
        (cls.base / "ambar" / "index.html").write_text("<h1>merhaba</h1>")
        (cls.base / "ambar" / "a b.png").write_bytes(b"\x89PNG")
        (cls.base / "ambar" / "betik.js").write_text("alert(1)")
        (cls.base / ".gizli.html").write_text("x")
        (root / "disarida.html").write_text("sir")
        os.symlink(root / "disarida.html", cls.base / "bag.html")
        cls.patches = [patch.object(api, "PREVIEW_DIR", str(cls.base))]
        for p in cls.patches:
            p.start()
        cls.server = api.ThreadingHTTPServer(("127.0.0.1", 0), api.Handler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        for p in cls.patches:
            p.stop()
        cls.tmp.cleanup()

    def get(self, path, authed=True):
        with patch.object(api.Handler, "_authed", lambda self, touch=False: "sid" if authed else None):
            conn = http.client.HTTPConnection("127.0.0.1", self.server.server_address[1], timeout=5)
            conn.request("GET", path)
            res = conn.getresponse()
            body = res.read()
            conn.close()
            return res, body

    def test_needs_session(self):
        res, _ = self.get("/api/onizleme/ambar/", authed=False)
        self.assertEqual(res.status, 403)

    def test_serves_index_without_scripts(self):
        res, body = self.get("/api/onizleme/ambar/")
        self.assertEqual(res.status, 200)
        self.assertIn(b"merhaba", body)
        self.assertTrue(res.getheader("Content-Security-Policy").startswith("sandbox;"))
        self.assertEqual(res.getheader("X-Content-Type-Options"), "nosniff")
        self.assertEqual(res.getheader("Cache-Control"), "no-store")

    def test_directory_gets_trailing_slash(self):
        res, _ = self.get("/api/onizleme/ambar")
        self.assertEqual((res.status, res.getheader("Location")), (302, "/api/onizleme/ambar/"))

    def test_image_with_space(self):
        res, body = self.get("/api/onizleme/ambar/a%20b.png")
        self.assertEqual((res.status, res.getheader("Content-Type"), body), (200, "image/png", b"\x89PNG"))

    def test_listing_shows_only_viewable(self):
        res, body = self.get("/api/onizleme/")
        self.assertEqual(res.status, 200)
        self.assertIn(b'href="ambar/"', body)
        self.assertNotIn(b"gizli", body)

    def test_refuses_everything_else(self):
        for path in ("/api/onizleme/../disarida.html", "/api/onizleme/%2e%2e/disarida.html",
                     "/api/onizleme/bag.html", "/api/onizleme/.gizli.html",
                     "/api/onizleme/ambar/betik.js", "/api/onizleme/yok.html", "/api/onizlemeX"):
            with self.subTest(path=path):
                res, body = self.get(path)
                self.assertEqual(res.status, 404)
                self.assertNotIn(b"sir", body)


if __name__ == "__main__":
    unittest.main()
