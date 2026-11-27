import json
import os
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import unittest

from clevertree_chat.auth import (
    LOGIN_METHOD,
    RELATED_ORIGINS,
    AuthRepo,
    authentication_options,
    email_hmac,
    registration_options,
)
from clevertree_chat.engine import Debate
from clevertree_chat.markdown_render import render_markdown
from clevertree_chat.policy import parse_policy
from clevertree_chat.public import FILING, HERO, PUBLIC_LINES, READER
from clevertree_chat.urls import normalize_url

ROOT = Path(__file__).resolve().parents[1]
PEPPER = b"node-secret-pepper"


class PublicLineTests(unittest.TestCase):
    def test_library_matches_the_live_page(self):
        self.assertEqual(
            PUBLIC_LINES,
            (
                "A public room. A clearer conversation.",
                "Don\u2019t get lost in the weeds.",
                "People speak. SI curates.",
            ),
        )
        self.assertEqual(HERO, PUBLIC_LINES[0])
        self.assertEqual(READER, PUBLIC_LINES[1])
        self.assertEqual(FILING, PUBLIC_LINES[2])
        home = (ROOT / "index.html").read_text()
        trial = (ROOT / "try" / "index.html").read_text()
        # Hero is split across a <br> on the homepage.
        self.assertIn("A public room.", home)
        self.assertIn("A clearer conversation.", home)
        self.assertIn(FILING, home)
        self.assertIn(READER, trial)


