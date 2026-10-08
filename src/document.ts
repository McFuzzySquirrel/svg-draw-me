import type { DrawingProject, Stroke, StrokePoint, StrokeStyle } from "./types";

export const DEFAULT_PROJECT_SIZE = { width: 1200, height: 800 };

export function createProject(
  width = DEFAULT_PROJECT_SIZE.width,
  height = DEFAULT_PROJECT_SIZE.height,
): DrawingProject {
  return { version: 1, width, height, strokes: [], rasterReferences: [], importedSvgs: [] };
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
    strokes: candidate.strokes,
    rasterReferences: Array.isArray(candidate.rasterReferences) ? candidate.rasterReferences : [],
    importedSvgs: Array.isArray(candidate.importedSvgs) ? candidate.importedSvgs : [],
  };
}

export function appendStroke(
  project: DrawingProject,
  points: StrokePoint[],
  style: StrokeStyle,
  pointerType: Stroke["pointerType"],
  startedAt: number,
  endedAt: number,
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
