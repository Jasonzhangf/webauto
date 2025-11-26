#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import sys

def add_weibo_homepage_containers():
    """添加微博主页容器定义"""

    # 读取容器库文件
    try:
        with open('/Users/fanzhang/Documents/github/webauto/container-library.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print(f"读取文件失败: {e}")
        return False

    # 检查weibo站点是否存在
    if 'weibo' not in data:
        print("weibo站点不存在于容器库中")
        return False

    weibo_containers = data['weibo']['containers']

    # 新增主页容器定义
    weibo_main_page = {
        "id": "weibo_logged_in_main",
        "name": "微博主页面（已登录）",
        "type": "page",
        "capabilities": ["scroll", "highlight", "find-child"],
        "page_patterns": ["weibo.com", "!*login*", "!*passport*"],
        "selectors": [
            {
                "classes": ["main", "content"],
                "variant": "primary",
                "score": 1.0
            },
            {
                "classes": ["woo-box-main"],
                "variant": "backup",
                "score": 0.8
            }
        ],
        "operations": [
            {
                "type": "highlight",
                "config": {
                    "style": "2px solid #fbbc05",
                    "duration": 1500
                }
            },
            {
                "type": "find-child",
                "config": {
                    "container_id": "weibo_feed"
                }
            },
            {
                "type": "scroll",
                "config": {
                    "direction": "down",
                    "distance": 500
                }
            }
        ]
    }

    weibo_feed = {
        "id": "weibo_content_feed",
        "name": "微博内容流",
        "type": "content",
        "capabilities": ["scroll", "click", "highlight", "find-child"],
        "page_patterns": ["weibo.com", "!*login*", "!*passport*"],
        "selectors": [
            {
                "classes": ["feed", "card", "list"],
                "variant": "primary",
                "score": 1.0
            },
            {
                "classes": ["woo-box-item", "Card"],
                "variant": "backup",
                "score": 0.8
            }
        ],
        "operations": [
            {
                "type": "highlight",
                "config": {
                    "style": "2px solid #9b59b6",
                    "duration": 1000
                }
            },
            {
                "type": "scroll",
                "config": {
                    "direction": "down",
                    "distance": 300
                }
            }
        ]
    }

    # 添加新容器到weibo容器列表
    weibo_containers["weibo_main_page"] = weibo_main_page
    weibo_containers["weibo_feed"] = weibo_feed

    # 保存修改后的文件
    try:
        with open('/Users/fanzhang/Documents/github/webauto/container-library.json', 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print("成功添加微博主页容器定义")
        print(f"添加的容器: weibo_main_page, weibo_feed")
        return True
    except Exception as e:
        print(f"保存文件失败: {e}")
        return False

if __name__ == "__main__":
    success = add_weibo_homepage_containers()
    sys.exit(0 if success else 1)