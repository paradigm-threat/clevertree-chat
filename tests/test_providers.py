"""Groq → Bedrock text failover (rate-limit / optional 5xx)."""

from __future__ import annotations

import unittest
from unittest import mock

from clevertree_chat import providers


class ProviderFailoverTests(unittest.TestCase):
    def setUp(self):
        self.env = mock.patch.dict(
            "os.environ",
            {
                "GROQ_API_KEY": "gsk_test",
                "GROQ_TEXT_MODEL": "llama-3.1-8b-instant",
                "CLEVERTREE_PROVIDER_FAILOVER": "1",
                "CLEVERTREE_BEDROCK_FAILOVER_ON_5XX": "1",
                "AWS_ACCESS_KEY_ID": "AKIATEST",
                "AWS_SECRET_ACCESS_KEY": "secret",
                "AWS_REGION": "us-east-1",
                "CLEVERTREE_BEDROCK_MODEL_ID": "anthropic.claude-3-haiku-20240307-v1:0",
            },
            clear=False,
        )
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_groq_success_no_failover(self):
        with mock.patch.object(
            providers,
            "complete_groq",
            return_value=providers.TextCompletion(
                text="ok", provider="groq", model="llama-3.1-8b-instant"
            ),
        ) as groq:
            with mock.patch.object(providers, "complete_bedrock") as bedrock:
                result = providers.complete_text(
                    [{"role": "user", "content": "hi"}]
                )
        self.assertEqual(result.provider, "groq")
        self.assertFalse(result.failover)
        groq.assert_called_once()
        bedrock.assert_not_called()

    def test_failover_on_429(self):
        with mock.patch.object(
            providers,
            "complete_groq",
            side_effect=providers.ProviderError("rate", status=429, provider="groq"),
        ):
            with mock.patch.object(
                providers,
                "complete_bedrock",
                return_value=providers.TextCompletion(
                    text="from bedrock",
                    provider="bedrock",
                    model="anthropic.claude-3-haiku-20240307-v1:0",
                ),
            ) as bedrock:
                result = providers.complete_text(
                    [{"role": "user", "content": "hi"}]
                )
        self.assertEqual(result.provider, "bedrock")
        self.assertTrue(result.failover)
        self.assertEqual(result.text, "from bedrock")
        bedrock.assert_called_once()

    def test_failover_on_5xx_when_enabled(self):
        with mock.patch.object(
            providers,
            "complete_groq",
            side_effect=providers.ProviderError("boom", status=503, provider="groq"),
        ):
            with mock.patch.object(
                providers,
                "complete_bedrock",
                return_value=providers.TextCompletion(
                    text="ok", provider="bedrock", model="m"
                ),
            ):
                result = providers.complete_text(
                    [{"role": "user", "content": "hi"}]
                )
        self.assertTrue(result.failover)

    def test_no_failover_when_disabled(self):
        with mock.patch.dict("os.environ", {"CLEVERTREE_PROVIDER_FAILOVER": "0"}):
            with mock.patch.object(
                providers,
                "complete_groq",
                side_effect=providers.ProviderError("rate", status=429, provider="groq"),
            ):
                with mock.patch.object(providers, "complete_bedrock") as bedrock:
                    with self.assertRaises(providers.ProviderError):
                        providers.complete_text([{"role": "user", "content": "hi"}])
        bedrock.assert_not_called()

    def test_rate_limit_without_bedrock_creds_raises(self):
        with mock.patch.dict(
            "os.environ",
            {"AWS_ACCESS_KEY_ID": "", "AWS_SECRET_ACCESS_KEY": ""},
            clear=False,
        ):
            with mock.patch.object(
                providers,
                "complete_groq",
                side_effect=providers.ProviderError("rate", status=429, provider="groq"),
            ):
                with self.assertRaises(providers.ProviderError) as ctx:
                    providers.complete_text([{"role": "user", "content": "hi"}])
        self.assertEqual(ctx.exception.status, 429)

    def test_bedrock_direct_when_no_groq(self):
        with mock.patch.dict("os.environ", {"GROQ_API_KEY": ""}, clear=False):
            with mock.patch.object(
                providers,
                "complete_bedrock",
                return_value=providers.TextCompletion(
                    text="direct", provider="bedrock", model="m"
                ),
            ) as bedrock:
                result = providers.complete_text(
                    [{"role": "user", "content": "hi"}]
                )
        self.assertEqual(result.provider, "bedrock")
        self.assertFalse(result.failover)
        bedrock.assert_called_once()

    def test_is_rate_limit_error(self):
        self.assertTrue(providers.is_rate_limit_error(429))
        self.assertTrue(providers.is_rate_limit_error(400, "Rate limit exceeded"))
        self.assertFalse(providers.is_rate_limit_error(400, "bad request"))

    def test_provider_status_hides_secrets(self):
        status = providers.provider_status()
        self.assertTrue(status["groq_key"])
        self.assertTrue(status["bedrock_configured"])
        self.assertFalse(status["asr"]["bedrock_failover"])
        blob = str(status)
        self.assertNotIn("gsk_test", blob)
        self.assertNotIn("secret", blob)


class BedrockSignTests(unittest.TestCase):
    def test_sign_headers_include_auth(self):
        headers = providers._sign_bedrock(
            method="POST",
            host="bedrock-runtime.us-east-1.amazonaws.com",
            path="/model/anthropic.claude-3-haiku-20240307-v1%3A0/converse",
            region="us-east-1",
            body=b'{"messages":[]}',
            access_key="AKIATEST",
            secret_key="secret",
            session_token="",
        )
        self.assertIn("Authorization", headers)
        self.assertIn("AWS4-HMAC-SHA256", headers["Authorization"])
        self.assertIn("X-Amz-Date", headers)


if __name__ == "__main__":
    unittest.main()
