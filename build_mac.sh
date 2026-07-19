#!/bin/bash

# Mac 打包脚本 - 使用 PyInstaller 打包

set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

echo "======================================"
echo "开始 Mac 打包流程"
echo "======================================"

# 先构建前端项目
echo "0. 开始构建前端项目..."
if [ ! -d "frontend" ]; then
    echo "错误: frontend 目录不存在"
    exit 1
fi

cd frontend

if ! command -v npm &> /dev/null; then
    echo "错误: 未找到 npm"
    exit 1
fi
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major === 20 && minor >= 9 ? 0 : 1)' || {
    echo "错误: 需要 Node.js 20.9+（但低于 21）"
    exit 1
}

echo "   使用锁文件安装前端依赖..."
npm ci
echo "   运行前端质量门禁..."
npm run lint
npm run typecheck
npm run test:all
npm run check:colors
echo "   构建前端..."
npm run build
npm run check:export

cd ..

FRONTEND_EXPORT_DIR="$SCRIPT_DIR/frontend/out"
STATIC_DIR="$SCRIPT_DIR/static"
STATIC_STAGING="$SCRIPT_DIR/static.building"
STATIC_BACKUP="$SCRIPT_DIR/static.previous"
if [ ! -f "$FRONTEND_EXPORT_DIR/index.html" ]; then
    echo "错误: 前端导出缺少 frontend/out/index.html"
    exit 1
fi

# Stage the complete export before replacing the packaged static tree. If the
# final move fails, restore the prior generated tree instead of leaving a
# partially-copied desktop bundle input.
rm -rf "$STATIC_STAGING" "$STATIC_BACKUP"
cp -R "$FRONTEND_EXPORT_DIR" "$STATIC_STAGING"
if [ -e "$STATIC_DIR" ]; then
    mv "$STATIC_DIR" "$STATIC_BACKUP"
fi
if mv "$STATIC_STAGING" "$STATIC_DIR"; then
    rm -rf "$STATIC_BACKUP"
else
    if [ -e "$STATIC_BACKUP" ]; then
        mv "$STATIC_BACKUP" "$STATIC_DIR"
    fi
    echo "错误: 无法更新打包用 static 目录"
    exit 1
fi

echo "   前端构建完成，桌面静态资源: static/"

# 清理 .next 缓存以避免与开发模式冲突
echo "   清理 .next 缓存（避免与开发模式冲突）..."
rm -rf frontend/.next
echo ""

# 检查 Python 环境
if ! command -v python3 &> /dev/null; then
    echo "错误: 未找到 Python3，请先安装 Python3"
    exit 1
fi

# 检查并创建虚拟环境
echo "1. 检查 Python 虚拟环境..."
if [ ! -d ".venv" ]; then
    echo "   .venv 不存在，正在创建虚拟环境..."
    python3 -m venv .venv
    echo "   虚拟环境创建成功"
else
    echo "   .venv 已存在"
fi

# 激活虚拟环境
echo "2. 激活虚拟环境..."
source .venv/bin/activate

# 安装项目依赖
echo "3. 安装项目依赖..."
if [ -f "requirements.txt" ]; then
    python -m pip install --upgrade "pip==26.1.2"
    python -m pip install -r requirements.txt
    python -m pip check
    echo "   依赖安装完成"
else
    echo "   警告: 未找到 requirements.txt"
fi

if [ ! -f "requirements-dev.txt" ]; then
    echo "错误: 未找到 requirements-dev.txt，无法验证发布构建"
    exit 1
fi
python -m pip install -r requirements-dev.txt

echo "3.5. 验证后端与生成目录..."
python scripts/check_duplicate_filenames.py
python scripts/validate_model_catalog.py
python -m compileall -q src tests scripts main.py
LUMENX_PRELOAD_DEMUCS=0 python -m pytest -q

# 检查并安装必要的打包工具
echo "4. 检查并安装打包工具..."
python -m pip install "pyinstaller==6.21.0"

# 清理之前的打包文件
echo "5. 清理旧的打包文件..."
rm -rf build dist dist_mac __pycache__
find src tests scripts -type d -name "__pycache__" -prune -exec rm -rf {} + 2>/dev/null || true

