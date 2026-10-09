import { describe, expect, it } from "vitest";
import { parseEditablePath, pathCommandsToSvg } from "../src/path";

describe("editable SVG paths", () => {
  it("normalizes relative, shorthand, and horizontal/vertical commands", () => {
    const commands = parseEditablePath("M 1 2 h 3 v 4 q 2 2 4 0 t 4 0");
    expect(commands).toEqual([
      { type: "M", x: 1, y: 2 },
      { type: "L", x: 4, y: 2 },
      { type: "L", x: 4, y: 6 },
      { type: "Q", x1: 6, y1: 8, x: 8, y: 6 },
      { type: "Q", x1: 10, y1: 4, x: 12, y: 6 },
    ]);
  });

  it("normalizes smooth cubic commands and exports canonical commands", () => {
    const commands = parseEditablePath("M0 0 C1 2 3 4 5 6 S7 8 9 10 Z");
    expect(commands[1]).toEqual({ type: "C", x1: 1, y1: 2, x2: 3, y2: 4, x: 5, y: 6 });
    expect(commands[2]).toEqual({ type: "C", x1: 7, y1: 8, x2: 7, y2: 8, x: 9, y: 10 });
    expect(pathCommandsToSvg(commands)).toContain("C 7 8 7 8 9 10 Z");
  });

  it("rejects unsupported and malformed paths", () => {
    expect(() => parseEditablePath("M0 0 A10 10 0 0 1 20 20")).toThrow(/Unsupported/);
    expect(() => parseEditablePath("M0 0 L")).toThrow(/Incomplete/);
  });
});
