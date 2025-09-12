#!/bin/bash

# OpenAI Compatible Providers Framework Build Script
# 标准构建脚本

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 显示帮助信息
show_help() {
    cat << EOF
🚀 OpenAI Compatible Providers Framework 构建脚本

用法: $0 [选项]

选项:
    -h, --help              显示此帮助信息
    -c, --clean             清理构建文件
    -i, --install           安装依赖
    -b, --build             构建项目
    -t, --test              运行测试
    -l, --lint              运行代码检查
    -f, --format            格式化代码
    -a, --all               完整构建流程 (清理+安装+构建+测试+检查)
    -p, --prod              生产构建 (跳过测试)
    -w, --watch             监听模式构建
    --skip-tests           跳过测试
    --skip-lint            跳过代码检查
    --clean-deps           清理依赖后重新安装

示例:
    $0 --all                # 完整构建
    $0 --build --test      # 构建并测试
    $0 --clean --install   # 清理并重新安装
    $0 --prod              # 生产构建

EOF
}

# 清理构建文件
clean_build() {
    log_info "🧹 清理构建文件..."
    
    cd "$PROJECT_ROOT"
    
    # 清理dist目录
    if [ -d "dist" ]; then
        rm -rf dist
        log_success "已清理 dist 目录"
    fi
    
    # 清理node_modules (如果指定)
    if [ "$CLEAN_DEPS" = "true" ]; then
        if [ -d "node_modules" ]; then
            rm -rf node_modules
            log_success "已清理 node_modules 目录"
        fi
        
        if [ -f "package-lock.json" ]; then
            rm -f package-lock.json
            log_success "已清理 package-lock.json"
        fi
    fi
    
    # 清理其他临时文件
    find . -name "*.log" -type f -delete 2>/dev/null || true
    find . -name "*.tmp" -type f -delete 2>/dev/null || true
    
    log_success "清理完成"
}

# 安装依赖
install_dependencies() {
    log_info "📦 安装依赖..."
    
    cd "$PROJECT_ROOT"
    
    if [ ! -f "package.json" ]; then
        log_error "package.json 不存在"
        exit 1
    fi
    
    npm install
    
    if [ $? -eq 0 ]; then
        log_success "依赖安装完成"
    else
        log_error "依赖安装失败"
        exit 1
    fi
}

# 构建项目
build_project() {
    log_info "🔨 构建项目..."
    
    cd "$PROJECT_ROOT"
    
    if [ ! -f "package.json" ]; then
        log_error "package.json 不存在"
        exit 1
    fi
    
    # 检查是否有构建脚本
    if ! grep -q '"build"' package.json; then
        log_warning "package.json 中没有构建脚本，跳过构建"
        return 0
    fi
    
    npm run build
    
    if [ $? -eq 0 ]; then
        log_success "项目构建完成"
    else
        log_error "项目构建失败"
        exit 1
    fi
}

# 运行测试
run_tests() {
    if [ "$SKIP_TESTS" = "true" ]; then
        log_info "⏭️  跳过测试"
        return 0
    fi
    
    log_info "🧪 运行测试..."
    
    cd "$PROJECT_ROOT"
    
    if [ ! -f "package.json" ]; then
        log_error "package.json 不存在"
        exit 1
    fi
    
    # 检查是否有测试脚本
    if ! grep -q '"test"' package.json; then
        log_warning "package.json 中没有测试脚本，跳过测试"
        return 0
    fi
    
    npm test
    
    if [ $? -eq 0 ]; then
        log_success "测试通过"
    else
        log_warning "测试失败，但继续构建"
        return 0
    fi
}

# 运行代码检查
run_lint() {
    if [ "$SKIP_LINT" = "true" ]; then
        log_info "⏭️  跳过代码检查"
        return 0
    fi
    
    log_info "🔍 运行代码检查..."
    
    cd "$PROJECT_ROOT"
    
    if [ ! -f "package.json" ]; then
        log_error "package.json 不存在"
        exit 1
    fi
    
    # 检查是否有lint脚本
    if ! grep -q '"lint"' package.json; then
        log_warning "package.json 中没有lint脚本，跳过代码检查"
        return 0
    fi
    
    npm run lint
    
    if [ $? -eq 0 ]; then
        log_success "代码检查通过"
    else
        log_warning "代码检查失败，但继续构建"
        return 0
    fi
}

# 格式化代码
format_code() {
    log_info "✏️  格式化代码..."
    
    cd "$PROJECT_ROOT"
    
    if [ ! -f "package.json" ]; then
        log_error "package.json 不存在"
        exit 1
    fi
    
    # 检查是否有format脚本
    if ! grep -q '"format"' package.json; then
        log_warning "package.json 中没有format脚本，跳过格式化"
        return 0
    fi
    
    npm run format
    
    if [ $? -eq 0 ]; then
        log_success "代码格式化完成"
    else
        log_warning "代码格式化失败"
        return 0
    fi
}

