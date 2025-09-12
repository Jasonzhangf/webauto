#!/bin/bash

# OpenAI Compatible Providers Framework Publish Script
# 标准发布脚本

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
🚀 OpenAI Compatible Providers Framework 发布脚本

用法: $0 [选项]

选项:
    -h, --help              显示此帮助信息
    -b, --build             构建项目 (发布前自动执行)
    -p, --publish           发布到npm
    -v, --version VERSION   指定发布版本 (默认: 补丁版本递增)
    -t, --tag TAG           指定发布标签 (latest, beta, etc.)
    -d, --dry-run           试运行模式 (不实际发布)
    -o, --otp CODE          双因子认证码
    --no-build              跳过构建步骤
    --pre-release           发布预发布版本
    --registry URL          自定义registry地址

示例:
    $0 --build --publish                    # 构建并发布
    $0 --version 1.0.1 --publish           # 指定版本发布
    $0 --tag beta --pre-release --publish   # 发布beta预发布版本
    $0 --dry-run                           # 试运行检查

EOF
}

# 获取当前版本
get_current_version() {
    if [ -f "$PROJECT_ROOT/package.json" ]; then
        jq -r '.version // "0.0.0"' "$PROJECT_ROOT/package.json"
    else
        echo "0.0.0"
    fi
}

# 更新版本号
update_version() {
    local new_version="$1"
    
    if [ ! -f "$PROJECT_ROOT/package.json" ]; then
        log_error "package.json 不存在"
        return 1
    fi
    
    log_info "更新版本号: $new_version"
    
    # 使用临时文件处理JSON
    local temp_file=$(mktemp)
    jq --arg new_version "$new_version" '.version = $new_version' "$PROJECT_ROOT/package.json" > "$temp_file"
    mv "$temp_file" "$PROJECT_ROOT/package.json"
    
    log_success "版本号已更新为: $new_version"
}

# 构建项目
build_project() {
    log_info "🔨 构建项目..."
    
    cd "$PROJECT_ROOT"
    
    if [ ! -f "$PROJECT_ROOT/scripts/build.sh" ]; then
        log_error "构建脚本不存在: $PROJECT_ROOT/scripts/build.sh"
        return 1
    fi
    
    # 运行构建脚本
    bash "$PROJECT_ROOT/scripts/build.sh" --build
    
    if [ $? -eq 0 ]; then
        log_success "项目构建完成"
    else
        log_error "项目构建失败"
        return 1
    fi
}

# 检查发布条件
check_publish_readiness() {
    log_info "🔍 检查发布条件..."
    
    cd "$PROJECT_ROOT"
    
    # 检查package.json
    if [ ! -f "package.json" ]; then
        log_error "package.json 不存在"
        return 1
    fi
    
    # 检查构建输出
    if [ ! -d "dist" ] || [ ! -f "dist/index.js" ]; then
        log_warning "构建输出不存在，将自动构建"
        build_project || return 1
    fi
    
    # 检查git状态
    if git rev-parse --git-dir > /dev/null 2>&1; then
        local git_status=$(git status --porcelain)
        if [ -n "$git_status" ]; then
            log_error "存在未提交的git更改:"
            echo "$git_status"
            return 1
        fi
    fi
    
    # 检查npm登录状态
    log_info "检查npm登录状态..."
    if ! npm whoami > /dev/null 2>&1; then
        log_error "未登录npm，请运行: npm login"
        return 1
    fi
    
    log_success "发布条件检查通过"
}

# 生成版本号
generate_version() {
    local current_version="$1"
    local is_pre_release="$2"
    
    if command -v semver > /dev/null 2>&1; then
        if [ "$is_pre_release" = "true" ]; then
            semver -i prerelease --preid beta "$current_version"
        else
            semver -i patch "$current_version"
        fi
    else
        # 简单版本号处理
        IFS='.' read -r major minor patch <<< "$current_version"
        if [ "$is_pre_release" = "true" ]; then
            echo "${major}.${minor}.${patch}-beta.1"
        else
            echo "${major}.${minor}.$((patch + 1))"
        fi
    fi
}

