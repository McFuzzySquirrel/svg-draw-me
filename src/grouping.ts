import type {
  DrawingProject,
  ProjectLayer,
  ProjectTransform,
} from "./types";
import {
  normalizeSelection,
  objectForTarget,
  type SelectionTarget,
} from "./selection";

export class GroupingError extends Error {}

interface AffineMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

const IDENTITY: AffineMatrix = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
const EPSILON = 1e-8;

const matrixForTransform = (transform: ProjectTransform | undefined, offset = { x: 0, y: 0 }): AffineMatrix => {
  const rotation = transform?.rotation ?? 0;
  const scaleX = transform?.scaleX ?? 1;
  const scaleY = transform?.scaleY ?? 1;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return {
    a: cosine * scaleX,
    b: sine * scaleX,
    c: -sine * scaleY,
    d: cosine * scaleY,
    tx: offset.x + (transform?.translateX ?? 0),
    ty: offset.y + (transform?.translateY ?? 0),
  };
};

const multiply = (left: AffineMatrix, right: AffineMatrix): AffineMatrix => ({
  a: left.a * right.a + left.c * right.b,
  b: left.b * right.a + left.d * right.b,
  c: left.a * right.c + left.c * right.d,
  d: left.b * right.c + left.d * right.d,
  tx: left.a * right.tx + left.c * right.ty + left.tx,
  ty: left.b * right.tx + left.d * right.ty + left.ty,
});

const invert = (matrix: AffineMatrix): AffineMatrix => {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (Math.abs(determinant) < EPSILON) throw new GroupingError("Cannot reparent an object with a zero-scale transform.");
  return {
    a: matrix.d / determinant,
    b: -matrix.b / determinant,
    c: -matrix.c / determinant,
    d: matrix.a / determinant,
    tx: (matrix.c * matrix.ty - matrix.d * matrix.tx) / determinant,
    ty: (matrix.b * matrix.tx - matrix.a * matrix.ty) / determinant,
  };
};

const nearlyEqual = (left: number, right: number): boolean =>
  Math.abs(left - right) <= EPSILON * Math.max(1, Math.abs(left), Math.abs(right));

const transformFromMatrix = (matrix: AffineMatrix, offset = { x: 0, y: 0 }): ProjectTransform | undefined => {
  const scaleX = Math.hypot(matrix.a, matrix.b);
  if (scaleX < EPSILON) throw new GroupingError("Cannot reparent an object with a zero-scale transform.");
  const rotation = Math.atan2(matrix.b, matrix.a);
  const scaleY = matrix.a * matrix.d - matrix.b * matrix.c < 0
    ? -Math.hypot(matrix.c, matrix.d)
    : Math.hypot(matrix.c, matrix.d);
  const dot = matrix.a * matrix.c + matrix.b * matrix.d;
  if (Math.abs(dot) > EPSILON * Math.max(1, scaleX * Math.abs(scaleY))) {
    throw new GroupingError("This grouping would require an unsupported skew transform.");
  }
  const translateX = matrix.tx - offset.x;
  const translateY = matrix.ty - offset.y;
  if (nearlyEqual(translateX, 0) && nearlyEqual(translateY, 0) &&
      nearlyEqual(rotation, 0) && nearlyEqual(scaleX, 1) && nearlyEqual(scaleY, 1)) {
    return undefined;
  }
  return { translateX, translateY, rotation, scaleX, scaleY };
};

const layerById = (project: DrawingProject, id: string): ProjectLayer | undefined =>
  project.layers.find((layer) => layer.id === id);

const parentLayerId = (
  project: DrawingProject,
  target: SelectionTarget,
): string | null => {
  if (target.type === "layer") return layerById(project, target.id)?.parentId ?? null;
  const object = objectForTarget(project, target) as { layerId?: string } | undefined;
  return object?.layerId ?? null;
};

