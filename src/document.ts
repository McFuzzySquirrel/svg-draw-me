import type {
  AnimationDefinition,
  DrawingProject,
  FillTarget,
  ProjectLayer,
  ProjectTransform,
  Shape,
  ShapeDraft,
  Stroke,
  StrokePoint,
  StrokeStyle,
} from "./types";

export const DEFAULT_PROJECT_SIZE = { width: 1200, height: 800 };

export function createProject(
  width = DEFAULT_PROJECT_SIZE.width,
  height = DEFAULT_PROJECT_SIZE.height,
): DrawingProject {
  return {
    version: 2,
    width,
    height,
    strokes: [],
    shapes: [],
    rasterReferences: [],
    importedSvgs: [],
    layers: [],
    animations: [],
  };
}

export function dimensionsForBounds(
  width: number,
  height: number,
  bounds: Iterable<{ x: number; y: number; width: number; height: number }>,
): { width: number; height: number } {
  let expandedWidth = width;
  let expandedHeight = height;
  for (const bound of bounds) {
    expandedWidth = Math.max(expandedWidth, Math.ceil(bound.x + bound.width));
    expandedHeight = Math.max(expandedHeight, Math.ceil(bound.y + bound.height));
  }
  return { width: expandedWidth, height: expandedHeight };
}

export function cloneProject(project: DrawingProject): DrawingProject {
  return structuredClone(project);
}

export function serializeProject(project: DrawingProject): string {
  return JSON.stringify(project, null, 2);
}

export function deserializeProject(serialized: string): DrawingProject {
  const parsed: unknown = JSON.parse(serialized);
  if (!isRecord(parsed)) throw new Error("Project data is not an object.");
  if ((parsed.version !== 1 && parsed.version !== 2) || !Array.isArray(parsed.strokes)) {
    throw new Error("Unsupported or invalid project version.");
  }
  const width = projectDimension(parsed.width, DEFAULT_PROJECT_SIZE.width);
  const height = projectDimension(parsed.height, DEFAULT_PROJECT_SIZE.height);
  const project: DrawingProject = {
    version: 2,
    width,
    height,
    strokes: parsed.strokes.map(validateStroke),
    shapes: optionalArray(parsed.shapes, "shapes").map(validateShape),
    rasterReferences: optionalArray(parsed.rasterReferences, "rasterReferences").map(validateRasterReference),
    importedSvgs: optionalArray(parsed.importedSvgs, "importedSvgs").map(validateImportedSvg),
    layers: optionalArray(parsed.layers, "layers").map(validateLayer),
    animations: optionalArray(parsed.animations, "animations").map(validateAnimation),
  };
  validateProjectRelationships(project);
  return project;
}

export function applyFill(project: DrawingProject, target: FillTarget, fill: string | null): DrawingProject {
  if (target.type === "stroke") {
    const index = project.strokes.findIndex((stroke) => stroke.id === target.id);
    if (index < 0 || project.strokes[index]?.fill === fill) return project;
    const strokes = [...project.strokes];
    strokes[index] = { ...strokes[index]!, fill };
    return { ...project, strokes };
  }

  const index = project.shapes.findIndex((shape) => shape.id === target.id);
  if (index < 0 || project.shapes[index]?.style.fill === fill) return project;
  const shapes = [...project.shapes];
  shapes[index] = { ...shapes[index]!, style: { ...shapes[index]!.style, fill } };
  return { ...project, shapes };
}

export function appendShape(project: DrawingProject, shape: ShapeDraft): DrawingProject {
  return {
    ...project,
    shapes: [...project.shapes, { ...shape, id: crypto.randomUUID() } as Shape],
  };
}

export function appendStroke(
  project: DrawingProject,
  points: StrokePoint[],
  style: StrokeStyle,
  pointerType: Stroke["pointerType"],
  startedAt: number,
  endedAt: number,
  fill: string | null = null,
): DrawingProject {
  if (points.length < 2) return project;
  return {
    ...project,
    strokes: [
      ...project.strokes,
      {
        id: crypto.randomUUID(),
        points,
        style,
        fill,
        pointerType,
        startedAt,
        endedAt,
      },
    ],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function projectDimension(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error("Project dimensions must be positive finite numbers.");
  }
  return value;
}

function optionalArray(value: unknown, name: string): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`Invalid project ${name}.`);
  return value;
}

function validateStroke(value: unknown): Stroke {
  if (!isRecord(value) || !Array.isArray(value.points) || value.points.length < 2 || !isRecord(value.style)) {
    throw new Error("Invalid project stroke.");
  }
  const style = validateStrokeStyle(value.style);
  if (typeof value.id !== "string" || !isPointerKind(value.pointerType) ||
      !isFiniteNumber(value.startedAt) || !isFiniteNumber(value.endedAt) ||
      !(value.fill === undefined || value.fill === null || isColor(value.fill))) {
    throw new Error("Invalid project stroke.");
  }
  return {
    id: value.id,
    ...optionalObjectTransform(value),
    points: value.points.map(validateStrokePoint),
    style,
    fill: value.fill ?? null,
    pointerType: value.pointerType,
    startedAt: value.startedAt,
    endedAt: value.endedAt,
  };
}