# Prepare FFmpeg in a disposable staging directory. A copied Homebrew binary in
# the repository can retain versioned dylib references and become unusable after
# an upgrade, so packaging must validate the binary selected for this build.
echo "5.5. 准备 FFmpeg..."
PACKAGING_DIR=$(mktemp -d "${TMPDIR:-/tmp}/lumenx-package.XXXXXX")
cleanup_packaging_dir() {
    if [ -n "${PACKAGING_DIR:-}" ] && [ -d "$PACKAGING_DIR" ]; then
        rm -rf -- "$PACKAGING_DIR"
    fi
}
trap cleanup_packaging_dir EXIT INT TERM

FFMPEG_SOURCE=${LUMENX_FFMPEG_BINARY:-}
if [ -z "$FFMPEG_SOURCE" ]; then
    FFMPEG_SOURCE=$(command -v ffmpeg || true)
fi
if [ -z "$FFMPEG_SOURCE" ] || [ ! -f "$FFMPEG_SOURCE" ] || [ ! -x "$FFMPEG_SOURCE" ]; then
    echo "   错误: 未找到可执行的 FFmpeg。请安装 FFmpeg，或设置 LUMENX_FFMPEG_BINARY。"
    exit 1
fi
if ! "$FFMPEG_SOURCE" -version >/dev/null 2>&1; then
    echo "   错误: FFmpeg 无法运行: $FFMPEG_SOURCE"
    echo "   请重新安装 FFmpeg，或通过 LUMENX_FFMPEG_BINARY 指定可用的二进制文件。"
    exit 1
fi

PACKAGING_FFMPEG="$PACKAGING_DIR/ffmpeg"
cp "$FFMPEG_SOURCE" "$PACKAGING_FFMPEG"
chmod +x "$PACKAGING_FFMPEG"
echo "   已验证并暂存 FFmpeg: $FFMPEG_SOURCE"

# 使用 PyInstaller 打包
echo "6. 使用 PyInstaller 打包..."

# 检查图标文件是否存在
if [ -f "icon.icns" ]; then
    ICON_PARAM=(--icon "$SCRIPT_DIR/icon.icns")
else
    ICON_PARAM=()
    echo "提示: 未找到 icon.icns，将使用默认图标"
fi

pyinstaller --clean --noconfirm \
    --specpath "$PACKAGING_DIR" \
    --additional-hooks-dir "$SCRIPT_DIR/.pyinstaller-hooks" \
    --name "LumenX Studio" \
    --windowed \
    "${ICON_PARAM[@]}" \
    --add-data "$STATIC_DIR:static" \
    --add-data "$SCRIPT_DIR/src:src" \
    --add-data "$SCRIPT_DIR/config/model_catalog/generated/model_catalog.json:config/model_catalog/generated" \
    --add-binary "$PACKAGING_FFMPEG:." \
    --hidden-import=src \
    --hidden-import=src.apps \
    --hidden-import=src.apps.comic_gen \
    --hidden-import=src.apps.comic_gen.api \
    --hidden-import=uvicorn.logging \
    --hidden-import=uvicorn.loops \
    --hidden-import=uvicorn.loops.auto \
    --hidden-import=uvicorn.protocols \
    --hidden-import=uvicorn.protocols.http \
    --hidden-import=uvicorn.protocols.http.auto \
    --hidden-import=uvicorn.protocols.websockets \
    --hidden-import=uvicorn.protocols.websockets.auto \
    --hidden-import=uvicorn.lifespan \
    --hidden-import=uvicorn.lifespan.on \
    --hidden-import=webview \
    --hidden-import=starlette \
    --hidden-import=starlette.staticfiles \
    --hidden-import=fastapi \
    --hidden-import=pydantic \
    --hidden-import=openai \
    --hidden-import=oss2 \
    --hidden-import=demucs \
    --hidden-import=demucs.pretrained \
    --hidden-import=demucs.separate \
    --hidden-import=soundfile \
    --hidden-import=yaml \
    --hidden-import=dotenv \
    --hidden-import=httptools \
    --hidden-import=uvloop \
    --hidden-import=requests \
    --hidden-import=multipart \
    --collect-all uvicorn \
    --collect-all fastapi \
    --collect-all starlette \
    --collect-all pydantic \
    --collect-all demucs \
    "$SCRIPT_DIR/main.py"

