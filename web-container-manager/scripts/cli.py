#!/usr/bin/env python3
"""Interactive CLI for Web Container Manager.

Current scope (phase 1):
- Main menu: create / update / manage containers (only create is wired).
- New container flow (local container library only):
  * Ask for page URL and profile (stored in metadata for now).
  * Use BrowserManager to open the page and analyze potential roots.
  * Check container-library for existing root containers for this URL.
  * If none, ask to create a root container using suggested selectors.
  * (DOM selection / hover capture will be added in the next step.)

This entry point is intended to be called from the agent as a subprocess
(`python3 web-container-manager/scripts/cli.py`).
"""

import sys
from typing import Any, Dict, List

from interaction_handler import InteractionHandler


def prompt(text: str) -> str:
    """Simple input wrapper."""
    return input(text).strip()


def print_line(text: str) -> None:
    sys.stdout.write(text + "\n")


def choose_from_list(title: str, items: List[str]) -> int:
    """Prompt user to choose an index from a list; returns 0-based index or -1."""
    print_line("")
    print_line(title)
    for i, item in enumerate(items, start=1):
        print_line(f"  {i}. {item}")
    choice = prompt("请输入编号 (或直接回车取消): ")
    if not choice:
        return -1
    try:
        idx = int(choice)
        if 1 <= idx <= len(items):
            return idx - 1
    except ValueError:
        pass
    print_line("无效的选择")
    return -1


def main_menu(handler: InteractionHandler) -> None:
    """Top-level interactive menu."""
    while True:
        print_line("\n=== Web Container Manager 技能 ===")
        print_line("1) 新增容器")
        print_line("2) 修改容器 (TODO)")
        print_line("3) 容器管理 (TODO)")
        print_line("0) 退出")

        choice = prompt("请选择操作: ")

        if choice == "1":
            flow_create_container(handler)
        elif choice == "2":
            print_line("修改容器流程尚未实现。")
        elif choice == "3":
            print_line("容器管理流程尚未实现。")
        elif choice == "0":
            print_line("已退出 Web Container Manager 技能。")
            return
        else:
            print_line("无效的选择，请重试。")