function validateStrokePoint(value: unknown): StrokePoint {
  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y) ||
      !isFiniteNumber(value.pressure) || !isFiniteNumber(value.time)) {
    throw new Error("Invalid project stroke point.");
  }
  return { x: value.x, y: value.y, pressure: value.pressure, time: value.time };
}

function validateStrokeStyle(value: unknown): StrokeStyle {
  if (!isRecord(value) || !isColor(value.color) || !isFiniteNumber(value.width) || value.width <= 0 ||
      !isFiniteNumber(value.opacity) || value.opacity < 0 || value.opacity > 1 ||
      !isLineCap(value.lineCap) || !isLineJoin(value.lineJoin)) {
    throw new Error("Invalid project stroke style.");
  }
  return {
    color: value.color,
    width: value.width,
    opacity: value.opacity,
    lineCap: value.lineCap,
    lineJoin: value.lineJoin,
  };
}

function validateShape(value: unknown): Shape {
  if (!isRecord(value) || !isRecord(value.geometry) || !isRecord(value.style) ||
      typeof value.id !== "string" || !isPointerKind(value.pointerType) ||
      !isFiniteNumber(value.startedAt) || !isFiniteNumber(value.endedAt) ||
      !isRecord(value.style.stroke) ||
      !(value.style.fill === null || isColor(value.style.fill))) {
    throw new Error("Invalid project shape.");
  }
  const style = { stroke: validateStrokeStyle(value.style.stroke), fill: value.style.fill };
  const base = {
    id: value.id,
    ...optionalObjectTransform(value),
    style,
    pointerType: value.pointerType,
    startedAt: value.startedAt,
    endedAt: value.endedAt,
  };
  const geometry = value.geometry;
  if (value.kind === "line" && hasFiniteNumbers(geometry, ["x1", "y1", "x2", "y2"])) {
    return { ...base, kind: "line", geometry: { x1: geometry.x1, y1: geometry.y1, x2: geometry.x2, y2: geometry.y2 } };
  }
  if (value.kind === "rectangle" && hasFiniteNumbers(geometry, ["x", "y", "width", "height"])) {
    return { ...base, kind: "rectangle", geometry: { x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height } };
  }
  if (value.kind === "ellipse" && hasFiniteNumbers(geometry, ["cx", "cy", "rx", "ry"])) {
    return { ...base, kind: "ellipse", geometry: { cx: geometry.cx, cy: geometry.cy, rx: geometry.rx, ry: geometry.ry } };
  }
  if (value.kind === "curve" && hasFiniteNumbers(geometry, ["x1", "y1", "cx", "cy", "x2", "y2"])) {
    return { ...base, kind: "curve", geometry: { x1: geometry.x1, y1: geometry.y1, cx: geometry.cx, cy: geometry.cy, x2: geometry.x2, y2: geometry.y2 } };
  }
  if (value.kind === "polygon" && Array.isArray(geometry.points) && geometry.points.length >= 2) {
    return { ...base, kind: "polygon", geometry: { points: geometry.points.map(validateShapePoint) } };
  }
  throw new Error("Invalid project shape.");
}

function validateShapePoint(value: unknown): { x: number; y: number } {
  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y)) {
    throw new Error("Invalid project shape point.");
  }
  return { x: value.x, y: value.y };
}

function validateRasterReference(value: unknown): DrawingProject["rasterReferences"][number] {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string" ||
      typeof value.dataUrl !== "string" || !isFiniteNumber(value.x) || !isFiniteNumber(value.y) ||
      !isFiniteNumber(value.width) || value.width <= 0 || !isFiniteNumber(value.height) || value.height <= 0 ||
      !isValidOpacity(value.opacity) || typeof value.visible !== "boolean") {
    throw new Error("Invalid project raster reference.");
  }
  return {
    id: value.id,
    ...optionalObjectTransform(value),
    name: value.name,
    dataUrl: value.dataUrl,
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height,
    opacity: value.opacity,
    visible: value.visible,
  };
}

function validateImportedSvg(value: unknown): DrawingProject["importedSvgs"][number] {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string" ||
      typeof value.markup !== "string" || !isFiniteNumber(value.x) || !isFiniteNumber(value.y) ||
      !isFiniteNumber(value.width) || value.width <= 0 || !isFiniteNumber(value.height) || value.height <= 0 ||
      !isValidOpacity(value.opacity) || typeof value.visible !== "boolean") {
    throw new Error("Invalid project SVG reference.");
  }
  return {
    id: value.id,
    ...optionalObjectTransform(value),
    name: value.name,
    markup: value.markup,
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height,
    opacity: value.opacity,
    visible: value.visible,
  };
}

function optionalObjectTransform(value: Record<string, unknown>): {
  layerId?: string;
  transform?: ProjectTransform;
} {
  if (value.layerId !== undefined && (typeof value.layerId !== "string" || value.layerId.length === 0)) {
    throw new Error("Invalid project object layer.");
  }
  if (value.transform === undefined) {
    return value.layerId === undefined ? {} : { layerId: value.layerId };
  }
  if (!isRecord(value.transform)) throw new Error("Invalid project transform.");
  const transform = validateTransform(value.transform);
  return value.layerId === undefined ? { transform } : { layerId: value.layerId, transform };
}

