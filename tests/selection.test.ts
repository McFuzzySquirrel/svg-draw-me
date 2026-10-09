import { describe, expect, it } from "vitest";
import { createProject } from "../src/document";
import {
  applyGroupTransform,
  boundsForTarget,
  boundsIntersect,
  normalizeSelection,
  unionBounds,
} from "../src/selection";

describe("selection geometry and transforms", () => {
  it("computes transformed object bounds", () => {
    const project = createProject();
    project.shapes.push({
      id: "shape",
      kind: "rectangle",
      style: {
        stroke: { color: "#000000", width: 2, opacity: 1, lineCap: "round", lineJoin: "round" },
        fill: null,
      },
      pointerType: "mouse",
      startedAt: 0,
      endedAt: 1,
      transform: { translateX: 10, translateY: 5, rotation: 0, scaleX: 2, scaleY: 1 },
      geometry: { x: 2, y: 3, width: 4, height: 6 },
    });
    expect(boundsForTarget(project, { type: "shape", id: "shape" })).toEqual({
      x: 14,
      y: 8,
      width: 8,
      height: 6,
    });
  });

  it("normalizes nested selections to the outer layer", () => {
    const project = createProject();
    project.layers.push(
      { id: "outer", name: "Outer", order: 0, visible: true, opacity: 1, parentId: null },
      { id: "inner", name: "Inner", order: 0, visible: true, opacity: 1, parentId: "outer" },
    );
    project.shapes.push({
      id: "shape",
      kind: "line",
      layerId: "inner",
      style: {
        stroke: { color: "#000000", width: 2, opacity: 1, lineCap: "round", lineJoin: "round" },
        fill: null,
      },
      pointerType: "mouse",
      startedAt: 0,
      endedAt: 1,
      geometry: { x1: 0, y1: 0, x2: 10, y2: 10 },
    });
    expect(normalizeSelection(project, [
      { type: "layer", id: "outer" },
      { type: "layer", id: "inner" },
      { type: "shape", id: "shape" },
    ])).toEqual([{ type: "layer", id: "outer" }]);
  });

  it("moves a selected object and keeps union bounds usable for marquee tests", () => {
    const project = createProject();
    project.shapes.push({
      id: "shape",
      kind: "rectangle",
      style: {
        stroke: { color: "#000000", width: 2, opacity: 1, lineCap: "round", lineJoin: "round" },
        fill: null,
      },
      pointerType: "mouse",
      startedAt: 0,
      endedAt: 1,
      geometry: { x: 0, y: 0, width: 10, height: 10 },
    });
    const target = { type: "shape" as const, id: "shape" };
    applyGroupTransform(project, [target], boundsForTarget(project, target), { translateX: 20, translateY: 4 });
    expect(boundsForTarget(project, target)).toEqual({ x: 20, y: 4, width: 10, height: 10 });
    const union = unionBounds([boundsForTarget(project, target)]);
    expect(boundsIntersect(union, { x: 25, y: 8, width: 2, height: 2 })).toBe(true);
    expect(boundsIntersect(union, { x: 0, y: 0, width: 2, height: 2 })).toBe(false);
  });

  it("mirrors a selected object around its selection center", () => {
    const project = createProject();
    project.shapes.push({
      id: "shape",
      kind: "rectangle",
      style: {
        stroke: { color: "#000000", width: 2, opacity: 1, lineCap: "round", lineJoin: "round" },
        fill: null,
      },
      pointerType: "mouse",
      startedAt: 0,
      endedAt: 1,
      geometry: { x: 100, y: 40, width: 20, height: 10 },
    });
    const target = { type: "shape" as const, id: "shape" };
    const bounds = boundsForTarget(project, target);
    applyGroupTransform(project, [target], bounds, { scaleX: -1 });
    expect(boundsForTarget(project, target)).toEqual(bounds);
    expect(project.shapes[0]?.transform?.scaleX).toBe(-1);
    expect(normalizeSelection(project, [target])).toEqual([target]);
  });
});
