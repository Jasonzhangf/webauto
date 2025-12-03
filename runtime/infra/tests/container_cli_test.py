#!/usr/bin/env python3
"""
Smoke test for the container CLI commands.

Steps:
1. Upsert a temporary container for a fake URL.
2. List containers to ensure it exists.
3. Add an extract operation, list operations to confirm.
4. Remove the operation.
5. Delete the container to clean up.
"""

import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
CLI = [sys.executable, str(REPO_ROOT / "cli" / "main.py"), "--format", "json"]
TEST_URL = "https://weibo.com/cli-test"
CONTAINER_ID = "cli_test.root"


def run_cli(args):
    proc = subprocess.run(CLI + args, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"Command failed: {' '.join(args)}\nSTDOUT:{proc.stdout}\nSTDERR:{proc.stderr}")
    try:
        return json.loads(proc.stdout.strip() or "{}")
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid JSON output: {proc.stdout}") from exc


def main():
    print("[1/5] Upserting container…")
    run_cli([
        "container", "upsert",
        "--url", TEST_URL,
        "--id", CONTAINER_ID,
        "--selector", "#app",
        "--name", "CLI Test Root"
    ])

    print("[2/5] Listing containers…")
    list_result = run_cli(["container", "list", "--url", TEST_URL])
    containers = list_result.get("data") or list_result.get("containers") or list_result.get("container_list")
    if containers is None:
        containers = list_result.get("containers")
    assert containers is not None, f"Unexpected list result: {list_result}"
    assert any(item.get("id") == CONTAINER_ID for item in containers), "Container not found after upsert"

    print("[3/5] Adding extract operation…")
    run_cli([
        "container", "ops", "add",
        "--url", TEST_URL,
        "--id", CONTAINER_ID,
        "--type", "extract",
        "--selector", "article a",
        "--target", "links",
        "--include-text",
        "--max-items", "5"
    ])

    ops_result = run_cli(["container", "ops", "list", "--url", TEST_URL, "--id", CONTAINER_ID])
    operations = ops_result.get("operations", [])
    assert operations, "Operation was not added"
    assert operations[-1]["type"] == "extract", "Last operation is not extract"

    print("[4/5] Removing operation…")
    run_cli(["container", "ops", "remove", "--url", TEST_URL, "--id", CONTAINER_ID, str(len(operations) - 1)])

    print("[5/5] Deleting container…")
    run_cli(["container", "delete", "--url", TEST_URL, "--id", CONTAINER_ID])

    print("Container CLI smoke test completed successfully.")


if __name__ == "__main__":
    main()
