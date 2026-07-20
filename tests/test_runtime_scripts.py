import shutil
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]


def _source(relative_path: str) -> str:
    return (REPO_ROOT / relative_path).read_text(encoding="utf-8")


@pytest.mark.parametrize(
    ("shell", "script"),
    [("sh", "start_backend.sh"), ("sh", "start_frontend.sh"), ("bash", "build_mac.sh")],
)
def test_shell_entrypoints_parse(shell: str, script: str):
    subprocess.run([shell, "-n", str(REPO_ROOT / script)], check=True)


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js is not installed")
@pytest.mark.parametrize(
    "script",
    ["scripts/dev-setup.js", "scripts/start-backend.js", "scripts/open-browser.js"],
)
def test_node_entrypoints_parse(script: str):
    subprocess.run(["node", "--check", str(REPO_ROOT / script)], check=True)


def test_local_backend_launchers_bind_to_loopback_by_default():
    shell_launcher = _source("start_backend.sh")
    node_launcher = _source("scripts/start-backend.js")

    assert "env.API_HOST || '127.0.0.1'" in node_launcher
    assert "0.0.0.0" not in shell_launcher
    assert "0.0.0.0" not in node_launcher
    assert "scripts/start-backend.js" in shell_launcher
    assert "Scripts', 'python.exe'" in node_launcher


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js is not installed")
def test_backend_launcher_parses_env_without_overwriting_proxy_exclusions(tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "# comment\nAPI_HOST=127.0.0.2\nAPI_PORT='18181'\nINVALID LINE\n",
        encoding="utf-8",
    )
    script = f"""
const launcher = require({str(REPO_ROOT / 'scripts' / 'start-backend.js')!r});
const parsed = launcher.readEnvFile({str(env_file)!r});
if (parsed.API_HOST !== '127.0.0.2' || parsed.API_PORT !== '18181') process.exit(2);
const merged = launcher.appendNoProxy('example.com,localhost');
if (merged !== 'example.com,localhost,127.0.0.1') process.exit(3);
"""

    subprocess.run(["node", "-e", script], check=True)


def test_direct_launchers_use_locked_dependencies_and_stable_working_directories():
    frontend_launcher = _source("start_frontend.sh")
    windows_launcher = _source("dev.bat")

    assert 'SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)' in frontend_launcher
    assert "npm ci" in frontend_launcher
    assert "npm install" not in frontend_launcher
    assert "npm ci" in windows_launcher
    assert "npm install" not in windows_launcher


def test_browser_launcher_waits_for_the_configured_frontend_without_shell_interpolation():
    source = _source("scripts/open-browser.js")

    assert "waitForFrontend" in source
    assert "process.env.PORT || '3008'" in source
    assert "LUMENX_OPEN_BROWSER === '0'" in source
    assert "spawn(command, args" in source
    assert "exec(" not in source


def test_packaging_scripts_run_quality_gates_and_use_consistent_branding():
    mac_build = _source("build_mac.sh")
    windows_build = _source("build_windows.ps1")
    spec_template = _source("build.spec.template")

    for source in (mac_build, windows_build):
        assert "npm ci" in source
        assert "npm run lint" in source
        assert "npm run typecheck" in source
        assert "npm run test:all" in source
        assert "npm run check:colors" in source
        assert "yarn" not in source.lower()
        assert "scripts/validate_model_catalog.py" in source
        assert "scripts/check_duplicate_filenames.py" in source
        assert "pytest -q" in source
        assert "additional-hooks-dir" in source
        assert "specpath" in source

    assert "Assert-NativeSuccess" in windows_build
    assert "TronComic" not in windows_build
    assert "LumenX Studio" in windows_build
    assert "FFMPEG_PATH" in spec_template
    assert "binaries = [(FFMPEG_PATH, '.')]" in spec_template
    assert "binaries += tmp_binaries" in spec_template
    assert "binaries=binaries" in spec_template
    assert "LUMENX_FFMPEG_BINARY" in spec_template
    assert "shutil.which" in spec_template
    assert "'-version'" in spec_template
    assert "LumenX Studio.app" in spec_template

    assert "LUMENX_FFMPEG_BINARY" in mac_build
    assert '"$FFMPEG_SOURCE" -version' in mac_build
    assert '"$PACKAGING_FFMPEG:."' in mac_build
    assert '"bin/ffmpeg:."' not in mac_build

    assert "LUMENX_FFMPEG_BINARY" in windows_build
    assert "FFmpeg validation" in windows_build
    assert '"$packagedFfmpeg;."' in windows_build
    assert '"bin\\ffmpeg.exe;."' not in windows_build
    assert 'Get-ChildItem -Filter "*.spec"' not in windows_build
    assert "*.spec __pycache__" not in mac_build

    assert (REPO_ROOT / "icon.icns").is_file()
    assert (REPO_ROOT / "icon.ico").is_file()

    for source in (mac_build, windows_build):
        assert "frontend/out" in source.replace("\\", "/")
        assert "static.building" in source
        assert "static.previous" in source
        assert "index.html" in source


def test_python_desktop_entrypoint_and_spec_are_syntactically_valid():
    for relative_path in ("main.py", "build.spec.template"):
        source = _source(relative_path)
        compile(source, str(REPO_ROOT / relative_path), "exec")


def test_desktop_entrypoint_uses_configurable_data_dir_and_waits_for_backend():
    source = _source("main.py")

    assert "get_user_data_dir()" in source
    assert 'os.path.expanduser("~/.lumen-x")' not in source
    assert 'os.path.join(path, "webview_storage")' in source
    assert "def wait_for_server" in source
    assert "wait_for_server()" in source
    assert 'SERVER_HOST = "127.0.0.1"' in source
    assert "TeeOutput" not in source
    assert "if sys.stdout is None" in source
    assert "if sys.stderr is None" in source
    assert "os.devnull" in source
    assert "log_config=None" in source


def test_logging_is_idempotent_rotating_and_does_not_duplicate_file_records(tmp_path):
    log_path = tmp_path / "app.log"
    script = f"""
import logging
from pathlib import Path
import src.utils as utils

root = logging.getLogger()
for handler in list(root.handlers):
    root.removeHandler(handler)
    handler.close()
utils._LOG_MAX_BYTES = 256
utils._LOG_BACKUP_COUNT = 2
utils.setup_logging(log_file={str(log_path)!r})
utils.setup_logging(log_file={str(log_path)!r})
handlers = [h for h in root.handlers if getattr(h, '_lumenx_handler', False)]
if len(handlers) != 2: raise SystemExit(2)
for index in range(20):
    logging.getLogger('contract').warning('rotation-line-%02d-%s', index, 'x' * 80)
logging.shutdown()
files = list(Path({str(tmp_path)!r}).glob('app.log*'))
if len(files) < 2: raise SystemExit(3)
payload = ''.join(path.read_text(encoding='utf-8') for path in files)
if payload.count('rotation-line-19-') != 1: raise SystemExit(4)
"""

    subprocess.run([sys.executable, "-c", script], cwd=REPO_ROOT, check=True)