def flow_create_container(handler: InteractionHandler) -> None:
    """Create-container flow using real DOM selection and container library.

    Steps implemented here:
    1. Ask for page URL + profile, open page via BrowserManager.
    2. Check container-library for existing root containers for this URL.
    3. If no root: guide user to create one (with optional suggestions).
    4. Ask whether to start DOM selection; if yes, enter selection mode,
       wait for user to click an element, and capture its selector.
    5. Suggest parent container (root) and create a new child container
       in the local container library.
    """

    print_line("\n--- 新增容器 ---")

    # 1) Ask for page URL
    page_url = prompt("请输入目标页面 URL: ")
    if not page_url:
        print_line("未提供 URL，返回主菜单。")
        return

    # 2) Ask for browser profile (stored as metadata hint for now)
    profile = prompt("请输入浏览器 profile (可选，直接回车跳过): ")

    # 3) Open page via BrowserManager (当前直接调用浏览器 CLI 能力)
    print_line(f"正在打开页面: {page_url}")
    page_result = handler.process_command("open_page", url=page_url)
    if not page_result.get("success"):
        print_line(f"打开页面失败: {page_result.get('error', 'unknown error')}")
        return

    # 4) Check existing root containers for this page
    existing_roots = page_result.get("existing_containers", [])
    if existing_roots:
        print_line("\n已找到该页面的根容器:")
        for idx, root in enumerate(existing_roots, start=1):
            print_line(
                f"  {idx}. id={root['container_id']} selector={root['selector']} op={root['operation']}"
            )
    else:
        print_line("\n未找到匹配的根容器。")

    # 5) Suggest root containers from page analysis if none exist
    chosen_parent_id = None
    if not existing_roots:
        suggestions = handler.suggest_root_containers(page_result)
        if suggestions:
            print_line("可作为根容器的推荐选择:")
            for idx, s in enumerate(suggestions, start=1):
                print_line(
                    f"  {idx}. selector={s['selector']} priority={s['priority']} reason={s['reason']}"
                )
            use_suggest = prompt("是否基于推荐创建根容器? (y/N): ")
            if use_suggest.lower() == "y":
                idx = choose_from_list(
                    "请选择要作为根容器的推荐项:",
                    [s["selector"] for s in suggestions],
                )
                if idx >= 0:
                    selector = suggestions[idx]["selector"]
                    op = "monitor"
                    meta = {"profile": profile} if profile else None
                    create_res = handler.process_command(
                        "create_container",
                        selector=selector,
                        page_url=page_url,
                        operation=op,
                        parent_id=None,
                        metadata=meta,
                    )
                    if create_res.get("success"):
                        chosen_parent_id = create_res["container_id"]
                        print_line(
                            f"已创建根容器: id={chosen_parent_id} selector={selector} operation={op}"
                        )
                    else:
                        print_line(
                            f"创建根容器失败: {create_res.get('error', 'unknown error')}"
                        )
        if not chosen_parent_id:
            confirm_root = prompt("是否现在创建一个根容器? (y/N): ")
            if confirm_root.lower() == "y":
                selector = prompt("请输入根容器的 CSS selector: ")
                if not selector:
                    print_line("未提供选择器，放弃创建根容器。")
                else:
                    op = "monitor"
                    meta = {"profile": profile} if profile else None
                    create_res = handler.process_command(
                        "create_container",
                        selector=selector,
                        page_url=page_url,
                        operation=op,
                        parent_id=None,
                        metadata=meta,
                    )
                    if create_res.get("success"):
                        chosen_parent_id = create_res["container_id"]
                        print_line(
                            f"已创建根容器: id={chosen_parent_id} selector={selector} operation={op}"
                        )
                    else:
                        print_line(
                            f"创建根容器失败: {create_res.get('error', 'unknown error')}"
                        )
            else:
                print_line("暂不创建根容器，返回主菜单。")
                return
    else:
        # Let user choose an existing root container as parent for later steps
        idx = choose_from_list(
            "请选择一个根容器作为父容器 (后续子容器会挂在其下):",
            [
                f"{r['selector']} (id={r['container_id']}, op={r['operation']})"
                for r in existing_roots
            ],
        )
        if idx >= 0:
            chosen_parent_id = existing_roots[idx]["container_id"]

    if not chosen_parent_id:
        print_line("未选定父容器，返回主菜单。")
        return

    # 6) Ask whether to start DOM capture flow
    start_capture = prompt("是否启动 DOM 元素捕获流程? (Y/n): ")
    if start_capture and start_capture.lower() == "n":
        print_line("已跳过 DOM 捕获，返回主菜单。")
        return

    # Enter selection mode in the browser
    print_line("\n正在进入选择模式，请在浏览器中 hover + 点击目标元素...")
    sel_mode_res = handler.process_command("enter_selection_mode")
    if not sel_mode_res.get("success"):
        print_line(f"进入选择模式失败: {sel_mode_res.get('error', 'unknown error')}")
        return

    # Wait for user confirmation that they have clicked the element
    prompt("请在浏览器中点击目标元素后，回到此窗口按回车继续...")

    # Try to read selected element from browser
    selected = handler.browser_manager.get_selected_element()
    if not selected.get("success"):
        print_line(f"未能获取已选元素: {selected.get('error', 'no selected element')}")
        handler.process_command("exit_selection_mode")
        return

    selected_info = selected.get("selected_element", {})
    selector = selected_info.get("selector") or ""
    if not selector:
        print_line("选择结果中没有有效的 selector，退出。")
        handler.process_command("exit_selection_mode")
        return

    print_line(
        f"已捕获元素: selector={selector}, tag={selected_info.get('tagName')} id={selected_info.get('id')} class={selected_info.get('className')}"
    )

    # Exit selection mode now that we have a selection
    handler.process_command("exit_selection_mode")

    # 7) Confirm / adjust selector
    confirm = prompt("是否使用该 selector? (直接回车确认，或输入新的 selector 覆盖): ")
    final_selector = confirm or selector

    # 8) Create container under chosen parent in local container library
    print_line("\n准备在本地容器库中创建容器...")
    op = "extract"  # 默认子容器 operation，后续可以改为交互式选择
    meta = {"profile": profile, "from_selection": True} if profile else {"from_selection": True}

    create_res = handler.process_command(
        "create_container",
        selector=final_selector,
        page_url=page_url,
        operation=op,
        parent_id=chosen_parent_id,
        metadata=meta,
    )

    if not create_res.get("success"):
        print_line(f"创建容器失败: {create_res.get('error', 'unknown error')}")
        return

    cid = create_res["container_id"]
    print_line(
        f"已创建新容器: id={cid} selector={final_selector} operation={op} (parent={chosen_parent_id})，已写入容器库。"
    )


if __name__ == "__main__":
    handler = InteractionHandler()
    try:
        main_menu(handler)
    except EOFError:
        print_line("\n检测到输入结束，退出技能。")