const layerWorldMatrix = (project: DrawingProject, layerId: string | null): AffineMatrix => {
  const chain: ProjectLayer[] = [];
  let current = layerId === null ? undefined : layerById(project, layerId);
  while (current) {
    chain.push(current);
    current = current.parentId === null ? undefined : layerById(project, current.parentId);
  }
  return chain.reverse().reduce(
    (matrix, layer) => multiply(matrix, matrixForTransform(layer.transform)),
    IDENTITY,
  );
};

const objectOffset = (object: { x?: number; y?: number }): { x: number; y: number } => ({
  x: object.x ?? 0,
  y: object.y ?? 0,
});

const objectWorldMatrix = (
  project: DrawingProject,
  target: SelectionTarget,
): AffineMatrix => {
  const object = objectForTarget(project, target) as {
    layerId?: string;
    transform?: ProjectTransform;
    x?: number;
    y?: number;
  } | undefined;
  if (!object || target.type === "layer") return IDENTITY;
  const offset = objectOffset(object);
  return multiply(
    layerWorldMatrix(project, object.layerId ?? null),
    matrixForTransform(object.transform, offset),
  );
};

const setObjectLocalMatrix = (
  object: { transform?: ProjectTransform; x?: number; y?: number },
  matrix: AffineMatrix,
): void => {
  object.transform = transformFromMatrix(matrix, objectOffset(object));
  if (!object.transform) delete object.transform;
};

const reparentObject = (
  project: DrawingProject,
  target: SelectionTarget,
  parentId: string | undefined,
  worldMatrix: AffineMatrix,
): void => {
  const object = objectForTarget(project, target) as {
    layerId?: string;
    transform?: ProjectTransform;
    x?: number;
    y?: number;
  } | undefined;
  if (!object || target.type === "layer") return;
  const parentWorld = layerWorldMatrix(project, parentId ?? null);
  object.layerId = parentId;
  if (object.layerId === undefined) delete object.layerId;
  setObjectLocalMatrix(object, multiply(invert(parentWorld), worldMatrix));
};

const reparentLayer = (
  project: DrawingProject,
  layer: ProjectLayer,
  parentId: string | null,
  worldMatrix: AffineMatrix,
): void => {
  const parentWorld = layerWorldMatrix(project, parentId);
  layer.parentId = parentId;
  layer.transform = transformFromMatrix(multiply(invert(parentWorld), worldMatrix));
  if (!layer.transform) delete layer.transform;
};

const ancestorChain = (project: DrawingProject, layerId: string | null): Array<string | null> => {
  const chain: Array<string | null> = [null];
  const nested: string[] = [];
  let current = layerId === null ? undefined : layerById(project, layerId);
  while (current) {
    nested.push(current.id);
    current = current.parentId === null ? undefined : layerById(project, current.parentId);
  }
  return [...chain, ...nested.reverse()];
};

const commonParent = (project: DrawingProject, targets: SelectionTarget[]): string | null => {
  const chains = targets.map((target) => ancestorChain(project, parentLayerId(project, target)));
  const first = chains[0] ?? [null];
  let result: string | null = null;
  for (const candidate of first) {
    if (chains.every((chain) => chain.includes(candidate))) result = candidate;
  }
  return result;
};

const renumberSiblings = (project: DrawingProject, parentId: string | null): void => {
  project.layers
    .filter((layer) => layer.parentId === parentId)
    .sort((left, right) => left.order - right.order)
    .forEach((layer, index) => {
      layer.order = index;
    });
};

const nextGroupName = (project: DrawingProject, requestedName: string): string => {
  const base = requestedName.trim() || "Group";
  const names = new Set(project.layers.map((layer) => layer.name));
  if (!names.has(base)) return base;
  let index = 2;
  while (names.has(`${base} ${index}`)) index += 1;
  return `${base} ${index}`;
};

