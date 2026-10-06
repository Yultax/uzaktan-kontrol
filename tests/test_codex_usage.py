"""Codex limit yanıtlarının eski/yeni biçimleri; ağ ve canlı servis gerektirmez."""
import importlib.util
from pathlib import Path
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "kutuphane_api", Path(__file__).resolve().parents[1] / "server" / "kutuphane_api.py")
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


class CodexUsageTests(unittest.TestCase):
    def setUp(self):
        self.reset = int(time.time()) + 3600
        self.bucket = {
            "primary": {"usedPercent": 42, "windowDurationMins": 300, "resetsAt": self.reset},
            "secondary": {"usedPercent": 18, "windowDurationMins": 10080, "resetsAt": self.reset},
        }

    def test_legacy_response(self):
        self.assertEqual(api.codex_limit_data({"rateLimits": self.bucket}),
                         {"bes_saat": (42, self.reset), "hafta": (18, self.reset)})

    def test_codex_bucket_wins_over_other_model(self):
        self.assertEqual(api.codex_limit_data({
            "rateLimits": {"limitId": "codex_other"},
            "rateLimitsByLimitId": {"codex": self.bucket}}),
            {"bes_saat": (42, self.reset), "hafta": (18, self.reset)})

    def test_other_model_is_not_codex(self):
        self.assertIsNone(api.codex_limit_data({
            "rateLimits": dict(self.bucket, limitId="codex_other")}))

    def test_invalid_or_different_windows_are_omitted(self):
        self.bucket["primary"]["usedPercent"] = "42"
        self.bucket["secondary"]["windowDurationMins"] = 60
        self.assertEqual(api.codex_limit_data({"rateLimits": self.bucket}), {})

    def test_refresh_and_percentage_output(self):
        with patch.object(api, "codex", {"t": time.time(), "ok": 0, "busy": True, "data": {}}), \
             patch.object(api, "codex_read_limits", return_value={"rateLimitsByLimitId": {"codex": self.bucket}}):
            api.codex_refresh()
            out = api.codex_usage()
            self.assertEqual(out["bes_saat"]["yuzde"], 42)
            self.assertEqual(out["hafta"]["yuzde"], 18)
            self.assertGreater(out["bes_saat"]["kalan"], 0)
            self.assertFalse(api.codex["busy"])

    def test_failed_refresh_keeps_recent_data(self):
        with patch.object(api, "codex", {"t": time.time(), "ok": time.time(), "busy": True,
                                         "data": {"hafta": (18, self.reset)}}), \
             patch.object(api, "codex_read_limits", return_value=None):
            api.codex_refresh()
            self.assertEqual(api.codex_usage()["hafta"]["yuzde"], 18)


if __name__ == "__main__":
    unittest.main()
