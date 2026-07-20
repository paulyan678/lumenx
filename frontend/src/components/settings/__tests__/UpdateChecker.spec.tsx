import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/renderWithIntl";

import UpdateChecker, {
  LATEST_COMMIT_API,
  UPDATE_REPOSITORY,
  commitsMatch,
} from "../UpdateChecker";

const CURRENT_COMMIT = "1111111111111111111111111111111111111111";
const REMOTE_COMMIT = "2222222222222222222222222222222222222222";
const REMOTE_URL = `https://github.com/${UPDATE_REPOSITORY}/commit/${REMOTE_COMMIT}`;

describe("UpdateChecker", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("checks the latest main commit in the personal repository", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ sha: REMOTE_COMMIT, html_url: REMOTE_URL }),
    });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    renderWithIntl(<UpdateChecker currentCommit={CURRENT_COMMIT} />);
    fireEvent.click(screen.getByRole("button", { name: "检查更新" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(LATEST_COMMIT_API, {
        headers: { Accept: "application/vnd.github+json" },
      });
    });
    expect(UPDATE_REPOSITORY).toBe("paulyan678/lumenx");
    expect(screen.getByText("发现 GitHub 新提交 (2222222)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "在 GitHub 打开提交" }));
    expect(openSpy).toHaveBeenCalledWith(
      REMOTE_URL,
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("reports up to date when GitHub returns the build commit", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ sha: CURRENT_COMMIT, html_url: REMOTE_URL }),
    });

    renderWithIntl(<UpdateChecker currentCommit={CURRENT_COMMIT.slice(0, 12)} />);
    fireEvent.click(screen.getByRole("button", { name: "检查更新" }));

    expect(
      await screen.findByText("已同步到最新提交 (1111111)"),
    ).toBeInTheDocument();
    expect(commitsMatch(CURRENT_COMMIT, CURRENT_COMMIT.slice(0, 7))).toBe(true);
  });
});
