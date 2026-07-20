<!-- Banner -->
<div align="center">
  <img src="docs/images/LumenX-Studio-Banner-cybr.png" alt="LumenX" width="100%" />
</div>

<div align="center">

# LumenX

### AI-Native Motion Comic & Video Creation Platform
**Render Noise into Narrative**

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.11%2B-blue)](https://www.python.org/)
[![Node](https://img.shields.io/badge/node-20.9%2B-green)](https://nodejs.org/)
[![GitHub Stars](https://img.shields.io/github/stars/alibaba/lumenx?style=social)](https://github.com/alibaba/lumenx)

[English](README_EN.md) · [中文](README.md) · [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md)

</div>

---

LumenX is an **AI-native motion comic & video creation platform**. It transforms creative text into publishable dynamic videos, providing a complete workflow from script analysis to final export, while also supporting standalone image/video generation.

LumenX currently includes two core modules:

| Module | Purpose |
|--------|---------|
| **LumenX Studio** | Pipeline-first comic/video production (Script → Storyboard → Assets → Video → Export) |
| **LumenX Playground** | Standalone image/video generation workbench (no project context required) |

---

## ✨ Core Capabilities

<table>
<tr>
<td width="50%">

### 🎬 Studio — Full Pipeline Production

- **Deep Script Analysis** — LLM auto-extracts characters/scenes/props, generates structured storyboards
- **Art Direction Control** — Custom visual styles with global consistency
- **New API Asset Generation** — Character turnarounds, scene establishing shots, prop references
- **AI Video Generation** — Seedance text-to-video and single-image image-to-video + batch candidates
- **Audio Production** — Local Demucs separation and FFmpeg-based final assembly
- **One-click Export** — Timeline editing + FFmpeg merging

</td>
<td width="50%">

### 🎨 Playground — Standalone Generation Workbench

- **4 Supported Workflows** — Text-to-image, image editing, text-to-video, and image-to-video
- **7 Approved Models** — GPT Image 2, three Seedance variants, and three chat models
- **Dynamic Parameters** — Per-model parameter configuration (size/resolution/duration/quality)
- **Concurrent Tasks** — Multiple tasks execute simultaneously with real-time status tracking
- **Prompt Templates** — Save/reuse/favorite/history
- **Gallery View** — Grid/gallery toggle + detail panel

</td>
</tr>
</table>

---

## 🎨 v1.2.1 Visual Identity Refresh

<div align="center">

| Before | After |
|:---:|:---:|
| <img src="docs/images/LumenX Studio Banner.jpeg" alt="Old Banner" width="100%" /> | <img src="docs/images/LumenX-Studio-Banner-cybr.png" alt="New Banner" width="100%" /> |
| Neon gradient lotus · Soft curves | Cyber Brutalism · Angular geometry · Circuit textures |

</div>

---

## 📸 Screenshots

<div align="center">
  <img src="docs/images/playground-overview.jpg" alt="Playground" width="90%" />
</div>

---

## 🎯 Supported AI Models

| Provider | Models | Capabilities |
|----------|--------|--------------|
| **New API** | `gpt-image-2` | T2I, image editing |
| **New API** | `doubao-seedance-2-0-260128` | T2V, single-image I2V |
| **New API** | `doubao-seedance-2-0-fast-260128` | T2V, single-image I2V |
| **New API** | `doubao-seedance-2-0-mini-260615` | T2V, single-image I2V |
| **New API** | `deepseek-v4-flash`, `qwen3.7-max`, `deepseek-v4-pro` | Script analysis, prompt refinement, chat |

Reference-to-video is not advertised because the implemented New API contract does not support multi-reference input.

---

## 🚀 Quick Start

### Prerequisites

- Python 3.11+
- Node.js 20.9+ (20.x)
- FFmpeg (for video processing)

### One-command Launch

```bash
# Clone
git clone https://github.com/alibaba/lumenx.git
cd lumenx

# Configure API Key
cp .env.example .env
chmod 600 .env
# Edit .env, set NEWAPI_BASE_URL and the key for each model you plan to use

# Install the root launcher dependencies once
npm ci

# Start (backend on 17177 + frontend on 3008, auto-opens browser)
npm run dev
```

Or start separately:

```bash
# Backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
./start_backend.sh  # http://localhost:17177

# Frontend
cd frontend && npm ci && npm run dev  # http://localhost:3008
```

### Access

- **Studio**: http://localhost:3008
- **Playground**: http://localhost:3008/#/playground
- **API Docs**: http://localhost:17177/docs

---

## ⚙️ New API Configuration

LumenX uses a **local-first** architecture and New API is its only AI provider. Every model has a dedicated key; a request is rejected if the selected model's key is missing.

| Configuration | Purpose |
|---------------|---------|
| `NEWAPI_BASE_URL` | Shared HTTPS gateway root ending in `/v1` |
| `NEWAPI_*_API_KEY` | Dedicated credential for one exact approved model |
| `NEWAPI_CHAT_MODEL` | Active chat model; default `deepseek-v4-flash` |
| `NEWAPI_IMAGE_MODEL` | Active image model; default `gpt-image-2` |
| `NEWAPI_VIDEO_MODEL` | Active video model; default `doubao-seedance-2-0-fast-260128` |

<details>
<summary>Detailed Configuration</summary>

All settings can be configured in the app. Development updates the project-root `.env`; packaged desktop and container builds persist settings not overridden by deployment environment variables in `config.json` under the durable user-data directory.

Saved keys stay masked in the application. LumenX never sends one model's key with another model ID and never falls back to another provider or model.

</details>

---

## 🏗️ Architecture

The Next.js frontend calls a FastAPI backend that uses New API as its sole AI provider. The backend resolves the selected exact model ID together with its model-specific key, and generated media stays in the local `output/` directory.

### Directory Structure

```
lumenx/
├── frontend/                  # Next.js Frontend
│   └── src/components/
│       ├── modules/playground/   # Playground module
│       ├── modules/              # Studio business modules
│       └── layout/               # Global layout
├── src/
│   ├── apps/comic_gen/        # Studio backend (API + Pipeline)
│   ├── apps/playground/       # Playground backend (API + Service)
│   ├── models/                # New API image/video adapters
│   └── audio/                 # Local audio processing utilities
├── config/model_catalog/      # Model catalog (YAML → JSON)
└── output/                    # Generated outputs (local storage)
```

---

## 📖 Documentation

| Document | Description |
|----------|-------------|
| [User Manual](USER_MANUAL.md) | Feature usage guide |
| [API Docs](http://localhost:17177/docs) | Swagger UI |
| [Model Onboarding](docs/model-onboarding-implementation.md) | New model integration guide |
| [New API Contract](docs/api-reference/newapi.md) | Supported models, credentials, and capabilities |

---

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md).

- **Bug Reports**: [GitHub Issues](https://github.com/alibaba/lumenx/issues)
- **Feature Requests**: [GitHub Discussions](https://github.com/alibaba/lumenx/discussions)
- **Email**: [zhangjunhe.zjh@alibaba-inc.com](mailto:zhangjunhe.zjh@alibaba-inc.com)

---

## 📄 License

[MIT License](LICENSE)

---

<div align="center">
  Made with ❤️ by StarLotus · Alibaba Group
</div>