# 发布到npm
publish_to_npm() {
    local tag="$1"
    local otp_code="$2"
    local dry_run="$3"
    local registry="$4"
    
    log_info "📦 发布到npm..."
    
    cd "$PROJECT_ROOT"
    
    # 构建npm publish命令
    local publish_cmd="npm publish"
    
    if [ -n "$registry" ]; then
        publish_cmd="$publish_cmd --registry $registry"
    fi
    
    if [ -n "$tag" ]; then
        publish_cmd="$publish_cmd --tag $tag"
    fi
    
    if [ "$dry_run" = "true" ]; then
        publish_cmd="$publish_cmd --dry-run"
        log_info "试运行模式: $publish_cmd"
    fi
    
    if [ -n "$otp_code" ]; then
        publish_cmd="$publish_cmd --otp $otp_code"
    fi
    
    log_info "执行发布命令: $publish_cmd"
    
    eval $publish_cmd
    
    if [ $? -eq 0 ]; then
        if [ "$dry_run" = "true" ]; then
            log_success "发布试运行完成"
        else
            log_success "发布成功！"
        fi
    else
        log_error "发布失败"
        return 1
    fi
}

# 创建git标签
create_git_tag() {
    local version="$1"
    
    if git rev-parse --git-dir > /dev/null 2>&1; then
        log_info "创建git标签: v$version"
        git tag -a "v$version" -m "Release v$version"
        log_success "Git标签已创建: v$version"
    fi
}

# 推送git标签
push_git_tags() {
    if git rev-parse --git-dir > /dev/null 2>&1; then
        log_info "推送git标签..."
        git push --tags
        log_success "Git标签已推送"
    fi
}

# 显示发布信息
show_publish_info() {
    local version="$1"
    local tag="$2"
    local dry_run="$3"
    
    echo -e "${CYAN}📋 发布信息:${NC}"
    echo "  项目名称: $(jq -r '.name // "N/A"' "$PROJECT_ROOT/package.json")"
    echo "  版本: $version"
    echo "  标签: ${tag:-latest}"
    echo "  模式: $([ "$dry_run" = "true" ] && echo "试运行" || echo "正式发布")"
    echo ""
}

# 解析命令行参数
parse_args() {
    BUILD=false
    PUBLISH=false
    VERSION=""
    TAG="latest"
    DRY_RUN=false
    OTP_CODE=""
    NO_BUILD=false
    PRE_RELEASE=false
    REGISTRY=""
    SHOW_HELP=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                SHOW_HELP=true
                shift
                ;;
            -b|--build)
                BUILD=true
                shift
                ;;
            -p|--publish)
                PUBLISH=true
                shift
                ;;
            -v|--version)
                VERSION="$2"
                shift 2
                ;;
            -t|--tag)
                TAG="$2"
                shift 2
                ;;
            -d|--dry-run)
                DRY_RUN=true
                shift
                ;;
            -o|--otp)
                OTP_CODE="$2"
                shift 2
                ;;
            --no-build)
                NO_BUILD=true
                shift
                ;;
            --pre-release)
                PRE_RELEASE=true
                TAG="beta"
                shift
                ;;
            --registry)
                REGISTRY="$2"
                shift 2
                ;;
            *)
                log_error "未知选项: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # 如果没有指定任何操作，显示帮助
    if [ "$SHOW_HELP" = true ] || [ $# -eq 0 ] && [ "$BUILD" = false ] && [ "$PUBLISH" = false ]; then
        show_help
        exit 0
    fi
    
    # 如果要发布但没有指定构建选项，自动构建
    if [ "$PUBLISH" = true ] && [ "$NO_BUILD" = false ]; then
        BUILD=true
    fi
}

# 主函数
main() {
    parse_args "$@"
    
    cd "$PROJECT_ROOT"
    
    # 获取当前版本
    local current_version=$(get_current_version)
    local target_version="$VERSION"
    
    # 如果没有指定版本，自动生成
    if [ -z "$target_version" ]; then
        target_version=$(generate_version "$current_version" "$PRE_RELEASE")
        log_info "自动生成版本: $target_version"
    fi
    
    # 显示发布信息
    show_publish_info "$target_version" "$TAG" "$DRY_RUN"
    
    # 构建项目
    if [ "$BUILD" = true ]; then
        build_project || exit 1
    fi
    
    # 更新版本号
    if [ "$target_version" != "$current_version" ]; then
        update_version "$target_version" || exit 1
    fi
    
    # 发布到npm
    if [ "$PUBLISH" = true ]; then
        check_publish_readiness || exit 1
        publish_to_npm "$TAG" "$OTP_CODE" "$DRY_RUN" "$REGISTRY" || exit 1
        
        # 创建和推送git标签
        if [ "$DRY_RUN" = "false" ]; then
            create_git_tag "$target_version"
            push_git_tags
        fi
    fi
    
    log_success "🎉 发布流程完成！"
}

# 运行主函数
main "$@"