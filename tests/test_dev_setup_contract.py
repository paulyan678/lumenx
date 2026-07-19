import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]


def test_setup_installs_declared_requirements_and_propagates_failures():
    setup_source = (REPO_ROOT / "scripts" / "dev-setup.js").read_text(encoding="utf-8")

    assert "'pip', 'install', '-r'" in setup_source
    assert "install -e ." not in setup_source
    assert "process.exitCode = 1" in setup_source
    assert "npmCommand, ['ci']" in setup_source


def test_setup_rejects_unsupported_runtime_versions():
    setup_source = (REPO_ROOT / "scripts" / "dev-setup.js").read_text(encoding="utf-8")

    assert "assertNodeVersion();" in setup_source
    assert "major !== 20 || minor < 9" in setup_source
    assert "MINIMUM_PYTHON = [3, 11]" in setup_source
    assert "assertPythonVersion(venvPython);" in setup_source


def test_npm_is_the_single_locked_package_manager():
    root_package = json.loads((REPO_ROOT / "package.json").read_text(encoding="utf-8"))
    frontend_package = json.loads(
        (REPO_ROOT / "frontend" / "package.json").read_text(encoding="utf-8")
    )

    assert root_package["packageManager"].startswith("npm@")
    assert frontend_package["packageManager"] == root_package["packageManager"]
    assert (REPO_ROOT / "package-lock.json").is_file()
    assert (REPO_ROOT / "frontend" / "package-lock.json").is_file()
    assert not (REPO_ROOT / "frontend" / "yarn.lock").exists()

    lock_source = (REPO_ROOT / "frontend" / "package-lock.json").read_text(encoding="utf-8")
    assert "registry.anpm.alibaba-inc.com" not in lock_source


def test_documented_quick_start_installs_root_dependencies_first():
    for readme_name in ("README.md", "README_EN.md"):
        source = (REPO_ROOT / readme_name).read_text(encoding="utf-8")
        assert source.index("npm ci") < source.index("npm run dev")


def test_python_direct_dependencies_are_exactly_pinned():
    for requirements_name in (
        "requirements.txt",
        "requirements-docker.txt",
        "requirements-dev.txt",
    ):
        active_requirements = [
            line.split("#", 1)[0].strip()
            for line in (REPO_ROOT / requirements_name).read_text(encoding="utf-8").splitlines()
            if line.split("#", 1)[0].strip()
        ]
        assert active_requirements
        assert all("==" in requirement for requirement in active_requirements)


def test_runtime_versions_are_consistent_in_project_guidance():
    guidance = "\n".join(
        (REPO_ROOT / path).read_text(encoding="utf-8")
        for path in (
            "README.md",
            "README_EN.md",
            "AGENTS.md",
            ".codex/workflows/lumenx-build.md",
            ".claude/commands/lumenx-build.md",
        )
    )

    assert "Node.js 18" not in guidance
    assert "node-18" not in guidance
    assert "Next.js 14" not in guidance
    assert "React 18" not in guidance
    assert "bin\\ffmpeg" not in guidance
