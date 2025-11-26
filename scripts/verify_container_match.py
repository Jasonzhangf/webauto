#!/usr/bin/env python3
"""
Automated container-matching verification.

Creates a session via the WebSocket server, navigates to a target URL,
runs container matching, and asserts the expected container ID is returned.
"""

import argparse
import importlib.util
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict

WS_CLIENT_PATH = Path(__file__).resolve().parent.parent / "cli" / "utils" / "websocket_client.py"
if not WS_CLIENT_PATH.exists():
    raise SystemExit(f"WebSocket client module not found at {WS_CLIENT_PATH}")

spec = importlib.util.spec_from_file_location("webauto_ws_client", WS_CLIENT_PATH)
if spec is None or spec.loader is None:
    raise SystemExit("Failed to load websocket_client module")
ws_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ws_module)
WebSocketClient = ws_module.WebSocketClient  # type: ignore


def send_command(client: WebSocketClient, session_id: str, command: Dict[str, Any]) -> Dict[str, Any]:
    """Send a WebSocket command and ensure it succeeds."""
    response = client.send_command(session_id, command)
    if response.get("type") != "response":
        raise RuntimeError(f"Unexpected response type: {response}")

    payload = response.get("data", {})
    if not isinstance(payload, dict):
        raise RuntimeError(f"Invalid payload: {payload}")

    if not payload.get("success", False):
        raise RuntimeError(f"Command failed: {payload.get('error', 'unknown error')}")
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify container matching via WebSocket server")
    parser.add_argument("--ws-url", default=os.environ.get("WEBAUTO_WS_URL", "ws://127.0.0.1:8765"),
                        help="WebSocket server URL")
    parser.add_argument("--url", default=os.environ.get("WEBAUTO_VERIFY_URL", "https://weibo.com"),
                        help="Target page URL to navigate to")
    parser.add_argument("--expected", default=os.environ.get("WEBAUTO_EXPECTED_CONTAINER", "weibo_login"),
                        help="Expected container ID to match")
    parser.add_argument("--capabilities", default="dom,screenshot",
                        help="Comma-separated session capabilities")
    args = parser.parse_args()

    client = WebSocketClient(args.ws_url)
    if not client.connect():
        raise RuntimeError(f"Failed to connect to WebSocket server at {args.ws_url}")

    placeholder_session = f"verify_{int(time.time())}"
    capabilities = [cap.strip() for cap in args.capabilities.split(",") if cap.strip()]

    # Create session
    create_payload = send_command(client, placeholder_session, {
        "command_type": "session_control",
        "action": "create",
        "capabilities": capabilities
    })
    session_id = create_payload.get("session_id")
    if not session_id:
        raise RuntimeError("Server did not return a session_id")

    try:
        # Navigate
        send_command(client, session_id, {
            "command_type": "node_execute",
            "node_type": "navigate",
            "parameters": {"url": args.url}
        })

        # Match container
        match_payload = send_command(client, session_id, {
            "command_type": "container_operation",
            "action": "match_root",
            "page_context": {
                "url": args.url,
                "domain": "",
                "path": ""
            }
        })

        data = match_payload.get("data", {})
        matched = data.get("matched_container")

        if not matched:
            raise RuntimeError("No container matched")

        matched_id = matched.get("id")
        if matched_id != args.expected:
            raise RuntimeError(f"Expected container '{args.expected}', got '{matched_id}'")

        print(f"✅ Matched container '{matched_id}' via selector '{matched.get('matched_selector')}'")
        return 0
    finally:
        try:
            send_command(client, session_id, {
                "command_type": "session_control",
                "action": "delete"
            })
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
