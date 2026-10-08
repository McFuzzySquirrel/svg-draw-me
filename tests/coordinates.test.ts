import { describe, expect, it } from "vitest";
import { viewportToProject } from "../src/coordinates";

describe("canvas coordinate conversion", () => {
  it("removes the centered letterbox offset before applying scale", () => {
    const point = viewportToProject(
      350,
      260,
      { left: 100, top: 80 },
      { scale: 0.5, offsetX: 50, offsetY: 40 },
    );

    expect(point).toEqual({ x: 400, y: 280 });
  });
});
