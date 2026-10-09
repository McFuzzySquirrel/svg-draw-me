import { describe, expect, it } from "vitest";
import { appendShape, appendStroke, applyFill, createProject, deserializeProject, dimensionsForBounds, serializeProject } from "../src/document";
import { MAX_EDITABLE_METADATA_LENGTH, projectToEditableSvg, projectToSvg } from "../src/svg";

describe("stroke-preserving document", () => {
  it("expands project dimensions to include reference bounds", () => {
    expect(dimensionsForBounds(1200, 800, [
      { x: 0, y: 0, width: 1600, height: 900 },
      { x: 1700, y: 100, width: 100, height: 200 },
    ])).toEqual({ width: 1800, height: 900 });
    expect(dimensionsForBounds(1200, 800, [{ x: 0, y: 0, width: 300, height: 200 }]))
      .toEqual({ width: 1200, height: 800 });
  });

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
    expect(svg).toContain('<clipPath id="project-bounds"><rect width="1200" height="800"/></clipPath>');
    expect(svg).toContain('<g clip-path="url(#project-bounds)">');
  });

  it("exports a filled freehand loop as a closed SVG path", () => {
    const project = appendStroke(
      createProject(),
      [
        { x: 0, y: 0, pressure: 1, time: 0 },
        { x: 20, y: 0, pressure: 1, time: 1 },
        { x: 20, y: 20, pressure: 1, time: 2 },
        { x: 0, y: 0, pressure: 1, time: 3 },
      ],
      { color: "#ff0000", width: 3, opacity: 1, lineCap: "round", lineJoin: "round" },
      "mouse",
      0,
      3,
      "#00ff00",
    );
    expect(projectToSvg(project)).toContain('fill="#00ff00"');
    expect(projectToSvg(project)).toContain("L 0 0 Z");
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
    expect(svg).toContain('"project":{"version":2');
    expect(svg).toContain('"pointerType":"touch"');
    expect(svg).toContain('stroke-linecap="square"');
  });

  it("rejects oversized editable SVG metadata", () => {
    const project = createProject();
    project.importedSvgs.push({
      id: "svg-1",
      name: "large",
      markup: "x".repeat(MAX_EDITABLE_METADATA_LENGTH),
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      opacity: 1,
      visible: true,
    });
    expect(() => projectToEditableSvg(project)).toThrow("metadata exceeds");
  });

  it("rejects unsupported project versions", () => {
    expect(() => deserializeProject(JSON.stringify({ version: 99, strokes: [] }))).toThrow(
      "Unsupported or invalid project version",
    );
  });

  it("migrates version-one projects to the current schema", () => {
    expect(deserializeProject(JSON.stringify({ version: 1, strokes: [] }))).toEqual({
      version: 2,
      width: 1200,
      height: 800,
      strokes: [],
      shapes: [],
      rasterReferences: [],
      importedSvgs: [],
      texts: [],
      layers: [],
      animations: [],
    });
  });

  it("rejects project files with invalid dimensions", () => {
    expect(() => deserializeProject(JSON.stringify({ version: 1, width: 0, height: 800, strokes: [] }))).toThrow(
      "Project dimensions must be positive",
    );
    for (const width of ["wide", null, Number.NaN]) {
      expect(() => deserializeProject(JSON.stringify({ version: 1, width, height: 800, strokes: [] }))).toThrow(
        "Project dimensions must be positive",
      );
    }
    expect(deserializeProject(JSON.stringify({ version: 1, strokes: [] }))).toMatchObject({ width: 1200, height: 800 });
  });

  it("rejects malformed nested project data before it can be loaded", () => {
    const invalidProjects = [
      { version: 1, strokes: [{}] },
      { version: 1, strokes: [], shapes: [{}] },
      { version: 1, strokes: [], rasterReferences: [{}] },
      { version: 1, strokes: [], importedSvgs: [{}] },
      { version: 1, strokes: [], shapes: "invalid" },
    ];
    for (const project of invalidProjects) {
      expect(() => deserializeProject(JSON.stringify(project))).toThrow("Invalid project");
    }
  });

  it("round trips first-class shape elements", () => {
    const project = appendShape(createProject(), {
      kind: "rectangle",
      style: {
        stroke: { color: "#111111", width: 2, opacity: 1, lineCap: "round", lineJoin: "round" },
        fill: "#eeeeee",
      },
      pointerType: "mouse",
      startedAt: 0,
      endedAt: 1,
      geometry: { x: 10, y: 20, width: 30, height: 40 },
    });
    const restored = deserializeProject(serializeProject(project));
    expect(restored.shapes[0]).toMatchObject({ kind: "rectangle", geometry: { width: 30, height: 40 } });
  });

  it("exports first-class shapes", () => {
    const project = appendShape(createProject(), {
      kind: "ellipse",
      style: {
        stroke: { color: "#111111", width: 2, opacity: 1, lineCap: "round", lineJoin: "round" },
        fill: "#eeeeee",
      },
      pointerType: "mouse",
      startedAt: 0,
      endedAt: 1,
      geometry: { cx: 20, cy: 25, rx: 10, ry: 5 },
    });

    expect(projectToSvg(project)).toContain('<ellipse cx="20" cy="25" rx="10" ry="5"');
  });

  it("round trips and exports linear gradient shape fills", () => {
    const project = appendShape(createProject(), {
      kind: "rectangle",
      style: {
        stroke: { color: "#111111", width: 2, opacity: 1, lineCap: "round", lineJoin: "round" },
        fill: null,
        gradient: { type: "linear", startColor: "#ff0000", endColor: "#0000ff", angle: 0 },
      },
      pointerType: "mouse",
      startedAt: 0,
      endedAt: 1,
      geometry: { x: 0, y: 0, width: 20, height: 20 },
    });

    expect(deserializeProject(serializeProject(project))).toEqual(project);
    const svg = projectToSvg(project);
    expect(svg).toContain("<linearGradient");
    expect(svg).toContain(`fill="url(#gradient-${project.shapes[0]!.id})"`);
  });

  it("round trips and exports radial gradient shape fills", () => {
    const project = appendShape(createProject(), {
      kind: "ellipse",
      style: {
        stroke: { color: "#111111", width: 2, opacity: 1, lineCap: "round", lineJoin: "round" },
        fill: null,
        gradient: { type: "radial", startColor: "#ffffff", endColor: "#000000" },
      },
      pointerType: "mouse",
      startedAt: 0,
      endedAt: 1,
      geometry: { cx: 10, cy: 10, rx: 10, ry: 10 },
    });

    expect(deserializeProject(serializeProject(project))).toEqual(project);
    expect(projectToSvg(project)).toContain("<radialGradient");
  });

  it("round trips and exports normalized editable paths", () => {
    const project = appendShape(createProject(), {
      kind: "path",
      style: {
        stroke: { color: "#111111", width: 2, opacity: 1, lineCap: "round", lineJoin: "round" },
        fill: null,
      },
      pointerType: "mouse",
      startedAt: 0,
      endedAt: 1,
      geometry: {
        commands: [
          { type: "M", x: 0, y: 0 },
          { type: "C", x1: 10, y1: 0, x2: 10, y2: 20, x: 20, y: 20 },
          { type: "Z" },
        ],
      },
    });

    expect(deserializeProject(serializeProject(project))).toEqual(project);
    expect(projectToSvg(project)).toContain('d="M 0 0 C 10 0 10 20 20 20 Z"');
  });

  it("round trips and exports constrained blur effects", () => {
    const project = appendShape(createProject(), {
      kind: "ellipse",
      style: {
        stroke: { color: "#111111", width: 2, opacity: 1, lineCap: "round", lineJoin: "round" },
        fill: "#eeeeee",
        effect: { type: "blur", strength: 3 },
      },
      pointerType: "mouse",
      startedAt: 0,
      endedAt: 1,
      geometry: { cx: 10, cy: 10, rx: 5, ry: 5 },
    });
    expect(deserializeProject(serializeProject(project))).toEqual(project);
    const svg = projectToSvg(project);
    expect(svg).toContain("<feGaussianBlur stdDeviation=\"3\"");
    expect(svg).toContain(`filter="url(#effect-${project.shapes[0]!.id})"`);
  });

  it("round trips and exports text objects", () => {
    const project = createProject();
    project.texts.push({
      id: "text-1",
      text: "<Hello>",
      x: 10,
      y: 20,
      fontFamily: "Inter",
      fontSize: 24,
      color: "#123456",
      opacity: 0.8,
      align: "center",
    });
    expect(deserializeProject(serializeProject(project))).toEqual(project);
    expect(projectToSvg(project)).toContain(
      '<text x="10" y="20" font-family="Inter, sans-serif" font-size="24" fill="#123456" opacity="0.8" text-anchor="middle">&lt;Hello&gt;</text>',
    );
  });

  it("sets and clears fills on strokes and shapes", () => {
    const withStroke = appendStroke(
      createProject(),
      [
        { x: 0, y: 0, pressure: 1, time: 0 },
        { x: 20, y: 0, pressure: 1, time: 1 },
        { x: 20, y: 20, pressure: 1, time: 2 },
        { x: 0, y: 0, pressure: 1, time: 3 },
      ],
      { color: "#000000", width: 2, opacity: 1, lineCap: "round", lineJoin: "round" },
      "mouse",
      0,
      3,
    );
    const strokeId = withStroke.strokes[0]!.id;
    const filledStroke = applyFill(withStroke, { type: "stroke", id: strokeId }, "#ff0000");
    expect(filledStroke.strokes[0]?.fill).toBe("#ff0000");
    const clearedStroke = applyFill(filledStroke, { type: "stroke", id: strokeId }, null);
    expect(clearedStroke.strokes[0]?.fill).toBeNull();

    const withShape = appendShape(clearedStroke, {
      kind: "rectangle",
      style: {
        stroke: { color: "#111111", width: 2, opacity: 1, lineCap: "round", lineJoin: "round" },
        fill: null,
      },
      pointerType: "mouse",
      startedAt: 0,
      endedAt: 1,
      geometry: { x: 10, y: 10, width: 20, height: 20 },
    });
    const shapeId = withShape.shapes[0]!.id;
    const filledShape = applyFill(withShape, { type: "shape", id: shapeId }, "#00ff00");
    expect(filledShape.shapes[0]?.style.fill).toBe("#00ff00");
    const clearedShape = applyFill(filledShape, { type: "shape", id: shapeId }, null);
    expect(clearedShape.shapes[0]?.style.fill).toBeNull();
    expect(projectToSvg(clearedShape)).toContain('fill="none"');
    expect(applyFill(filledShape, { type: "shape", id: shapeId }, "#00ff00")).toBe(filledShape);
    expect(applyFill(filledShape, { type: "shape", id: "missing" }, null)).toBe(filledShape);
  });

  it("round trips layers, transforms, and animation definitions", () => {
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
    const stroke = project.strokes[0]!;
    stroke.layerId = "foreground";
    stroke.transform = { translateX: 5, translateY: 8, rotation: 0.2, scaleX: 1.5, scaleY: 1 };
    project.layers.push({
      id: "foreground",
      name: "Foreground",
      order: 0,
      visible: true,
      opacity: 1,
      parentId: null,
    });
    project.animations.push({
      id: "animation-1",
      preset: "fade",
      targetType: "object",
      targetId: stroke.id,
      duration: 800,
      delay: 100,
      iterations: "infinite",
      direction: "alternate",
      easing: "ease-in-out",
      enabled: true,
    });

    expect(deserializeProject(serializeProject(project))).toEqual(project);
  });

  it("rejects invalid animation values and unresolved targets", () => {
    const baseProject = {
      ...createProject(),
      animations: [{
        id: "animation-1",
        preset: "fade",
        targetType: "layer",
        targetId: "missing",
        duration: 800,
        delay: 0,
        iterations: 1,
        direction: "normal",
        easing: "linear",
        enabled: true,
      }],
    };
    expect(() => deserializeProject(JSON.stringify(baseProject))).toThrow("Invalid project animation target");

    for (const invalid of [
      { ...baseProject, layers: [{ id: "layer-1", name: "Layer", order: 0, visible: true, opacity: 1, parentId: null }] },
      { ...baseProject, animations: [{ ...baseProject.animations[0], duration: 0 }] },
      { ...baseProject, animations: [{ ...baseProject.animations[0], easing: "spring" }] },
    ]) {
      expect(() => deserializeProject(JSON.stringify(invalid))).toThrow("Invalid project animation");
    }
  });

  it("rejects invalid transforms and cyclic layer groups", () => {
    const project = createProject();
    project.layers.push(
      { id: "layer-1", name: "One", order: 0, visible: true, opacity: 1, parentId: "layer-2" },
      { id: "layer-2", name: "Two", order: 1, visible: true, opacity: 1, parentId: "layer-1" },
    );
    expect(() => deserializeProject(serializeProject(project))).toThrow("Invalid project layer hierarchy");

    project.layers = [];
    project.strokes.push({
      id: "stroke-1",
      points: [
        { x: 0, y: 0, pressure: 1, time: 0 },
        { x: 1, y: 1, pressure: 1, time: 1 },
      ],
      style: { color: "#000000", width: 1, opacity: 1, lineCap: "round", lineJoin: "round" },
      fill: null,
      pointerType: "mouse",
      startedAt: 0,
      endedAt: 1,
      transform: { translateX: 0, translateY: 0, rotation: 0, scaleX: 0, scaleY: 1 },
    });
    expect(() => deserializeProject(serializeProject(project))).toThrow("Invalid project transform");
  });

  it("applies object and hierarchical layer transforms in SVG exports", () => {
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
    project.strokes[0]!.transform = {
      translateX: 10,
      translateY: 20,
      rotation: Math.PI / 2,
      scaleX: 2,
      scaleY: 3,
    };
    project.layers.push(
      {
        id: "parent",
        name: "Parent",
        order: 0,
        visible: true,
        opacity: 0.5,
        parentId: null,
        transform: { translateX: 5, translateY: 6, rotation: 0, scaleX: 1, scaleY: 1 },
      },
      {
        id: "child",
        name: "Child",
        order: 1,
        visible: true,
        opacity: 0.8,
        parentId: "parent",
      },
    );
    project.strokes[0]!.layerId = "child";

    const svg = projectToSvg(project);
    expect(svg).toContain('data-layer="parent" opacity="0.5" transform="translate(5 6) rotate(0) scale(1 1)"');
    expect(svg).toContain('<g data-layer="child" opacity="0.8">');
    expect(svg).toContain('<g transform="translate(10 20) rotate(90) scale(2 3)"><path d="M 2 3 L 4 5"');
    expect(projectToSvg({
      ...project,
      layers: [{ ...project.layers[0]!, visible: false }],
    })).not.toContain('data-layer="parent"');
  });

  it("keeps raster references omitted from standard SVG unless requested", () => {
    const project = createProject();
    project.rasterReferences.push({
      id: "raster-1",
      name: "Reference",
      dataUrl: "data:image/png;base64,AA==",
      x: 20,
      y: 30,
      width: 40,
      height: 50,
      opacity: 0.5,
      visible: true,
      transform: { translateX: 1, translateY: 2, rotation: 0, scaleX: 2, scaleY: 2 },
    });

    expect(projectToSvg(project)).not.toContain("<image");
    expect(projectToSvg(project, true)).toContain('transform="translate(21 32) rotate(0) scale(2 2)"');
  });

  it("rejects duplicate object IDs and paths without an initial moveto", () => {
    const project = createProject();
    project.shapes.push({
      id: "same",
      kind: "path",
      geometry: { commands: [{ type: "L", x: 0, y: 0 }] },
      style: { stroke: { color: "#000000", width: 1, opacity: 1, lineCap: "round", lineJoin: "round" }, fill: null },
      pointerType: "mouse",
      startedAt: 0,
      endedAt: 1,
    });
    expect(() => deserializeProject(serializeProject(project))).toThrow("Invalid project path command sequence");
    const duplicate = createProject();
    duplicate.shapes.push({
      id: "same",
      kind: "path",
      geometry: { commands: [{ type: "M", x: 0, y: 0 }] },
      style: { stroke: { color: "#000000", width: 1, opacity: 1, lineCap: "round", lineJoin: "round" }, fill: null },
      pointerType: "mouse",
      startedAt: 0,
      endedAt: 1,
    });
    duplicate.strokes.push({
      id: "same",
      points: [{ x: 0, y: 0, pressure: 1, time: 0 }, { x: 1, y: 1, pressure: 1, time: 1 }],
      style: { color: "#000000", width: 1, opacity: 1, lineCap: "round", lineJoin: "round" },
      fill: null,
      pointerType: "mouse",
      startedAt: 0,
      endedAt: 1,
    });
    expect(() => deserializeProject(serializeProject(duplicate))).toThrow("Duplicate project object ID");
  });
});
