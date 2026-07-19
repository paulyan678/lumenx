import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  API_URL: "http://127.0.0.1:17177",
}));

let getAssetUrl: typeof import("@/lib/utils").getAssetUrl;

beforeAll(async () => {
  ({ getAssetUrl } = await import("@/lib/utils"));
});

describe("getAssetUrl", () => {
  it.each([
    ["assets/scene.png", "http://127.0.0.1:17177/files/assets/scene.png"],
    ["/assets/scene.png", "http://127.0.0.1:17177/files/assets/scene.png"],
    ["output/assets/scene.png", "http://127.0.0.1:17177/files/assets/scene.png"],
    ["/outputs/assets/scene.png", "http://127.0.0.1:17177/files/assets/scene.png"],
    ["files/assets/scene.png", "http://127.0.0.1:17177/files/assets/scene.png"],
    ["/files/assets/scene.png", "http://127.0.0.1:17177/files/assets/scene.png"],
  ])("normalizes persisted local path %s", (input, expected) => {
    expect(getAssetUrl(input)).toBe(expected);
  });

  it.each([
    "https://cdn.example/scene.png",
    "http://cdn.example/scene.png",
    "//cdn.example/scene.png",
    "blob:https://studio.example/id",
    "data:image/png;base64,AAAA",
  ])("preserves supported direct URL %s", (input) => {
    expect(getAssetUrl(input)).toBe(input);
  });

  it("does not mistake a local name beginning with http for a remote URL", () => {
    expect(getAssetUrl("http-cache/scene.png")).toBe(
      "http://127.0.0.1:17177/files/http-cache/scene.png",
    );
  });

  it("returns an empty URL for absent paths", () => {
    expect(getAssetUrl(undefined)).toBe("");
    expect(getAssetUrl(null)).toBe("");
    expect(getAssetUrl("  ")).toBe("");
  });
});
