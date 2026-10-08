import { describe, expect, it } from "vitest";
import { viewportToProject, zoomTransformAtPoint } from "../src/coordinates";

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

  it("keeps the document point under the cursor while zooming", () => {
    const transform = zoomTransformAtPoint(
      { scale: 1, offsetX: 100, offsetY: 50 },
      { x: 200, y: 100 },
      { x: 300, y: 150 },
      2,
    );

    expect(transform).toEqual({ scale: 2, offsetX: -100, offsetY: -50 });
    expect(viewportToProject(300, 150, { left: 0, top: 0 }, transform)).toEqual({ x: 200, y: 100 });
  });
});
