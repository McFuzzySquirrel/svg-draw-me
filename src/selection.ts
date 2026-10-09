import type {
  DrawingProject,
  PathCommand,
  ProjectLayer,
  ProjectTransform,
  Shape,
  Stroke,
} from "./types";

export type SelectionTargetType = "stroke" | "shape" | "text" | "raster" | "svg" | "layer";

export interface SelectionTarget {
  type: SelectionTargetType;
  id: string;
}

export interface SelectionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SelectionPoint {
  x: number;
  y: number;
}

const emptyBounds = (): SelectionBounds => ({ x: Infinity, y: Infinity, width: 0, height: 0 });

const includePoint = (bounds: SelectionBounds, point: SelectionPoint): SelectionBounds => {
  if (!Number.isFinite(bounds.x)) return { x: point.x, y: point.y, width: 0, height: 0 };
  const maxX = Math.max(bounds.x + bounds.width, point.x);
  const maxY = Math.max(bounds.y + bounds.height, point.y);
  const minX = Math.min(bounds.x, point.x);
  const minY = Math.min(bounds.y, point.y);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

const includeBounds = (bounds: SelectionBounds, next: SelectionBounds): SelectionBounds => {
  if (!Number.isFinite(bounds.x)) return next;
  return includePoint(includePoint(bounds, { x: next.x, y: next.y }), {
    x: next.x + next.width,
    y: next.y + next.height,
  });
};

const transformPoint = (point: SelectionPoint, transform: ProjectTransform | undefined): SelectionPoint => {
  if (!transform) return point;
  const scaled = { x: point.x * transform.scaleX, y: point.y * transform.scaleY };
  const cosine = Math.cos(transform.rotation);
  const sine = Math.sin(transform.rotation);
  return {
    x: scaled.x * cosine - scaled.y * sine + transform.translateX,
    y: scaled.x * sine + scaled.y * cosine + transform.translateY,
  };
};

const transformBounds = (bounds: SelectionBounds, transform: ProjectTransform | undefined): SelectionBounds => {
  if (!transform) return bounds;
  const corners = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x, y: bounds.y + bounds.height },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
  ].map((point) => transformPoint(point, transform));
  let result = emptyBounds();
  for (const corner of corners) result = includePoint(result, corner);
  return result;
};

const pointsBounds = (points: SelectionPoint[]): SelectionBounds => {
  let result = emptyBounds();
  for (const point of points) result = includePoint(result, point);
  return Number.isFinite(result.x) ? result : { x: 0, y: 0, width: 0, height: 0 };
};

const strokeBounds = (stroke: Stroke): SelectionBounds =>
  transformBounds(pointsBounds(stroke.points), stroke.transform);

const pathBounds = (commands: PathCommand[]): SelectionBounds => {
  const points = commands.flatMap((command) => {
    if (command.type === "M" || command.type === "L") return [{ x: command.x, y: command.y }];
    if (command.type === "Q") return [{ x: command.x1, y: command.y1 }, { x: command.x, y: command.y }];
    if (command.type === "C") return [
      { x: command.x1, y: command.y1 },
      { x: command.x2, y: command.y2 },
      { x: command.x, y: command.y },
    ];
    return [];
  });
  return pointsBounds(points);
};

const shapeBounds = (shape: Shape): SelectionBounds => {
  let bounds: SelectionBounds;
  if (shape.kind === "line") {
    bounds = pointsBounds([{ x: shape.geometry.x1, y: shape.geometry.y1 }, { x: shape.geometry.x2, y: shape.geometry.y2 }]);
  } else if (shape.kind === "rectangle") {
    bounds = { x: shape.geometry.x, y: shape.geometry.y, width: shape.geometry.width, height: shape.geometry.height };
  } else if (shape.kind === "ellipse") {
    bounds = {
      x: shape.geometry.cx - shape.geometry.rx,
      y: shape.geometry.cy - shape.geometry.ry,
      width: shape.geometry.rx * 2,
      height: shape.geometry.ry * 2,
    };
  } else if (shape.kind === "polygon") {
    bounds = pointsBounds(shape.geometry.points);
  } else if (shape.kind === "curve") {
    bounds = pointsBounds([
      { x: shape.geometry.x1, y: shape.geometry.y1 },
      { x: shape.geometry.cx, y: shape.geometry.cy },
      { x: shape.geometry.x2, y: shape.geometry.y2 },
    ]);
  } else {
    bounds = pathBounds(shape.geometry.commands);
  }
  return transformBounds(bounds, shape.transform);
};

