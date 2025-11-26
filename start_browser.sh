#!/bin/bash

# WebAuto浏览器快速启动脚本
# 提供简单便捷的浏览器启动方式

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 显示logo
show_logo() {
    echo -e "${BLUE}"
    echo "  ╔═══════════════════════════════════════╗"
    echo "  ║        WebAuto Browser CLI           ║"
    echo "  ║      智能Cookie自动保存浏览器          ║"
    echo "  ╚═══════════════════════════════════════╝"
    echo -e "${NC}"
}

# 显示帮助
show_help() {
    echo -e "${YELLOW}使用方法:${NC}"
    echo "  $0 [选项]"
    echo ""
    echo -e "${YELLOW}选项:${NC}"
    echo "  -p, --profile <name>    指定profile名称 (默认: default)"
    echo "  -u, --url <url>         目标URL (默认: https://weibo.com)"
    echo "  -h, --headless          无头模式"
    echo "  -d, --demo              运行Cookie功能演示"
    echo "  -t, --test              运行Cookie测试"
    echo "  -l, --list              列出所有profiles"
    echo "  --help                  显示此帮助信息"
    echo ""
    echo -e "${YELLOW}示例:${NC}"
    echo "  $0                           # 启动默认浏览器"
    echo "  $0 --profile work           # 使用work profile"
    echo "  $0 --url https://taobao.com # 访问淘宝"
    echo "  $0 --headless               # 无头模式"
    echo ""
}

# 列出profiles
list_profiles() {
    echo -e "${GREEN}📁 当前Profiles:${NC}"

    if [ ! -d "profiles" ]; then
        echo "   (暂无profiles目录)"
        return
    fi

    # 列出profile配置文件
    for profile_file in profiles/*.json; do
        if [ -f "$profile_file" ]; then
            profile_name=$(basename "$profile_file" .json)
            cookie_file="profiles/${profile_name}_cookies.json"

            if [ -f "$cookie_file" ]; then
                cookie_status="✅ 有Cookie"
                cookie_size=$(stat -c%s "$cookie_file" 2>/dev/null || echo "0")
                echo -e "   📂 ${profile_name} - ${cookie_status} (${cookie_size} bytes)"
            else
                echo -e "   📂 ${profile_name} - ❌ 无Cookie"
            fi
        fi
    done
}

# 检查依赖
check_dependencies() {
    if ! command -v python3 &> /dev/null; then
        echo -e "${RED}错误: 未找到python3${NC}"
        exit 1
    fi

    if [ ! -f "browser_cli.py" ]; then
        echo -e "${RED}错误: 未找到browser_cli.py${NC}"
        exit 1
    fi
}

# 主函数
main() {
    # 默认参数
    PROFILE="default"
    URL="https://weibo.com"
    HEADLESS=""
    COOKIE_CHECK_INTERVAL=30

    # 解析命令行参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            -p|--profile)
                PROFILE="$2"
                shift 2
                ;;
            -u|--url)
                URL="$2"
                shift 2
                ;;
            -h|--headless)
                HEADLESS="--headless"
                shift
                ;;
            -d|--demo)
                show_logo
                python3 cookie_demo.py
                exit 0
                ;;
            -t|--test)
                show_logo
                python3 test_cookie_auto_save.py
                exit $?
                ;;
            -l|--list)
                show_logo
                list_profiles
                exit 0
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                echo -e "${RED}未知选项: $1${NC}"
                show_help
                exit 1
                ;;
        esac
    done

    # 显示启动信息
    show_logo
    echo -e "${GREEN}🌐 启动浏览器...${NC}"
    echo -e "📂 Profile: ${BLUE}$PROFILE${NC}"
    echo -e "🔗 URL: ${BLUE}$URL${NC}"
    echo -e "🍪 Cookie监控: ${GREEN}启用${NC} (间隔: ${COOKIE_CHECK_INTERVAL}秒)"
    if [ -n "$HEADLESS" ]; then
        echo -e "👓 模式: ${YELLOW}无头模式${NC}"
    fi
    echo ""

    # 确保profiles目录存在
    mkdir -p profiles

    # 启动浏览器
    echo -e "${YELLOW}正在启动浏览器...${NC}"
    python3 browser_cli.py launch \
        --profile "$PROFILE" \
        --url "$URL" \
        $HEADLESS \
        --cookie-check-interval $COOKIE_CHECK_INTERVAL
}

# 检查依赖
check_dependencies

# 运行主函数
main "$@"