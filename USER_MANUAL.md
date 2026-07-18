# LumenX 用户手册

## 快速开始

1. 启动 LumenX。
2. 打开“设置”。
3. 在“New API 模型管理”中填写 `NEWAPI_BASE_URL`。
4. 为计划使用的每个模型填写它自己的 API Key，然后保存。
5. 分别选择活动的聊天、图像和视频模型。

开发环境也可以从项目根目录的示例文件开始：

```bash
cp .env.example .env
chmod 600 .env
```

`.env` 已被 Git 忽略。不要把真实密钥提交到仓库、截图、日志或问题报告中。

## New API 配置

New API 是 LumenX 唯一的 AI Provider。所有模型共用一个网关地址，但每个模型使用独立凭证。

| 能力 | 模型 ID | 专用密钥字段 |
|---|---|---|
| 图像 | `gpt-image-2` | `NEWAPI_GPT_IMAGE_2_API_KEY` |
| 视频 | `doubao-seedance-2-0-260128` | `NEWAPI_SEEDANCE_2_API_KEY` |
| 视频 | `doubao-seedance-2-0-fast-260128` | `NEWAPI_SEEDANCE_2_FAST_API_KEY` |
| 视频 | `doubao-seedance-2-0-mini-260615` | `NEWAPI_SEEDANCE_2_MINI_API_KEY` |
| 聊天 | `deepseek-v4-flash` | `NEWAPI_DEEPSEEK_V4_FLASH_API_KEY` |
| 聊天 | `qwen3.7-max` | `NEWAPI_QWEN_37_MAX_API_KEY` |
| 聊天 | `deepseek-v4-pro` | `NEWAPI_DEEPSEEK_V4_PRO_API_KEY` |

共享字段：

- `NEWAPI_BASE_URL`：New API 网关根地址，通常以 `/v1` 结尾。

保存后，设置页面只会显示遮罩值，不会从后端取回完整密钥。请求会严格使用“所选模型 ID + 该模型专用密钥”。所选模型缺少密钥时，LumenX 会在提交前显示错误；不会改用其他模型、其他密钥或其他 Provider。

## 模型选择

聊天、图像和视频的活动模型相互独立，并在保存后保持选择，页面重载或应用重启不会重置。

默认值：

- 聊天：`deepseek-v4-flash`
- 图像：`gpt-image-2`
- 视频：`doubao-seedance-2-0-fast-260128`

选择器只显示对应类别的模型：

- 聊天选择器：三个聊天模型。
- 图像选择器：仅 `gpt-image-2`。
- 视频选择器：三个 Seedance 模型。

设置页与相关生成页面会标出当前活动模型。切换聊天或视频模型后无需重启应用。

## 支持的生成流程

| 流程 | 可用模型 |
|---|---|
| 文生图 | `gpt-image-2` |
| 图像编辑 | `gpt-image-2` |
| 文生视频 | 三个 Seedance 模型 |
| 单图图生视频 | 三个 Seedance 模型 |

当前 New API 请求协议只实现单参考图的图生视频。界面不提供多参考图的参考生视频流程，也不会把任何 Seedance 模型描述成支持该流程。

## 本地数据与可选 OSS

用户数据默认存储在：

| 系统 | 路径 |
|---|---|
| macOS / Linux | `~/.lumen-x/` |
| Windows | `C:\Users\<用户名>\.lumen-x\` |

生成素材本地优先保存到 `output/`。OSS 是可选的媒体镜像和签名 URL 服务，与 AI Provider 或模型路由无关。需要时可配置：

- `ALIBABA_CLOUD_ACCESS_KEY_ID`
- `ALIBABA_CLOUD_ACCESS_KEY_SECRET`
- `OSS_BUCKET_NAME`
- `OSS_ENDPOINT`
- `OSS_BASE_PATH`

## 日志与故障排查

日志位置：

| 系统 | 路径 |
|---|---|
| macOS / Linux | `~/.lumen-x/logs/app.log` |
| Windows | `C:\Users\<用户名>\.lumen-x\logs\app.log` |

生成失败时依次检查：

1. 所选模型是否已启用并配置了它自己的密钥。
2. `NEWAPI_BASE_URL` 是否正确且网络可访问。
3. 模型 ID 是否与 New API 控制台中的精确 ID 一致。
4. 账户余额、配额和模型权限是否正常。
5. 日志中的请求 ID 和已遮罩错误信息。

提交问题报告前，请删除日志中的个人数据、媒体地址和任何可能的凭证。不要提供 `.env` 或完整 API Key。

## 常见问题

### 为什么一个模型一个密钥？

这样可以确保模型与凭证严格匹配，避免错误计费或把一个模型的权限用于另一个模型。

### 可以只配置正在使用的模型吗？

可以。未配置密钥的模型仍可在设置中看到其未配置状态，但选择它后提交请求会被明确拒绝。

### 为什么没有参考生视频选择器？

当前实现没有经过验证的多参考图 New API 请求合同，因此只提供文生视频和单图图生视频。

### 如何清理界面缓存？

退出应用后删除 `~/.lumen-x/` 下的 `webview_storage` 目录，再重新启动。密钥配置与项目数据应先按需备份。

更多信息见 [README](README.md) 与 [New API 合同](docs/api-reference/newapi.md)。
