import type { DrawingProject, FillTarget, Shape, ShapeDraft, Stroke, StrokePoint, StrokeStyle } from "./types";

export const DEFAULT_PROJECT_SIZE = { width: 1200, height: 800 };

export function createProject(
  width = DEFAULT_PROJECT_SIZE.width,
  height = DEFAULT_PROJECT_SIZE.height,
): DrawingProject {
  return { version: 1, width, height, strokes: [], shapes: [], rasterReferences: [], importedSvgs: [] };
}

export function cloneProject(project: DrawingProject): DrawingProject {
  return structuredClone(project);
}

export function serializeProject(project: DrawingProject): string {
  return JSON.stringify(project, null, 2);
}

export function deserializeProject(serialized: string): DrawingProject {
  const parsed: unknown = JSON.parse(serialized);
  if (!parsed || typeof parsed !== "object") throw new Error("Project data is not an object.");
  const candidate = parsed as Partial<DrawingProject>;
  if (candidate.version !== 1 || !Array.isArray(candidate.strokes)) {
    throw new Error("Unsupported or invalid project version.");
  }
  return {
    version: 1,
    width: finiteOr(candidate.width, DEFAULT_PROJECT_SIZE.width),
    height: finiteOr(candidate.height, DEFAULT_PROJECT_SIZE.height),
    strokes: candidate.strokes.map((stroke) => ({ ...stroke, fill: stroke.fill ?? null })),
    shapes: Array.isArray(candidate.shapes) ? candidate.shapes : [],
    rasterReferences: Array.isArray(candidate.rasterReferences) ? candidate.rasterReferences : [],
    importedSvgs: Array.isArray(candidate.importedSvgs) ? candidate.importedSvgs : [],
  };
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

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
