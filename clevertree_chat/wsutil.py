"""Minimal RFC6455 WebSocket helpers for text frames (Intake chat host)."""

from __future__ import annotations

import base64
import hashlib
import struct
from typing import Iterator


GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


def accept_key(sec_websocket_key: str) -> str:
    digest = hashlib.sha1((sec_websocket_key.strip() + GUID).encode("utf-8")).digest()
    return base64.b64encode(digest).decode("ascii")


def encode_text(message: str) -> bytes:
    payload = message.encode("utf-8")
    n = len(payload)
    if n < 126:
        header = struct.pack("!BB", 0x81, n)
    elif n < 65536:
        header = struct.pack("!BBH", 0x81, 126, n)
    else:
        header = struct.pack("!BBQ", 0x81, 127, n)
    return header + payload


def encode_close(code: int = 1000) -> bytes:
    return struct.pack("!BBH", 0x88, 2, code)


def iter_frames(buffer: bytearray) -> Iterator[tuple[int, bytes]]:
    """Yield (opcode, payload) for complete frames; leave remainder in buffer."""
    while True:
        if len(buffer) < 2:
            return
        b0, b1 = buffer[0], buffer[1]
        opcode = b0 & 0x0F
        masked = (b1 & 0x80) != 0
        length = b1 & 0x7F
        offset = 2
        if length == 126:
            if len(buffer) < 4:
                return
            length = struct.unpack("!H", buffer[2:4])[0]
            offset = 4
        elif length == 127:
            if len(buffer) < 10:
                return
            length = struct.unpack("!Q", buffer[2:10])[0]
            offset = 10
        mask_len = 4 if masked else 0
        total = offset + mask_len + length
        if len(buffer) < total:
            return
        data = bytes(buffer[offset:total])
        del buffer[:total]
        if masked:
            mask = data[:4]
            payload = bytes(b ^ mask[i % 4] for i, b in enumerate(data[4:]))
        else:
            payload = data
        yield opcode, payload
