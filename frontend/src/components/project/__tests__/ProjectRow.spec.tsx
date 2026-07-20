import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/renderWithIntl";
import type { Project } from "@/store/projectStore";

vi.mock("@/components/project/ProjectCard", () => ({
  deriveCover: () => undefined,
  deriveStatus: () => "pending",
}));

import ProjectRow from "../ProjectRow";

const project: Project = {
  id: "episode-1",
  title: "First episode",
  originalText: "Episode text",
  characters: [],
  scenes: [],
  props: [],
  frames: [],
  status: "pending",
  createdAt: "2026-07-20T00:00:00.000Z",
  updatedAt: "2026-07-20T00:00:00.000Z",
  series_id: "series-1",
  episode_number: 1,
};

describe("ProjectRow actions menu", () => {
  beforeEach(() => {
    window.location.hash = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens from the three-dot button and closes with Escape", () => {
    renderWithIntl(
      <ProjectRow project={project} crumb="Series · EP.01" onDelete={vi.fn()} />,
    );

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "更多操作" }));

    expect(screen.getByRole("menu", { name: "更多操作" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "打开" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "删除" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens an episode through its series route", () => {
    renderWithIntl(
      <ProjectRow project={project} crumb="Series · EP.01" onDelete={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "打开" }));

    expect(window.location.hash).toBe("#/series/series-1/episode/episode-1");
  });

  it("confirms and deletes the selected row", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWithIntl(
      <ProjectRow project={project} crumb="Series · EP.01" onDelete={onDelete} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "删除" }));

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith("episode-1"));
    expect(window.confirm).toHaveBeenCalledWith(
      '确定要删除项目"First episode"吗？',
    );
  });
});
