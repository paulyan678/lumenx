import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/renderWithIntl";

import SeriesGroupHeader from "../SeriesGroupHeader";

describe("SeriesGroupHeader", () => {
  it("shows a usable delete button for an empty series", () => {
    const onDelete = vi.fn();

    renderWithIntl(
      <SeriesGroupHeader
        title="1"
        episodeCount={0}
        onOpen={vi.fn()}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByText("系列 · 0 分镜")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "删除系列“1”" }));

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("prevents a second delete while the first request is running", () => {
    const onDelete = vi.fn();

    renderWithIntl(
      <SeriesGroupHeader
        title="1"
        episodeCount={0}
        deleting
        onOpen={vi.fn()}
        onDelete={onDelete}
      />,
    );

    const deleteButton = screen.getByRole("button", { name: "删除系列“1”" });
    expect(deleteButton).toBeDisabled();
    fireEvent.click(deleteButton);
    expect(onDelete).not.toHaveBeenCalled();
  });
});
