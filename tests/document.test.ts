import { describe, expect, it } from "vitest";
import { appendStroke, createProject, deserializeProject, serializeProject } from "../src/document";
import { projectToEditableSvg, projectToSvg } from "../src/svg";

describe("stroke-preserving document", () => {
  it("round trips a project without losing stroke metadata", () => {
    const project = appendStroke(
      createProject(),
      [
        { x: 2, y: 3, pressure: 0.4, time: 10 },
        { x: 4, y: 5, pressure: 0.8, time: 20 },
      ],
      { color: "#000000", width: 4, opacity: 1, lineCap: "round", lineJoin: "round" },
      "pen",
      10,
      20,
    );
    const restored = deserializeProject(serializeProject(project));
    expect(restored.strokes).toEqual(project.strokes);
    expect(restored.strokes[0]?.pointerType).toBe("pen");
  });

  it("exports ordered strokes as normal SVG paths", () => {
    const project = appendStroke(
      createProject(),
      [
        { x: 0, y: 0, pressure: 1, time: 0 },
        { x: 10, y: 10, pressure: 1, time: 1 },
      ],
      { color: "#ff0000", width: 3, opacity: 0.8, lineCap: "round", lineJoin: "round" },
      "mouse",
      0,
      1,
    );
    const svg = projectToSvg(project);
    expect(svg).toContain('stroke="#ff0000"');
    expect(svg).toContain("M 0 0 L 10 10");
  });

  it("includes editable project metadata in the editable export", () => {
    const project = appendStroke(
      createProject(),
      [
        { x: 1, y: 2, pressure: 0.7, time: 4 },
        { x: 3, y: 5, pressure: 0.9, time: 8 },
      ],
      { color: "#123456", width: 6, opacity: 0.5, lineCap: "square", lineJoin: "bevel" },
      "touch",
      4,
      8,
    );
    const svg = projectToEditableSvg(project);
    expect(svg).toContain('"pointerType":"touch"');
    expect(svg).toContain('stroke-linecap="square"');
  });

  it("rejects unsupported project versions", () => {
    expect(() => deserializeProject(JSON.stringify({ version: 99, strokes: [] }))).toThrow(
      "Unsupported or invalid project version",
    );
  });
});