# 监听模式构建
watch_build() {
    log_info "👀 启动监听模式构建..."
    
    cd "$PROJECT_ROOT"
    
    if [ ! -f "package.json" ]; then
        log_error "package.json 不存在"
        exit 1
    fi
    
    # 检查是否有监听构建脚本
    if ! grep -q '"build:watch"' package.json; then
        log_error "package.json 中没有监听构建脚本"
        exit 1
    fi
    
    npm run build:watch
}

# 显示项目信息
show_info() {
    cd "$PROJECT_ROOT"
    
    if [ -f "package.json" ]; then
        echo -e "${CYAN}📦 项目信息:${NC}"
        echo "  名称: $(jq -r '.name // "N/A"' package.json)"
        echo "  版本: $(jq -r '.version // "N/A"' package.json)"
        echo "  描述: $(jq -r '.description // "N/A"' package.json)"
        echo ""
    fi
    
    if [ -d "dist" ]; then
        echo -e "${CYAN}📁 构建输出:${NC}"
        echo "  目录大小: $(du -sh dist | cut -f1)"
        echo "  文件数量: $(find dist -type f | wc -l)"
        echo ""
    fi
    
    if [ -f "tsconfig.json" ]; then
        echo -e "${CYAN}⚙️  TypeScript:${NC} 配置文件存在"
    fi
    
    if [ -f "jest.config.js" ] || [ -f "jest.config.json" ]; then
        echo -e "${CYAN}🧪 测试:${NC} Jest 配置存在"
    fi
    
    if [ -f ".eslintrc.js" ] || [ -f ".eslintrc.json" ]; then
        echo -e "${CYAN}🔍 代码检查:${NC} ESLint 配置存在"
    fi
}

# 解析命令行参数
parse_args() {
    CLEAN=false
    INSTALL=false
    BUILD=false
    TEST=false
    LINT=false
    FORMAT=false
    ALL=false
    PROD=false
    WATCH=false
    SKIP_TESTS=false
    SKIP_LINT=false
    CLEAN_DEPS=false
    SHOW_HELP=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                SHOW_HELP=true
                shift
                ;;
            -c|--clean)
                CLEAN=true
                shift
                ;;
            -i|--install)
                INSTALL=true
                shift
                ;;
            -b|--build)
                BUILD=true
                shift
                ;;
            -t|--test)
                TEST=true
                shift
                ;;
            -l|--lint)
                LINT=true
                shift
                ;;
            -f|--format)
                FORMAT=true
                shift
                ;;
            -a|--all)
                ALL=true
                shift
                ;;
            -p|--prod)
                PROD=true
                shift
                ;;
            -w|--watch)
                WATCH=true
                shift
                ;;
            --skip-tests)
                SKIP_TESTS=true
                shift
                ;;
            --skip-lint)
                SKIP_LINT=true
                shift
                ;;
            --clean-deps)
                CLEAN_DEPS=true
                shift
                ;;
            *)
                log_error "未知选项: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # 如果没有指定任何操作，显示帮助
    if [ "$SHOW_HELP" = true ] || [ $# -eq 0 ] && [ "$CLEAN" = false ] && [ "$INSTALL" = false ] && [ "$BUILD" = false ] && [ "$TEST" = false ] && [ "$LINT" = false ] && [ "$FORMAT" = false ] && [ "$ALL" = false ] && [ "$PROD" = false ] && [ "$WATCH" = false ]; then
        show_help
        exit 0
    fi
}

# 主函数
main() {
    parse_args "$@"
    
    # 显示项目信息
    if [ "$ALL" = false ] && [ "$PROD" = false ] && [ "$WATCH" = false ]; then
        show_info
    fi
    
    # 监听模式
    if [ "$WATCH" = true ]; then
        watch_build
        exit 0
    fi
    
    # 完整构建流程
    if [ "$ALL" = true ]; then
        CLEAN=true
        INSTALL=true
        BUILD=true
        TEST=true
        LINT=true
    fi
    
    # 生产构建
    if [ "$PROD" = true ]; then
        SKIP_TESTS=true
        BUILD=true
        if [ "$CLEAN" = false ] && [ "$INSTALL" = false ]; then
            CLEAN=true
            INSTALL=true
        fi
    fi
    
    # 执行操作
    if [ "$CLEAN" = true ]; then
        clean_build
    fi
    
    if [ "$INSTALL" = true ]; then
        install_dependencies
    fi
    
    if [ "$BUILD" = true ]; then
        build_project
    fi
    
    if [ "$FORMAT" = true ]; then
        format_code
    fi
    
    if [ "$TEST" = true ]; then
        run_tests
    fi
    
    if [ "$LINT" = true ]; then
        run_lint
    fi
    
    log_success "🎉 构建流程完成！"
}

# 运行主函数
main "$@"