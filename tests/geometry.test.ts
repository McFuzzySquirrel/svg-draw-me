import { describe, expect, it } from "vitest";
import { findFillTarget, isClosedStroke, pointHitsReference, pointHitsShape, pointHitsStroke, pointInStrokeLoop } from "../src/geometry";
import { createProject } from "../src/document";

describe("whole-object hit testing", () => {
  it("hits reference bounds with an optional eraser tolerance", () => {
    const reference = { x: 10, y: 20, width: 40, height: 30 };
    expect(pointHitsReference({ x: 30, y: 35 }, reference)).toBe(true);
    expect(pointHitsReference({ x: 9, y: 35 }, reference)).toBe(false);
    expect(pointHitsReference({ x: 9, y: 35 }, reference, 1)).toBe(true);
  });

  it("hits a stroke near one of its segments", () => {
    expect(pointHitsStroke(
      { x: 5, y: 2 },
      {
        id: "stroke",
        points: [
          { x: 0, y: 0, pressure: 1, time: 0 },
          { x: 10, y: 0, pressure: 1, time: 1 },
        ],
        style: { color: "#000", width: 2, opacity: 1, lineCap: "round", lineJoin: "round" },
        fill: null,
        pointerType: "mouse",
        startedAt: 0,
        endedAt: 1,
      },
      2,
    )).toBe(true);
  });

  it("accepts a small endpoint gap for freehand loop filling", () => {
    const stroke = {
      id: "loop",
      points: [
        { x: 0, y: 0, pressure: 1, time: 0 },
        { x: 20, y: 0, pressure: 1, time: 1 },
        { x: 20, y: 20, pressure: 1, time: 2 },
        { x: 2, y: 20, pressure: 1, time: 3 },
        { x: 0, y: 3, pressure: 1, time: 4 },
      ],
      style: { color: "#000", width: 2, opacity: 1, lineCap: "round" as const, lineJoin: "round" as const },
      fill: null,
      pointerType: "mouse" as const,
      startedAt: 0,
      endedAt: 4,
    };
    expect(isClosedStroke(stroke)).toBe(true);
    expect(pointInStrokeLoop({ x: 10, y: 10 }, stroke)).toBe(true);
    expect(pointInStrokeLoop({ x: 30, y: 10 }, stroke)).toBe(false);
  });

  it("hits the outline of a rectangle shape", () => {
    expect(pointHitsShape(
      { x: 10, y: 20 },
      {
        id: "rectangle",
        kind: "rectangle",
        style: {
          stroke: { color: "#000", width: 2, opacity: 1, lineCap: "round", lineJoin: "round" },
          fill: null,
        },
        pointerType: "mouse",
        startedAt: 0,
        endedAt: 1,
        geometry: { x: 10, y: 20, width: 40, height: 30 },
      },
      2,
    )).toBe(true);
  });

  it("hits the interior of a filled rectangle", () => {
    expect(pointHitsShape(
      { x: 30, y: 35 },
      {
        id: "filled-rectangle",
        kind: "rectangle",
        style: {
          stroke: { color: "#000", width: 2, opacity: 1, lineCap: "round", lineJoin: "round" },
          fill: "#fff",
        },
        pointerType: "mouse",
        startedAt: 0,
        endedAt: 1,
        geometry: { x: 10, y: 20, width: 40, height: 30 },
      },
      2,
    )).toBe(true);
  });

  it("finds an unfilled shape as a fill target", () => {
    const project = createProject();
    project.shapes.push({
      id: "rectangle",
      kind: "rectangle",
      style: {
        stroke: { color: "#000", width: 2, opacity: 1, lineCap: "round", lineJoin: "round" },
        fill: null,
      },
      pointerType: "mouse",
      startedAt: 0,
      endedAt: 1,
      geometry: { x: 10, y: 20, width: 40, height: 30 },
    });
    expect(findFillTarget(project, { x: 30, y: 35 }, 2)).toEqual({ type: "shape", id: "rectangle" });
  });

  it("prefers the visually topmost shape over a closed stroke", () => {
    const project = createProject();
    project.strokes.push({
      id: "loop",
      points: [
        { x: 0, y: 0, pressure: 1, time: 0 },
        { x: 60, y: 0, pressure: 1, time: 1 },
        { x: 60, y: 60, pressure: 1, time: 2 },
        { x: 0, y: 0, pressure: 1, time: 3 },
      ],
      style: { color: "#000", width: 2, opacity: 1, lineCap: "round", lineJoin: "round" },
      fill: null,
      pointerType: "mouse",
      startedAt: 0,
      endedAt: 3,
    });
    project.shapes.push({
      id: "top-shape",
      kind: "ellipse",
      style: {
        stroke: { color: "#000", width: 2, opacity: 1, lineCap: "round", lineJoin: "round" },
        fill: null,
      },
      pointerType: "mouse",
      startedAt: 0,
      endedAt: 1,
      geometry: { cx: 20, cy: 20, rx: 10, ry: 10 },
    });
    expect(findFillTarget(project, { x: 20, y: 20 }, 2)).toEqual({ type: "shape", id: "top-shape" });
  });
});
