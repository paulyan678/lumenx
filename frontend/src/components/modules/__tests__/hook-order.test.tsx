import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import PropertiesPanel from "@/components/modules/PropertiesPanel";
import MediaInput from "@/components/modules/playground/MediaInput";
import ResultCard from "@/components/modules/playground/ResultCard";
import ResultGallery from "@/components/modules/playground/ResultGallery";
import {
  usePlaygroundStore,
  type PlaygroundGeneration,
} from "@/components/modules/playground/usePlaygroundStore";
import { useProjectStore, type Project } from "@/store/projectStore";
import { renderWithIntl } from "@/test/renderWithIntl";

const imageGeneration: PlaygroundGeneration = {
  id: "generation-1",
  mode: "t2i",
  model_id: "gpt-image-1.5",
  prompt: "A cinematic skyline",
  input_media: [],
  parameters: {},
  batch_size: 1,
  outputs: [
    {
      id: "output-1",
      media_path: "outputs/skyline.png",
      media_type: "image",
      saved_to_library: false,
    },
  ],
  status: "completed",
  created_at: "2026-07-18T12:00:00.000Z",
};

const projectWithNoFrames = {
  id: "project-1",
  title: "Hook order test",
  originalText: "",
  frames: [],
  characters: [],
  scenes: [],
  props: [],
  status: "draft",
  createdAt: "2026-07-18T12:00:00.000Z",
  updatedAt: "2026-07-18T12:00:00.000Z",
} satisfies Project;

afterEach(() => {
  usePlaygroundStore.setState({
    mode: "t2i",
    inputMedia: [],
    history: [],
    featuredByGen: {},
  });
  useProjectStore.setState({
    currentProject: null,
    selectedFrameId: null,
  });
});

describe("conditional render hook safety", () => {
  it("renders MediaInput when switching from a no-media mode", async () => {
    usePlaygroundStore.setState({ mode: "t2v", inputMedia: [] });
    const { container } = renderWithIntl(<MediaInput />);

    expect(container).toBeEmptyDOMElement();

    act(() => {
      usePlaygroundStore.setState({ mode: "i2v" });
    });

    expect(await screen.findByText("拖拽或点击上传")).toBeInTheDocument();
  });

  it("renders storyboard properties when a project finishes loading", async () => {
    useProjectStore.setState({ currentProject: null, selectedFrameId: null });
    renderWithIntl(<PropertiesPanel activeStep="storyboard" />);

    act(() => {
      useProjectStore.setState({ currentProject: projectWithNoFrames });
    });

    expect(
      await screen.findByText("选择一个帧来编辑其详情。"),
    ).toBeInTheDocument();
  });
});

describe("result reference actions", () => {
  it("uses a completed image as an image-editing reference", () => {
    usePlaygroundStore.setState({ mode: "t2i", inputMedia: [] });
    renderWithIntl(<ResultCard generation={imageGeneration} />);

    fireEvent.click(screen.getByTitle("用作参考图"));

    expect(usePlaygroundStore.getState().mode).toBe("i2i");
    expect(usePlaygroundStore.getState().inputMedia).toEqual([
      "outputs/skyline.png",
    ]);
  });

  it("routes the gallery's generate-video action to i2v", () => {
    usePlaygroundStore.setState({
      mode: "t2i",
      inputMedia: [],
      history: [imageGeneration],
    });
    renderWithIntl(<ResultGallery />);

    fireEvent.click(screen.getByTitle("生成视频"));

    expect(usePlaygroundStore.getState().mode).toBe("i2v");
    expect(usePlaygroundStore.getState().inputMedia).toEqual([
      "outputs/skyline.png",
    ]);
  });
});
