import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/renderWithIntl";

const apiMocks = vi.hoisted(() => ({
  getEnvConfig: vi.fn(),
  fetchPromptDefaults: vi.fn(),
  healthCheck: vi.fn(),
  checkSystem: vi.fn(),
  saveEnvConfig: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  API_URL: "http://127.0.0.1:17177",
  api: apiMocks,
}));

import SettingsPage from "../SettingsPage";

describe("SettingsPage storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getEnvConfig.mockResolvedValue({
      NEWAPI_BASE_URL: "https://example.test/v1",
      NEWAPI_CHAT_MODEL: "deepseek-v4-flash",
      NEWAPI_IMAGE_MODEL: "gpt-image-2",
      NEWAPI_VIDEO_MODEL: "doubao-seedance-2-0-fast-260128",
      secrets_configured: {},
    });
    apiMocks.fetchPromptDefaults.mockResolvedValue({});
    apiMocks.healthCheck.mockResolvedValue({
      log_dir: "/tmp/lumenx/logs",
      log_file: "/tmp/lumenx/logs/lumenx.log",
    });
    apiMocks.checkSystem.mockResolvedValue({ status: "ok", dependencies: {} });
    apiMocks.saveEnvConfig.mockResolvedValue({ status: "success" });
  });

  it("shows only the managed local storage paths", () => {
    renderWithIntl(<SettingsPage />);

    fireEvent.click(screen.getByRole("tab", { name: "存储" }));

    expect(screen.getByText("本地存储路径")).toBeInTheDocument();
    expect(screen.getByText("本地数据目录")).toBeInTheDocument();
    expect(screen.getByText("日志目录")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "保存配置" }),
    ).not.toBeInTheDocument();
  });
});
