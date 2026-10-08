import { describe, expect, it } from "vitest";
import { createSvgBlob } from "../src/imports";

describe("SVG imports", () => {
  it("creates an SVG-typed blob for browser loading", () => {
    const blob = createSvgBlob("<svg><circle cx=\"2\" cy=\"2\" r=\"1\" /></svg>");

    expect(blob.type).toBe("image/svg+xml");
  });
});
