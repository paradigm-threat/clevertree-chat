"""In-process durable submit → drain → view; gauge soft-fail; IRC bridge mocks."""

from __future__ import annotations

import json
import tempfile
import threading
import time
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest import mock
from urllib import request

from clevertree_chat import live_runtime as live
from clevertree_chat.gauge import measure_batch
from clevertree_chat.irc_bridge import IrcBridge, _fingerprint


class DurableSubmitDrainTests(unittest.TestCase):
    def setUp(self):
        live._service = None
        live._store = None
        live._pages.clear()
        live._visitors.clear()
        live.stop_drain_worker()
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self._live = tempfile.TemporaryDirectory()
        self.addCleanup(self._live.cleanup)
        self._env = mock.patch.dict(
            "os.environ",
            {
                "CLEVERTREE_COMMENTS_PATH": self._tmp.name,
                "CLEVERTREE_LIVE_ROOT": self._live.name,
                "CLEVERTREE_SEED_FIXTURES": "0",
                "CLEVERTREE_IRC_ENABLE": "0",
            },
            clear=False,
        )
        self._env.start()
        self.addCleanup(self._env.stop)

    def tearDown(self):
        live.stop_drain_worker()

    def test_submit_drain_places_key(self):
        code, ident = live.dispatch({"action": "identify"}, {})
        visitor = ident["visitor"]
        live.dispatch(
            {
                "action": "resolve",
                "url": "https://api.clevertree.chat/chat/flock-cameras",
                "visitor": visitor,
            },
            {},
        )
        body = "Privacy dies when every corner has a camera network."
        code, filed = live.dispatch(
            {
                "action": "submit",
                "topic": "flock-cameras",
                "visitor": visitor,
                "body": body,
            },
            {},
        )
        self.assertEqual(code, 200)
        self.assertIsNot(filed.get("guided"), True)
        self.assertIn("comment_id", filed)

        code, drained = live.dispatch(
            {"action": "drain", "topic": "flock-cameras", "visitor": visitor},
            {},
        )
        self.assertEqual(code, 200)
        self.assertNotIn("error", drained)
        self.assertIn("wake", drained)

        code, view = live.dispatch(
            {"action": "view", "topic": "flock-cameras", "visitor": visitor},
            {},
        )
        self.assertEqual(code, 200)
        self.assertFalse(view.get("guided"))
        self.assertIn("invasion-of-privacy", view.get("existing") or [])
        from clevertree_chat.chat_hub import activity_from_view

        act = activity_from_view(view, visitor)
        self.assertTrue(act, "expected activity rows after submit")
        self.assertTrue(
            any("invasion-of-privacy" in (a.get("keys") or []) for a in act),
            f"expected filed key in activity, got {act[:2]}",
        )

    def test_submit_idempotency_key_replays_without_refile(self):
        code, ident = live.dispatch({"action": "identify"}, {})
        visitor = ident["visitor"]
        live.dispatch(
            {
                "action": "resolve",
                "url": "https://api.clevertree.chat/chat/flock-cameras",
                "visitor": visitor,
            },
            {},
        )
        body = "Camera nets chill speech even when footage stays unused."
        key = "client-post-regression-1"
        code, first = live.dispatch(
            {
                "action": "submit",
                "topic": "flock-cameras",
                "visitor": visitor,
                "body": body,
                "client_post_id": key,
            },
            {},
            headers={"Idempotency-Key": key},
        )
        self.assertEqual(code, 200)
        self.assertIn("comment_id", first)
        first_id = first["comment_id"]

        code, replay = live.dispatch(
            {
                "action": "submit",
                "topic": "flock-cameras",
                "visitor": visitor,
                "body": body + " (retry)",
                "client_post_id": key,
            },
            {},
            headers={"Idempotency-Key": key},
        )
        self.assertEqual(code, 200)
        self.assertTrue(replay.get("idempotent_replay"))
        self.assertEqual(replay.get("comment_id"), first_id)

        # Header-only key (no body client_post_id) still replays.
        code, header_only = live.dispatch(
            {
                "action": "submit",
                "topic": "flock-cameras",
                "visitor": visitor,
                "body": "also ignored",
            },
            {},
            headers={"Idempotency-Key": key},
        )
        self.assertEqual(code, 200)
        self.assertTrue(header_only.get("idempotent_replay"))
        self.assertEqual(header_only.get("comment_id"), first_id)

        # Distinct key files a separate post on the same topic.
        code, second = live.dispatch(
            {
                "action": "submit",
                "topic": "flock-cameras",
                "visitor": visitor,
                "body": "A second original claim about camera nets.",
                "client_post_id": key + "-b",
            },
            {},
            headers={"Idempotency-Key": key + "-b"},
        )
        self.assertEqual(code, 200)
        self.assertFalse(second.get("idempotent_replay"))
        self.assertIn("comment_id", second)
        self.assertNotEqual(second.get("comment_id"), first_id)

    def test_background_drain_worker_notices(self):
        code, ident = live.dispatch({"action": "identify"}, {})
        visitor = ident["visitor"]
        live.dispatch(
            {
                "action": "resolve",
                "url": "https://api.clevertree.chat/chat/flock-cameras",
                "visitor": visitor,
            },
            {},
        )
        live.start_drain_worker(interval_s=0.4)
        live.dispatch(
            {
                "action": "submit",
                "topic": "flock-cameras",
                "visitor": visitor,
                "body": "Mass surveillance expands when cameras go unchecked.",
            },
            {},
        )
        from clevertree_chat.chat_hub import activity_from_view

        deadline = time.time() + 8
        view = {}
        act: list = []
        while time.time() < deadline:
            _, view = live.dispatch(
                {"action": "view", "topic": "flock-cameras", "visitor": visitor},
                {},
            )
            if view.get("existing"):
                act = activity_from_view(view, visitor)
                if any((a.get("keys") or []) for a in act):
                    break
            time.sleep(0.3)
        self.assertTrue(view.get("existing"), view)
        self.assertTrue(any((a.get("keys") or []) for a in act), act[:3])


