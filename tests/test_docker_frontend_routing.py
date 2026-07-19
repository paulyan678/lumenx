import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_API = REPO_ROOT / "frontend" / "src" / "lib" / "api.ts"
NGINX_CONFIG = REPO_ROOT / "docker" / "nginx.conf"
DOCKERFILE_FRONTEND = REPO_ROOT / "Dockerfile.frontend"
DOCKERFILE_BACKEND = REPO_ROOT / "Dockerfile.backend"

TEMPLATE_API_PATH = re.compile(r"\$\{API_URL\}(/[^`\"'\s?]*)")
CONCATENATED_API_PATH = re.compile(r"API_URL\s*\+\s*[\"'](/[^\"']+)[\"']")


def _frontend_api_prefixes() -> set[str]:
    source = FRONTEND_API.read_text(encoding="utf-8")
    paths = TEMPLATE_API_PATH.findall(source) + CONCATENATED_API_PATH.findall(source)
    prefixes = {path.lstrip("/").split("/", 1)[0] for path in paths}
    assert paths, "No frontend API paths were discovered; update the contract parser"
    assert "" not in prefixes
    return prefixes


def _nginx_api_location(config: str) -> tuple[re.Pattern[str], str]:
    match = re.search(r"location\s+~\s+(\S+)\s*\{", config)
    assert match is not None, "nginx must define a regex API proxy location"

    pattern = re.compile(match.group(1))
    block_start = match.end()
    block_end = config.find("\n    }", block_start)
    assert block_end != -1, "nginx API proxy location is not closed"
    return pattern, config[block_start:block_end]


def test_all_frontend_api_prefixes_are_proxied_before_spa_fallback():
    config = NGINX_CONFIG.read_text(encoding="utf-8")
    api_pattern, api_block = _nginx_api_location(config)

    prefixes = _frontend_api_prefixes()
    uncovered = {
        prefix
        for prefix in prefixes
        if not api_pattern.fullmatch(f"/{prefix}")
        or not api_pattern.match(f"/{prefix}/deployment-contract-probe")
    }

    assert (
        not uncovered
    ), f"Frontend API prefixes can fall through to index.html: {sorted(uncovered)}"
    assert "proxy_pass http://backend:17177;" in api_block
    assert "try_files" not in api_block

    spa_match = re.search(r"location\s+/\s*\{(?P<body>.*?)\n    \}", config, re.DOTALL)
    assert spa_match is not None
    assert "/index.html" in spa_match.group("body")
    assert "proxy_pass" not in spa_match.group("body")


def test_api_prefix_matching_has_a_path_boundary():
    config = NGINX_CONFIG.read_text(encoding="utf-8")
    api_pattern, _ = _nginx_api_location(config)

    for prefix in _frontend_api_prefixes():
        assert api_pattern.fullmatch(f"/{prefix}")
        assert not api_pattern.match(f"/{prefix}-spa-route")


def test_frontend_image_runs_verification_before_static_build():
    dockerfile = DOCKERFILE_FRONTEND.read_text(encoding="utf-8")

    lint_at = dockerfile.index("npm run lint")
    tests_at = dockerfile.index("npm run test:all")
    colors_at = dockerfile.index("npm run check:colors")
    typecheck_at = dockerfile.index("./node_modules/.bin/tsc --noEmit")
    production_env_at = dockerfile.index("ENV NODE_ENV=production")
    build_at = dockerfile.index("npm run build")

    assert lint_at < tests_at < colors_at < typecheck_at < production_env_at < build_at


def test_nginx_limits_uploads_and_sets_baseline_security_headers():
    config = NGINX_CONFIG.read_text(encoding="utf-8")

    assert "client_max_body_size 10M;" in config
    assert "client_max_body_size 100M;" not in config
    assert 'add_header X-Content-Type-Options "nosniff" always;' in config
    assert 'add_header X-Frame-Options "DENY" always;' in config
    assert 'add_header Referrer-Policy "same-origin" always;' in config


def test_backend_image_contains_runtime_catalog_and_portable_proxy_exclusions():
    dockerfile = DOCKERFILE_BACKEND.read_text(encoding="utf-8")
    compose = (REPO_ROOT / "docker-compose.yml").read_text(encoding="utf-8")

    assert "COPY config/model_catalog/generated/model_catalog.json" in dockerfile
    assert "*.aliyuncs.com" not in dockerfile
    assert "*.aliyuncs.com" not in compose
    assert ".aliyuncs.com,aliyuncs.com,localhost,127.0.0.1" in dockerfile
    assert ".aliyuncs.com,aliyuncs.com,localhost,127.0.0.1" in compose
    assert "fonts-noto-cjk" in dockerfile
    assert "LUMEN_X_PACKAGED=true" in dockerfile
    assert "LUMENX_DATA_DIR=/data" in dockerfile
    assert "HEALTHCHECK" in dockerfile

    dockerignore = (REPO_ROOT / ".dockerignore").read_text(encoding="utf-8")
    for private_or_large_path in (
        ".venv/",
        ".lumen-x/",
        ".mypy_cache/",
        "tmp/",
        "dist_*/",
        "*.log",
    ):
        assert private_or_large_path in dockerignore