class PolicyTests(unittest.TestCase):
    def test_default_policy_is_not_a_copied_file(self):
        policy = parse_policy(None)
        self.assertTrue(policy.links)
        self.assertEqual(policy.images, "links")
        rendered = render_markdown(
            "See [the note](https://example.com/a) and ![tree](https://example.com/tree.png)\n<script>alert(1)</script>",
            policy,
        )
        self.assertIn("<a href=", rendered)
        self.assertNotIn("<img", rendered)
        self.assertIn("tree", rendered)
        self.assertNotIn("<script>", rendered)
        self.assertIn("&lt;script&gt;", rendered)

    def test_posted_policy_can_show_images_or_turn_links_off(self):
        shown = render_markdown(
            "![tree](https://example.com/tree.png)",
            parse_policy("images: show\n"),
        )
        self.assertIn("<img", shown)
        quiet = render_markdown(
            "[the note](https://example.com/a)",
            parse_policy("links: off\n"),
        )
        self.assertNotIn("<a ", quiet)
        self.assertIn("the note", quiet)

    def test_rules_do_not_turn_images_on(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        debate = Debate.create(Path(tmp.name) / "debate")
        debate.post_rules("Show the images in summaries.\n")
        self.assertFalse((debate.repo.path / "policy.md").exists())
        self.assertEqual(debate.policy().images, "links")
        debate.post_policy("images: show\n")
        rendered = render_markdown("![tree](https://example.com/tree.png)", debate.policy())
        self.assertIn("<img", rendered)
        comment = "A picture [lives here](https://example.com/a)."
        debate.submit(
            str(uuid.uuid4()),
            page="demo",
            topic="flock-cameras",
            body="These cameras are mass surveillance. " + comment,
        )
        stored = next((debate.repo.path / "pages").rglob("comments/1.md")).read_text()
        self.assertIn("[lives here](https://example.com/a)", stored)
        self.assertNotIn("<a ", stored)


class AuthTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.debate = Debate.create(Path(self.tmp.name) / "debate")
        self.auth = AuthRepo.create(Path(self.tmp.name) / "clevertree-chat-auth", PEPPER)
        self.debate.attach_auth(self.auth)

    def test_passkey_record_is_private_and_session_gates_later_writes(self):
        user = str(uuid.uuid4())
        self.assertFalse(self.debate.knows_user(user))
        self.auth.register_passkey(
            self.debate,
            uuid=user,
            credential_id="cred-1",
            public_key="pk-test",
            email="  A@Example.com ",
        )
        self.assertTrue(self.debate.knows_user(user))
        record = json.loads(
            (self.auth.path / "credentials" / "cred-1.json").read_text()
        )
        self.assertEqual(set(record), {"credential_id", "email_hmac", "public_key", "uuid"})
        self.assertEqual(record["email_hmac"], email_hmac(PEPPER, "a@example.com"))
        self.assertNotEqual(record["email_hmac"], __import__("hashlib").sha256(b"a@example.com").hexdigest())
        visible = self.debate.repo.read("users/index.json")
        name = json.loads(visible)["by_uuid"][user]["name"]
        blob = self.auth.files_text()
        self.assertNotIn(name, blob)
        self.assertNotIn(PEPPER.decode(), blob)
        self.assertNotIn("votes.json", blob)
        self.assertNotIn("author:", blob)
        options = registration_options(user)
        self.assertEqual(options["authenticatorSelection"]["residentKey"], "required")
        self.assertEqual(options["authenticatorSelection"]["userVerification"], "required")
        login = authentication_options()
        self.assertEqual(login["userVerification"], "required")
        self.assertEqual(login["mediation"], "conditional")
        self.assertEqual(login["allowCredentials"], [])
        self.assertNotIn("password", json.dumps(options).lower())
        self.assertNotIn("password", json.dumps(login).lower())
        self.assertEqual(LOGIN_METHOD, "webauthn")
        self.assertIn("https://clevertree.chat", RELATED_ORIGINS)
        self.assertIn("https://myproblem.app", RELATED_ORIGINS)
        source = (ROOT / "clevertree_chat" / "auth.py").read_text()
        self.assertNotIn("DigitalCredential", source)
        self.assertNotIn("password_hash", source.lower())
        self.assertNotIn("check_password", source.lower())

        body = "These cameras are mass surveillance"
        with self.assertRaises(PermissionError):
            self.debate.submit(user, page="demo", topic="flock-cameras", body=body)
        session = self.auth.begin_session("cred-1")
        self.assertTrue(session.http_only)
        self.assertIn("HttpOnly", session.header())
        self.debate.submit(user, page="demo", topic="flock-cameras", body=body, session=session)
        with self.assertRaises(PermissionError):
            self.debate.edit(
                user,
                page="demo",
                topic="flock-cameras",
                key="uncategorized",
                comment_id="1",
                body=body + " still surveillance",
            )
        self.debate.edit(
            user,
            page="demo",
            topic="flock-cameras",
            key="uncategorized",
            comment_id="1",
            body=body + " still surveillance",
            session=session,
        )
        with self.assertRaises(PermissionError):
            self.debate.vote(user, page="demo", level="topic", topic="flock-cameras")
        self.debate.vote(
            user, page="demo", level="topic", topic="flock-cameras", session=session
        )

    def test_a_visitor_without_a_passkey_uses_the_uuid(self):
        user = str(uuid.uuid4())
        self.debate.submit(
            user,
            page="demo",
            topic="flock-cameras",
            body="These cameras are mass surveillance",
        )
        self.assertTrue(next((self.debate.repo.path / "pages").rglob("comments/1.md")).is_file())


class UrlTests(unittest.TestCase):
    def test_public_suffix_and_tracking_normalization(self):
        left = normalize_url(
            "https://www.Example.com:443/News/Flock-Cameras/?utm_source=x&id=1#section"
        )
        right = normalize_url("https://example.com/news/flock-cameras?id=1&fbclid=zzz")
        self.assertEqual(left, "com/example.com/news/flock-cameras/?id=1")
        self.assertEqual(left, right)
        self.assertEqual(
            normalize_url("https://www.Example.com/News/Flock-Cameras/?utm_source=a&gclid=b"),
            "com/example.com/news/flock-cameras/",
        )
        self.assertEqual(
            normalize_url("https://www.BBC.co.uk/news/story"),
            "co.uk/bbc.co.uk/news/story/",
        )
        self.assertEqual(
            normalize_url("https://example.net/about"),
            "net/example.net/about/",
        )
        self.assertNotEqual(
            normalize_url("https://example.com/news?id=1"),
            normalize_url("https://example.com/news?id=2"),
        )
        self.assertEqual(
            normalize_url("http://www.example.com:80/a?b=2&a=1&utm_medium=z"),
            "com/example.com/a/?a=1&b=2",
        )
        self.assertEqual(
            normalize_url("https://example.com/read?story=9&p=3&gclid=1"),
            "com/example.com/read/?p=3&story=9",
        )
        kept = normalize_url("https://example.com:8443/item")
        self.assertEqual(kept, "com/example.com:8443/item/")

    def test_fronts_call_the_same_behavior_and_are_not_an_apk(self):
        script = (ROOT / "fronts" / "extension" / "normalize-url.js").read_text()
        snippet = (ROOT / "fronts" / "snippet" / "embed.html").read_text()
        for needle in ("normalizeUrl", "utm_", "fbclid", "gclid", "co.uk"):
            self.assertIn(needle, script)
        # Snippet mounts the shared room + launcher (normalize lives in extension).
        self.assertIn("clevertree-room.js", snippet)
        self.assertIn("chat-launcher.js", snippet)
        self.assertIn("ClevertreeChatLauncher", snippet)
        voice_candidates = list((ROOT / "android").rglob("ClevertreeVoice.kt"))
        self.assertTrue(voice_candidates, "ClevertreeVoice.kt missing")
        voice_txt = voice_candidates[0].read_text()
        self.assertIn("fileTranscript", voice_txt)
        self.assertIn("sectionAudio", voice_txt)
        self.assertNotIn("git commit", voice_txt.lower())
        self.assertNotIn("Runtime.getRuntime", voice_txt)
        # Ignore Gradle build outputs; source tree must not ship APKs.
        shipped = [
            p
            for p in (ROOT / "android").rglob("*.apk")
            if "build/" not in p.as_posix() and "/build/" not in ("/" + p.as_posix())
        ]
        self.assertFalse(shipped, shipped)


class HardwareTests(unittest.TestCase):
    def test_spot_scripts_refuse_decommissioned(self):
        """Spot scripts always refuse — Linode pub1 replaced Rackspace Spot for chat."""
        wake = ROOT / "infra" / "spot-wake-comments.sh"
        stop = ROOT / "infra" / "spot-decommission-comments.sh"
        env = {k: v for k, v in os.environ.items() if k not in {
            "CLEVERTREE_SPOT_WAKE", "RACKSPACE_SPOT_TOKEN", "CLEVERTREE_SPOT_TOKEN",
        }}
        wake_run = subprocess.run(
            ["bash", str(wake)], check=False, capture_output=True, text=True, env=env
        )
        stop_run = subprocess.run(
            ["bash", str(stop)], check=False, capture_output=True, text=True, env=env
        )
        self.assertEqual(wake_run.returncode, 1)
        self.assertEqual(stop_run.returncode, 1)
        self.assertIn("Spot decommissioned", wake_run.stderr)
        self.assertIn("Spot decommissioned", stop_run.stderr)
        env_wake = dict(env)
        env_wake["CLEVERTREE_SPOT_WAKE"] = "1"
        gated = subprocess.run(
            ["bash", str(wake)], check=False, capture_output=True, text=True, env=env_wake
        )
        self.assertEqual(gated.returncode, 1)
        self.assertIn("Spot decommissioned", gated.stderr)


if __name__ == "__main__":
    unittest.main()