class GaugeSoftFailTests(unittest.TestCase):
    def test_missing_scripts_do_not_raise(self):
        class FakeDebate:
            class repo:
                @staticmethod
                def commit_changes(*_a, **_k):
                    return None

            @staticmethod
            def _read_json(*_a, **_k):
                return {"samples": []}

        missing = Path("/tmp/clevertree-no-such-spot-wake.sh")
        with mock.patch("clevertree_chat.gauge.WAKE", missing), mock.patch(
            "clevertree_chat.gauge.STOP", missing
        ):
            note = measure_batch(FakeDebate())
        self.assertFalse(note["cloud_api_called"])
        self.assertIn("missing", note["wake"])


class IrcBridgeUnitTests(unittest.TestCase):
    def test_fingerprint_stable(self):
        a = _fingerprint("general", "hello")
        b = _fingerprint("general", "hello")
        c = _fingerprint("general", "hello ")
        self.assertEqual(a, b)
        self.assertEqual(a, c)

    def test_announce_skips_echo_and_calls_privmsg(self):
        bridge = IrcBridge()
        bridge.prefix = "pt"
        sent = []

        class FakeClient:
            ready = True
            nick = "clevertree-si"

            def join(self, ch):
                pass

            def privmsg(self, ch, text):
                sent.append((ch, text))

        bridge._client = FakeClient()
        bridge._joined.add("#pt")
        fp = _fingerprint("general", "same body")
        bridge._echo_ids.add(fp)
        bridge.announce_submit("general", "same body", "Ari")
        self.assertEqual(sent, [])
        bridge.announce_submit("general", "fresh body", "Ari")
        self.assertEqual(len(sent), 1)
        self.assertEqual(sent[0][0], "#pt")
        self.assertIn("fresh body", sent[0][1])


