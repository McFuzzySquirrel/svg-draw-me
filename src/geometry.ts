import type { Shape, Stroke } from "./types";

export const FREEHAND_FILL_GAP = 28;

export function isClosedStroke(stroke: Stroke, tolerance = FREEHAND_FILL_GAP): boolean {
  if (stroke.points.length < 3) return false;
  const first = stroke.points[0]!;
  const last = stroke.points[stroke.points.length - 1]!;
  return Math.hypot(last.x - first.x, last.y - first.y) <= tolerance;
}

export function pointInStrokeLoop(point: { x: number; y: number }, stroke: Stroke, tolerance = FREEHAND_FILL_GAP): boolean {
  if (!isClosedStroke(stroke, tolerance)) return false;
  return pointInPolygon(point, stroke.points);
}

export function pointHitsStroke(point: { x: number; y: number }, stroke: Stroke, radius: number): boolean {
  for (let index = 1; index < stroke.points.length; index += 1) {
    if (distanceToSegment(point, stroke.points[index - 1]!, stroke.points[index]!) <= radius) return true;
  }
  return false;
}

export function pointHitsShape(point: { x: number; y: number }, shape: Shape, radius: number): boolean {
  if (shape.kind === "line") {
    const g = shape.geometry;
    return distanceToSegment(point, { x: g.x1, y: g.y1 }, { x: g.x2, y: g.y2 }) <= radius;
  }
  if (shape.kind === "curve") {
    const g = shape.geometry;
    let previous = { x: g.x1, y: g.y1 };
    for (let step = 1; step <= 20; step += 1) {
      const t = step / 20;
      const next = {
        x: (1 - t) ** 2 * g.x1 + 2 * (1 - t) * t * g.cx + t ** 2 * g.x2,
        y: (1 - t) ** 2 * g.y1 + 2 * (1 - t) * t * g.cy + t ** 2 * g.y2,
      };
      if (distanceToSegment(point, previous, next) <= radius) return true;
      previous = next;
    }
    return false;
  }
  if (shape.kind === "rectangle") {
    const g = shape.geometry;
    const inside = point.x >= g.x && point.x <= g.x + g.width
      && point.y >= g.y && point.y <= g.y + g.height;
    return inside && shape.style.fill !== null || (
      point.x >= g.x - radius && point.x <= g.x + g.width + radius
      && point.y >= g.y - radius && point.y <= g.y + g.height + radius
    );
  }
  if (shape.kind === "ellipse") {
    const g = shape.geometry;
    const rx = Math.max(g.rx + radius, 1);
    const ry = Math.max(g.ry + radius, 1);
    const inside = ((point.x - g.cx) / Math.max(g.rx, 1)) ** 2 + ((point.y - g.cy) / Math.max(g.ry, 1)) ** 2 <= 1;
    return (inside && shape.style.fill !== null) || ((point.x - g.cx) / rx) ** 2 + ((point.y - g.cy) / ry) ** 2 <= 1;
  }
  if (shape.kind === "polygon") {
    const g = shape.geometry;
    if (shape.style.fill !== null && pointInPolygon(point, g.points)) return true;
    return g.points.some((current, index) => distanceToSegment(point, current, g.points[(index + 1) % g.points.length]!) <= radius);
  }

  return false;
}

export function pointInPolygon(point: { x: number; y: number }, points: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const current = points[index]!;
    const prior = points[previous]!;
    const intersects = current.y > point.y !== prior.y > point.y
      && point.x < ((prior.x - current.x) * (point.y - current.y)) / (prior.y - current.y) + current.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function distanceToSegment(point: { x: number; y: number }, start: { x: number; y: number }, end: { x: number; y: number }): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}
