"""Clevertree Chat phase 1: file a debate onto a git comments branch.

The filer is deterministic. It does not call a cloud API and it does not boot hardware.
"""

from clevertree_chat.public import FILING, HERO, PUBLIC_LINES, READER

__all__ = ["HERO", "READER", "FILING", "PUBLIC_LINES", "SERVICE_ID"]

SERVICE_ID = "clevertree-chat-ai"
SERVICE_EMAIL = "clevertree-chat-ai@clevertree.chat"