function validateTransform(value: unknown): ProjectTransform {
  if (!isRecord(value) || !isFiniteNumber(value.translateX) || !isFiniteNumber(value.translateY) ||
      !isFiniteNumber(value.rotation) || !isFiniteNumber(value.scaleX) ||
      !isFiniteNumber(value.scaleY) || value.scaleX === 0 || value.scaleY === 0) {
    throw new Error("Invalid project transform.");
  }
  return {
    translateX: value.translateX,
    translateY: value.translateY,
    rotation: value.rotation,
    scaleX: value.scaleX,
    scaleY: value.scaleY,
  };
}

function validateLayer(value: unknown): ProjectLayer {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.length === 0 ||
      typeof value.name !== "string" || value.name.trim().length === 0 ||
      !Number.isSafeInteger(value.order) || typeof value.visible !== "boolean" ||
      !isValidOpacity(value.opacity) ||
      !(value.parentId === null || (typeof value.parentId === "string" && value.parentId.length > 0))) {
    throw new Error("Invalid project layer.");
  }
  const transform = value.transform === undefined ? undefined : validateTransform(value.transform);
  return {
    id: value.id,
    name: value.name,
    order: value.order as number,
    visible: value.visible,
    opacity: value.opacity,
    parentId: value.parentId,
    ...(transform === undefined ? {} : { transform }),
  };
}

function validateProjectRelationships(project: DrawingProject): void {
  const layersById = new Map(project.layers.map((layer) => [layer.id, layer]));
  for (const layer of project.layers) {
    if (layer.parentId !== null && !layersById.has(layer.parentId)) {
      throw new Error("Invalid project layer parent.");
    }
    const ancestors = new Set<string>();
    let current: ProjectLayer | undefined = layer;
    while (current) {
      if (ancestors.has(current.id)) throw new Error("Invalid project layer hierarchy.");
      ancestors.add(current.id);
      current = current.parentId === null ? undefined : layersById.get(current.parentId);
    }
  }

  const objects = [...project.strokes, ...project.shapes, ...project.rasterReferences, ...project.importedSvgs];
  const objectIds = new Set(objects.map((object) => object.id));
  for (const object of objects) {
    if (object.layerId !== undefined && !layersById.has(object.layerId)) {
      throw new Error("Invalid project object layer.");
    }
  }
  for (const animation of project.animations) {
    const targetExists = animation.targetType === "layer"
      ? layersById.has(animation.targetId)
      : objectIds.has(animation.targetId);
    if (!targetExists) throw new Error("Invalid project animation target.");
  }
}

function validateAnimation(value: unknown): AnimationDefinition {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.length === 0 ||
      !isAnimationPreset(value.preset) ||
      (value.targetType !== "object" && value.targetType !== "layer") ||
      typeof value.targetId !== "string" || value.targetId.length === 0 ||
      !isFiniteNumber(value.duration) || value.duration <= 0 ||
      !isFiniteNumber(value.delay) || value.delay < 0 ||
      !isAnimationIterations(value.iterations) ||
      !isAnimationDirection(value.direction) || !isAnimationEasing(value.easing) ||
      typeof value.enabled !== "boolean") {
    throw new Error("Invalid project animation.");
  }
  return {
    id: value.id,
    preset: value.preset,
    targetType: value.targetType,
    targetId: value.targetId,
    duration: value.duration,
    delay: value.delay,
    iterations: value.iterations,
    direction: value.direction,
    easing: value.easing,
    enabled: value.enabled,
  };
}

function isAnimationPreset(value: unknown): value is AnimationDefinition["preset"] {
  return value === "fade" || value === "move" || value === "scale" || value === "rotate" ||
    value === "draw" || value === "pulse" || value === "emphasis";
}

function isAnimationIterations(value: unknown): value is AnimationDefinition["iterations"] {
  return value === "infinite" || (Number.isSafeInteger(value) && typeof value === "number" && value > 0);
}

function isAnimationDirection(value: unknown): value is AnimationDefinition["direction"] {
  return value === "normal" || value === "reverse" || value === "alternate" || value === "alternate-reverse";
}

function isAnimationEasing(value: unknown): value is AnimationDefinition["easing"] {
  return value === "linear" || value === "ease" || value === "ease-in" ||
    value === "ease-out" || value === "ease-in-out";
}

function hasFiniteNumbers<K extends string>(
  value: Record<string, unknown>,
  keys: K[],
): value is Record<string, unknown> & Record<K, number> {
  return keys.every((key) => isFiniteNumber(value[key]));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidOpacity(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

function isColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function isPointerKind(value: unknown): value is Stroke["pointerType"] {
  return value === "mouse" || value === "pen" || value === "touch";
}

function isLineCap(value: unknown): value is StrokeStyle["lineCap"] {
  return value === "round" || value === "butt" || value === "square";
}

function isLineJoin(value: unknown): value is StrokeStyle["lineJoin"] {
  return value === "round" || value === "bevel" || value === "miter";
}
