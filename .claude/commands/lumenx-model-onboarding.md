---
description: LumenX 模型接入与文档更新流程 - 厂商文档抓取、model_catalog 更新、运行时范围判断、端到端验证
---

# LumenX 模型接入流程

当你在这个仓库里被要求做以下事情时，使用本流程：

- 接入新模型或新模型家族
- 更新模型文档、版本、默认值、参数、展示范围
- 更新已批准的 New API 模型 ID、能力或模型专用凭据
- 判断某次模型变更到底只是 catalog 变更，还是还要改运行时逻辑 / 前端 UI
- 使用 `/lumenx-model-onboarding`

这个流程是 LumenX 仓库内的正式模型接入入口，目标是让整个过程 **可观测、可验证、可 Review**。

## 支持的变更类型

- **仅文档刷新**：只更新文档链接、版本信息、集成说明，不改运行时行为
- **仅 catalog 变更**：只改 `config/model_catalog/` 里的模型定义、默认值、参数、文档链路、UI 暴露
- **catalog + 前端**：catalog 改完后，前端的设置页 / 视频侧边栏等展示也要一起调整
- **catalog + 运行时**：还需要改 New API 请求参数、端点行为、响应处理或模型到密钥的精确路由
- **provider 边界变更**：任何新增非 New API provider 的需求都属于架构变更，不是常规模型接入，必须得到用户明确批准

## 当前单一 Provider 约束

LumenX 只支持 New API 作为 AI provider。当前批准的模型 ID 为：

- Chat：`deepseek-v4-flash`、`qwen3.7-max`、`deepseek-v4-pro`
- Image：`gpt-image-2`
- Video：`doubao-seedance-2-0-260128`、`doubao-seedance-2-0-fast-260128`、`doubao-seedance-2-0-mini-260615`

唯一共享的 provider 配置是 `NEWAPI_BASE_URL`。精确凭据映射为：

- `gpt-image-2` → `NEWAPI_GPT_IMAGE_2_API_KEY`
- `doubao-seedance-2-0-260128` → `NEWAPI_SEEDANCE_2_API_KEY`
- `doubao-seedance-2-0-fast-260128` → `NEWAPI_SEEDANCE_2_FAST_API_KEY`
- `doubao-seedance-2-0-mini-260615` → `NEWAPI_SEEDANCE_2_MINI_API_KEY`
- `deepseek-v4-flash` → `NEWAPI_DEEPSEEK_V4_FLASH_API_KEY`
- `qwen3.7-max` → `NEWAPI_QWEN_37_MAX_API_KEY`
- `deepseek-v4-pro` → `NEWAPI_DEEPSEEK_V4_PRO_API_KEY`

运行时必须把选中的模型 ID 与该模型的精确 API key 一起解析。对于不支持的模型 ID 或缺失的 key 必须报错，禁止复用其他模型的 key，也禁止回退到其他 provider。

## 开始前要明确的输入

至少搞清楚这些信息：

- New API 端点与请求协议
- model family
- 涉及的 model ID
- 本次属于哪种变更类型
- 源文档 URL
- 是否影响：
  - 默认模型
  - 模型到密钥的精确路由
  - 输入传输方式
  - 请求参数
  - 前端可见性

如果信息不完整，先判断哪些可以安全推进，哪些必须停下来问用户。

## 仓库内外的职责边界

本仓库负责：

- `model_catalog` 可执行清单
- 后端 catalog 加载和 provider routing
- 前端模型列表 / 默认值 / UI 暴露
- workflow 文档、校验脚本、实现文档

本仓库不直接负责：

- 原始厂商文档归档仓库
- 共享 Context Hub 源文档仓库

这两个通常应该在本仓库之外独立维护。

## 文档同步模式

### 模式 A：完整多仓流程

当原始文档归档仓库和 Context Hub 源仓都可用时：

1. 在原始归档仓库抓取 / 刷新文档
2. 在 Context Hub 中提炼集成关键信息
3. 在本仓库更新 `model_catalog`

### 模式 B：仅当前仓库流程

当当前工作区只有本仓库时：

1. 先把文档证据抓到 `docs/api-reference/` 作为本地 staging mirror
2. 在本仓库更新 `model_catalog`
3. 在实现文档或 PR 里明确写出：外部 raw archive / Context Hub 仍待同步

