import { describe, expect, it } from "vitest";
import { createProject } from "../src/document";
import { groupSelection, GroupingError, ungroupSelection } from "../src/grouping";
import { boundsForTarget } from "../src/selection";

const shape = (id: string, layerId?: string) => ({
  id,
  ...(layerId ? { layerId } : {}),
  kind: "rectangle" as const,
  style: {
    stroke: { color: "#000000", width: 2, opacity: 1, lineCap: "round" as const, lineJoin: "round" as const },
    fill: null,
  },
  pointerType: "mouse" as const,
  startedAt: 0,
  endedAt: 1,
  geometry: { x: 10, y: 20, width: 30, height: 15 },
});

describe("grouping mutations", () => {
  it("groups mixed objects and layers into a named layer", () => {
    const project = createProject();
    project.layers.push(
      { id: "layer-a", name: "A", order: 0, visible: true, opacity: 1, parentId: null },
      { id: "layer-b", name: "B", order: 1, visible: true, opacity: 1, parentId: null },
    );
    project.shapes.push(shape("shape", "layer-a"));

    const group = groupSelection(project, [
      { type: "shape", id: "shape" },
      { type: "layer", id: "layer-b" },
    ], "Group 1");

    expect(group.type).toBe("layer");
    const created = project.layers.find((layer) => layer.id === group.id);
    expect(created?.name).toBe("Group 1");
    expect(created?.parentId).toBeNull();
    expect(project.layers.find((layer) => layer.id === "layer-a")?.parentId).toBeNull();
    expect(project.layers.find((layer) => layer.id === "layer-b")?.parentId).toBe(group.id);
    expect(project.shapes[0]?.layerId).toBe(group.id);
  });

  it("preserves appearance when ungrouping transformed children", () => {
    const project = createProject();
    project.layers.push({
      id: "group",
      name: "Group",
      order: 0,
      visible: true,
      opacity: 1,
      parentId: null,
      transform: { translateX: 100, translateY: 40, rotation: 0, scaleX: 2, scaleY: 2 },
    });
    project.shapes.push({
      ...shape("shape", "group"),
      transform: { translateX: 12, translateY: 8, rotation: 0, scaleX: 1, scaleY: 1 },
    });
    const before = boundsForTarget(project, { type: "shape", id: "shape" });

    const promoted = ungroupSelection(project, [{ type: "layer", id: "group" }]);

    expect(promoted).toEqual([{ type: "shape", id: "shape" }]);
    expect(project.layers).toHaveLength(0);
    expect(project.shapes[0]?.layerId).toBeUndefined();
    expect(boundsForTarget(project, { type: "shape", id: "shape" })).toEqual(before);
  });

  it("blocks ungrouping an animated group without mutating the project", () => {
    const project = createProject();
    project.layers.push({ id: "group", name: "Group", order: 0, visible: true, opacity: 1, parentId: null });
    project.animations.push({
      id: "animation",
      preset: "fade",
      targetType: "layer",
      targetId: "group",
      duration: 100,
      delay: 0,
      iterations: 1,
      direction: "normal",
      easing: "linear",
      enabled: true,
    });
    expect(() => ungroupSelection(project, [{ type: "layer", id: "group" }])).toThrow(GroupingError);
    expect(project.layers).toHaveLength(1);
    expect(project.animations).toHaveLength(1);
  });
});