const layerAncestors = (project: DrawingProject, layerId: string | undefined): ProjectLayer[] => {
  const result: ProjectLayer[] = [];
  let current = project.layers.find((layer) => layer.id === layerId);
  while (current) {
    result.push(current);
    current = current.parentId === null ? undefined : project.layers.find((layer) => layer.id === current?.parentId);
  }
  return result.reverse();
};

export const targetKey = (target: SelectionTarget): string => `${target.type}:${target.id}`;

export const sameTarget = (left: SelectionTarget, right: SelectionTarget): boolean =>
  left.type === right.type && left.id === right.id;

export const objectForTarget = (
  project: DrawingProject,
  target: SelectionTarget,
): DrawingProject["strokes"][number] | DrawingProject["shapes"][number] |
  DrawingProject["texts"][number] | DrawingProject["rasterReferences"][number] |
  DrawingProject["importedSvgs"][number] | ProjectLayer | undefined => {
  if (target.type === "stroke") return project.strokes.find((item) => item.id === target.id);
  if (target.type === "shape") return project.shapes.find((item) => item.id === target.id);
  if (target.type === "text") return project.texts.find((item) => item.id === target.id);
  if (target.type === "raster") return project.rasterReferences.find((item) => item.id === target.id);
  if (target.type === "svg") return project.importedSvgs.find((item) => item.id === target.id);
  return project.layers.find((item) => item.id === target.id);
};

const objectBounds = (
  object: ReturnType<typeof objectForTarget>,
): SelectionBounds => {
  if (!object) return { x: 0, y: 0, width: 0, height: 0 };
  if ("points" in object) return strokeBounds(object);
  if ("kind" in object) return shapeBounds(object);
  if ("text" in object) {
    return transformBounds({
      x: object.x,
      y: object.y - object.fontSize,
      width: Math.max(object.fontSize, object.text.length * object.fontSize * 0.6),
      height: object.fontSize,
    }, object.transform);
  }
  if ("width" in object && "height" in object) {
    return transformBounds({ x: object.x, y: object.y, width: object.width, height: object.height }, object.transform);
  }
  return { x: 0, y: 0, width: 0, height: 0 };
};

export const boundsForTarget = (project: DrawingProject, target: SelectionTarget): SelectionBounds => {
  if (target.type !== "layer") {
    let bounds = objectBounds(objectForTarget(project, target));
    const object = objectForTarget(project, target) as { layerId?: string } | undefined;
    for (const layer of layerAncestors(project, object?.layerId)) bounds = transformBounds(bounds, layer.transform);
    return bounds;
  }
  let bounds = emptyBounds();
  const descendantLayers = new Set<string>([target.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const layer of project.layers) {
      if (layer.parentId && descendantLayers.has(layer.parentId) && !descendantLayers.has(layer.id)) {
        descendantLayers.add(layer.id);
        changed = true;
      }
    }
  }
  const targets: SelectionTarget[] = [
    ...project.strokes.filter((item) => item.layerId && descendantLayers.has(item.layerId)).map((item) => ({ type: "stroke" as const, id: item.id })),
    ...project.shapes.filter((item) => item.layerId && descendantLayers.has(item.layerId)).map((item) => ({ type: "shape" as const, id: item.id })),
    ...project.texts.filter((item) => item.layerId && descendantLayers.has(item.layerId)).map((item) => ({ type: "text" as const, id: item.id })),
    ...project.rasterReferences.filter((item) => item.layerId && descendantLayers.has(item.layerId)).map((item) => ({ type: "raster" as const, id: item.id })),
    ...project.importedSvgs.filter((item) => item.layerId && descendantLayers.has(item.layerId)).map((item) => ({ type: "svg" as const, id: item.id })),
  ];
  for (const item of targets) bounds = includeBounds(bounds, boundsForTarget(project, item));
  if (!Number.isFinite(bounds.x)) bounds = { x: 0, y: 0, width: 0, height: 0 };
  return bounds;
};

export const unionBounds = (bounds: SelectionBounds[]): SelectionBounds => {
  let result = emptyBounds();
  for (const next of bounds) result = includeBounds(result, next);
  return Number.isFinite(result.x) ? result : { x: 0, y: 0, width: 0, height: 0 };
};

export const boundsIntersect = (left: SelectionBounds, right: SelectionBounds): boolean =>
  left.x <= right.x + right.width && left.x + left.width >= right.x &&
  left.y <= right.y + right.height && left.y + left.height >= right.y;

export const targetIsDescendantOfLayer = (
  project: DrawingProject,
  target: SelectionTarget,
  layerId: string,
): boolean => {
  if (target.type === "layer") {
    let current = project.layers.find((layer) => layer.id === target.id);
    while (current) {
      if (current.parentId === layerId) return true;
      current = current.parentId ? project.layers.find((layer) => layer.id === current?.parentId) : undefined;
    }
    return false;
  }
  const object = objectForTarget(project, target) as { layerId?: string } | undefined;
  return layerAncestors(project, object?.layerId).some((layer) => layer.id === layerId);
};

