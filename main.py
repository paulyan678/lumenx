import logging
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime

import webview

# 保存原始工作目录
if getattr(sys, "frozen", False):
    # 打包后的环境
    application_path = sys._MEIPASS
    # 将打包后的 Resources 目录添加到 Python 路径，PyInstaller 通常将数据文件放在这里
    resources_path = os.path.join(os.path.dirname(os.path.dirname(application_path)), "Resources")
    if os.path.exists(resources_path) and resources_path not in sys.path:
        sys.path.insert(0, resources_path)
    # 也添加 _MEIPASS 本身
    if application_path not in sys.path:
        sys.path.insert(0, application_path)
else:
    # 开发环境
    application_path = os.path.dirname(os.path.abspath(__file__))

cwd = application_path

from starlette.staticfiles import StaticFiles

from src.utils import get_log_dir, get_user_data_dir, setup_logging

# 切换到用户数据目录
path = get_user_data_dir()
os.makedirs(path, exist_ok=True)
os.chdir(path)

# 配置日志文件路径
log_dir = get_log_dir()
log_file = os.path.join(log_dir, "app.log")

# PyInstaller's windowed bootloader may initialize these streams as None.
# Give libraries that expect file-like stdio a harmless sink; application logs
# still go to the bounded rotating file configured below.
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w", encoding="utf-8")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w", encoding="utf-8")
setup_logging(log_file=log_file)
logger = logging.getLogger(__name__)

SERVER_HOST = "127.0.0.1"
try:
    SERVER_PORT = int(os.environ.get("API_PORT", "17177"))
except ValueError as exc:
    raise RuntimeError("API_PORT must be an integer") from exc
if not 1 <= SERVER_PORT <= 65535:
    raise RuntimeError("API_PORT must be between 1 and 65535")


import mimetypes

import uvicorn

from src.apps.comic_gen.api import app

mimetypes.add_type("text/css", ".css")
mimetypes.add_type("application/javascript", ".js")


def run_server():
    app.mount(
        "/static", StaticFiles(directory=os.path.join(cwd, "static"), html=True), name="static"
    )

    # 直接传入 app 对象,而非字符串路径
    # 这样可以避免 PyArmor 混淆后字符串导入失败的问题
    # 注意: Windows 不支持 uvloop, 使用默认的 asyncio 事件循环
    uvicorn.run(
        app,
        host=SERVER_HOST,
        port=SERVER_PORT,
        reload=False,
        log_level="info",
        log_config=None,
    )


def wait_for_server(timeout: float = 30.0) -> None:
    """Wait until the local API is responsive before opening the desktop UI."""
    health_url = f"http://{SERVER_HOST}:{SERVER_PORT}/health"
    deadline = time.monotonic() + timeout
    last_error = None
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(health_url, timeout=1) as response:
                if response.status == 200:
                    return
        except (OSError, urllib.error.URLError) as exc:
            last_error = exc
        time.sleep(0.2)
    raise RuntimeError(
        f"Backend did not become ready at {health_url} within {timeout:.0f}s: {last_error}"
    )


def open_webview():
    wait_for_server()

    # 在 Windows 平台上检查并安装 WebView2 Runtime
    if sys.platform == "win32":
        try:
            from src.utils.webview2_installer import ensure_webview2_runtime

            if not ensure_webview2_runtime():
                logger.warning("WebView2 Runtime is missing or failed to install")
                logger.warning("Install Edge WebView2 Runtime before retrying the desktop app")
                time.sleep(5)  # 给用户时间阅读提示
        except Exception as e:
            logger.warning("WebView2 Runtime check failed; continuing startup: %s", e)

    # 创建 pywebview 窗口
    webview.create_window(
        title="LumenX Studio",
        url=(
            f"http://{SERVER_HOST}:{SERVER_PORT}/static/index.html"
            f"?timestamp={datetime.now().timestamp()}"
        ),
        width=1280,
        height=800,
        resizable=True,
        fullscreen=False,
        min_size=(800, 600),
    )

    # 启动 webview(阻塞式调用)
    if sys.platform == "win32":
        # gui='edgechromium': 使用 Edge Chromium 引擎(Windows 推荐),替代已弃用的 MSHTML
        webview.start(
            gui="edgechromium",
            private_mode=False,
            storage_path=os.path.join(path, "webview_storage"),
        )
    else:
        # private_mode=False: 禁用隐私模式,允许保存 cookies 和 localStorage
        # storage_path: 指定持久化存储路径,确保 localStorage 数据不会丢失
        webview.start(private_mode=False, storage_path=os.path.join(path, "webview_storage"))

    # The server thread is a daemon, so returning from the main thread exits
    # cleanly and gives logging handlers a chance to flush.
    logging.shutdown()


if __name__ == "__main__":
    # 在后台线程启动服务器
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()

    # 在主线程打开 WebView
    open_webview()