class HttpApiE2ETests(unittest.TestCase):
    """Spin chat_host briefly; identify → resolve → submit → view over HTTP."""

    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory()
        cls._env = mock.patch.dict(
            "os.environ",
            {
                "CLEVERTREE_COMMENTS_PATH": cls._tmp.name,
                "CLEVERTREE_SEED_FIXTURES": "1",
                "CLEVERTREE_IRC_ENABLE": "0",
            },
            clear=False,
        )
        cls._env.start()
        live._service = None
        live._store = None
        live._pages.clear()
        live._visitors.clear()

        # Load chat_host after env so comments path / IRC flags apply
        import importlib.util

        host_path = Path(__file__).resolve().parents[1] / "scripts" / "chat_host.py"
        spec = importlib.util.spec_from_file_location("ct_chat_host", host_path)
        assert spec and spec.loader
        chat_host = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(chat_host)

        live.open_service()
        live.start_drain_worker(interval_s=0.5)
        cls._httpd = ThreadingHTTPServer(("127.0.0.1", 0), chat_host.ChatHandler)
        cls._port = cls._httpd.server_address[1]
        cls._thread = threading.Thread(target=cls._httpd.serve_forever, daemon=True)
        cls._thread.start()
        cls.base = f"http://127.0.0.1:{cls._port}"

    @classmethod
    def tearDownClass(cls):
        live.stop_drain_worker()
        cls._httpd.shutdown()
        cls._env.stop()
        cls._tmp.cleanup()

    def _post(self, payload: dict) -> dict:
        raw = json.dumps(payload).encode()
        req = request.Request(
            self.base + "/api/chat",
            data=raw,
            headers={"content-type": "application/json"},
            method="POST",
        )
        with request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())

    def test_http_identify_resolve_submit_view(self):
        ident = self._post({"action": "identify"})
        visitor = ident["visitor"]
        resolved = self._post(
            {
                "action": "resolve",
                "url": self.base + "/chat/flock-cameras",
                "visitor": visitor,
            }
        )
        self.assertEqual(resolved["topic"], "flock-cameras")
        self.assertFalse(resolved["guided"])
        marker = f"http-e2e-{int(time.time())}"
        filed = self._post(
            {
                "action": "submit",
                "topic": "flock-cameras",
                "visitor": visitor,
                "body": f"{marker} privacy cameras on every block.",
            }
        )
        self.assertIn("comment_id", filed)
        # wait for background drain
        deadline = time.time() + 10
        view = {}
        while time.time() < deadline:
            view = self._post(
                {"action": "view", "topic": "flock-cameras", "visitor": visitor}
            )
            bodies = [str(a.get("body") or "") for a in (view.get("activity") or [])]
            if any(marker in b for b in bodies):
                break
            time.sleep(0.3)
        bodies = [str(a.get("body") or "") for a in (view.get("activity") or [])]
        self.assertTrue(any(marker in b for b in bodies), bodies[:5])
        self.assertFalse(view.get("guided"))

    def test_scripted_http_rejected(self):
        for action in ("replay", "advance", "play"):
            raw = json.dumps({"action": action}).encode()
            req = request.Request(
                self.base + "/api/chat",
                data=raw,
                headers={"content-type": "application/json"},
                method="POST",
            )
            try:
                with request.urlopen(req, timeout=15) as resp:
                    self.fail(f"expected 400 for {action}, got {resp.status}")
            except Exception as exc:
                self.assertIn("400", str(exc))

    def test_http_website_room_empty_until_submit(self):
        """ /chat/w parity: resolve leaves SoT empty; first submit creates topic. """
        slug = f"e2e-site-{int(time.time())}"
        href = f"https://example.com/{slug}/"
        resolved = self._post(
            {"action": "resolve", "url": href, "page_scope": "path"}
        )
        topic = resolved["topic"]
        visitor = resolved["visitor"]
        self.assertTrue(topic.startswith("u-"))
        self.assertFalse(resolved["exists"])
        comments = Path(self._tmp.name)
        topic_dirs = list(comments.glob(f"pages/*/topics/{topic}"))
        self.assertEqual(topic_dirs, [])

        # HTML board route serves chat shell for /chat/w/...
        with request.urlopen(self.base + f"/chat/w/example.com/{slug}", timeout=15) as resp:
            html = resp.read().decode()
        self.assertIn("data-clevertree-board", html)
        self.assertIn("/chat/w", html)  # script handles w mode

        marker = f"website-first-{int(time.time())}"
        filed = self._post(
            {
                "action": "submit",
                "topic": topic,
                "visitor": visitor,
                "body": f"{marker} first words on this URL.",
            }
        )
        self.assertIn("comment_id", filed)
        self.assertTrue(
            (comments / "pages" / "try" / "topics" / topic).is_dir()
        )
        assoc = comments / "associations.json"
        self.assertTrue(assoc.is_file())
        self.assertIn(resolved["normalized"], assoc.read_text())


class ExtensionSurfaceTests(unittest.TestCase):
    def test_sidepanel_has_no_guided_theater(self):
        root = Path(__file__).resolve().parents[1] / "fronts" / "extension"
        js = (root / "sidepanel.js").read_text()
        html = (root / "sidepanel.html").read_text()
        self.assertNotIn("demoMode", js)
        self.assertNotIn("btn-continue", html)
        self.assertNotIn("GUIDED", js)
        self.assertIn("page_scope", js)
        self.assertIn("domain", js)
        self.assertIn("coachSeen", js)
        self.assertIn("clevertree.coachSeen", js)


if __name__ == "__main__":
    unittest.main()