模式 B 可以完成实现与验证，但不能冒充“所有跨仓同步都已完成”。

## 阶段一：抓取文档证据

优先方式：

- 使用 `url-to-markdown` 之类的 URL 抓取流程

优先落点：

- 外部原始文档归档仓库

当前仓库内的 fallback：

- `docs/api-reference/<provider>-<topic>.md`

最少要保留这些信息：

- 原始 URL
- 抓取日期
- provider / family / model 范围
- 文档中提到的版本或发布日期

## 阶段二：先判断范围，再决定改哪里

先把需求归类：

- **只改 catalog**
  - model ID
  - 默认值
  - duration / params / badges / visible_in / status
  - 文档链路
- **需要改前端**
  - 模型要显示或隐藏
  - 新参数要在 UI 上暴露
- **需要改运行时**
  - 认证方式变化
  - 请求 payload 变化
  - 媒体输入方式变化
  - 轮询 / 响应结构变化
  - New API 传输协议或模型到密钥的精确映射发生变化

不要把明显需要运行时改动的事情硬塞成“只改 catalog”。

## 阶段三：更新 model_catalog

主文件：

- `config/model_catalog/catalog.meta.yaml`
- `config/model_catalog/families/*.yaml`

按需更新这些字段：

- `id`
- `display_name`
- `description`
- `status`
- `release_stage`
- `capabilities`
- `docs.official_snapshot_ids`
- `docs.context_hub_doc_ids`
- `ui.selection_group`
- `ui.visible_in`
- `ui.recommended`
- `ui.order`
- `duration`
- `params`
- `inputs`
- family 级别的 `supported_backends`（只能包含 `newapi`）
- family 级别的 `transport`
- family 级别的 `credential_sources`（必须指向精确的模型专用 key）

规则：

- 只要模型在 UI 中可见，就必须有文档链路
- 默认模型必须指向真实存在的 model
- `planned` / `hidden` 模型不能被误暴露到 UI
- 不支持的模型 ID 不能残留在选择器、默认值、验证或运行时路由中
- 凭据来源不能回退到其他模型的 key
- 前端不直接解析 YAML，必须吃生成后的 JSON mirror

## 阶段四：只有需要时才继续改运行时或前端

如果运行时行为发生变化，检查：

- `src/utils/newapi_models.py`
- `src/models/newapi.py`
- `src/apps/comic_gen/models.py`

如果 UI 行为发生变化，检查：

- `frontend/src/lib/modelCatalog.ts`
- `frontend/src/store/projectStore.ts`
- 相关设置页、视频生成页、参数侧边栏

如果变更确实只是 catalog，不要多改一层。

## 阶段五：重新生成 artifacts

运行：

```bash
python scripts/build_model_catalog.py
```

这一步必须更新：

- `config/model_catalog/generated/model_catalog.json`
- `frontend/src/generated/modelCatalog.json`
- `config/model_catalog/schema/model-catalog.schema.json`

## 阶段六：运行 catalog 校验

运行：

```bash
python scripts/validate_model_catalog.py
```

这一步必须验证：

- 后端 canonical artifact 与前端 mirror 一致
- 默认模型在正确的 UI surface 上可见
- 所有可见模型仍有文档链路

## 阶段七：运行完整验证

任何 catalog 变更，最少跑这些：

```bash
pytest -q
cd frontend && npm run typecheck
cd frontend && npm run test:all
cd frontend && npm run build
```

可以先跑更窄的测试，但不要在没跑完端到端验证前宣称完成。

## 必须停下来问用户的情况

- 文档暗示要新增非 New API provider 或全新认证方式
- 需要新的媒体输入传输模式
- 需要新增 UI 控件，但产品交互不明显
- 用户期待完整跨仓同步，但当前工作区拿不到 raw archive / Context Hub 仓库
- 文档本身残缺、互相冲突，或需要登录后才能看

## 一个完整 onboarding 的交付物

一次完整模型接入至少应该留下：

- 更新后的文档证据或说明
- 更新后的 catalog YAML
- 重新生成的 backend / frontend artifacts
- 必要时补上的运行时代码或前端代码
- 可复现的验证结果
- 明确写出的延期项 / 未完成项
