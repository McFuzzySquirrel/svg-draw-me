import { describe, expect, it } from "vitest";
import { createSvgBlob, getSvgDimensions } from "../src/imports";

describe("SVG imports", () => {
  it("creates an SVG-typed blob for browser loading", () => {
    const blob = createSvgBlob("<svg><circle cx=\"2\" cy=\"2\" r=\"1\" /></svg>");

    expect(blob.type).toBe("image/svg+xml");
  });

  it("reads intrinsic dimensions from SVG attributes or its viewBox", () => {
    expect(getSvgDimensions('<svg width="640px" height="480"></svg>')).toEqual({ width: 640, height: 480 });
    expect(getSvgDimensions('<svg viewBox="-10 5 320 240"></svg>')).toEqual({ width: 320, height: 240 });
    expect(getSvgDimensions("<svg></svg>")).toEqual({ width: 300, height: 150 });
  });
});