export const selectableTargets = (project: DrawingProject): SelectionTarget[] => [
  ...project.strokes.map((item) => ({ type: "stroke" as const, id: item.id })),
  ...project.shapes.map((item) => ({ type: "shape" as const, id: item.id })),
  ...project.texts.map((item) => ({ type: "text" as const, id: item.id })),
  ...project.rasterReferences.map((item) => ({ type: "raster" as const, id: item.id })),
  ...project.importedSvgs.map((item) => ({ type: "svg" as const, id: item.id })),
  ...project.layers.map((item) => ({ type: "layer" as const, id: item.id })),
];

export const normalizeSelection = (
  project: DrawingProject,
  targets: SelectionTarget[],
): SelectionTarget[] => {
  const unique = [...new Map(targets.map((target) => [targetKey(target), target])).values()];
  return unique.filter((target) => {
    if (target.type !== "layer") return !unique.some((candidate) =>
      candidate.type === "layer" && candidate.id !== target.id && targetIsDescendantOfLayer(project, target, candidate.id));
    return !unique.some((candidate) =>
      candidate.type === "layer" && candidate.id !== target.id && targetIsDescendantOfLayer(project, target, candidate.id));
  });
};

const transformableObject = (
  project: DrawingProject,
  target: SelectionTarget,
): { transform?: ProjectTransform } | undefined => {
  const object = objectForTarget(project, target);
  return object as { transform?: ProjectTransform } | undefined;
};

const rotateAround = (point: SelectionPoint, center: SelectionPoint, angle: number): SelectionPoint => {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const x = point.x - center.x;
  const y = point.y - center.y;
  return {
    x: center.x + x * cosine - y * sine,
    y: center.y + x * sine + y * cosine,
  };
};

const applyLinearTransform = (
  point: SelectionPoint,
  rotation: number,
  scaleX: number,
  scaleY: number,
): SelectionPoint => {
  const scaled = { x: point.x * scaleX, y: point.y * scaleY };
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return {
    x: scaled.x * cosine - scaled.y * sine,
    y: scaled.x * sine + scaled.y * cosine,
  };
};

const inverseLinearTransform = (
  point: SelectionPoint,
  rotation: number,
  scaleX: number,
  scaleY: number,
): SelectionPoint => {
  const cosine = Math.cos(-rotation);
  const sine = Math.sin(-rotation);
  const rotated = {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  };
  return { x: rotated.x / scaleX, y: rotated.y / scaleY };
};

export const applyGroupTransform = (
  project: DrawingProject,
  targets: SelectionTarget[],
  bounds: SelectionBounds,
  transform: { translateX?: number; translateY?: number; scaleX?: number; scaleY?: number; rotation?: number },
): void => {
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  for (const target of normalizeSelection(project, targets)) {
    const object = transformableObject(project, target);
    if (!object) continue;
    const targetBounds = boundsForTarget(project, target);
    const targetCenter = {
      x: targetBounds.x + targetBounds.width / 2,
      y: targetBounds.y + targetBounds.height / 2,
    };
    const scaled = {
      x: center.x + (targetCenter.x - center.x) * (transform.scaleX ?? 1),
      y: center.y + (targetCenter.y - center.y) * (transform.scaleY ?? 1),
    };
    const rotated = rotateAround(scaled, center, transform.rotation ?? 0);
    const next = object.transform ?? {
      translateX: 0,
      translateY: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    };
    const nextScaleX = next.scaleX * (transform.scaleX ?? 1);
    const nextScaleY = next.scaleY * (transform.scaleY ?? 1);
    const nextRotation = next.rotation + (transform.rotation ?? 0);
    const localCenter = inverseLinearTransform(
      { x: targetCenter.x - next.translateX, y: targetCenter.y - next.translateY },
      next.rotation,
      next.scaleX,
      next.scaleY,
    );
    const transformedLocalCenter = applyLinearTransform(localCenter, nextRotation, nextScaleX, nextScaleY);
    const desiredCenter = {
      x: rotated.x + (transform.translateX ?? 0),
      y: rotated.y + (transform.translateY ?? 0),
    };
    object.transform = {
      translateX: desiredCenter.x - transformedLocalCenter.x,
      translateY: desiredCenter.y - transformedLocalCenter.y,
      rotation: nextRotation,
      scaleX: nextScaleX,
      scaleY: nextScaleY,
    };
  }
};