const selectedLayerIds = (project: DrawingProject, targets: SelectionTarget[]): Set<string> =>
  new Set(targets.filter((target) => target.type === "layer").map((target) => target.id));

export const groupSelection = (
  project: DrawingProject,
  targets: SelectionTarget[],
  requestedName = "Group 1",
): SelectionTarget => {
  const normalized = normalizeSelection(project, targets);
  if (normalized.length === 0) throw new GroupingError("Select at least one object or layer to group.");
  const parentId = commonParent(project, normalized);
  const siblingLayers = project.layers.filter((layer) => layer.parentId === parentId);
  const selectedIds = selectedLayerIds(project, normalized);
  const selectedOrders = siblingLayers
    .filter((layer) => selectedIds.has(layer.id))
    .map((layer) => layer.order);
  const order = selectedOrders.length > 0
    ? Math.min(...selectedOrders)
    : siblingLayers.length;
  const group: ProjectLayer = {
    id: crypto.randomUUID(),
    name: nextGroupName(project, requestedName),
    order,
    visible: true,
    opacity: 1,
    parentId,
  };
  const worldMatrices = new Map<string, AffineMatrix>();
  for (const target of normalized) {
    if (target.type === "layer") worldMatrices.set(targetKey(target), layerWorldMatrix(project, target.id));
    else worldMatrices.set(targetKey(target), objectWorldMatrix(project, target));
  }
  project.layers.push(group);
  for (const target of normalized) {
    if (target.type === "layer") {
      const layer = layerById(project, target.id);
      if (layer) reparentLayer(project, layer, group.id, worldMatrices.get(targetKey(target))!);
    } else {
      reparentObject(project, target, group.id, worldMatrices.get(targetKey(target))!);
    }
  }
  renumberSiblings(project, parentId);
  return { type: "layer", id: group.id };
};

export const ungroupSelection = (
  project: DrawingProject,
  targets: SelectionTarget[],
): SelectionTarget[] => {
  const normalized = normalizeSelection(project, targets)
    .filter((target) => target.type === "layer");
  if (normalized.length === 0) throw new GroupingError("Select one or more groups to ungroup.");
  const groupIds = new Set(normalized.map((target) => target.id));
  const animated = project.animations.some((animation) =>
    animation.targetType === "layer" && groupIds.has(animation.targetId));
  if (animated) throw new GroupingError("Animated groups cannot be ungrouped. Remove the group animation first.");

  const promoted: SelectionTarget[] = [];
  for (const target of normalized) {
    const group = layerById(project, target.id);
    if (!group) continue;
    const parentId = group.parentId;
    const childLayers = project.layers.filter((layer) => layer.parentId === group.id);
    const childObjects = [
      ...project.strokes.filter((object) => object.layerId === group.id).map((object) => ({ type: "stroke" as const, id: object.id })),
      ...project.shapes.filter((object) => object.layerId === group.id).map((object) => ({ type: "shape" as const, id: object.id })),
      ...project.texts.filter((object) => object.layerId === group.id).map((object) => ({ type: "text" as const, id: object.id })),
      ...project.rasterReferences.filter((object) => object.layerId === group.id).map((object) => ({ type: "raster" as const, id: object.id })),
      ...project.importedSvgs.filter((object) => object.layerId === group.id).map((object) => ({ type: "svg" as const, id: object.id })),
    ];
    for (const child of childLayers) {
      const world = layerWorldMatrix(project, child.id);
      reparentLayer(project, child, parentId, world);
      promoted.push({ type: "layer", id: child.id });
    }
    for (const child of childObjects) {
      const world = objectWorldMatrix(project, child);
      reparentObject(project, child, parentId ?? undefined, world);
      promoted.push(child);
    }
    project.layers = project.layers.filter((layer) => layer.id !== group.id);
    renumberSiblings(project, parentId);
  }
  return promoted;
};

const targetKey = (target: SelectionTarget): string => `${target.type}:${target.id}`;
