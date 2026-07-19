import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import PlaygroundPage from "@/components/modules/playground/PlaygroundPage";
import PromptHistoryDrawer from "@/components/modules/playground/PromptHistoryDrawer";
import PromptTemplateModal from "@/components/modules/playground/PromptTemplateModal";
import { usePlaygroundStore } from "@/components/modules/playground/usePlaygroundStore";
import { playgroundApi } from "@/lib/api";
import { renderWithIntl } from "@/test/renderWithIntl";

vi.mock("@/lib/api", () => ({
  API_URL: "http://127.0.0.1:17177",
  playgroundApi: {
    getHistory: vi.fn().mockResolvedValue([]),
    getTemplates: vi.fn().mockResolvedValue([]),
  },
}));

afterEach(() => {
  usePlaygroundStore.setState({
    history: [],
    prompt: "",
    showHistoryDrawer: false,
    showTemplateModal: false,
    templates: [],
  });
  vi.clearAllMocks();
});

describe("playground responsive layout", () => {
  it("stacks the input and result panels below the desktop breakpoint", async () => {
    renderWithIntl(<PlaygroundPage />);

    expect(screen.getByTestId("playground-split-layout")).toHaveClass(
      "flex-col",
      "overflow-y-auto",
      "md:flex-row",
      "md:overflow-hidden",
    );
    expect(screen.getByTestId("playground-input-panel")).toHaveClass(
      "w-full",
      "md:w-[420px]",
      "md:overflow-y-auto",
    );
    expect(screen.getByTestId("playground-results-panel")).toHaveClass(
      "min-h-[360px]",
      "w-full",
      "md:min-h-0",
    );

    await waitFor(() => {
      expect(playgroundApi.getHistory).toHaveBeenCalledOnce();
      expect(playgroundApi.getTemplates).toHaveBeenCalledOnce();
    });
  });

  it("keeps the history drawer within narrow viewports", () => {
    usePlaygroundStore.setState({ showHistoryDrawer: true });
    renderWithIntl(<PromptHistoryDrawer />);

    expect(screen.getByTestId("playground-history-drawer")).toHaveClass(
      "w-full",
      "max-w-[420px]",
    );
    expect(screen.getByRole("button", { name: "关闭" })).toBeInTheDocument();
  });

  it("keeps the template drawer within narrow viewports", () => {
    usePlaygroundStore.setState({ showTemplateModal: true });
    renderWithIntl(<PromptTemplateModal />);

    expect(screen.getByTestId("playground-template-drawer")).toHaveClass(
      "w-full",
      "max-w-[420px]",
    );
    expect(screen.getByRole("button", { name: "关闭" })).toBeInTheDocument();
  });
});
