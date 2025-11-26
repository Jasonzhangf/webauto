#!/usr/bin/env python3
"""
Entry point for launching the WebAuto WebSocket server.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import signal
from typing import Optional

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.websocket_server import WebSocketServer


async def _run_server(host: str, port: int) -> None:
    server = WebSocketServer(host=host, port=port)

    stop_event = asyncio.Event()

    def _stop(*_: object) -> None:
        stop_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _stop)
        except NotImplementedError:
            signal.signal(sig, lambda *_: _stop())

    await server.start()
    print(f"📡 WebSocket server running on ws://{host}:{port}")

    await stop_event.wait()
    print("🛑 Shutting down WebSocket server...")
    await server.shutdown()


def main() -> None:
    parser = argparse.ArgumentParser(description="Start the WebAuto WebSocket server")
    parser.add_argument("--host", default="127.0.0.1", help="Server host (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8765, help="Server port (default: 8765)")
    parser.add_argument("--log-level", default="INFO", help="Logging level")
    args = parser.parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level.upper(), logging.DEBUG),
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )

    try:
        asyncio.run(_run_server(args.host, args.port))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