# PyInstaller ad-hoc signs the bundle, but Finder metadata inherited from source
# assets can make strict verification fail. Remove those attributes and require
# the bundle to validate before it is copied or placed into a DMG.
BUILT_APP_PATH="$SCRIPT_DIR/dist/LumenX Studio.app"
if [ ! -d "$BUILT_APP_PATH" ]; then
    echo "错误: PyInstaller 未生成 LumenX Studio.app"
    exit 1
fi
xattr -cr "$BUILT_APP_PATH"
codesign --verify --deep --strict "$BUILT_APP_PATH"

# 复制打包结果到项目根目录。ditto 会保留 PyInstaller 的符号链接结构；
# cp -r 会展开链接、放大应用体积并破坏签名。
echo "7. 复制打包结果..."
mkdir -p dist_mac
ditto --norsrc --noextattr --noqtn \
    "$BUILT_APP_PATH" "$SCRIPT_DIR/dist_mac/LumenX Studio.app"
xattr -cr "$SCRIPT_DIR/dist_mac/LumenX Studio.app"
codesign --verify --deep --strict "$SCRIPT_DIR/dist_mac/LumenX Studio.app"

# 创建 DMG 安装包
echo "8. 创建 DMG 安装包..."

# 定义 DMG 文件名和路径
APP_NAME="LumenX Studio"
DMG_NAME="${APP_NAME}.dmg"
DMG_PATH="dist_mac/${DMG_NAME}"
APP_PATH="dist_mac/${APP_NAME}.app"

# 检查 .app 是否存在
if [ ! -d "$APP_PATH" ]; then
    echo "错误: 未找到 ${APP_NAME}.app"
    exit 1
fi

# 删除旧的 DMG 文件
if [ -f "$DMG_PATH" ]; then
    rm "$DMG_PATH"
fi

# 创建临时 DMG 目录
TMP_DMG_DIR="dist_mac/dmg_tmp"
rm -rf "$TMP_DMG_DIR"
mkdir -p "$TMP_DMG_DIR"

# 复制 .app 到临时目录并再次验证，防止 DMG 封装损坏符号链接。
ditto --norsrc --noextattr --noqtn \
    "$APP_PATH" "$TMP_DMG_DIR/${APP_NAME}.app"
xattr -cr "$TMP_DMG_DIR/${APP_NAME}.app"
codesign --verify --deep --strict "$TMP_DMG_DIR/${APP_NAME}.app"

# 复制安装脚本到临时目录
if [ -f "运行APP前_先点我安装.sh" ]; then
    cp "运行APP前_先点我安装.sh" "$TMP_DMG_DIR/"
    chmod +x "$TMP_DMG_DIR/运行APP前_先点我安装.sh"
    echo "   已添加安装脚本到 DMG"
else
    echo "   警告: 未找到 运行APP前_先点我安装.sh 安装脚本"
fi

# 创建 Applications 软链接（方便用户拖拽安装）
ln -s /Applications "$TMP_DMG_DIR/Applications"

# 使用 hdiutil 创建 DMG
echo "   正在生成 DMG 文件..."

# 先卸载可能存在的挂载
hdiutil detach "/Volumes/${APP_NAME}" 2>/dev/null || true

# 等待一下，确保资源释放
sleep 2

# 创建 DMG
if hdiutil create -volname "${APP_NAME}" \
        -srcfolder "$TMP_DMG_DIR" \
        -ov -format UDZO \
        "$DMG_PATH"; then
    hdiutil verify "$DMG_PATH" >/dev/null
    echo "   DMG 创建成功: $DMG_PATH"
else
    echo "   警告: DMG 创建失败，但 .app 文件已成功打包"
fi

# 清理临时目录
rm -rf "$TMP_DMG_DIR"

# A synced Documents folder may attach Finder metadata while hdiutil reads the
# bundle. Clear it, prefer strict verification, and fall back to verifying the
# code seal when the provider immediately reattaches metadata. The immutable
# copy written into the DMG was already strictly verified above.
xattr -cr "$APP_PATH"
if ! codesign --verify --deep --strict "$APP_PATH"; then
    echo "   提示: 同步文件系统重新附加了 Finder 元数据；验证代码封印（DMG 内副本已严格验证）..."
    codesign --verify --deep "$APP_PATH"
fi

echo "======================================"
echo "打包完成！"
echo "输出目录: dist_mac/"
echo "App 文件: ${APP_NAME}.app"
echo "DMG 文件: ${DMG_NAME}"
echo "======================================"
